// src/lib/format.ts
export const EPS = 1e-12;
export const abs = (x: number) => Math.abs(Number(x) || 0);
export const gt = (x: number) => abs(x) > EPS;


export function fmtAbs(x: number, maxDp = 12) {
const v = abs(x);
const s = v.toString().includes("e") ? v.toFixed(12) : v.toString();
return s;
}
export function fmtSigned(x: number, maxDp = 12) {
const n = Number(x) || 0;
const sign = n >= 0 ? "+" : "−";
return `${sign}${fmtAbs(n, maxDp)}`;
}
