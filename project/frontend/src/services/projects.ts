import { api, jsonBody } from "../api";
import type { MeetingItem } from "./meetings";

export type Project = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  meetings_count: number;
  last_meeting_at: string | null;
  status: "empty" | "ready" | "work" | "error";
  my_role?: "owner" | "editor" | "viewer";
  owner_name?: string | null;
};

export type Member = { id: string; user_id: string; name: string; email: string; role: string; created_at: string };

export const getMembers = (pid: string) => api(`/api/projects/${pid}/members`) as Promise<Member[]>;
export const addMember = (pid: string, email: string, role: string) =>
  api(`/api/projects/${pid}/members`, jsonBody({ email, role })) as Promise<Member>;
export const setMemberRole = (pid: string, mid: string, role: string) =>
  api(`/api/projects/${pid}/members/${mid}`, jsonBody({ email: "", role })) as Promise<Member>;
export const removeMember = (pid: string, mid: string) => api(`/api/projects/${pid}/members/${mid}`, { method: "DELETE" });

export const getProjects = () => api("/api/projects") as Promise<Project[]>;
export const getProject = (pid: string) => api(`/api/projects/${pid}`) as Promise<Project>;
export const createProject = (name: string, description = "") =>
  api("/api/projects", jsonBody({ name, description })) as Promise<Project>;
export const deleteProject = (pid: string) => api(`/api/projects/${pid}`, { method: "DELETE" });
export const getProjectMeetings = (pid: string) => api(`/api/projects/${pid}/meetings`) as Promise<MeetingItem[]>;
