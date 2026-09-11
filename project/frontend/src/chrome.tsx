import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Plus, Menu, X } from "lucide-react";
import UserMenu from "./UserMenu";
import { openNewMeeting } from "./ui";

export const APP_NAME = "X<актион> ТехЗадание";

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-x">X&lt;актион&gt;</span>
      <span className="brand-name">ТехЗадание</span>
    </div>
  );
}

export function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

/* ---- аватар: frontend-стор, готов к подключению API (POST /auth/avatar) ---- */
const AV_KEY = "xtz_avatar";

export function getStoredAvatar(userId: string): string {
  try {
    const raw = JSON.parse(localStorage.getItem(AV_KEY) || "{}");
    return raw[userId] || "";
  } catch { return ""; }
}

export function storeAvatar(userId: string, dataUrl: string | null) {
  const raw = (() => { try { return JSON.parse(localStorage.getItem(AV_KEY) || "{}"); } catch { return {}; } })();
  if (dataUrl) raw[userId] = dataUrl; else delete raw[userId];
  localStorage.setItem(AV_KEY, JSON.stringify(raw));
  window.dispatchEvent(new CustomEvent("xtz-avatar"));
}

export function useAvatar(userId: string | undefined): string {
  const [src, setSrc] = useState(() => (userId ? getStoredAvatar(userId) : ""));
  useEffect(() => {
    const sync = () => setSrc(userId ? getStoredAvatar(userId) : "");
    sync();
    window.addEventListener("xtz-avatar", sync);
    return () => window.removeEventListener("xtz-avatar", sync);
  }, [userId]);
  return src;
}

/* ---- фон: большие красные дуги + свечения по углам ---- */
export function AppBackground() {
  return (
    <div className="background-art" aria-hidden="true">
      <span className="bg-arc bg-arc-left" />
      <span className="bg-arc bg-arc-right" />
      <span className="bg-glow bg-glow-top-left" />
      <span className="bg-glow bg-glow-top-right" />
      <span className="bg-glow bg-glow-bottom-left" />
      <span className="bg-glow bg-glow-bottom-right" />
    </div>
  );
}

export type NavKey = "home" | "projects" | "meetings" | "tz" | "settings";

const NAV: Array<[NavKey, string, string]> = [
  ["home", "/home", "Главная"],
  ["projects", "/projects", "Проекты"],
  ["meetings", "/meetings", "Встречи"],
  ["tz", "/tz", "ТЗ"],
];
/* ---------------- header ---------------- */
export function AppHeader({ active, extra, tzHref }: { active: NavKey; extra?: ReactNode; tzHref?: string }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname, loc.search]);

  const links = (cls: string) => NAV.map(([k, to, label]) => (
    <Link key={k} className={`${cls} ${active === k ? "active" : ""}`}
          to={k === "tz" && tzHref ? tzHref : to}>{label}</Link>
  ));

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to="/home" aria-label="X актион ТехЗадание — на главную">
          <Brand />
        </Link>
        <nav className="desk">{links("")}</nav>
      </div>
      <div className="top-right">
        {extra}
        <button className="header-create" onClick={() => openNewMeeting()}><Plus size={15} /> Новая встреча</button>
        <UserMenu />
        <button className="icon-btn burger" aria-label="Меню" onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button>
      </div>
      {open && <nav className="mob">{links("")}</nav>}
    </header>
  );
}

/* ---------------- footer ---------------- */
export function AppFooter() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const ping = () => fetch("/api/health", { credentials: "include" })
      .then((r) => alive && setBackendOk(r.ok))
      .catch(() => alive && setBackendOk(false));
    ping();
    const t = window.setInterval(ping, 30000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);
  return (
    <footer className="appfoot">
      <span className="fbrand"><Brand /></span>
      <span>Профессиональная AI-система создания технических заданий из встреч</span>
      <span className="fright" style={backendOk === false ? { color: "var(--red)" } : undefined}>
        <span className="dotlive" style={backendOk === false ? { background: "var(--red)", boxShadow: "none" } : undefined} />
        {backendOk === null ? "проверяем связь…" : backendOk ? "Система работает" : "Сервер не отвечает"}
      </span>
    </footer>
  );
}
