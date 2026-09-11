import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, ArrowUpRight, FileCheck2, FileText, ListChecks, Mic,
  Moon, ShieldCheck, Sparkles, Link2, Sun, Users,
} from "lucide-react";
import { AppFooter, AppHeader } from "./chrome";
import ProjectCard from "./components/ProjectCard";
import MeetingRow from "./components/MeetingRow";
import { openNewMeeting } from "./ui";
import { useMeetings } from "./hooks/useMeetings";
import { getProjects } from "./services/projects";
import type { Project } from "./services/projects";
import { api } from "./api";
import { isDark, setPref, subscribeTheme } from "./theme";
import type { MeetingData } from "./types";
import "./tz.css";

function ThemeToggle() {
  const [dark, setDark] = useState(isDark());
  useEffect(() => subscribeTheme(setDark), []);
  return (
    <button
      className="theme-toggle theme-toggle--inline"
      onClick={() => setPref(dark ? "light" : "dark")}
      aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={dark ? "Светлая тема" : "Тёмная тема"}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

export default function Home() {
  const { list, error, refetch, remove } = useMeetings(8000);
  const nav = useNavigate();
  const [showcase, setShowcase] = useState<MeetingData | null>(null);

  const all = list ?? [];
  const done = all.filter((m) => m.status === "done");
  const src = all; // статистика за всё время (все встречи пользователя из БД)
  const reqSum = all.reduce((a, m) => a + (m.requirements_count ?? 0), 0);
  const tzSum = done.length;
  const roleSum = all.reduce((a, m) => a + (m.roles_count ?? 0), 0);
  const label = "За всё время";

  const [projects, setProjects] = useState<Project[] | null>(null);
  useEffect(() => { if (list !== null) getProjects().then(setProjects).catch(() => setProjects([])); }, [list]);

  useEffect(() => {
    const id = done[0]?.id;
    if (!id) { setShowcase(null); return; }
    (async () => {
      try { setShowcase(await api(`/api/meetings/${id}`)); } catch { setShowcase(null); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list === null ? 0 : done.length]);

  const previewReqs = showcase?.requirements.slice(0, 2) ?? [];

  return (
    <div className="app-ui">
      <AppHeader active="home" extra={<ThemeToggle />} />

      <div className="dash">
        <div className="dash-in">
          {/* ---- HERO ---- */}
          <section className="hero3">
            <div className="hc">
              <h1 className="hero-h1">Превратите разговор<br />в <span>готовое ТЗ</span></h1>
              <p className="lead">Загрузите запись встречи — система автоматически выделит требования,
                роли, противоречия и открытые вопросы, а затем сформирует структурированное техническое задание.</p>
              <div className="hero-actions">
                <button className="btn btn-red" style={{ height: 44, fontSize: 13 }} onClick={() => openNewMeeting()}>
                  <Mic size={16} color="#fff" /> Новая встреча
                </button>
                <Link className="btn btn-ghost" style={{ height: 44, fontSize: 13 }} to="/tz/mock/doc">
                  Открыть демо-ТЗ <ArrowUpRight size={15} />
                </Link>
              </div>
              <div className="hero-meta">
                <span><ShieldCheck size={14} /> AI-анализ</span>
                <span><Link2 size={14} /> Связь с источником</span>
                <span><FileCheck2 size={14} /> Готовое ТЗ</span>
              </div>
            </div>

            <div className="hp">
              <div className="hp-frame"><div className="hp-inner">
                <div className="hp-head">
                  <div className="hp-title">
                    <small>Сгенерированное ТЗ</small>
                    <strong>{showcase?.meeting.title ?? "Техническое задание"}</strong>
                  </div>
                  <span className="ai-badge">AI</span>
                </div>
                <div className="doc-heading">Функциональные требования</div>
                {previewReqs.length ? previewReqs.map((r, i) => (
                  <div className="doc-section" key={r.id}>
                    <span className="rq">{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <strong>{r.title}</strong>
                      <p>{r.description}</p>
                    </div>
                  </div>
                )) : (
                  <>
                    <div className="doc-section">
                      <span className="rq">1</span>
                      <div><strong>{showcase ? "Идёт обработка…" : "Авторизация пользователя"}</strong>
                        <p>{showcase ? "Данные формируются…" : "Пользователь должен иметь возможность войти в систему по email и паролю."}</p></div>
                    </div>
                    <div className="doc-section">
                      <span className="rq">2</span>
                      <div><strong>{showcase ? "Выделение требований" : "Личный кабинет"}</strong>
                        <p>{showcase ? "Пожалуйста, подождите…" : "Пользователь может просматривать и изменять персональные данные."}</p></div>
                    </div>
                  </>
                )}
                <div className="hp-foot">
                  <span><b>{done[0]?.requirements_count ?? "—"}</b> требований</span>
                  <span><b>{done[0]?.roles_count ?? "—"}</b> роли</span>
                  <span><b>{done[0]?.contradictions_count ?? 0}</b> противоречия</span>
                  {done[0] && <Link className="btn btn-ghost btn-sm" to={`/tz/${done[0].id}/doc`}>Открыть ТЗ <ArrowUpRight size={13} /></Link>}
                </div>
              </div></div>
            </div>
          </section>

          {/* ---- WORKFLOW ---- */}
          <section className="sect">
            <div className="sec-head3">
              <div>
                <h2>От разговора до ТЗ</h2>
                <p>Система автоматически проходит весь путь от записи встречи до структурированного документа.</p>
              </div>
            </div>
            <div className="flow3">
              <div className="fcard"><div className="fn">01 — ВСТРЕЧА</div><div className="fi"><Mic size={18} /></div>
                <h3>Загрузите разговор</h3><p>mp3, wav, m4a, webm или запись с микрофона. Файл обрабатывается сразу после загрузки.</p></div>
              <div className="fcard"><div className="fn">02 — AI-АНАЛИЗ</div><div className="fi"><Sparkles size={18} /></div>
                <h3>AI выделяет смысл</h3><p>Расшифровка с диаризацией, требования, роли, противоречия и пробелы — всё из исходной речи.</p></div>
              <div className="fcard"><div className="fn">03 — РЕЗУЛЬТАТ</div><div className="fi"><FileText size={18} /></div>
                <h3>Проверяемое ТЗ</h3><p>Каждое требование связано с таймкодом. Откройте источник одним кликом и скачайте документ.</p></div>
            </div>
          </section>

          {/* ---- PROJECTS ---- */}
          <section className="sect">
            <div className="sec-head3">
              <div><h2>Проекты</h2></div>
              <Link to="/projects">Все проекты <ArrowRight size={14} /></Link>
            </div>
            {error ? (
              <div className="empty-state"><b>{error}</b><span>Проверьте, что backend запущен (:8000)</span><button className="btn btn-ghost" onClick={refetch}>Повторить</button></div>
            ) : list === null ? (
              <div className="pcards3">{[0, 1].map((i) => <div key={i} className="skel" style={{ height: 210, borderRadius: 16 }} />)}</div>
            ) : projects && projects.length ? (
              <div className={`pcards3${projects.length === 1 ? " solo" : ""}`}>
                {projects.slice(0, 3).map((p) => (
                  <ProjectCard key={p.id} p={p} onOpen={() => nav(`/projects/${p.id}`)} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <ListChecks size={28} />
                <b>У вас пока нет проектов</b>
                <span>Загрузите первую встречу, и AI автоматически сформирует техническое задание.</span>
                <button className="btn btn-red" onClick={() => openNewMeeting()}><Mic size={15} color="#fff" /> Новая встреча</button>
              </div>
            )}
          </section>

          {/* ---- RECENT MEETINGS ---- */}
          {list && list.length > 0 && (
            <section className="sect">
              <div className="sec-head3">
                <div><h2>Последние встречи</h2></div>
                <Link to="/meetings">Все встречи <ArrowRight size={14} /></Link>
              </div>
              <div className="mlist3">
                {list.slice(0, 3).map((m) => (
                  <MeetingRow key={m.id} m={m}
                              onOpen={() => nav(m.project_id ? `/projects/${m.project_id}/meetings/${m.id}` : `/tz/${m.id}`)}
                              onDelete={() => remove(m)} />
                ))}
              </div>
            </section>
          )}

          {/* ---- STATS ---- */}
          {list && list.length > 0 && (
            <section>
              <div className="sec-head3 compact" style={{ marginBottom: 14 }}>
                <div><h2>{label}</h2></div>
              </div>
              <div className="stats3">
                <div className="scard"><div className="sl"><Mic size={13} /> Встречи</div><div className="sv">{src.length}</div></div>
                <div className="scard"><div className="sl"><ListChecks size={13} /> Требования</div><div className="sv">{reqSum}</div></div>
                <div className="scard"><div className="sl"><Users size={13} /> Роли</div><div className="sv">{roleSum}</div></div>
                <div className="scard"><div className="sl"><FileText size={13} /> Готовые ТЗ</div><div className="sv"><span>{tzSum}</span><em>из {src.length}</em></div></div>
              </div>
            </section>
          )}
        </div>
      </div>

      <AppFooter />
    </div>
  );
}
