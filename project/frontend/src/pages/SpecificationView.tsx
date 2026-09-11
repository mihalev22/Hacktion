import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Download, FileText, ListChecks,
  Loader2, Pencil, Play, ShieldQuestion, Sparkles, Users as UsersIcon, HelpCircle, SlidersHorizontal,
} from "lucide-react";
import { AppFooter, AppHeader } from "../chrome";
import { api } from "../api";
import { PRIO_ORDER } from "../types";
import { idNum, idsNum } from "../utils/id";
import type { MeetingData, Req } from "../types";
import { downloadTzPdf, tzPdfFilename } from "../pdf";
import { toast } from "../ui";
import "../tz.css";

const SECTIONS = [
  ["overview", "01", "Общая информация", FileText],
  ["requirements", "02", "Функциональные требования", ListChecks],
  ["nonfunctional", "03", "Нефункциональные требования", SlidersHorizontal],
  ["roles", "04", "Роли и участники", UsersIcon],
  ["constraints", "05", "Ограничения", ShieldQuestion],
  ["contradictions", "06", "Противоречия", AlertTriangle],
  ["questions", "07", "Открытые вопросы", HelpCircle],
] as const;

export default function SpecificationView() {
  const params = useParams();
  const id = params.id ?? "mock";
  const [data, setData] = useState<MeetingData | null>(null);
  const [err, setErr] = useState("");
  const [active, setActive] = useState<string>("overview");
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  const nav = useNavigate();
  const pdfTriggeredFor = useRef("");
  const pdfRunningRef = useRef(false);
  const suppressSpy = useRef(false);

  const runPdfDownload = async (title: string) => {
    if (pdfRunningRef.current) return;
    pdfRunningRef.current = true;
    setIsGeneratingPDF(true);
    try {
      await downloadTzPdf(tzPdfFilename(title));
    } catch (e) {
      console.error("Ошибка создания PDF:", e);
      toast("Не удалось создать PDF. Попробуйте ещё раз.", "err");
    } finally {
      pdfRunningRef.current = false;
      setIsGeneratingPDF(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (id === "mock") { setData(await api("/api/mock")); return; }
        const detail = await api(`/api/meetings/${id}`);
        const transcript = await api(`/api/meetings/${id}/transcript`);
        setData({ ...detail, transcript });
      } catch (e) { setErr(String(e)); }
    })();
  }, [id]);

  // авто-запуск с экрана редактирования: /tz/:id/doc?pdf=1 → скачать один раз
  useEffect(() => {
    if (!data) return;
    const wantsPdf = new URLSearchParams(loc.search).get("pdf") === "1";
    if (!wantsPdf || pdfTriggeredFor.current === loc.key) return;
    pdfTriggeredFor.current = loc.key;
    nav(loc.pathname, { replace: true });
    void runPdfDownload(data.meeting.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loc.search, loc.key]);

  if (err) return (
    <div className="app-ui"><AppHeader active="tz" />
      <div className="dash"><div className="dash-in"><div className="empty-state"><b>Не удалось загрузить ТЗ</b><span>{err}</span><Link to="/tz" className="btn btn-ghost">К списку</Link></div></div></div>
      <AppFooter /></div>
  );
  if (!data) return (
    <div className="app-ui"><AppHeader active="tz" />
      <div className="dash"><div className="dash-in"><div className="list-col">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 70 }} />)}</div></div></div>
      <AppFooter /></div>
  );

  const funcReqs = data.requirements.filter((r) => r.type !== "non-functional" && r.type !== "constraint");
  const nfReqs = data.requirements.filter((r) => r.type === "non-functional");
  const citationPct = data.requirements.length
    ? Math.round((data.requirements.filter((r) => r.source?.text).length / data.requirements.length) * 100)
    : 0;
  const sorted = (a: Req[]) => [...a].sort((x, y) => (PRIO_ORDER[x.priority] ?? 1) - (PRIO_ORDER[y.priority] ?? 1));

  const jump = (sec: string) => {
    const el = bodyRef.current;
    const target = el?.querySelector<HTMLElement>(`#sec-${sec}`);
    setActive(sec);
    if (!el || !target) return;
    suppressSpy.current = true;
    const top = el.scrollTop + (target.getBoundingClientRect().top - el.getBoundingClientRect().top) - 14;
    el.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    window.setTimeout(() => { suppressSpy.current = false; }, 850);
  };

  const downloadPDF = () => runPdfDownload(data.meeting.title);

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el || suppressSpy.current) return;
    const elTop = el.getBoundingClientRect().top;
    let cur: string = SECTIONS[0][0];
    el.querySelectorAll<HTMLElement>("[data-sec]").forEach((s) => {
      if (s.getBoundingClientRect().top - elTop <= 160) cur = s.dataset.sec!;
    });
    setActive(cur);
  };

  return (
    <div className="app-ui doc-screen">
      <AppHeader active="tz" tzHref={`/tz/${id}`} />
      <div className="doc-layout pagein">
        <aside className="doc-nav">
          <div className="crumb" style={{ padding: "6px 4px 10px" }}><Link to="/tz" className="link-btn"><ArrowLeft size={13} /> Все ТЗ</Link></div>
          <div className="doc-nav-title">Содержание</div>
          {SECTIONS.map(([key, num, label, Icon]) => (
            <button key={key} className={`doc-nav-item ${active === key ? "on" : ""}`} onClick={() => jump(key)}>
              <span className="dn">{num}</span><Icon size={14} /><span>{label}</span>
            </button>
          ))}
          <div className="doc-stat-card">
            <Sparkles size={13} color="var(--red)" /> Подтверждено цитатами из записи
            <div className="pct">{citationPct}%</div>
          </div>
        </aside>

        <div className="doc-main" id="technical-specification">
          <div className="doc-head">
            <div className="crumb">Техническое задание / <b>{data.meeting.title}</b></div>
            <h1>{data.meeting.title}</h1>
            <div className="doc-sub">{data.meeting.description || "Сформировано из расшифровки встречи"}</div>
            <div className="stat-chips" style={{ margin: "16px 0 0" }}>
              <span className="stat-chip"><b>{data.requirements.length}</b> требований</span>
              <span className="stat-chip problem"><b>{data.open_questions.length}</b> вопросов</span>
              <span className="stat-chip problem"><b>{data.requirements.filter((r) => r.needs_clarification).length}</b> требуют уточнения</span>
              <span className="stat-chip problem"><b>{data.contradictions.length}</b> противоречий</span>
            </div>
            <div className="doc-actions pdf-exclude">
              <button className="btn btn-red" onClick={downloadPDF} disabled={isGeneratingPDF}>
                {isGeneratingPDF
                  ? <><Loader2 size={15} className="spin" /> Создание PDF...</>
                  : <><Download size={15} /> Скачать PDF</>}
              </button>
              {id !== "mock" && <Link to={`/tz/${id}`} className="btn btn-ghost"><Pencil size={14} /> Редактировать</Link>}
            </div>
          </div>

          <div className="doc" ref={bodyRef} onScroll={onScroll}>
            <div className="doc-in">
              <section id="sec-overview" data-sec="overview">
                <h2 className="doc-sec">01 · Общая информация</h2>
                <p className="doc-lead">{data.meeting.summary ? idsNum(data.meeting.summary) : "Выжимка ещё не сформирована."}</p>
              </section>

              <section id="sec-requirements" data-sec="requirements">
                <h2 className="doc-sec">02 · Функциональные требования</h2>
                {sorted(funcReqs).map((r) => <ReqBlock key={r.id} r={r} />)}
                {!funcReqs.length && <div className="note plain">Пока нет функциональных требований.</div>}
              </section>

              <section id="sec-nonfunctional" data-sec="nonfunctional">
                <h2 className="doc-sec">03 · Нефункциональные требования</h2>
                {sorted(nfReqs).map((r) => <ReqBlock key={r.id} r={r} />)}
                {!nfReqs.length && <div className="note plain">Нефункциональные требования не выявлены.</div>}
              </section>

              <section id="sec-roles" data-sec="roles">
                <h2 className="doc-sec">04 · Роли и участники</h2>
                <div>
                  {data.roles.map((role) => {
                    const count = data.requirements.filter((r) => (r.for_roles || "").toLowerCase().includes(role.toLowerCase())).length;
                    return <span key={role} className="role-card">{role} {count > 0 && <span className="n">{count}</span>}</span>;
                  })}
                  {!data.roles.length && <div className="note plain">Роли в разговоре явно не названы.</div>}
                </div>
              </section>

              <section id="sec-constraints" data-sec="constraints">
                <h2 className="doc-sec">05 · Ограничения</h2>
                {data.constraints.map((c) => (
                  <div key={c.id} className="doc-req"><div className="hd"><span className="code">{idNum(c.public_id)}</span><span className="tt">{c.title}</span></div>
                    <p>{c.description}</p></div>
                ))}
                {!data.constraints.length && <div className="note plain">Ограничения не выявлены.</div>}
              </section>

              <section id="sec-contradictions" data-sec="contradictions">
                <h2 className="doc-sec">06 · Противоречия {data.contradictions.length > 0 && <span className="badge high">{data.contradictions.length}</span>}</h2>
                {data.contradictions.map((x) => {
                  const pair = x.requirement_public_ids.split(/[,;]/).map((s) => s.trim());
                  const get = (pid: string) => {
                    const d = (pid.match(/\d+/) || [])[0];
                    return data.requirements.find((r) => r.public_id === pid || (!!d && r.public_id.replace(/\D/g, "") === d));
                  };
                  return (
                    <div key={x.id} className="doc-req" style={{ borderColor: "rgba(239,43,45,.28)" }}>
                      <div className="hd"><AlertTriangle size={14} color="var(--red)" /><span className="tt">{idsNum(x.description)}</span></div>
                      <div className="vs-row">
                        <div className="vs-box"><div className="src-link">{idNum(get(pair[0])?.public_id) || idsNum(pair[0] ?? "")}</div>{get(pair[0]) ? idsNum(get(pair[0])!.title) : "—"}</div>
                        <span className="vs">ПРОТИВ</span>
                        <div className="vs-box"><div className="src-link">{idNum(get(pair[1])?.public_id) || idsNum(pair[1] ?? "")}</div>{get(pair[1]) ? idsNum(get(pair[1])!.title) : "—"}</div>
                      </div>
                      <p style={{ marginTop: 8, fontSize: 12.5 }}>Рекомендация: {idsNum(x.recommendation) || "—"}</p>
                    </div>
                  );
                })}
                {!data.contradictions.length && <div className="note good"><CheckCircle2 size={15} /><span>Противоречий не найдено.</span></div>}
              </section>

              <section id="sec-questions" data-sec="questions">
                <h2 className="doc-sec">07 · Открытые вопросы</h2>
                {data.open_questions.map((q) => (
                  <div key={q.id} className="doc-req">
                    <div className="hd"><span className="code">?</span><span className="tt">{idsNum(q.description)}</span>{q.resolved && <CheckCircle2 size={15} color="var(--green)" />}</div>
                    {q.source_text && <p>«{q.source_text}»</p>}
                  </div>
                ))}
                {!data.open_questions.length && <div className="note plain">Открытых вопросов нет.</div>}
              </section>
            </div>
          </div>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}

