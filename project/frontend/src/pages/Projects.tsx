import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderKanban, Plus, Search, X } from "lucide-react";
import { AppFooter, AppHeader } from "../chrome";
import ProjectCard from "../components/ProjectCard";
import { createProject, deleteProject, getProjects } from "../services/projects";
import type { Project } from "../services/projects";
import { showConfirm, toast } from "../ui";

const FILTERS: ["all" | "ready" | "work" | "error", string][] = [["all", "Все"], ["ready", "Готовые"], ["work", "В работе"], ["error", "Проблемные"]];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "ready" | "work" | "error">("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const load = useCallback(() => {
    getProjects().then((p) => { setProjects(p); setError(""); }).catch(() => setError("Не удалось загрузить проекты"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (projects ?? [])
    .filter((p) => filter === "all" || p.status === filter)
    .filter((p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase()));

  const create = async () => {
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    try {
      const p = await createProject(name.trim(), desc.trim());
      setCreating(false); setName(""); setDesc("");
      toast("Проект создан");
      load();
      nav(`/projects/${p.id}`);
    } catch (e) { toast(e instanceof Error ? e.message : "Не удалось создать проект", "err"); }
    setBusy(false);
  };

  const remove = async (p: Project) => {
    const ok = await showConfirm("Удалить проект?", `«${p.name}» со всеми встречами будет удалён безвозвратно.`);
    if (!ok) return;
    try { await deleteProject(p.id); toast("Проект удалён"); load(); }
    catch { toast("Не удалось удалить проект", "err"); }
  };

  return (
    <div className="app-ui">
      <AppHeader active="projects" />
      <div className="dash pagein">
        <div className="dash-in">
          <div className="sec-head3">
            <div>
              <span className="se">Рабочее пространство</span>
              <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}><FolderKanban size={20} color="var(--red)" /> Проекты</h2>
              <p>Каждый проект — это группа встреч. Откройте проект, чтобы увидеть только его встречи.</p>
            </div>
            <button className="btn btn-red" onClick={() => setCreating(true)}><Plus size={15} color="#fff" /> Новый проект</button>
          </div>

          <div className="toolbar">
            <div className="search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск проекта…" aria-label="Поиск проектов" /></div>
            <div className="segs">
              {FILTERS.map(([f, l]) => <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{l}</button>)}
            </div>
            <span className="count-label">{shown.length} из {projects?.length ?? "…"}{projects?.length ? ` ${plural(projects.length)}` : ""}</span>
          </div>

          {error ? (
            <div className="empty-state"><b>{error}</b><button className="btn btn-ghost" onClick={load}>Повторить</button></div>
          ) : projects === null ? (
            <div className="pcards3">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 230, borderRadius: 16 }} />)}</div>
          ) : shown.length ? (
            <div className={`pcards3${shown.length === 1 ? " solo" : ""}`}>
              {shown.map((p) => (
                <ProjectCard key={p.id} p={p} onOpen={() => nav(`/projects/${p.id}`)}
                             onDelete={p.my_role === "owner" || p.my_role === undefined ? () => remove(p) : undefined} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <FolderKanban size={28} />
              <b>Проектов пока нет</b>
              <span>Создайте проект и загрузите в него первую встречу.</span>
              <button className="btn btn-red" onClick={() => setCreating(true)}><Plus size={15} color="#fff" /> Новый проект</button>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal nm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Новый проект">
            <div className="modal-header">
              <div><span className="modal-eyebrow">ПРОЕКТ</span><h2>Новый проект</h2></div>
              <button className="modal-close" aria-label="Закрыть" onClick={() => setCreating(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <label className="field">
                <span className="field-label">Название</span>
                <span className="field-wrap"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: АкуаДоставка" aria-label="Название проекта" /></span>
              </label>
              <label className="field">
                <span className="field-label">Описание (необязательно)</span>
                <span className="field-wrap"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="О чём этот проект" aria-label="Описание проекта" /></span>
              </label>
            </div>
            <div className="modal-footer">
              <button className="cancel-button" onClick={() => setCreating(false)}>Отмена</button>
              <button className="create-button" disabled={busy || name.trim().length < 2} onClick={create}>Создать</button>
            </div>
          </div>
        </div>
      )}
      <AppFooter />
    </div>
  );
}

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "проект";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "проекта";
  return "проектов";
}
