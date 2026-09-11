import { Calendar, Clock, FileAudio, Folder, Mic, Trash2, Users } from "lucide-react";
import type { MeetingItem } from "../services/meetings";
import { STATUS_RU } from "../services/meetings";
import { fmtSec } from "../types";

export default function MeetingRow({ m, onOpen, onDelete }: { m: MeetingItem; onOpen: () => void; onDelete?: () => void }) {
  const cls = m.status === "done" ? "" : m.status === "error" ? "err" : ["extracting", "transcribing", "analyzing"].includes(m.status) ? "work" : "idle";
  return (
    <div className="mrow3" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <span className="mi"><Mic size={17} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="mt" title={m.title}>{m.title}</div>
        <div className="mp">
          {m.project_name && <span style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "var(--red)", fontWeight: 600 }}><Folder size={11} /> {m.project_name}</span>}
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Calendar size={11} /> {new Date(m.created_at).toLocaleDateString("ru")}</span>
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><FileAudio size={11} /> {m.requirements_count} требований</span>
          {(m.roles_count ?? 0) > 0 && <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Users size={11} /> {m.roles_count} участн.</span>}
        </div>
      </div>
      {m.duration_sec ? <span className="md"><Clock size={11} style={{ marginRight: 4, verticalAlign: -1 }} />{fmtSec(m.duration_sec)}</span> : <span className="md">—</span>}
      <span className={`mstat ${cls}`}>{STATUS_RU[m.status] ?? m.status}</span>
      {onDelete
        ? <button className="mx" aria-label="Удалить встречу" title="Удалить"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 size={14} /></button>
        : <span className="md" style={{ width: 20 }}>→</span>}
    </div>
  );
}
