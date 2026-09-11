"""Фоновый пайплайн: файл -> транскрипция -> AI-анализ -> БД."""
import hashlib
import shutil
import traceback
from pathlib import Path

from ..db import SessionLocal
from .. import models
from . import analyzer, media, s2t

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_cached_meeting(db, fhash: str, user_id: str | None = None) -> models.Meeting | None:
    """Готовая встреча по тому же файлу; если обработка ещё идёт — тоже возвращаем её (иначе дубль)."""
    def _q(extra):
        q = db.query(models.Meeting).filter(models.Meeting.file_hash == fhash)
        if user_id is not None:
            q = q.filter(models.Meeting.user_id == user_id)
        return extra(q).first()
    return _q(lambda q: q.filter(models.Meeting.status == "done").order_by(models.Meeting.created_at)) \
        or _q(lambda q: q.filter(models.Meeting.status != "error").order_by(models.Meeting.created_at))


def process_meeting(meeting_id: str, upload_path: Path) -> None:
    db = SessionLocal()
    try:
        meeting = db.get(models.Meeting, meeting_id)
        if meeting is None:
            return
        tmp: Path | None = None
        try:
            kind = media.detect_kind(upload_path) or "audio"
            stt_path = upload_path
            if kind == "video":  # видео → извлекаем аудиодорожку → дальше общий STT-путь
                meeting.status = "extracting"
                db.commit()
                tmp = media.workdir()
                media.ensure_ffmpeg()
                if not media.has_audio_stream(upload_path):
                    raise RuntimeError("В этом видео не обнаружена аудиодорожка.")
                stt_path = media.extract_audio(upload_path, tmp)

            meeting.status = "transcribing"
            db.commit()
            task = s2t.send_file(str(stt_path), lang="ru")
            meeting.s2t_task_id = task.get("id")
            db.commit()
            task = s2t.wait_done(task["id"])
            segments = parse_s2t_result(s2t.get_result_json(task["id"]))
            if not segments:
                raise RuntimeError("пустой транскрипт")
            for s in segments:
                db.add(models.TranscriptSegment(
                    meeting_id=meeting.id, start_sec=s["start_sec"],
                    end_sec=s["end_sec"], speaker=s.get("speaker"), text=s["text"]))
            duration = _sec((task.get("file_meta") or {}).get("duration") or 0)
            if duration:
                meeting.duration_sec = duration
            db.commit()

            meeting.status = "analyzing"
            db.commit()
            analysis = analyzer.extract(segments)
            store_analysis(db, meeting, analysis)
            meeting.summary = analysis.get("summary")
            # плеер: у видео оставляем извлечённый WAV, сам видеофайл не храним
            keep = UPLOAD_DIR / f"{meeting.id}{'.wav' if kind == 'video' else upload_path.suffix}"
            shutil.move(str(stt_path), keep)
            meeting.file_path = str(keep)
            if kind == "video":
                upload_path.unlink(missing_ok=True)
            meeting.status = "done"
            db.commit()
        except Exception as e:
            traceback.print_exc()
            meeting.status = "error"
            meeting.error = str(e)[:1000]
            db.commit()  # файл на диске сохраняем: можно дожать без повторной загрузки
        finally:
            media.cleanup(tmp)
    finally:
        db.close()


def parse_s2t_result(result) -> list[dict]:
    """speech2text result/json (фактический формат, проверен живым вызовом):
    {"languages": [...], "speakers": [{"id":0,"name":"Спикер 1"}],
     "chunks": [{"speaker":0, "time":{"from":2.28,"to":7.52}, "text":"..."}]}"""
    speaker_names: dict = {}
    arr: list = []
    if isinstance(result, dict):
        for sp in result.get("speakers") or []:
            if isinstance(sp, dict) and sp.get("id") is not None:
                speaker_names[sp["id"]] = sp.get("name") or f"Спикер {sp['id']}"
        arr = result.get("chunks") or []
        if not arr:
            arr = result.get("result") or result.get("transcription") or result.get("segments") or []
            if isinstance(arr, dict):
                arr = arr.get("transcription") or arr.get("segments") or []
    else:
        arr = result or []
    segments = []
    for item in arr:
        if not isinstance(item, dict):
            continue
        text = item.get("text") or item.get("word") or ""
        if not str(text).strip():
            continue
        t = item.get("time") or {}
        start = _sec(t.get("from") if "from" in t else (item.get("audio_start_from") or item.get("start") or item.get("begin") or 0))
        end = _sec(t.get("to") if "to" in t else (item.get("audio_to") or item.get("end") or start))
        spk = item.get("speaker")
        speaker = speaker_names.get(spk) if isinstance(spk, int) or (isinstance(spk, str) and spk.isdigit()) else spk
        segments.append({"start_sec": start, "end_sec": max(end, start + 0.1),
                         "speaker": str(speaker) if speaker else None, "text": str(text).strip()})
    return _merge_adjacent(segments)


def _sec(v) -> float:
    if isinstance(v, (int, float)):
        return float(v) / 1000 if v and v > 10 * 3600 * 100 else float(v or 0)
    try:
        parts = [float(p) for p in str(v).replace(",", ".").split(":")]
    except ValueError:
        return 0.0
    if len(parts) == 3:
        h, m, s = parts
        return h * 3600 + m * 60 + s
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return parts[0] if parts else 0.0


