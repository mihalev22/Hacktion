import { useCallback, useEffect, useRef, useState } from "react";
import { deleteMeeting, getMeetings } from "../services/meetings";
import type { MeetingItem } from "../services/meetings";
import { showConfirm, toast } from "../ui";

export function useMeetings(pollMs?: number) {
  const [list, setList] = useState<MeetingItem[] | null>(null);
  const [error, setError] = useState("");
  const prevStatus = useRef<Record<string, string>>({});

  const notify = useCallback((l: MeetingItem[]) => {
    for (const m of l) {
      const p = prevStatus.current[m.id];
      if (p && p !== m.status && m.status === "done" && localStorage.getItem("xtz_notify_tz") !== "0")
        toast(`ТЗ готово: «${m.title}»`);
      if (p && p !== m.status && m.status === "error" && localStorage.getItem("xtz_notify_err") !== "0")
        toast(`Не удалось обработать «${m.title}»`, "err");
      prevStatus.current[m.id] = m.status;
    }
  }, []);

  const refetch = useCallback(async () => {
    try {
      const l = await getMeetings();
      setList(l);
      notify(l);
      setError("");
      return l;
    } catch {
      setError("Не удалось загрузить встречи");
      return [];
    }
  }, [notify]);

  useEffect(() => {
    refetch();
    if (!pollMs) return;
    const t = window.setInterval(() => {
      getMeetings().then((l) => {
        setList(l);
        notify(l);
        if (l.every((m) => m.status === "done" || m.status === "error")) window.clearInterval(t);
      }).catch(() => { /* ignore tick */ });
    }, pollMs);
    return () => window.clearInterval(t);
  }, [refetch, notify, pollMs]);

  const remove = useCallback(async (m: MeetingItem) => {
    const ok = await showConfirm("Удалить встречу?",
      `«${m.title}» со всеми требованиями будет удалена безвозвратно.`);
    if (!ok) return false;
    try {
      await deleteMeeting(m.id);
      setList((l) => (l ?? []).filter((x) => x.id !== m.id));
      delete prevStatus.current[m.id];
      toast("Встреча удалена");
      return true;
    } catch {
      toast("Не удалось удалить встречу", "err");
      return false;
    }
  }, []);

  return { list, error, refetch, remove };
}
