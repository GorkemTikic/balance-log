// src/utils/format.ts

const EPS = 1e-12;

export const abs = (x: number) => Math.abs(Number(x) || 0);
export const gt = (x: number) => abs(x) > EPS;

export function fmtAbs(x: number, maxDp = 12): string {
  const v = abs(x);
  const s = v.toString().includes("e") ? v.toFixed(12) : v.toString();
  return s;
}

export function fmtSigned(x: number, maxDp = 12): string {
  const n = Number(x) || 0;
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${fmtAbs(n, maxDp)}`;
}

export function titleCaseWords(s: string): string {
  if (!s) return s;
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function friendlyTypeName(t: string): string {
  const map: Record<string, string> = {
    CASH_COUPON: "Cash Coupon",
    WELCOME_BONUS: "Welcome Bonus",
    BFUSD_REWARD: "BFUSD Reward",
    STRATEGY_UMFUTURES_TRANSFER: "Futures GridBot Transfer",
  };
  return map[t] || titleCaseWords(t);
}
