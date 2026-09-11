export type ThemePref = "light" | "dark" | "system";

const KEY = "xtz_theme";
let listeners: Array<(dark: boolean) => void> = [];

function systemDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function getPref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "system" ? v : "dark";
}

export function isDark(): boolean {
  const p = getPref();
  return p === "dark" || (p === "system" && systemDark());
}

export function applyTheme() {
  const dark = isDark();
  document.documentElement.classList.toggle("xtz-dark", dark);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  listeners.forEach((f) => f(dark));
}

export function setPref(p: ThemePref) {
  localStorage.setItem(KEY, p);
  applyTheme();
}

export function subscribeTheme(fn: (dark: boolean) => void) {
  listeners.push(fn);
  return () => { listeners = listeners.filter((f) => f !== fn); };
}

window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (getPref() === "system") applyTheme();
});
