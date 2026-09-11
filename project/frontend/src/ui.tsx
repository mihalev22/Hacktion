import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

/* ---------- глобальная модалка «Новая встреча» (опционально — внутри проекта) ---------- */
export function openNewMeeting(projectId?: string | null) {
  window.dispatchEvent(new CustomEvent("xtz:new-meeting", { detail: { projectId: projectId ?? null } }));
}

/* ---------- toasts ---------- */
type Toast = { id: number; msg: string; kind: "ok" | "err" };
let toastListeners: Array<(t: Toast[]) => void> = [];
let items: Toast[] = [];
let seq = 0;

export function toast(msg: string, kind: "ok" | "err" = "ok") {
  const t = { id: ++seq, msg, kind };
  items = [...items, t];
  toastListeners.forEach((f) => f(items));
  window.setTimeout(() => {
    items = items.filter((x) => x.id !== t.id);
    toastListeners.forEach((f) => f(items));
  }, 3600);
}

export function ToastHost() {
  const [list, setList] = useState<Toast[]>(items);
  useEffect(() => {
    toastListeners.push(setList);
    return () => { toastListeners = toastListeners.filter((f) => f !== setList); };
  }, []);
  if (!list.length) return null;
  return (
    <div className="xtz-toasts">
      {list.map((t) => (
        <div key={t.id} className={`xtz-toast ${t.kind}`}>
          {t.kind === "ok" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ---------- confirm dialog (замена window.confirm) ---------- */
type ConfirmReq = { title: string; body?: string; resolve: (v: boolean) => void };
let confirmListener: ((r: ConfirmReq | null) => void) | null = null;

export function showConfirm(title: string, body?: string): Promise<boolean> {
  return new Promise((resolve) => confirmListener?.({ title, body, resolve }));
}

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  useEffect(() => {
    confirmListener = setReq;
    return () => { confirmListener = null; };
  }, []);
  if (!req) return null;
  const done = (v: boolean) => { req.resolve(v); setReq(null); };
  return (
    <div className="tz-modal-back" onClick={() => done(false)}>
      <div className="tz-modal" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={req.title}>
        <h2>{req.title}</h2>
        {req.body && <p style={{ fontSize: 13, color: "#777", marginTop: 6 }}>{req.body}</p>}
        <div className="row">
          <button className="ghost" onClick={() => done(false)}><X size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Отмена</button>
          <button className="primary" style={{ background: "var(--red, #ef2b2d)" }} onClick={() => done(true)}>Удалить</button>
        </div>
      </div>
    </div>
  );
}
