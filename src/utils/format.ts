import { EPS } from "../constants";

export const gt = (n?: number) => !!n && Math.abs(n) > EPS;

export function fmtAbs(n: number){
  const v = Math.abs(n);
  if (v >= 1) return v.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return v.toPrecision(8);
}
export function fmtSigned(n: number){
  return (n >= 0 ? "+" : "-") + fmtAbs(n);
}

export function toCsv<T extends Record<string, any>>(rows: T[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (s:any) => {
    const t = String(s ?? "");
    return /[",\n]/.test(t) ? `"${t.replace(/"/g,'""')}"` : t;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
}
