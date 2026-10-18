export type Period = "day" | "week" | "month" | "year";

const pad = (n: number) => String(n).padStart(2, "0");

/** Group label for a date: 2026-10-16, 2026-W42 (ISO week), 2026-10, 2026. */
export function periodKey(d: Date, p: Period): string {
  const y = d.getFullYear();
  if (p === "year") return String(y);
  if (p === "month") return `${y}-${pad(d.getMonth() + 1)}`;
  if (p === "day") return `${y}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const t = new Date(Date.UTC(y, d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(wk)}`;
}
