import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Plus, Search } from "lucide-react";
import { AppFooter, AppHeader } from "../chrome";
import MeetingRow from "../components/MeetingRow";
import { openNewMeeting } from "../ui";
import { useMeetings } from "../hooks/useMeetings";
import { matchesFilter } from "../services/meetings";
import type { MeetingFilter } from "../services/meetings";

const FILTERS: [MeetingFilter, string][] = [["all", "Все"], ["ready", "Готово"], ["work", "В обработке"], ["error", "Ошибка"]];

export default function MeetingsPage() {
  const { list, error, refetch, remove } = useMeetings(8000);
  const nav = useNavigate();
  const [filter, setFilter] = useState<MeetingFilter>("all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    let arr = (list ?? []).filter((m) => matchesFilter(m, filter));
    if (q.trim()) arr = arr.filter((m) => m.title.toLowerCase().includes(q.toLowerCase()));
    return arr;
  }, [list, filter, q]);

  return (
    <div className="app-ui">
      <AppHeader active="meetings" />
      <div className="dash pagein">
        <div className="dash-in">
          <div className="sec-head3">
            <div>
              <span className="se">Записи разговоров</span>
              <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}><Mic size={20} color="var(--red)" /> Встречи</h2>
              <p>Все записи разговоров, которые система анализирует для формирования требований.</p>
            </div>
            <button className="btn btn-red" onClick={() => openNewMeeting()}><Plus size={15} color="#fff" /> Новая встреча</button>
          </div>

          <div className="toolbar">
            <div className="search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск встреч…" aria-label="Поиск встреч" /></div>
            <div className="segs">
              {FILTERS.map(([f, l]) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{l}</button>)}
            </div>
            <span className="count-label">{shown.length} из {list?.length ?? "…"}</span>
          </div>

          {error ? (
            <div className="empty-state"><b>{error}</b><button className="btn btn-ghost" onClick={refetch}>Повторить</button></div>
          ) : list === null ? (
            <div className="mlist3">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 72, borderRadius: 12 }} />)}</div>
          ) : shown.length ? (
            <div className="mlist3">
              {shown.map((m) => <MeetingRow key={m.id} m={m} onOpen={() => nav(m.project_id ? `/projects/${m.project_id}/meetings/${m.id}` : `/tz/${m.id}`)} onDelete={() => remove(m)} />)}
            </div>
          ) : (
            <div className="empty-state">
              <Mic size={28} />
              <b>Встреч не найдено</b>
              <span>Загрузите запись разговора — она появится здесь.</span>
              <button className="btn btn-red" onClick={() => openNewMeeting()}><Plus size={15} color="#fff" /> Новая встреча</button>
            </div>
          )}
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
