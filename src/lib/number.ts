// src/lib/number.ts
// Small, shared numeric helpers. No app behavior changes.

export const EPS = 1e-12;

export const abs = (x: number) => Math.abs(Number(x) || 0);
export const gt = (x: number) => abs(x) > EPS;

/** Keep as many decimals as JS preserves; avoid extra rounding. */
export function fmtAbs(x: number, _maxDp = 12): string {
  const v = abs(x);
  const s = v.toString().includes("e") ? v.toFixed(12) : v.toString();
  return s;
}

export function fmtSigned(x: number, _maxDp = 12): string {
  const n = Number(x) || 0;
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${fmtAbs(n)}`;
}