function ReqBlock({ r }: { r: Req }) {
  const conf = Math.round(r.confidence * 100);
  return (
    <div className="doc-req">
      <div className="hd">
        <span className="code">{idNum(r.public_id)}</span>
        <span className="tt">{idsNum(r.title)}</span>
        <span className={`badge ${r.priority}`}>{r.priority}</span>
      </div>
      <p>{idsNum(r.description)}</p>
      <div className="foot">
        <span><UsersIcon size={12} /> Роль: <b>{r.for_roles || "ALL"}</b></span>
        <span>Уверенность: <b>{conf}%</b></span>
        {r.source?.start_time && (
          <span><Clock3 size={12} /> Источник: <b>{r.source.start_time.slice(3)}–{r.source.end_time?.slice(3)}</b></span>
        )}
        {r.needs_clarification && <span className="badge red-soft">требует уточнения</span>}
      </div>
      {r.source?.text && <div className="note plain" style={{ marginTop: 10 }}><Play size={13} /><span>«{r.source.text}»</span></div>}
      {!!r.user_stories?.length && (
        <div style={{ marginTop: 8 }}>
          {r.user_stories.map((u) => <div key={u.id} className="note plain" style={{ marginTop: 6 }}>Как <b style={{ margin: "0 3px" }}>{u.role}</b>, я хочу <b style={{ margin: "0 3px" }}>{u.action}</b>, чтобы <b style={{ margin: "0 3px" }}>{u.goal}</b>.</div>)}
        </div>
      )}
    </div>
  );
}