def _merge_adjacent(segments: list[dict], gap: float = 1.5) -> list[dict]:
    merged: list[dict] = []
    for s in segments:
        if merged and merged[-1]["speaker"] == s["speaker"] and s["start_sec"] - merged[-1]["end_sec"] < gap:
            merged[-1]["end_sec"] = s["end_sec"]
            merged[-1]["text"] += " " + s["text"]
        else:
            merged.append(dict(s))
    return merged


def _roles_str(v) -> str:
    """Модель обещает массив ролей, но может вернуть строку/None/числа — не роняем встречу."""
    if isinstance(v, str):
        return v.strip() or "ALL"
    if isinstance(v, (list, tuple)):
        return ", ".join(str(x).strip() for x in v if str(x).strip()) or "ALL"
    return "ALL"


def store_analysis(db, meeting: models.Meeting, analysis: dict) -> None:
    from ..schemas import PRIORITIES, REQ_TYPES
    id_map: dict[str, str] = {}
    used_pub: set[str] = set()

    def _uniq(pub) -> str:
        pub = str(pub or "").strip()[:20] or f"REQ-{len(used_pub) + 1:03d}"
        base, k = pub, 2
        while pub in used_pub:
            pub = f"{base}-{k}"
            k += 1
        used_pub.add(pub)
        return pub

    for r in analysis.get("requirements", []) or []:
        if not isinstance(r, dict):
            continue
        src = r.get("source") if isinstance(r.get("source"), dict) else {}
        seg_id = _find_segment(db, meeting.id, src.get("text"))
        typ = r.get("type") if r.get("type") in REQ_TYPES else "functional"
        prio = r.get("priority") if r.get("priority") in PRIORITIES else "medium"
        conf = r.get("confidence", 1.0)
        try:
            conf = min(1.0, max(0.0, float(conf)))
        except (TypeError, ValueError):
            conf = 1.0
        req = models.Requirement(
            meeting_id=meeting.id, public_id=_uniq(r.get("id") or f"REQ-{len(id_map) + 1:03d}"),
            type=typ, title=str(r.get("title") or "")[:300] or "Без названия",
            description=str(r.get("description") or ""), priority=prio,
            confidence=conf,
            needs_clarification=bool(r.get("needs_clarification")),
            source_text=src.get("text"),
            source_start_sec=_sec(_time(r, "start_time")), source_end_sec=_sec(_time(r, "end_time")),
            for_roles=_roles_str(r.get("for_roles")),
            source_segment_id=seg_id)
        db.add(req)
        db.flush()
        id_map[req.public_id] = req.id
        nested = r.get("user_stories") or []
        if nested:
            for us in nested:
                if isinstance(us, dict):
                    db.add(models.UserStory(requirement_id=req.id, role=str(us.get("role") or ""),
                                            action=str(us.get("action") or ""), goal=str(us.get("goal") or "")))
        else:
            for us in analysis.get("user_stories", []) or []:
                if isinstance(us, dict) and us.get("requirement_id") == req.public_id:
                    db.add(models.UserStory(requirement_id=req.id, role=str(us.get("role") or ""),
                                            action=str(us.get("action") or ""), goal=str(us.get("goal") or "")))
    for c in analysis.get("constraints", []) or []:
        if not isinstance(c, dict):
            continue
        db.add(models.Requirement(
            meeting_id=meeting.id, public_id=_uniq(c.get("id") or "C-000"), type="constraint",
            title=str(c.get("description") or "")[:100], description=str(c.get("description") or ""),
            confidence=0.9, source_text=(c.get("source") or {}).get("text"),
            source_start_sec=_sec(_time(c, "start_time")), source_end_sec=_sec(_time(c, "end_time"))))
    for q in analysis.get("open_questions", []) or []:
        if not isinstance(q, dict):
            continue
        db.add(models.OpenQuestion(meeting_id=meeting.id, description=str(q.get("description") or ""),
                                   source_text=(q.get("source") or {}).get("text")))
    for x in analysis.get("contradictions", []) or []:
        if not isinstance(x, dict):
            continue
        raw = [str(i).strip().replace(",", ";") for i in (x.get("requirement_ids") or x.get("requirement_texts") or []) if i]
        db.add(models.Contradiction(meeting_id=meeting.id, requirement_public_ids="; ".join(raw)[:200],
                                    description=str(x.get("description") or ""),
                                    recommendation=str(x.get("recommendation") or "")))
    db.commit()


def _time(item: dict, key: str):
    return (item.get("source") or {}).get(key)


def _find_segment(db, meeting_id: str, quote: str | None) -> str | None:
    if not quote:
        return None
    segs = db.query(models.TranscriptSegment).filter_by(meeting_id=meeting_id).all()
    from rapidfuzz import fuzz
    best, score = None, 0.0
    for s in segs:
        sc = fuzz.partial_ratio(quote.lower(), s.text.lower())
        if sc > score:
            best, score = s, sc
    return best.id if best and score >= 85 else None
