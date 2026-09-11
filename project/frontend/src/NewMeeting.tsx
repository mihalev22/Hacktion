import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FolderKanban, Plus, UploadCloud, X } from "lucide-react";
import { toast } from "./ui";
import { getProjects, getProject, createProject } from "./services/projects";
import type { Project } from "./services/projects";

export function NewMeetingHost() {
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const nav = useNavigate();
  useEffect(() => {
    const h = (e: Event) => setOpen((e as CustomEvent).detail?.projectId ?? null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(undefined);
    window.addEventListener("xtz:new-meeting", h);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("xtz:new-meeting", h); window.removeEventListener("keydown", esc); };
  }, []);
  if (open === undefined) return null;
  return (
    <NewMeetingModal
      fixedProjectId={open}
      onClose={() => setOpen(undefined)}
      onCreated={(id, pid) => {
        setOpen(undefined);
        nav(pid ? `/projects/${pid}/meetings/${id}` : `/tz/${id}`);
      }}
    />
  );
}

const ALLOWED = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".mp4", ".mov", ".avi", ".mkv", ".webm"];
const VIDEO = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
const MAX_SIZE = 200 * 1024 * 1024;

export function validateAudio(file: File) {
  const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED.includes(ext)) throw new Error(`Формат ${ext} не поддерживается: нужны ${ALLOWED.join(", ")}`);
  if (file.size > MAX_SIZE) throw new Error("Максимальный размер — 200 МБ");
  if (file.size === 0) throw new Error("Файл пустой");
}

const kindOf = (f: File) => (VIDEO.includes("." + (f.name.split(".").pop() || "").toLowerCase()) ? "Видео" : "Аудио");

type Props = {
  onClose: () => void;
  onCreated: (meetingId: string, projectId: string | null) => void;
  fixedProjectId?: string | null;
};

