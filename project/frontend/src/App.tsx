import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock3, Download, FileText, Play,
  Plus, Search, Trash2, Users, X,
} from "lucide-react";
import { api, jsonBody } from "./api";
import { fmtSec, parseTc } from "./types";
import type { Contra, MeetingData, Question, Req, Segment } from "./types";
import { AppHeader, AppFooter } from "./chrome";
import { openNewMeeting, showConfirm, toast } from "./ui";
import { audioUrl } from "./services/meetings";
import { idNum, idsNum } from "./utils/id";
import "./tz.css";

type Tab = "reqs" | "clarify" | "questions" | "contradictions" | "roles";
type Sel = { kind: "req" | "contra" | "q" | "role"; id: string };

const STEPS_AUDIO: Array<[string, string]> = [
  ["uploaded", "Файл загружен"],
  ["transcribing", "Расшифровка"],
  ["analyzing", "Анализ разговора"],
];
const STEPS_VIDEO: Array<[string, string]> = [
  ["uploaded", "Видео загружено"],
  ["extracting", "Извлечение аудио"],
  ["transcribing", "Расшифровка"],
  ["analyzing", "Анализ разговора"],
];

export default function TzScreen() {
  const params = useParams();
  const query = new URLSearchParams(useLocation().search);
  const nav = useNavigate();
  const projectId = params.projectId ?? null;
  const meetingId = params.meetingId ?? params.id ?? query.get("id");

  const [data, setData] = useState<MeetingData | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [tab, setTab] = useState<Tab>("reqs");
  const [sel, setSel] = useState<Sel | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState({ title: "", description: "" });
  const [highlight, setHighlight] = useState<Segment | null>(null);
  const [askFor, setAskFor] = useState<Req | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [audio, setAudio] = useState({ cur: 0, dur: 0, playing: false });
  const [trAll, setTrAll] = useState(true);
  const [exportHint, setExportHint] = useState(false);
  const [busyKey, setBusyKey] = useState("uploaded");

  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (meetingId && meetingId !== "mock") loadLive(meetingId);
    else {
      api("/api/mock")
        .then((d: MeetingData) => { setData(withResolved(d)); setLive(false); setSel(null); })
        .catch((e) => setError(String(e)));
    }
    return () => { if (pollRef.current) window.clearTimeout(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const tick = () => setAudio((s) => ({ ...s, cur: a.currentTime }));
    const meta = () => setAudio((s) => ({ ...s, dur: a.duration || s.dur }));
    a.addEventListener("timeupdate", tick);
    a.addEventListener("loadedmetadata", meta);
    return () => {
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("loadedmetadata", meta);
    };
  }, [data?.meeting.id, live]);

  if (error) return <div className="app-ui"><div className="tz-body"><div className="state-card err">Ошибка: {error} — поднят ли бэк? (scripts/start_dev.py)</div></div></div>;
  if (!data) return <div className="app-ui"><div className="tz-body"><div className="crumb">Загрузка…</div></div></div>;

  const itemsAll = [...data.requirements, ...data.constraints];
  const contraIds = new Set(
    data.contradictions.flatMap((x) => x.requirement_public_ids.split(/[,;]/).map((s) => s.trim()))
  );
  const clarifyN = itemsAll.filter((r) => r.needs_clarification).length;

  const selReq = sel?.kind === "req" ? itemsAll.find((r) => r.id === sel.id) : undefined;
  const selContra = sel?.kind === "contra" ? data.contradictions.find((x) => x.id === sel.id) : undefined;
  const selQ = sel?.kind === "q" ? data.open_questions.find((q) => q.id === sel.id) : undefined;

  // роли — только реальные данные из AI JSON (roles + for_roles требований)
  const reqsByRole = (role: string) => itemsAll.filter((r) =>
    (r.for_roles || "").toLowerCase().includes(role.toLowerCase()));
  const roleNames = Array.from(new Set([
    ...data.roles,
    ...itemsAll.flatMap((r) => (r.for_roles || "").split(/[,;]/).map((x) => x.trim())).filter((x) => x && x !== "ALL"),
  ]));
  const selRole = sel?.kind === "role" ? roleNames.find((x) => x.toLowerCase() === sel.id.toLowerCase()) : undefined;

  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  const shownReqs = itemsAll
    .filter((r) => (tab === "clarify" ? r.needs_clarification : true))
    .filter((r) => !search || norm(`${r.public_id} ${r.title} ${r.description}`).includes(norm(search)))
    .sort((a, b) => (a.public_id < b.public_id ? -1 : 1));

  const linkedFrom = selReq?.source?.start_time ? parseTc(selReq.source.start_time) : null;
  const linkedTo = selReq?.source?.end_time ? parseTc(selReq.source.end_time) : null;
  const linkedIds = new Set<string>(
    linkedFrom != null
      ? data.transcript.filter((s) => s.end_sec >= linkedFrom - 0.5 && s.start_sec <= (linkedTo ?? linkedFrom + 1) + 0.5).map((s) => s.id)
      : []
  );
  const trShown = linkedIds.size > 0 && !trAll ? data.transcript.filter((s) => linkedIds.has(s.id)) : data.transcript;
  const curSpeaker = data.transcript.find((s) => s.start_sec <= audio.cur && s.end_sec >= audio.cur)?.speaker;

  const seek = (t?: string, quote?: string) => {
    const sec = parseTc(t);
    if (sec != null && audioRef.current) {
      audioRef.current.currentTime = sec;
      if (audioRef.current.paused) audioRef.current.play().catch(() => {});
    }
    const seg = quote
      ? data.transcript.find((s) => s.text.includes(quote.slice(0, 25)))
      : data.transcript.find((s) => sec != null && s.start_sec <= sec && s.end_sec >= sec);
    if (seg) {
      setHighlight(seg);
      transcriptRef.current?.querySelector(`[data-seg="${seg.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a || !live) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };

  const seekWave = (e: ReactMouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !live || !audio.dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * audio.dur;
  };

  const patchLocal = (id: string, body: Partial<Req>) => {
    setData({
      ...data,
      requirements: data.requirements.map((r) => (r.id === id ? { ...r, ...body } : r)),
      constraints: data.constraints.map((r) => (r.id === id ? { ...r, ...body } : r)),
    });
  };

  // правки optimistic, но ошибки сервера (403 viewer, 404, 422) больше не молчат:
  // показываем причину и перечитываем данные с сервера, чтобы UI не врал после reload
  const apiFail = (e: unknown) => {
    toast(e instanceof Error && e.message ? `Сервер отклонил изменение: ${e.message}` : "Сервер отклонил изменение", "err");
    if (live && meetingId) void loadLive(meetingId);
  };

  const patch = async (req: Req, body: Partial<Req>) => {
    patchLocal(req.id, body);
    if (!live) return;
    try {
      await api(`/api/requirements/${req.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) { apiFail(e); }
  };

  const remove = async (req: Req) => {
    const ok = await showConfirm("Удалить требование?", "Действие необратимо.");
    if (!ok) return;
    setData({
      ...data,
      requirements: data.requirements.filter((r) => r.id !== req.id),
      constraints: data.constraints.filter((r) => r.id !== req.id),
    });
    setSel(null);
    if (!live) return;
    try {
      await api(`/api/requirements/${req.id}`, { method: "DELETE" });
    } catch (e) { apiFail(e); }
  };

  const toggleContra = async (x: Contra) => {
    setData({ ...data, contradictions: data.contradictions.map((c) => (c.id === x.id ? { ...c, resolved: !c.resolved } : c)) });
    if (!live) return;
    try {
      await api(`/api/contradictions/${x.id}/resolve`, { method: "PATCH" });
    } catch (e) { apiFail(e); }
  };

  const toggleQuestion = async (q: Question) => {
    setData({ ...data, open_questions: data.open_questions.map((x) => (x.id === q.id ? { ...x, resolved: !x.resolved } : x)) });
    if (!live) return;
    try {
      await api(`/api/open-questions/${q.id}`, { method: "PATCH" });
    } catch (e) { apiFail(e); }
  };

  const sendQuestion = async () => {
    if (!askFor || questionText.trim().length < 3) return;
    const description = questionText.trim();
    setAskFor(null);
    setQuestionText("");
    setTab("questions");
    if (!live) {
      const q: Question = { id: `q${Date.now()}`, description, resolved: false };
      setData({ ...data, open_questions: [...data.open_questions, q] });
      patchLocal(askFor.id, { needs_clarification: true });
      setSel({ kind: "q", id: q.id });
      return;
    }
    try {
      const created = await api(`/api/requirements/${askFor.id}/question`, jsonBody({ description }));
      setData({
        ...data,
        requirements: data.requirements.map((r) => (r.id === askFor.id ? { ...r, needs_clarification: true } : r)),
        constraints: data.constraints.map((r) => (r.id === askFor.id ? { ...r, needs_clarification: true } : r)),
        open_questions: [...data.open_questions, { id: created.id, description: created.description, resolved: false, requirement_id: created.requirement_id }],
      });
      setSel({ kind: "q", id: created.id });
    } catch (e) { apiFail(e); }
  };

  async function loadLive(id: string) {
    try {
      const detail = await api(projectId ? `/api/projects/${projectId}/meetings/${id}` : `/api/meetings/${id}`);
      const transcript = await api(`/api/meetings/${id}/transcript`);
      setData(withResolved({ ...detail, transcript }));
      setLive(true);
      setErrMsg("");
      if (["done", "error"].includes(detail.meeting.status)) {
        setBusy("");
        if (detail.meeting.status === "error") setErrMsg(detail.meeting.error || "ошибка обработки");
      } else {
        setBusy(stepLabel(detail.meeting.status));
        setBusyKey(detail.meeting.status);
        if (pollRef.current) window.clearTimeout(pollRef.current);
        pollRef.current = window.setTimeout(() => loadLive(id), 4000);
      }
      setSel((prev) => (prev && prev.kind !== "req" ? prev
        : detail.requirements?.[0] ? { kind: "req", id: detail.requirements[0].id } : null));
    } catch (e) {
      setError(String(e));
    }
  }

  function withResolved(d: MeetingData): MeetingData {
    d.contradictions = (d.contradictions || []).map((x) => ({ ...x, resolved: x.resolved ?? false }));
    return d;
  }

  const addManual = async () => {
    if (!data) return;
    const title = window.prompt("Название нового требования");
    if (!title) return;
    if (!live) {
      const n = itemsAll.length + 1;
      setData({
        ...data,
        requirements: [...data.requirements, {
          id: `manual${Date.now()}`, public_id: `REQ-${String(n).padStart(3, "0")}`, type: "functional",
          title, description: "", priority: "medium", confidence: 1, needs_clarification: false,
          manual: true, for_roles: "ALL", user_stories: [],
        }],
      });
      return;
    }
    try {
      const r = await api(`/api/meetings/${meetingId}/requirements`, jsonBody({ title: title.trim() }));
      setData({ ...data, requirements: [...data.requirements, r] });
      setSel({ kind: "req", id: r.id });
      toast(`Требование ${r.public_id} сохранено`);
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "Не удалось сохранить требование", "err");
    }
  };

  const downloadPDF = () => {
    // PDF строится на странице документа из того же отрисованного ТЗ (?pdf=1 — автоскачивание)
    if (live || meetingId === "mock") { nav(`/tz/${meetingId}/doc?pdf=1`); return; }
    setExportHint(true);
    window.setTimeout(() => setExportHint(false), 2600);
  };

  const runPipeline = async () => {
    if (!live || !meetingId) return;
    try {
      await api(`/api/meetings/${meetingId}/process`, { method: "POST" });
      toast("Анализ запущен");
      setErrMsg("");
      void loadLive(meetingId);
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : "Не удалось запустить обработку", "err");
    }
  };

  const st = data.meeting.status;
  const canEdit = !live || !data.meeting.project_role || data.meeting.project_role !== "viewer";
  const dotClass = st === "done" ? "live-dot" : st === "error" ? "live-dot err" : "live-dot wait";

  return (
    <div className="app-ui">
      <AppHeader active="meetings" extra={
        <span className={dotClass}>{st === "done" ? "готово" : st === "error" ? "ошибка" : "обработка"}</span>
      } />
      <div className="tz-body">
        <div className="tz-head">
          <div className="grow">
            <div className="crumb">
              <Link to="/projects" className="link-btn">← Проекты</Link>
              {live && data.meeting.project_name && (
                <> / <Link to={data.meeting.project_id ? `/projects/${data.meeting.project_id}` : "/projects"}>{data.meeting.project_name}</Link></>
              )}
              {" / "}<b>{live ? data.meeting.title : "Демонстрация"}</b>
            </div>
            <div className="tz-title">{data.meeting.title}</div>
            <div className="tz-sub">{data.meeting.description || "Техническое задание, сформированное AI из разговора команды"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <div style={{ display: "flex", gap: 8 }}>
              {live && <Link className="btn btn-ghost" to={`/tz/${data.meeting.id}/doc`}><FileText size={14} /> Открыть ТЗ</Link>}
              <button className="btn btn-red" onClick={downloadPDF}><Download size={15} /> Скачать ТЗ</button>
            </div>
            {exportHint && <span style={{ fontSize: 11, color: "var(--tx-3)" }}>Экспорт — для загруженных записей</span>}
          </div>
        </div>

        <div className="audio">
          <audio ref={audioRef} src={live ? audioUrl(data.meeting.id) : undefined}
                 onPlay={() => setAudio((s) => ({ ...s, playing: true }))}
                 onPause={() => setAudio((s) => ({ ...s, playing: false }))} />
          <button className="a-play" onClick={togglePlay} disabled={!live} aria-label="play">
            {audio.playing ? <span style={{ fontSize: 10, fontWeight: 800 }}>❚❚</span> : <Play size={13} color="#fff" />}
          </button>
          <div className="a-wave" onClick={seekWave}>
            {waveBars.map((h, i) => (
              <i key={i} className={audio.dur && (i / waveBars.length) * audio.dur <= audio.cur ? "p" : ""}
                 style={{ height: `${14 + h * 78}%` }} />
            ))}
          </div>
          <span className="a-time"><b>{fmtSec(audio.cur)}</b> / {fmtSec(audio.dur || data.meeting.duration_sec || 0)}</span>
          {live && !audio.dur && <span className="a-hint">аудио недоступно</span>}
          {curSpeaker && <span className="a-speaker">{curSpeaker}</span>}
        </div>

        {busy && (
          <div className="proc">
            <b><span className="ai-pulse" /> {busyKey === "uploaded" ? "Файл сохранён" : "Анализируем встречу"}</b>
            {(data.meeting.is_video ? STEPS_VIDEO : STEPS_AUDIO).map(([k, label], i) => {
              const order = (data.meeting.is_video ? STEPS_VIDEO : STEPS_AUDIO).map(([s]) => s);
              const cur = order.indexOf(busyKey);
              return <span key={k} className={`ps ${cur > i ? "done" : cur === i ? "now" : ""}`}><i /> {label}</span>;
            })}
            {busyKey === "uploaded" ? (
              <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                {canEdit && <button className="btn btn-red btn-sm" onClick={runPipeline}>Начать анализ</button>}
                <span style={{ fontSize: 11.5, color: "var(--tx-4)" }}>обработка начнётся по кнопке или автоматически</span>
              </span>
            ) : (
              <span style={{ fontSize: 11.5, color: "var(--tx-4)" }}>страницу можно не закрывать — результат подставится сам</span>
            )}
          </div>
        )}
        {!busy && errMsg && (
          <div className="proc" style={{ borderColor: "rgba(239,43,45,.35)" }}>
            <b style={{ color: "var(--red-deep)" }}><AlertTriangle size={14} /> Не удалось обработать встречу</b>
            <span style={{ fontSize: 12.5, color: "var(--tx-3)" }}>{errMsg}</span>
            <span style={{ display: "inline-flex", gap: 8 }}>
              {canEdit && <button className="btn btn-red btn-sm retry" onClick={runPipeline}>Повторить обработку</button>}
              <button className="btn btn-ghost btn-sm retry" onClick={() => openNewMeeting()}>Загрузить заново</button>
            </span>
          </div>
        )}

        <div className="tabs">
          <button className={tab === "reqs" ? "active" : ""} onClick={() => setTab("reqs")}>Требования <span className="n">{itemsAll.length}</span></button>
          <button className={tab === "clarify" ? "active" : ""} onClick={() => setTab("clarify")}>Требуют уточнения <span className="n">{clarifyN}</span></button>
          <button className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}>Вопросы <span className="n">{data.open_questions.length}</span></button>
          <button className={tab === "contradictions" ? "active" : ""} onClick={() => setTab("contradictions")}>Противоречия <span className="n">{data.contradictions.length}</span></button>
          <button className={tab === "roles" ? "active" : ""} onClick={() => setTab("roles")}><Users size={13} /> Роли <span className="n">{roleNames.length}</span></button>
        </div>

        <div className="grid-main">
          <aside className="panel p-list">
            <div className="panel-h">Элементы {canEdit && <button className="icon-btn" title="Добавить требование" onClick={addManual}><Plus size={15} /></button>}</div>
            <div className="search"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по требованиям…" /></div>
            <div className="panel-b">
              {(tab === "reqs" || tab === "clarify") && shownReqs.map((r) => (
                <div key={r.id} className={`item ${sel?.kind === "req" && sel.id === r.id ? "selected" : ""}`} title={r.title}
                     onClick={() => {
                       setSel({ kind: "req", id: r.id }); setEditing(false);
                       const f = parseTc(r.source?.start_time);
                       if (f != null) {
                         const seg = data.transcript.find((s) => s.start_sec <= f && s.end_sec >= f)
                           ?? data.transcript.find((s) => s.start_sec >= f);
                         if (seg) window.setTimeout(() =>
                           transcriptRef.current?.querySelector(`[data-seg="${seg.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
                       }
                     }}>
                  <div className="item-top">
                    <span className="item-code">{idNum(r.public_id)} · {r.type === "constraint" ? "ОГРАНИЧЕНИЕ" : "ТРЕБОВАНИЕ"}</span>
                    <span className={`badge ${r.priority}`}>{r.priority}</span>
                  </div>
                  <div className="t">{idsNum(r.title)}</div>
                  <small>{r.source?.start_time ? `${r.source.start_time.slice(3)}–${(r.source.end_time ?? "").slice(3)} · ` : ""}{r.for_roles || "ALL"}</small>
                  {(contraIds.has(r.public_id) || r.needs_clarification) && (
                    <div className="flags">
                      {contraIds.has(r.public_id) && <span className="flag"><AlertTriangle size={10} /> противоречие</span>}
                      {r.needs_clarification && <span className="flag">уточнить</span>}
                    </div>
                  )}
                </div>
              ))}
              {tab === "questions" && data.open_questions.map((q) => (
                <div key={q.id} className={`item ${sel?.kind === "q" && sel.id === q.id ? "selected" : ""}`}
                     onClick={() => setSel({ kind: "q", id: q.id })}>
                  <div className="item-top"><span className="item-code">ВОПРОС</span>{q.resolved && <CheckCircle2 size={13} color="#2e7d32" />}</div>
                  <div className="t">{q.description}</div>
                </div>
              ))}
              {tab === "contradictions" && data.contradictions.map((x) => (
                <div key={x.id} className={`item conflict ${x.resolved ? "resolved" : ""} ${sel?.kind === "contra" && sel.id === x.id ? "selected" : ""}`}
                     onClick={() => setSel({ kind: "contra", id: x.id })}>
                  <div className="item-top"><span className="item-code">{idsNum(x.requirement_public_ids)}</span>{x.resolved && <CheckCircle2 size={13} color="#2e7d32" />}</div>
                  <div className="t">{idsNum(x.description)}</div>
                </div>
              ))}
              {tab === "roles" && roleNames.map((role) => (
                <div key={role} className={`item ${sel?.kind === "role" && sel.id.toLowerCase() === role.toLowerCase() ? "selected" : ""}`}
                     onClick={() => setSel({ kind: "role", id: role })}>
                  <div className="item-top"><span className="item-code">РОЛЬ</span><span className="badge">{reqsByRole(role).length} треб.</span></div>
                  <div className="t">{role}</div>
                  <small>{data.transcript.filter((s) => (s.speaker || "").toLowerCase() === role.toLowerCase()).length} реплик в транскрипции</small>
                </div>
              ))}
              {tab === "roles" && !roleNames.length && <div className="empty">AI не выделил роли — данные появятся после анализа</div>}
              {tab === "reqs" && !shownReqs.length && <div className="empty">Ничего не найдено</div>}
            </div>
          </aside>

          <section className="panel p-detail">
            <div className="panel-b">
              {selReq ? (
                <ReqDetail r={selReq} inContra={contraIds.has(selReq.public_id)} patch={patch} remove={remove} canEdit={canEdit}
                           onAsk={() => setAskFor(selReq)} onSeek={() => seek(selReq.source?.start_time, selReq.source?.text)}
                           editing={editing} setEditing={setEditing} editDraft={editDraft} setEditDraft={setEditDraft} />
              ) : selContra ? <ContraDetail x={selContra} itemsAll={itemsAll} canEdit={canEdit} onOpenReq={(id) => { setTab("reqs"); setSel({ kind: "req", id }); setEditing(false); }} onToggle={() => toggleContra(selContra)} />
              : selQ ? <QDetail q={selQ} canEdit={canEdit && live} onToggle={() => toggleQuestion(selQ)}
                                onOpenReq={itemsAll.find((r) => r.id === selQ.requirement_id || r.public_id === selQ.requirement_public_id)?.id
                                  ? () => { setTab("reqs"); setSel({ kind: "req", id: (itemsAll.find((r) => r.id === selQ.requirement_id || r.public_id === selQ.requirement_public_id))!.id }); setEditing(false); } : undefined} />
              : selRole !== undefined && selRole ? <RoleDetail role={selRole} reqs={reqsByRole(selRole)}
                                                                onOpenReq={(id) => { setTab("reqs"); setSel({ kind: "req", id }); setEditing(false); }} />
              : <div className="empty">Выберите элемент слева</div>}
            </div>
          </section>

          <div className="panel p-trans">
            <div className="half">
              <div className="panel-h">
                Транскрипция <span className="count">{data.transcript.length} фраз</span>
              </div>
              <div className="panel-b">
                <div ref={transcriptRef} className="tr">
                  {trShown.map((s) => {
                    return (
                      <p key={s.id} data-seg={s.id}
                         className={`tr-line ${linkedIds.has(s.id) ? "link" : ""} ${highlight?.id === s.id ? "now" : ""} ${live && s.start_sec <= audio.cur && s.end_sec >= audio.cur ? "now" : ""}`}
                         onClick={() => {
                           const a = audioRef.current;
                           if (a && live) { a.currentTime = s.start_sec; a.play().catch(() => {}); }
                           setHighlight(s);
                         }}>
                        <span className="tc">{fmtSec(s.start_sec)}</span>
                        <span><b>{s.speaker ?? "Говорящий"}:</b> {s.text}</span>
                      </p>
                    );
                  })}
                  {!data.transcript.length && <div className="empty" style={{ placeItems: "start" }}>Транскрипция появится после обработки.</div>}
                </div>
                {(selReq?.source?.start_time || trAll) && (
                  <div className="tr-more" style={{ padding: "8px 0 0" }}>
                    {trAll ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => setTrAll(false)}>Только связанные с требованием</button>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => setTrAll(true)}>Показать всю транскрипцию ({data.transcript.length})</button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="half">
              <div className="panel-h">Источник требования <ArrowRight size={13} /></div>
              <div className="panel-b">
                {selReq?.source?.text ? (
                  <div className="source-card">
                    <div className="src-link">{idNum(selReq.public_id)} ← исходная реплика</div>
                    <div className="source-time"><Clock3 size={13} /> {selReq.source.start_time?.slice(3) ?? "?"} — {selReq.source.end_time?.slice(3) ?? "?"}</div>
                    <blockquote>«{selReq.source.text}»</blockquote>
                    <button className="btn btn-dark btn-sm" onClick={() => seek(selReq.source?.start_time, selReq.source?.text)}>
                      <Play size={12} color="#fff" /> Открыть источник
                    </button>
                  </div>
                ) : selReq ? (
                  <div className="note warn"><AlertTriangle size={15} /><span>Для этого требования источник в записи не найден — скорее всего, его добавили вручную или формулировку стоит уточнить.</span></div>
                ) : (
                  <div className="empty">Выберите требование — здесь появится его цитата из разговора</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {askFor && (
        <div className="tz-modal-back" onClick={() => setAskFor(null)}>
          <div className="tz-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Напишите ваш вопрос</h2>
            <span className="tag">{idNum(askFor.public_id)} · {askFor.title}</span>
            <textarea autoFocus value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Мой вопрос…" />
            <div className="row">
              <button className="ghost" onClick={() => setAskFor(null)}>Отмена</button>
              <button className="primary" disabled={questionText.trim().length < 3} onClick={sendQuestion}>Отправить специалисту</button>
            </div>
          </div>
        </div>
      )}
      <AppFooter />
    </div>
  );
}

function stepLabel(status: string) {
  return ({
    uploaded: "Файл принят — ждём расшифровку…",
    extracting: "Извлекаем аудиодорожку из видео…",
    transcribing: "Расшифровываем аудиозапись…",
    analyzing: "AI анализирует требования…",
  } as Record<string, string>)[status] ?? "Обрабатываем запись…";
}

function ReqDetail({ r, inContra, patch, remove, onAsk, onSeek, canEdit = true, editing, setEditing, editDraft, setEditDraft }: {
  r: Req; inContra: boolean; patch: (r: Req, b: Partial<Req>) => void; remove: (r: Req) => void; onAsk: () => void; onSeek: () => void; canEdit?: boolean;
  editing: boolean; setEditing: (v: boolean) => void;
  editDraft: { title: string; description: string }; setEditDraft: (v: { title: string; description: string }) => void;
}) {
  const conf = Math.round(r.confidence * 100);
  return (
    <div style={{ paddingTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="eyebrow">№ {idNum(r.public_id)} · {r.type === "constraint" ? "ограничение" : "требование"}{r.manual ? " · вручную" : ""}</span>
        {canEdit && <button className="icon-btn danger" title="Удалить" onClick={() => remove(r)}><Trash2 size={15} /></button>}
      </div>
      <div className="detail-title">{idsNum(r.title)}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className={`pill ${r.priority === "high" ? "red" : r.priority === "low" ? "green" : ""}`}>{r.priority.toUpperCase()} приоритет</span>
        <span className="pill">Роль: {r.for_roles || "ALL"}</span>
        <span className={`pill ${conf >= 85 ? "green" : "red"}`}>Уверенность {conf}%</span>
      </div>

      <div className="sec">
        <h4>Формулировка</h4>
        <p>{r.description || "Описание не указано."}</p>
      </div>

      <div className="sec">
        <h4>AI-анализ</h4>
        <div className={`note ${inContra || r.needs_clarification ? "warn" : "good"}`}>
          {inContra || r.needs_clarification ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          <span>
            {inContra
              ? "Требование участвует в найденном противоречии — сверьте формулировки с участниками встречи."
              : r.needs_clarification
                ? "Цитата совпала с транскриптом не полностью — рекомендуем уточнить у автора речи."
                : "Требование подтверждено цитатой из записи: уверенность = реальное совпадение с транскриптом, а не оценка модели."}
          </span>
        </div>
      </div>

      {!!r.user_stories?.length && (
        <div className="sec">
          <h4>Пользовательские истории</h4>
          {r.user_stories.map((u) => (
            <div key={u.id} className="note plain" style={{ marginTop: 6 }}>Как <b style={{ margin: "0 4px" }}>{u.role}</b>, я хочу <b style={{ margin: "0 4px" }}>{u.action}</b>, чтобы <b style={{ margin: "0 4px" }}>{u.goal}</b>.</div>
          ))}
        </div>
      )}
      {canEdit && (
      <div className="sec">
        <h4>Приоритет</h4>
        <div className="prio-row">
          {(["high", "medium", "low"] as const).map((p) => (
            <button key={p} className={r.priority === p ? "on" : ""} onClick={() => patch(r, { priority: p })}>
              {p === "high" ? "HIGH" : p === "medium" ? "MEDIUM" : "LOW"}
            </button>
          ))}
        </div>
      </div>
      )}

      <div className="sec">
        <h4>Редактирование</h4>
        {editing ? (
          <div className="edit-form">
            <input value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} placeholder="Название" />
            <textarea value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} placeholder="Описание" />
            <div className="detail-actions">
              <button className="btn btn-red" onClick={() => { patch(r, { title: editDraft.title, description: editDraft.description }); setEditing(false); }}>Сохранить</button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Отмена</button>
            </div>
          </div>
        ) : (
          <div className="detail-actions">
            {r.source?.text && (
              <button className="btn btn-ghost" onClick={onSeek}><Play size={12} /> Открыть источник</button>
            )}
            {canEdit && <>
              <button className="btn btn-ghost" onClick={() => { setEditDraft({ title: r.title, description: r.description }); setEditing(true); }}><FileText size={14} /> Редактировать</button>
              <button className="btn btn-ghost" style={{ color: "var(--red)" }} onClick={onAsk}>
                {r.needs_clarification ? "Переоткрыть вопрос" : "Задать вопрос специалисту"}
              </button>
              <button className="btn btn-ghost" onClick={() => remove(r)}><Trash2 size={13} /> Удалить</button>
            </>}
          </div>
        )}
      </div>
    </div>
  );
}

function ContraDetail({ x, itemsAll, onOpenReq, onToggle, canEdit = true }: {
  x: Contra; itemsAll: Req[]; onOpenReq: (id: string) => void; onToggle: () => void; canEdit?: boolean;
}) {
  const ids = x.requirement_public_ids.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const get = (pid: string) => {
    const d = (pid.match(/\d+/) || [])[0];
    return itemsAll.find((r) => r.public_id === pid || (!!d && r.public_id.replace(/\D/g, "") === d));
  };
  const pair = ids.map(get);
  return (
    <div style={{ paddingTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="eyebrow">Противоречие · {idsNum(x.requirement_public_ids)}</span>
        <AlertTriangle size={17} color="var(--red)" />
      </div>
      <div className="detail-title" style={{ fontSize: 22 }}>{idsNum(x.description)}</div>
      <div className="sec">
        <h4>Конфликтующие требования</h4>
        <div className="vs-row">
          <div className="vs-box">
            <div className="src-link">{idNum(pair[0]?.public_id) || idsNum(ids[0] ?? "")}</div>
            {pair[0]?.title ?? "Требование не найдено"}
            {pair[0] && <div><button className="link-btn" style={{ marginTop: 6 }} onClick={() => onOpenReq(pair[0]!.id)}>открыть →</button></div>}
          </div>
          <span className="vs">ПРОТИВ</span>
          <div className="vs-box">
            <div className="src-link">{idNum(pair[1]?.public_id) || idsNum(ids[1] ?? "")}</div>
            {pair[1]?.title ?? "Требование не найдено"}
            {pair[1] && <div><button className="link-btn" style={{ marginTop: 6 }} onClick={() => onOpenReq(pair[1]!.id)}>открыть →</button></div>}
          </div>
        </div>
      </div>
      <div className="sec">
        <h4>Рекомендация AI</h4>
        <div className="note good"><CheckCircle2 size={15} /><span>{x.recommendation || "Рекомендация не сгенерирована."}</span></div>
      </div>
      {canEdit && (
      <div className="detail-actions">
        <button className={x.resolved ? "btn btn-ghost" : "btn btn-red"} onClick={onToggle}>
          {x.resolved ? "Снять отметку" : <><CheckCircle2 size={14} color="#fff" /> Отметить разрешённым</>}
        </button>
      </div>
      )}
    </div>
  );
}

function QDetail({ q, onOpenReq, onToggle, canEdit }: { q: Question; onOpenReq?: () => void; onToggle: () => void; canEdit: boolean }) {
  return (
    <div style={{ paddingTop: 14 }}>
      <span className="eyebrow">Требует уточнения {q.resolved && "· закрыт"}</span>
      <div className="detail-title" style={{ fontSize: 22 }}>{q.description}</div>
      {q.source_text && (
        <div className="sec">
          <h4>Почему необходимо уточнение</h4>
          <div className="source-card"><blockquote>«{q.source_text}»</blockquote></div>
        </div>
      )}
      <div className="sec">
        <div className={`note ${q.resolved ? "good" : "plain"}`}>
          {q.resolved ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{q.resolved ? "Вопрос закрыт командой." : "Вопрос открыт — нужен ответ участников встречи."}</span>
        </div>
      </div>
      <div className="detail-actions">
        {canEdit && (
          <button className={q.resolved ? "btn btn-ghost" : "btn btn-red"} onClick={onToggle}>
            {q.resolved ? <><X size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Переоткрыть вопрос</>
              : <><CheckCircle2 size={14} color="#fff" style={{ verticalAlign: -2, marginRight: 4 }} />Отметить закрытым</>}
          </button>
        )}
        {onOpenReq && <button className="btn btn-ghost" onClick={onOpenReq}><FileText size={13} /> Открыть требование</button>}
      </div>
    </div>
  );
}

function RoleDetail({ role, reqs, onOpenReq }: { role: string; reqs: Req[]; onOpenReq: (id: string) => void }) {
  return (
    <div style={{ paddingTop: 14 }}>
      <span className="eyebrow">Роль из разговора</span>
      <div className="detail-title" style={{ fontSize: 24 }}>{role}</div>
      <div className="sec">
        <h4>Затронутые требования ({reqs.length})</h4>
        {reqs.length ? reqs.map((r) => (
          <div key={r.id} className="note plain" style={{ marginTop: 6, cursor: "pointer" }} onClick={() => onOpenReq(r.id)}>
            <FileText size={15} style={{ flex: "none", marginTop: 2 }} />
            <span><b style={{ marginRight: 8 }}>{idNum(r.public_id)}</b>{r.title}</span>
          </div>
          )) : <div className="note plain">Роль не закреплена за отдельными требованиями — она упоминалась в разговоре или определена по голосовой дорожке.</div>}
      </div>
    </div>
  );
}

const waveBars = Array.from({ length: 72 }, (_, i) =>
  0.25 + 0.75 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.31) + 0.4 * Math.sin(i * 1.7)));
