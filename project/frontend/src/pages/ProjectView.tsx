import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Calendar, FileAudio, FolderKanban, Mic, Plus, Users, Users as UsersIcon, Trash2, AlertTriangle } from "lucide-react";
import { AppFooter, AppHeader, initialsOf } from "../chrome";
import { openNewMeeting, showConfirm, toast } from "../ui";
import { deleteMeeting } from "../services/meetings";
import type { MeetingItem } from "../services/meetings";
import { STATUS_RU, STATUS_CLASS } from "../services/meetings";
import { getProject, getProjectMeetings, getMembers, addMember, setMemberRole, removeMember } from "../services/projects";
import type { Project, Member } from "../services/projects";
import { fmtSec } from "../types";

export default function ProjectView() {
  const { projectId = "" } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [meetings, setMeetings] = useState<MeetingItem[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [mEmail, setMEmail] = useState("");
  const [mRole, setMRole] = useState("editor");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const p = await getProject(projectId);
      setProject(p);
      setMeetings(await getProjectMeetings(projectId));
      try { setMembers(await getMembers(projectId)); } catch { /* ignore */ }
      setError("");
    } catch {
      setError("Проект не найден или доступ запрещён");
    }
  }, [projectId]);

  useEffect(() => {
    load();
    const t = setInterval(async () => {
      try {
        const ms = await getProjectMeetings(projectId);
        setMeetings(ms);
        if (ms.every((m) => m.status === "done" || m.status === "error")) clearInterval(t);
      } catch { /* ignore */ }
    }, 6000);
    return () => clearInterval(t);
  }, [load, projectId]);

  const remove = async (m: MeetingItem) => {
    const ok = await showConfirm("Удалить встречу?", `«${m.title}» будет удалена безвозвратно.`);
    if (!ok) return;
    try { await deleteMeeting(m.id); toast("Встреча удалена"); load(); }
    catch { toast("Не удалось удалить", "err"); }
  };

  if (error) {
    return (
      <div className="app-ui">
        <AppHeader active="projects" />
        <div className="dash"><div className="dash-in">
          <div className="empty-state"><FolderKanban size={28} /><b>{error}</b>
            <Link to="/projects" className="btn btn-ghost">К списку проектов</Link></div>
        </div></div>
        <AppFooter />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="app-ui">
        <AppHeader active="projects" />
        <div className="dash"><div className="dash-in">
          <div className="list-col">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 72, borderRadius: 12 }} />)}</div>
        </div></div>
        <AppFooter />
      </div>
    );
  }

  const canEdit = !project.my_role || project.my_role !== "viewer";
  const isOwner = project.my_role !== "viewer" && (project.my_role === "owner" || project.my_role === undefined);

  const invite = async () => {
    if (mEmail.trim().length < 5) return;
    try { await addMember(project.id, mEmail.trim().toLowerCase(), mRole); toast("Участник добавлен"); setMEmail(""); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Не удалось добавить", "err"); }
  };

  return (
    <div className="app-ui">
      <AppHeader active="projects" />
      <div className="dash pagein">
        <div className="dash-in">
          <div className="crumb" style={{ marginBottom: 6 }}>
            <Link to="/projects" className="link-btn">Проекты</Link> / <b>{project.name}</b>
          </div>
          <div className="sec-head3">
            <div>
              <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}><FolderKanban size={20} color="var(--red)" /> {project.name}</h2>
              <p>{project.description || "Встречи этого проекта: транскрипция, требования, роли и ТЗ каждой записи."}</p>
              {project.my_role && project.my_role !== "owner" && (
                <p style={{ marginTop: 6 }}><em className="pill">доступ: {project.my_role === "editor" ? "редактирование" : "только просмотр"}</em></p>
              )}
            </div>
            {canEdit && <button className="btn btn-red" onClick={() => openNewMeeting(project.id)}><Plus size={15} color="#fff" /> Новая встреча</button>}
          </div>

          <div className="sec-title" style={{ margin: "8px 0 10px" }}>
            <h2 style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}><Mic size={15} color="var(--red)" /> Встречи</h2>
            <span className="hint">{meetings ? `${meetings.length} ${plural(meetings.length)}` : "…"}</span>
          </div>

          {meetings === null ? (
            <div className="mlist3">{[0, 1].map((i) => <div key={i} className="skel" style={{ height: 70, borderRadius: 12 }} />)}</div>
          ) : meetings.length ? (
            <div className="mlist3">
              {meetings.map((m) => (
                <div key={m.id} className="mrow3" role="button" tabIndex={0}
                     onClick={() => nav(`/projects/${project.id}/meetings/${m.id}`)}
                     onKeyDown={(e) => e.key === "Enter" && nav(`/projects/${project.id}/meetings/${m.id}`)}>
                  <span className="mi"><Mic size={17} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="mt" title={m.title}>{m.title}</div>
                    <div className="mp">
                      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Calendar size={11} /> {new Date(m.created_at).toLocaleDateString("ru")}</span>
                      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><FileAudio size={11} /> {m.requirements_count} требований</span>
                      {(m.roles_count ?? 0) > 0 && <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><Users size={11} /> {m.roles_count} участн.</span>}
                      {(m.contradictions_count ?? 0) > 0 && <span style={{ display: "inline-flex", gap: 4, alignItems: "center", color: "var(--red)" }}><AlertTriangle size={11} /> {m.contradictions_count}</span>}
                    </div>
                  </div>
                  {m.duration_sec ? <span className="md">{fmtSec(m.duration_sec)}</span> : <span className="md">—</span>}
                  <span className={`mstat ${STATUS_CLASS[m.status] === "done" ? "" : STATUS_CLASS[m.status] === "err" ? "err" : STATUS_CLASS[m.status] === "work" ? "work" : "idle"}`}>
                    {STATUS_RU[m.status] ?? m.status}
                  </span>
                  {canEdit && <button className="mx" aria-label="Удалить встречу" title="Удалить" onClick={(e) => { e.stopPropagation(); remove(m); }}><Trash2 /></button>}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Mic size={28} />
              <b>В проекте пока нет встреч</b>
              <span>Загрузите запись разговора — AI расшифрует её и соберёт требования.</span>
              {canEdit && <button className="btn btn-red" onClick={() => openNewMeeting(project.id)}><Plus size={15} color="#fff" /> Новая встреча</button>}
            </div>
          )}

          {/* ---- Участники проекта (доступ: owner/editor/viewer) ---- */}
          <div className="sec-title" style={{ margin: "26px 0 10px" }}>
            <h2 style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}><UsersIcon size={15} color="var(--red)" /> Участники</h2>
            <span className="hint">{members.length + 1}</span>
          </div>
          <div className="member-list">
            <div className="member-row">
              <span className="avatar sm">{initialsOf(project.owner_name || "?")}</span>
              <div className="mname">{project.owner_name || "Владелец"} <span className="dim">владелец</span></div>
              <em className="pill">owner</em>
              <span />
            </div>
            {members.filter((mm) => mm.role !== "owner").map((mm) => (
              <div className="member-row" key={mm.id}>
                <span className="avatar sm">{initialsOf(mm.name)}</span>
                <div className="mname">{mm.name} <span className="dim">{mm.email}</span></div>
                {isOwner ? (
                  <select className="sort" value={mm.role} style={{ height: 30 }} aria-label="Роль участника"
                          onChange={(e) => setMemberRole(project.id, mm.id, e.target.value).then(() => { toast("Роль обновлена"); load(); }).catch(() => toast("Не удалось", "err"))}>
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                ) : <em className="pill">{mm.role}</em>}
                {isOwner && (
                  <button className="icon-btn danger" aria-label="Удалить участника"
                          onClick={() => showConfirm("Удалить участника?", `${mm.name} потеряет доступ к проекту.`)
                            .then((y) => { if (y) removeMember(project.id, mm.id).then(() => load()); })}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
            {isOwner && (
              <div className="member-row invite">
                <span className="field-wrap" style={{ flex: 1 }}>
                  <input value={mEmail} onChange={(e) => setMEmail(e.target.value)} placeholder="Email зарегистрированного пользователя" aria-label="Email участника" />
                </span>
                <select className="sort" value={mRole} onChange={(e) => setMRole(e.target.value)} aria-label="Роль">
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
                <button className="btn btn-ghost btn-sm" onClick={invite}><Plus size={13} /> Добавить</button>
              </div>
            )}
            <p className="set-hint">Роли доступа к проекту (owner / editor / viewer) не связаны с ролями сотрудников, которые AI находит в разговоре.</p>
          </div>
        </div>
      </div>
      <AppFooter />
    </div>
  );
}

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "встреча";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "встречи";
  return "встреч";
}
