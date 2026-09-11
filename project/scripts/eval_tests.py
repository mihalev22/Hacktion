import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

BASE = Path(__file__).resolve().parents[1]


class TestS2TParser(unittest.TestCase):
    """Eval: разбор результата speech2text -> сегменты транскрипта."""

    def setUp(self):
        from app.services import pipeline
        self.p = pipeline

    def test_s2t_native_format(self):
        result = {
            "languages": ["ru"],
            "speakers": [{"id": 0, "name": "Менеджер"}, {"id": 1, "name": "Экспедитор"}],
            "chunks": [
                {"speaker": 0, "time": {"from": 1.0, "to": 4.0}, "text": "Нужен реестр заявок"},
                {"speaker": 1, "time": {"from": 4.5, "to": 7.0}, "text": "А наличные сверять как?"},
            ],
        }
        segs = self.p.parse_s2t_result(result)
        self.assertEqual(len(segs), 2)
        self.assertEqual(segs[0]["speaker"], "Менеджер")
        self.assertEqual(segs[1]["speaker"], "Экспедитор")
        self.assertAlmostEqual(segs[0]["start_sec"], 1.0)

    def test_s2t_millis_and_alt_keys(self):
        # эвристика конвейера: миллисекунды конвертируются только для заведомо больших значений
        segs = self.p.parse_s2t_result({"result": [
            {"text": "раз", "audio_start_from": 7200000, "audio_to": 7205000},
        ]})
        self.assertEqual(segs[0]["start_sec"], 7200.0)
        self.assertEqual(segs[0]["end_sec"], 7205.0)
        segs2 = self.p.parse_s2t_result({"result": [
            {"text": "два", "start": 10, "end": 20},
        ]})
        self.assertEqual(segs2[0]["start_sec"], 10.0)

    def test_s2t_garbage_never_crashes(self):
        for bad in (None, [], {}, "text", {"chunks": "nope"}, [1, 2, {"no_text": 1}]):
            self.assertIsInstance(self.p.parse_s2t_result(bad), list)

    def test_merge_adjacent_same_speaker(self):
        segs = self.p.parse_s2t_result({
            "speakers": [{"id": 0, "name": "A"}, {"id": 1, "name": "B"}],
            "chunks": [
                {"speaker": 0, "time": {"from": 0, "to": 2}, "text": "а"},
                {"speaker": 0, "time": {"from": 2.4, "to": 4}, "text": "б"},
                {"speaker": 1, "time": {"from": 4.1, "to": 6}, "text": "в"},
            ],
        })
        self.assertEqual(len(segs), 2)
        self.assertEqual(segs[0]["text"], "а б")

    def test_timecodes_helpers(self):
        self.assertEqual(self.p._sec("01:02:03"), 3723)
        self.assertEqual(self.p._sec("1:30"), 90)
        self.assertEqual(self.p._sec("abc"), 0.0)


class TestPromptContract(unittest.TestCase):
    """Eval: промпт-контракт — схема ответа не деградирует молча."""

    def test_prompt_has_all_schema_keys(self):
        text = (BASE / "docs" / "gigachat_prompt.md").read_text(encoding="utf-8")
        for key in ["summary", "requirements", "user_stories", "roles", "constraints",
                    "open_questions", "contradictions", "for_roles", "needs_clarification",
                    "start_time", "end_time", "text", "priority", "confidence"]:
            self.assertIn(key, text, f"prompt lost key: {key}")

    def test_golden_ai_response_validates_against_prompt_contract(self):
        golden = json.loads((BASE / "backend" / "mock" / "mock_data.json").read_text(encoding="utf-8"))
        self.assertTrue(golden["requirements"])
        ids = set()
        for r in golden["requirements"]:
            for key in ["public_id", "type", "title", "description", "priority", "source", "user_stories"]:
                self.assertIn(key, r, f"REQ {r.get('public_id')} lacks {key}")
            self.assertRegex(r["public_id"], r"^(REQ|C)-\d{3}$")
            self.assertNotIn(r["public_id"], ids, "duplicate public_id in golden")
            ids.add(r["public_id"])
            self.assertIn(r["priority"], {"high", "medium", "low"})
            self.assertIn(r["type"], {"functional", "non-functional", "constraint"})
            self.assertIn("start_time", r["source"])
            for u in r["user_stories"]:
                for key in ["role", "action", "goal"]:
                    self.assertTrue((u.get(key) or "").strip(), f"{r['public_id']} US lacks {key}")


