import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, rawApi, setSessionLostHandler, jsonBody } from "./api";
import "./tz.css";

export type User = { id: string; email: string; name: string; system_role?: "admin" | "user" };
type Status = "loading" | "anon" | "authed";

type AuthCtx = {
  user: User | null;
  status: Status;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, confirm: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStat] = useState<Status>("loading");

  async function me(): Promise<User | null> {
    try {
      return await rawApi("/api/auth/me");
    } catch {
      return null;
    }
  }

  useEffect(() => {
    setSessionLostHandler(() => { setUser(null); setStat("anon"); });
    (async () => {
      let u = await me();
      if (!u) {
        try {
          await rawApi("/api/auth/refresh", { method: "POST" });
          u = await me();
        } catch { /* нет сессии */ }
      }
      setUser(u);
      setStat(u ? "authed" : "anon");
    })();
  }, []);

  const value: AuthCtx = {
    user,
    status,
    setUser: (u) => setUser(u),
    async login(email, password) {
      const u = await api("/api/auth/login", jsonBody({ email, password }), false);
      setUser(u);
      setStat("authed");
    },
    async register(name, email, password, confirm) {
      const u = await api("/api/auth/register", jsonBody({ name, email, password, password_confirm: confirm }), false);
      setUser(u);
      setStat("authed");
    },
    async logout() {
      try { await rawApi("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
      setUser(null);
      setStat("anon");
    },
    async refreshSession() {
      const u = await me();
      setUser(u);
      setStat(u ? "authed" : "anon");
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function Splash() {
  return (
    <div className="app-ui auth-splash">
      <div className="auth-splash-brand">
        <div className="brand">
          <span className="brand-x">X&lt;актион&gt;</span>
          <span className="brand-name">ТехЗадание</span>
        </div>
      </div>
      <div className="splash-box">
        <div className="spinner" />
        Проверяем доступ…
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === "loading") return <Splash />;
  if (status === "anon") return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <>{children}</>;
}

export function RequireAnon({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "authed") return <Navigate to="/home" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "anon") return <Navigate to="/login" replace />;
  if (user?.system_role !== "admin") return <Navigate to="/home" replace />;
  return <>{children}</>;
}
