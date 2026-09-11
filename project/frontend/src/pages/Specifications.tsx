import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Calendar, FileText, ListChecks, ShieldQuestion } from "lucide-react";
import { AppFooter, AppHeader } from "../chrome";
import { useMeetings } from "../hooks/useMeetings";
import { matchesFilter } from "../services/meetings";
import type { MeetingFilter } from "../services/meetings";

const FILTERS: [MeetingFilter, string][] = [["all", "Все"], ["ready", "Готовые"], ["work", "В работе"]];

export default function SpecificationsPage() {
  const { list } = useMeetings();
  const nav = useNavigate();
  const [filter, setFilter] = useState<MeetingFilter>("all");
  const shown = (list ?? []).filter((m) => matchesFilter(m, filter));

  return (
    <div className="app-ui">
      <AppHeader active="tz" />
      <div className="dash pagein">
        <div className="dash-in">
          <div className="sec-head3">
            <div>
              <span className="se">Документы</span>
              <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}><FileText size={20} color="var(--red)" /> Технические задания</h2>
              <p>Сгенерированные документы: требования, роли, ограничения и открытые вопросы из разговоров команды.</p>
            </div>
            <div className="segs">
              {FILTERS.map(([f, l]) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{l}</button>)}
            </div>
          </div>

          {list === null ? (
            <div className="pcards3">{[0, 1].map((i) => <div key={i} className="skel" style={{ height: 238, borderRadius: 16 }} />)}</div>
          ) : shown.length ? (
            <div className="pcards3">
              {shown.map((m) => {
                const ready = m.status === "done";
                const base = (x: typeof m) => x.project_id ? `/projects/${x.project_id}/meetings/${x.id}` : `/tz/${x.id}`;
                return (
                <div key={m.id} className="pcard3" onClick={() => nav(base(m))}
                     role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && nav(base(m))} aria-label={`Открыть ТЗ ${m.title}`}>
                    <div className="pt">
                      <span className="pi"><ShieldQuestion size={20} /></span>
                      <span className={`mstat ${ready ? "" : m.status === "error" ? "err" : "work"}`}
                            style={{ padding: "5px 10px", borderRadius: 999, fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, color: ready ? "var(--green)" : "var(--orange)", background: ready ? "var(--green-bg)" : "var(--orange-bg)" }}>
                        {ready ? "готово" : m.status === "error" ? "ошибка" : "в работе"}
                      </span>
                    </div>
                    <h3 title={m.title}>{m.title}</h3>
                    <p className="pd">Техническое задание, собранное AI из расшифровки встречи. Каждое требование привязано к таймкоду.</p>
                    <div className="pf">
                      <span><ListChecks size={12} /> {m.requirements_count} требований</span>
                      {(m.contradictions_count ?? 0) > 0 && <span><AlertTriangle size={12} style={{ color: "var(--red)" }} /> {m.contradictions_count} противоречий</span>}
                      <span><Calendar size={12} /> {new Date(m.created_at).toLocaleDateString("ru")}</span>
                    </div>
                    <button className="btn btn-red btn-sm" style={{ marginTop: 14, alignSelf: "flex-start" }}
                            onClick={(e) => { e.stopPropagation(); ready ? nav(`/tz/${m.id}/doc`) : nav(base(m)); }}>
                      Открыть ТЗ
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <FileText size={28} />
              <b>Готовых ТЗ пока нет</b>
              <span>Каждая обработанная встреча превращается в техническое задание.</span>
            </div>
          )}
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
