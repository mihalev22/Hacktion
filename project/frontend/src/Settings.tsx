import { useEffect, useRef, useState } from "react";
import { Camera, Check, LogOut, Monitor, Moon, Sun, Trash2, X } from "lucide-react";
import { useAuth } from "./auth";
import { api } from "./api";
import { AppFooter, AppHeader, initialsOf, storeAvatar, useAvatar } from "./chrome";
import { getPref, setPref, subscribeTheme } from "./theme";
import type { ThemePref } from "./theme";

const MAX_AVATAR_KB = 512;

export default function Settings() {
  const { user, logout, setUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<ThemePref>(getPref());
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const avatar = useAvatar(user?.id);

  useEffect(() => subscribeTheme(() => setTheme(getPref())), []);
  useEffect(() => {
    fetch("/api/health", { credentials: "include" }).then((r) => setBackendOk(r.ok)).catch(() => setBackendOk(false));
  }, []);

  if (!user) return null;

  const pickAvatar = (file: File) => {
    setErr("");
    if (!file.type.startsWith("image/")) return setErr("Нужен файл изображения (png/jpg/webp)");
    if (file.size > MAX_AVATAR_KB * 1024) return setErr(`Файл больше ${MAX_AVATAR_KB} КБ — сжмите изображение`);
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        const k = Math.min(1, 256 / Math.max(img.width, img.height));
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        (c.getContext("2d") as CanvasRenderingContext2D).drawImage(img, 0, 0, c.width, c.height);
        storeAvatar(user.id, c.toDataURL("image/webp", 0.85));
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  };

  const saveName = async () => {
    setErr("");
    if (name.trim().length < 2) return setErr("Имя: минимум 2 символа");
    setBusy(true);
    try {
      const u = await api("/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      setUser(u);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch {
      setErr("Не удалось сохранить имя");
    }
    setBusy(false);
  };

  const themes: [ThemePref, string, typeof Sun][] = [
    ["light", "Светлая", Sun],
    ["dark", "Тёмная", Moon],
    ["system", "Системная", Monitor],
  ];

  return (
    <div className="app-ui">
      <AppHeader active="settings" />
      <div className="settings">
        <div className="settings-in">
          <h1>Настройки</h1>

          <section className="set-card">
            <h2>Профиль</h2>
            <div className="set-row profile-row">
              <div className="av-block">
                {avatar
                  ? <img className="avatar img xl" src={avatar} alt="Аватар" />
                  : <span className="avatar xl">{initialsOf(user.name)}</span>}
                <div className="av-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}><Camera size={13} /> Загрузить</button>
                  {avatar && <button className="btn btn-ghost btn-sm" onClick={() => storeAvatar(user.id, null)}><Trash2 size={13} /> Удалить</button>}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
                       onChange={(e) => e.target.files?.[0] && pickAvatar(e.target.files[0])} />
              </div>
              <div className="grow">
                <label className="field">
                  <span className="field-label">Имя</span>
                  <span className="field-wrap"><input value={name} onChange={(e) => setName(e.target.value)} /></span>
                </label>
                <label className="field">
                  <span className="field-label">Email</span>
                  <span className="field-wrap"><input value={user.email} readOnly /></span>
                </label>
                {err && <div className="set-err"><X size={13} /> {err}</div>}
                <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <button className="btn btn-red" disabled={busy} onClick={saveName}>
                    {busy ? "Сохраняем…" : <><Check size={14} color="#fff" /> Сохранить</>}
                  </button>
                  {saved && <span className="set-ok"><Check size={13} /> Сохранено</span>}
                  <span className="grow" />
                  <button className="btn btn-ghost" onClick={() => logout()}><LogOut size={14} /> Выйти</button>
                </div>
                <p className="set-hint">Аватар хранится локально в браузере — загрузка на сервер подключается одним вызовом API.</p>
              </div>
            </div>
          </section>

          <section className="set-card">
            <h2>Внешний вид</h2>
            <div className="set-label">Тема</div>
            <div className="theme-opts">
              {themes.map(([pref, label, Icon]) => (
                <button key={pref} className={`theme-opt ${theme === pref ? "on" : ""}`} onClick={() => setPref(pref)}>
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          </section>

          <section className="set-card">
            <h2>Уведомления</h2>
            <ToggleRow k="xtz_notify_tz" label="Готовность ТЗ" hint="Показывать уведомление в приложении, когда AI закончит обработку встречи" />
            <ToggleRow k="xtz_notify_err" label="Ошибки обработки" hint="Сообщать, если запись не удалось расшифровать" />
          </section>

          <section className="set-card">
            <h2>Обработка</h2>
            <ToggleRow k="xtz_auto_tz" label="Автоматически создавать ТЗ" hint="Запускать AI-анализ сразу после загрузки; если выключено — запуск с экрана встречи" />
          </section>

          {user.system_role === "admin" && (
          <section className="set-card">
            <h2>Настройки приложения</h2>
            <div className="kv"><span>Сервер (API)</span>
              <b className={backendOk ? "ok" : backendOk === false ? "bad" : ""}>
                {backendOk === null ? "проверяем…" : backendOk ? "на связи" : "не отвечает"}
              </b></div>
            <div className="kv"><span>Хранилище</span><b>SQLite + локальные файлы встреч</b></div>
            <div className="kv"><span>AI-стек</span><b>GigaChat-3-Ultra · speech2text.ru</b></div>
            <div className="kv"><span>Сессия</span><b>JWT · access 15 мин · refresh 7 дней</b></div>
          </section>
          )}
        </div>
      </div>
      <AppFooter />
    </div>
  );
}

function ToggleRow({ k, label, hint }: { k: string; label: string; hint: string }) {
  const [on, setOn] = useState(() => localStorage.getItem(k) !== "0");
  const toggle = () => {
    const v = !on;
    setOn(v);
    localStorage.setItem(k, v ? "1" : "0");
  };
  return (
    <div className="kv" style={{ borderBottom: "1px solid var(--line)" }}>
      <span style={{ display: "block" }}><b style={{ color: "var(--tx)", fontSize: 13, display: "block", fontWeight: 600 }}>{label}</b>
        <span style={{ fontSize: 11.5, color: "var(--tx-4)" }}>{hint}</span>
      </span>
      <button className={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={toggle}><i /></button>
    </div>
  );
}
