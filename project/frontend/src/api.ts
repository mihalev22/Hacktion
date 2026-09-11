export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(status: number, detail: any) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

let refreshPromise: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

export async function rawApi(path: string, opts: RequestInit = {}): Promise<any> {
  const r = await fetch(path, { credentials: "include", ...opts });
  if (!r.ok) {
    let detail: any = `${r.status}`;
    try { detail = (await r.json()).detail ?? detail; } catch { /* ignore */ }
    throw new ApiError(r.status, detail);
  }
  if (r.status === 204) return null;
  const ct = r.headers.get("content-type") || "";
  return ct.includes("json") ? r.json() : r.text();
}

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

/** Основной клиент: сам тянет HttpOnly-cookies, при 401 — один refresh + повтор. */
export async function api(path: string, opts: RequestInit = {}, allowRetry = true): Promise<any> {
  try {
    return await rawApi(path, opts);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && allowRetry && !path.startsWith("/api/auth/")) {
      if (await refreshSession()) return api(path, opts, false);
      onSessionLost?.();
    }
    throw e;
  }
}

export const jsonBody = (data: object): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
