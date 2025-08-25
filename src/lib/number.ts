// lib/number.ts
export const EPS = 1e-12;
export const abs = (x: number) => Math.abs(Number(x) || 0);
export const gt = (x: number) => abs(x) > EPS;

export function fmtAbs(x: number) {
  const v = abs(x);
  return v.toString().includes("e") ? v.toFixed(12) : String(v);
}
export function fmtSigned(x: number) {
  const n = Number(x) || 0;
  return `${n >= 0 ? "+" : "−"}${fmtAbs(n)}`;
}
export function toCsv<T extends object>(rows: T[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]) as (keyof T)[];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const body = rows.map((r) => headers.map((h) => esc((r as any)[h])).join(","));
  return [headers.join(","), ...body].join("\n");
}
