import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { AlertTriangle, Eye, EyeOff, Loader2, Moon, Sun } from "lucide-react";
import { useAuth } from "./auth";
import { Brand } from "./chrome";
import { ApiError } from "./api";
import { isDark, setPref, subscribeTheme } from "./theme";

function ThemeToggle() {
  const [dark, setDark] = useState(isDark());
  useEffect(() => subscribeTheme(setDark), []);
  return (
    <button
      className="theme-toggle"
      onClick={() => setPref(dark ? "light" : "dark")}
      aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={dark ? "Светлая тема" : "Тёмная тема"}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}

function errText(e: unknown): string[] {
  if (e instanceof ApiError) {
    if (Array.isArray(e.detail)) {
      return (e.detail as any[]).map((d) => {
        const f = String(d.loc?.[d.loc.length - 1] ?? "");
        const map: Record<string, string> = {
          name: "Имя: 2–100 символов", email: "Некорректный email", password: "Пароль: минимум 8 символов",
        };
        return map[f] || "Проверьте введённые данные";
      });
    }
    return [String(e.detail)];
  }
  return ["Не удалось связаться с сервером"];
}

function Field(props: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; secret?: boolean; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const { label, type = "text", value, onChange, placeholder, secret, autoComplete } = props;
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-wrap">
        <input type={secret && !show ? "password" : type} value={value} placeholder={placeholder}
               autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
        {secret && (
          <button type="button" className="eye" onClick={() => setShow(!show)} tabIndex={-1}
                  aria-label={show ? "Скрыть пароль" : "Показать пароль"}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </span>
    </label>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-ui login-root">
      <div className="login-page">
        <ThemeToggle />
        <div className="login-background" aria-hidden="true">
          <div className="login-glow login-glow-left" />
          <div className="login-glow login-glow-right" />
          <div className="login-grid" />
        </div>

        <section className="login-left">
          <div className="login-left-content">
            <div className="login-logo"><Brand /></div>
            <h1 className="login-title">Превратите разговор<br />в <span>готовое ТЗ</span></h1>
            <div className="login-benefits">
              <span className="login-benefit">Расшифровка встреч с выделением смысловых блоков</span>
              <span className="login-benefit">Требования, вопросы и противоречия от AI</span>
              <span className="login-benefit">Каждое требование связано с исходной репликой</span>
            </div>
          </div>
        </section>

        <main className="login-right">
          <div className="auth-card login-card">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Errors({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <div className="form-errors">
      <AlertTriangle size={14} />
      <div>{list.map((e, i) => <p key={i}>{e}</p>)}</div>
    </div>
  );
}

export default function Login() {
  const { status, login } = useAuth();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (status === "authed") return <Navigate to="/home" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrors([]);
    if (!email.includes("@")) return setErrors(["Введите корректный email"]);
    if (!password) return setErrors(["Введите пароль"]);
    setBusy(true);
    try {
      await login(email, password);
      const to = (loc.state as any)?.from || "/home";
      window.location.hash = "#" + to;
    } catch (err) {
      setErrors(errText(err));
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h2>С возвращением</h2>
      <p className="auth-sub">Войдите, чтобы продолжить работу с ТЗ</p>
      <Errors list={errors} />
      <form onSubmit={submit} noValidate>
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" />
        <Field label="Пароль" value={password} onChange={setPassword} secret placeholder="••••••••" autoComplete="current-password" />
        <button className="btn btn-red auth-submit" type="submit" disabled={busy}>
          {busy ? <><Loader2 size={15} className="spin" /> Входим…</> : "Войти"}
        </button>
      </form>
      <div className="auth-alt">Нет аккаунта? <Link to="/register">Создать</Link></div>
    </Shell>
  );
}

export function Register() {
  const { status, register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (status === "authed") return <Navigate to="/home" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v: string[] = [];
    if (name.trim().length < 2) v.push("Имя: минимум 2 символа");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) v.push("Некорректный email");
    if (password.length < 8) v.push("Пароль: минимум 8 символов");
    if (password !== confirm) v.push("Пароли не совпадают");
    setErrors(v);
    if (v.length) return;
    setBusy(true);
    try {
      await register(name, email, password, confirm);
      window.location.hash = "#/home";
    } catch (err) {
      setErrors(errText(err));
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h2>Создать аккаунт</h2>
      <p className="auth-sub">Рабочее пространство для ваших встреч и требований</p>
      <Errors list={errors} />
      <form onSubmit={submit} noValidate>
        <Field label="Имя" value={name} onChange={setName} placeholder="Алекс" autoComplete="name" />
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@company.com" autoComplete="email" />
        <Field label="Пароль" value={password} onChange={setPassword} secret placeholder="Минимум 8 символов" autoComplete="new-password" />
        <Field label="Подтверждение пароля" value={confirm} onChange={setConfirm} secret placeholder="Ещё раз" autoComplete="new-password" />
        <button className="btn btn-red auth-submit" type="submit" disabled={busy}>
          {busy ? <><Loader2 size={15} className="spin" /> Создаём аккаунт…</> : "Создать аккаунт"}
        </button>
      </form>
      <div className="auth-alt">Уже есть аккаунт? <Link to="/login">Войти</Link></div>
    </Shell>
  );
}
