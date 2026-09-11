import { api } from "../api";

export type MeetingItem = {
  id: string;
  title: string;
  status: "uploaded" | "extracting" | "transcribing" | "analyzing" | "done" | "error";
  duration_sec?: number | null;
  created_at: string;
  requirements_count: number;
  roles_count?: number;
  contradictions_count?: number;
  questions_count?: number;
  is_video?: boolean;
  project_id?: string | null;
  project_name?: string | null;
};

export type MeetingFilter = "all" | "ready" | "work" | "error";

const WORKING: MeetingItem["status"][] = ["uploaded", "extracting", "transcribing", "analyzing"];

export const STATUS_RU: Record<string, string> = {
  uploaded: "ожидает анализа", extracting: "извлечение аудио", transcribing: "расшифровка", analyzing: "анализ", done: "готово", error: "ошибка",
};
export const STATUS_CLASS: Record<string, string> = {
  done: "done", error: "err", uploaded: "idle", extracting: "work", transcribing: "work", analyzing: "work",
};

export function matchesFilter(m: MeetingItem, f: MeetingFilter): boolean {
  if (f === "ready") return m.status === "done";
  if (f === "work") return WORKING.includes(m.status);
  if (f === "error") return m.status === "error";
  return true;
}

export async function getMeetings(): Promise<MeetingItem[]> {
  return api("/api/meetings");
}

export async function deleteMeeting(id: string) {
  return api(`/api/meetings/${id}`, { method: "DELETE" });
}

export function audioUrl(id: string) { return `/api/meetings/${id}/audio`; }
