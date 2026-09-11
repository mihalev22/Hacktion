import { api } from "../api";

export type AdminUser = {
  id: string; name: string; email: string; system_role: "admin" | "user";
  status: "active" | "blocked"; created_at: string;
  projects_count: number; meetings_count: number;
};

export type AdminProject = {
  id: string; name: string; owner: string; owner_email: string;
  meetings_count: number; members_count: number; updated_at: string;
};

export type Activity = {
  users: number; projects: number; meetings: number; done: number;
  recent: Array<{ id: string; title: string; status: string; user: string; project: string; created_at: string }>;
};

export const getUsers = () => api("/api/admin/users") as Promise<AdminUser[]>;
export const patchUser = (id: string, body: { system_role?: string; is_active?: boolean }) =>
  api(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const deleteUser = (id: string) => api(`/api/admin/users/${id}`, { method: "DELETE" });
export const getAdminProjects = () => api("/api/admin/projects") as Promise<AdminProject[]>;
export const getActivity = () => api("/api/admin/activity") as Promise<Activity>;