export default function NewMeetingModal({ onClose, onCreated, fixedProjectId = null }: Props) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string>(fixedProjectId ?? "");
  const [newProject, setNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fixedProjectId) {
      getProject(fixedProjectId).then((p) => setProjects([p])).catch(() => setProjects([]));
    } else {
      getProjects().then((p) => {
        setProjects(p);
        setProjectId((cur) => cur || p[0]?.id || "");
      }).catch(() => setProjects([]));
    }
  }, [fixedProjectId]);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    try { validateAudio(f); setErr(""); setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "")); }
    catch (e) { setErr((e as Error).message); }
  };

  const finish = (id: string, pid: string | null) => onCreated(id, pid);

  const upload = (project_id: string) => {
    const fd = new FormData();
    fd.append("file", file!);
    fd.append("title", title.trim() || file!.name.replace(/\.[^.]+$/, ""));
    if (project_id) fd.append("project_id", project_id);
    const autoAnalyze = localStorage.getItem("xtz_auto_tz") !== "0";
    if (!autoAnalyze) fd.append("analyze", "false");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/meetings");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const m = JSON.parse(xhr.responseText);
          toast(autoAnalyze ? "Встреча загружена — AI начинает анализ" : "Встреча сохранена — анализ можно запустить с её экрана");
          finish(m.id, m.project_id || project_id || null);
        } catch { setPct(null); toast("Неожиданный ответ сервера", "err"); }
      } else {
        setPct(null);
        let d = "Не удалось загрузить файл";
        try { d = JSON.parse(xhr.responseText).detail || d; } catch { /* keep */ }
        setErr(d);
        toast(d, "err");
      }
    };
    xhr.onerror = () => { setPct(null); setErr("Сеть недоступна"); };
    xhr.send(fd);
  };

  const submit = async () => {
    if (!file || pct !== null) return;
    // при 0 проектов поле имени видно без кнопки «Новый проект» — введённое имя не должно игнорироваться
    if (newProject || (projects?.length === 0 && newProjectName.trim().length > 0)) {
      if (newProjectName.trim().length < 2) return setErr("Название проекта: минимум 2 символа");
      setPct(2);
      try {
        const p = await createProject(newProjectName.trim());
        upload(p.id);
      } catch (e) {
        setPct(null);
        toast(e instanceof Error ? e.message : "Не удалось создать проект", "err");
      }
      return;
    }
    upload(fixedProjectId || projectId);
  };

  const chosen = fixedProjectId
    ? projects?.find((x) => x.id === fixedProjectId)
    : projects?.find((x) => x.id === projectId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal nm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Новая встреча">
        <div className="modal-header">
          <div>
            <span className="modal-eyebrow">НОВАЯ ВСТРЕЧА</span>
            <h2>Загрузить разговор</h2>
          </div>
          <button className="modal-close" aria-label="Закрыть" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body">
          {!fixedProjectId && projects && (
            <div className="field">
              <span className="field-label">Проект</span>
              {projects.length > 0 && (
                <div className="proj-pick">
                  {projects.map((p) => (
                    <button key={p.id} type="button" className={`proj-opt ${!newProject && projectId === p.id ? "on" : ""}`}
                            onClick={() => { setProjectId(p.id); setNewProject(false); setErr(""); }}>
                      <FolderKanban size={13} /> {p.name}
                    </button>
                  ))}
                  <button type="button" className={`proj-opt new ${newProject ? "on" : ""}`}
                          onClick={() => { setNewProject(true); setErr(""); }}>
                    <Plus size={13} /> Новый проект
                  </button>
                </div>
              )}
              {(projects.length === 0 || newProject) && (
                <span className="field-wrap" style={{ marginTop: projects.length ? 8 : 0 }}>
                  <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)}
                         placeholder="Название нового проекта, например: АкуаДоставка" aria-label="Название проекта" />
                </span>
              )}
            </div>
          )}
          {fixedProjectId && chosen && (
            <div className="proj-fixed"><FolderKanban size={13} /> Проект: <b>{chosen.name}</b></div>
          )}

          <label className="field">
            <span className="field-label">Название встречи</span>
            <span className="field-wrap">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Обсуждение личного кабинета" aria-label="Название встречи" />
            </span>
          </label>

          <div className="field-label" style={{ marginBottom: 6 }}>Запись встречи — аудио или видео</div>
          <div
            className={`drop ${over ? "over" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
            role="button" tabIndex={0} aria-label="Перетащите файл или выберите"
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          >
            {file ? (
              <><b>{file.name}</b><br />
                <span style={{ fontSize: 12 }}>{(file.size / 1024 / 1024).toFixed(1)} МБ · {kindOf(file)}</span><br />
                <span style={{ fontSize: 11, opacity: .7 }}>нажмите, чтобы выбрать другой файл</span></>
            ) : (
              <><UploadCloud size={26} style={{ color: "#ff3131", marginBottom: 8 }} /><br />
                <b>Перетащите файл</b> или выберите<br />
                <span style={{ fontSize: 11.5 }}>Загрузите аудио или видео встречи</span><br />
                <span style={{ fontSize: 11, opacity: .75 }}>MP3, WAV, M4A, AAC, OGG, FLAC, MP4, MOV, AVI, MKV, WEBM · до 200 МБ</span></>
            )}
          </div>
          <input ref={inputRef} type="file" accept={"audio/*,video/*," + ALLOWED.join(",")} style={{ display: "none" }}
                 onChange={(e) => pick(e.target.files?.[0])} aria-label="Файл записи" />

          {err && <div className="modal-err"><X size={13} /> {err}</div>}
          {pct !== null && (
            <div className="up-file">
              <span className="n">{pct < 100 ? "Загрузка…" : "Обрабатываем на сервере…"}</span>
              <span className="up-bar"><i style={{ width: `${Math.max(pct, 6)}%` }} /></span>
              <span className="n" style={{ width: 40, textAlign: "right" }}>{pct}%</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>Отмена</button>
          <button className="create-button" disabled={!file || pct !== null || (newProject && !newProjectName.trim())} onClick={submit}>
            {pct !== null ? <><CheckCircle2 size={13} /> Ждём…</> : "Начать анализ"}
          </button>
        </div>
      </div>
    </div>
  );
}