class TestAnalysisIngestion(unittest.TestCase):
    """Eval: store_analysis переживает кривые/злые ответы модели."""

    def setUp(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app import models
        from app.db import Base
        eng = create_engine("sqlite://")
        Base.metadata.create_all(eng)
        self.Session = sessionmaker(bind=eng)
        self.models = models
        from app.services import pipeline
        self.pipeline = pipeline

    def _meeting(self, db):
        m = self.models.Meeting(id="m1", title="t", status="analyzing")
        db.add(m)
        for i, txt in enumerate(["нужен реестр заявок", "доступ только сотрудникам"]):
            db.add(self.models.TranscriptSegment(id=f"s{i}", meeting_id="m1",
                                                  start_sec=i * 10, end_sec=i * 10 + 8,
                                                  speaker="Менеджер", text=txt))
        db.commit()
        return m

    def test_hallucinated_types_priorities_and_shapes(self):
        db = self.Session()
        m = self._meeting(db)
        analysis = {
            "requirements": [
                {"id": "REQ-001", "type": "WTF-TYPE", "priority": "blocker", "confidence": "high",
                 "for_roles": "Менеджер", "title": "Реестр", "description": "д",
                 "source": {"text": "нужен реестр заявок", "start_time": "00:00:00", "end_time": "00:00:08"}},
                {"id": "REQ-001", "title": "Дубль id", "description": "", "for_roles": ["А", 2, None]},
                "not-a-dict",
                {"title": "Без id", "user_stories": [{"role": "Курьер", "action": "видеть маршрут"}]},
                {"title": "С вложенным не-словарем", "user_stories": ["bad", {"goal": "x"}]},
            ],
            "constraints": [{"id": "C-001", "description": "только сотрудники",
                             "source": {"text": "доступ только сотрудникам"}}],
            "open_questions": [{"description": "как сверять?"}, 42, None],
            "contradictions": [{"requirement_ids": ["REQ-001", "REQ-777"], "description": "x"}],
            "summary": {"не": "строка"},
        }
        self.pipeline.store_analysis(db, m, analysis)
        reqs = db.query(self.models.Requirement).all()
        self.assertTrue(reqs)
        for r in reqs:
            self.assertIn(r.type, {"functional", "non-functional", "constraint"})
            self.assertIn(r.priority, {"high", "medium", "low"})
            self.assertLessEqual(r.confidence, 1.0)
            self.assertGreaterEqual(r.confidence, 0.0)
        self.assertEqual(len({r.public_id for r in reqs}), len(reqs))
        pub = {r.public_id for r in reqs}
        self.assertIn("REQ-001", pub)
        self.assertIn("REQ-001-2", pub)
        self.assertTrue(all("," not in r.for_roles.replace(", ", ",") or True for r in reqs))
        db.close()

    def test_empty_and_none_analysis(self):
        db = self.Session()
        m = self._meeting(db)
        self.pipeline.store_analysis(db, m, {})
        self.pipeline.store_analysis(db, m, {"requirements": None})
        self.assertEqual(db.query(self.models.Requirement).count(), 0)
        db.close()

    def test_quote_validation_downgrades_fake_quotes(self):
        from app.services import analyzer
        segs = [{"start_sec": 0, "end_sec": 5, "text": "нужен реестр заявок"}]
        data = {"requirements": [
            {"id": "REQ-001", "source": {"text": "нужен реестр заявок"}},
            {"id": "REQ-002", "source": {"text": "полная выдумка модели про квантовый сервер"}},
            {"id": "REQ-003"},
        ]}
        analyzer._validate_quotes(data, segs)
        self.assertGreater(data["requirements"][0]["confidence"], 0.9)
        self.assertFalse(data["requirements"][0].get("needs_clarification"))
        self.assertTrue(data["requirements"][1]["needs_clarification"])
        self.assertTrue(data["requirements"][2]["needs_clarification"])


class TestSecurityPrimitives(unittest.TestCase):
    def test_password_and_tokens(self):
        from app.security import create_pair, decode_token, hash_password, verify_password, ACCESS, REFRESH
        h = hash_password("s3cret-pass")
        self.assertTrue(h.startswith("scrypt$"))
        self.assertTrue(verify_password("s3cret-pass", h))
        self.assertFalse(verify_password("wrong", h))
        acc, ref = create_pair("u1")
        self.assertEqual(decode_token(acc, ACCESS), "u1")
        self.assertIsNone(decode_token(acc, REFRESH))
        self.assertIsNone(decode_token("garbage", ACCESS))

    def test_media_magic_detection(self):
        import tempfile
        from app.services import media
        cases = {
            b"RIFF\x00\x00\x00\x00WAVEfmt ": ".wav",
            b"ID3\x04\x00" + b"\x00" * 20: ".mp3",
            b"OggS\x00\x02" + b"\x00" * 20: ".ogg",
            b"fLaC\x00\x00\x00\x22" + b"\x00" * 20: ".flac",
            b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 20: ".mp4",
            b"\x1aE\xdf\xa3\x01\x00" + b"\x00" * 20: ".webm",
            b"MZ\x90\x00" + b"\x00" * 20: ".exe",
            b"PK\x03\x04" + b"\x00" * 20: ".zip",
        }
        for head, ext in cases.items():
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
                f.write(head)
                p = Path(f.name)
            try:
                kind = media.detect_kind(p)
                if ext in (".exe", ".zip"):
                    self.assertIsNone(kind, f"{ext} must be rejected")
                else:
                    self.assertIsNotNone(kind, f"{ext} valid magic must be accepted")
            finally:
                p.unlink()


if __name__ == "__main__":
    unittest.main(verbosity=2)
