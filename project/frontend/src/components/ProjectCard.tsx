import { FolderKanban, Mic, Calendar, FileText, Trash2 } from "lucide-react";
import type { Project } from "../services/projects";

const STATUS_RU: Record<Project["status"], string> = {
  ready: "готово", work: "в работе", error: "ошибка", empty: "пусто",
};

export default function ProjectCard({ p, onOpen, onDelete }: { p: Project; onOpen: () => void; onDelete?: () => void }) {
  const cls = p.status === "ready" ? "" : p.status === "error" ? "err" : p.status === "work" ? "work" : "idle";
  return (
    <div className="pcard3" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()} aria-label={`Открыть проект ${p.name}`}>
      {onDelete && (
        <button className="x-del" aria-label="Удалить проект" title="Удалить проект"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 size={13} /></button>
      )}
      <div className="pt">
        <span className="pi"><FolderKanban size={20} /></span>
        <Calendar size={14} style={{ color: "var(--tx-4)" }} aria-hidden />
      </div>
      <span className={`ps ${cls}`}>{STATUS_RU[p.status]}</span>
      <h3 title={p.name}>{p.name}</h3>
      <p className="pd">{p.description || "Рабочее пространство встреч: транскрипция, требования, роли и ТЗ каждого разговора."}</p>
      <div className="pf">
        <span><Mic size={12} /> {p.meetings_count} {plural(p.meetings_count)}</span>
        <span><FileText size={12} /> {p.status === "ready" ? p.meetings_count : 0} ТЗ</span>
        {p.last_meeting_at && <span><Calendar size={12} /> {new Date(p.last_meeting_at).toLocaleDateString("ru")}</span>}
      </div>
    </div>
  );
}

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "встреча";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "встречи";
  return "встреч";
}
