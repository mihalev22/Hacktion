/** Только отображение: REQ-003 → «3», C-012 → «12». Данные/API/ID не меняются. */
export const idNum = (s?: string | null): string =>
  s ? s.replace(/^[A-Za-z]+-0*(\d+)$/, "$1") : "";

/** Строка со списком id: "REQ-001, REQ-007" → "1, 7" */
export const idsNum = (s: string): string =>
  (s || "").replace(/[A-Za-z]+-0*(\d+)/g, "$1");
