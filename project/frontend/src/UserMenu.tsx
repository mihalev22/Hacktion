import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, LogOut, Moon, ShieldCheck, Sun, User, UserCog } from "lucide-react";
import { useAuth } from "./auth";
import { initialsOf, useAvatar } from "./chrome";
import { isDark, setPref } from "./theme";

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(isDark());
  const ref = useRef<HTMLDivElement>(null);
  const avatar = useAvatar(user?.id);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!user) return null;

  return (
    <div className="um" ref={ref}>
      <button className="profile-button" onClick={() => setOpen(!open)} aria-label="Профиль пользователя" aria-expanded={open}>
        {avatar
          ? <img className="avatar img" src={avatar} alt="" />
          : <span className="avatar">{initialsOf(user.name)}</span>}
        <span className="nm">{user.name}</span>
        <ChevronDown size={13} className={open ? "up" : ""} style={{ color: "var(--tx-4)" }} />
      </button>
      {open && (
        <div className="um-menu">
          <div className="um-head">
            {avatar
              ? <img className="avatar img" src={avatar} alt="" />
              : <span className="avatar">{initialsOf(user.name)}</span>}
            <div>
              <b>{user.name}</b>
              <span>{user.email}</span>
            </div>
          </div>
          <div className="um-sep" />
          <Link to="/settings"><User size={14} /> Профиль</Link>
          <Link to="/settings"><UserCog size={14} /> Настройки</Link>
          {user.system_role === "admin" && (
            <Link to="/admin"><ShieldCheck size={14} /> Администрирование</Link>
          )}
          <button onClick={() => { setPref(dark ? "light" : "dark"); setDark(!dark); }}>
            {dark ? <><Sun size={14} /> Светлая тема</> : <><Moon size={14} /> Тёмная тема</>}
          </button>
          <div className="um-sep" />
          <button className="um-red" onClick={() => logout()}><LogOut size={14} /> Выйти</button>
        </div>
      )}
    </div>
  );
}
