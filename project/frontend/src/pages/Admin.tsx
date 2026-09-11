import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity as ActivityIcon, FolderKanban, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import { AppFooter, AppHeader } from "../chrome";
import { showConfirm, toast } from "../ui";
import { deleteUser, getActivity, getAdminProjects, getUsers, patchUser } from "../services/admin";
import type { Activity, AdminProject, AdminUser } from "../services/admin";

type Tab = "users" | "projects" | "activity";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    getUsers().then((u) => { setUsers(u); setError(""); }).catch(() => setError("Нет доступа к админ-API"));
    getAdminProjects().then(setProjects).catch(() => { /* admin sees only users on error */ });
    getActivity().then(setActivity).catch(() => { /* ignore */ });
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast(msg); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Действие отклонено сервером", "err"); }
  };

  const toggleRole = (u: AdminUser) => act(
    () => patchUser(u.id, { system_role: u.system_role === "admin" ? "user" : "admin" }),
    "Роль обновлена");
  const toggleBlock = (u: AdminUser) => act(
    () => patchUser(u.id, { is_active: u.status === "blocked" }),
    u.status === "blocked" ? "Пользователь разблокирован" : "Пользователь заблокирован");
  const removeUser = (u: AdminUser) => showConfirm("Удалить пользователя?", `${u.name} (${u.email}) — его проекты и встречи будут удалены.`)
    .then((yes) => { if (yes) act(() => deleteUser(u.id), "Пользователь удалён"); });

  return (
    <div className="app-ui">
      <AppHeader active="home" />
      <div className="dash pagein">
        <div className="dash-in">
          <div className="sec-head3">
            <div>
              <span className="se">Управление системой</span>
              <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}><ShieldCheck size={20} color="var(--red)" /> Администрирование</h2>
            </div>
            <div className="segs">
              <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>Пользователи</button>
              <button className={tab === "projects" ? "on" : ""} onClick={() => setTab("projects")}>Проекты</button>
              <button className={tab === "activity" ? "on" : ""} onClick={() => setTab("activity")}>Активность</button>
            </div>
          </div>

          {error && <div className="empty-state"><b>{error}</b><button className="btn btn-ghost" onClick={load}>Повторить</button></div>}

          {tab === "users" && (users === null ? <div className="list-col">{[0, 1].map((i) => <div key={i} className="skel" style={{ height: 56, borderRadius: 10 }} />)}</div> : (
            <div className="admin-table">
              <div className="admin-tr head"><span>Имя</span><span>Email</span><span>Роль</span><span>Статус</span><span>Проекты</span><span>Дата</span><span /></div>
              {users.map((u) => (
                <div className="admin-tr" key={u.id}>
                  <span className="nm">{u.name}</span>
                  <span className="dim">{u.email}</span>
                  <span><em className={`pill ${u.system_role === "admin" ? "red" : ""}`}>{u.system_role === "admin" ? "admin" : "user"}</em></span>
                  <span><em className={`pill ${u.status === "active" ? "green" : ""}`}>{u.status === "active" ? "активен" : "заблокирован"}</em></span>
                  <span className="dim">{u.projects_count}</span>
                  <span className="dim">{new Date(u.created_at).toLocaleDateString("ru")}</span>
                  <span className="acts">
                    <button className="icon-btn" title="Сменить роль" onClick={() => toggleRole(u)}><UserCog size={15} /></button>
                    <button className="icon-btn" title={u.status === "active" ? "Заблокировать" : "Разблокировать"}
                            onClick={() => toggleBlock(u)}><ShieldCheck size={15} /></button>
                    <button className="icon-btn danger" title="Удалить" onClick={() => removeUser(u)}><Trash2 size={15} /></button>
                  </span>
                </div>
              ))}
            </div>
          ))}

          {tab === "projects" && (projects === null ? <div className="skel" style={{ height: 120, borderRadius: 12 }} /> : (
            <div className="admin-table">
              <div className="admin-tr head"><span>Проект</span><span>Владелец</span><span>Встречи</span><span>Участники</span><span>Обновлён</span></div>
              {projects.map((p) => (
                <div className="admin-tr" key={p.id}>
                  <span className="nm"><FolderKanban size={13} style={{ marginRight: 6, verticalAlign: -2 }} />{p.name}</span>
                  <span className="dim">{p.owner} · {p.owner_email}</span>
                  <span className="dim">{p.meetings_count}</span>
                  <span className="dim">{p.members_count}</span>
                  <span className="dim">{new Date(p.updated_at).toLocaleDateString("ru")}</span>
                </div>
              ))}
            </div>
          ))}

          {tab === "activity" && (activity === null ? <div className="skel" style={{ height: 120, borderRadius: 12 }} /> : (
            <>
              <div className="stats3" style={{ marginBottom: 14 }}>
                <div className="scard"><div className="sl"><Users size={13} /> Пользователи</div><div className="sv">{activity.users}</div></div>
                <div className="scard"><div className="sl"><FolderKanban size={13} /> Проекты</div><div className="sv">{activity.projects}</div></div>
                <div className="scard"><div className="sl"><ActivityIcon size={13} /> Встречи</div><div className="sv">{activity.meetings}</div></div>
                <div className="scard"><div className="sl"><ShieldCheck size={13} /> Готовых ТЗ</div><div className="sv">{activity.done}</div></div>
              </div>
              <div className="mlist3">
                {activity.recent.map((r) => (
                  <Link key={r.id} to="/meetings" className="mrow3">
                    <span className="mi"><ActivityIcon size={16} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="mt">{r.title}</div>
                      <div className="mp">{r.user} · {r.project} · {new Date(r.created_at).toLocaleString("ru")}</div>
                    </div>
                    <span className={`mstat ${r.status === "done" ? "" : r.status === "error" ? "err" : "work"}`}>
                      {r.status === "done" ? "готово" : r.status === "error" ? "ошибка" : "в работе"}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ))}
        </div>
      </div>
      <AppFooter />
    </div>
  );
}
