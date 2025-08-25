// lib/utils.ts
import { DATE_RE } from "./types";

export function titleCaseWords(s: string) {
  return s
    ? s.toLowerCase().split(/[_\s]+/).map(w => w[0]?.toUpperCase()+w.slice(1)).join(" ")
    : s;
}
export function friendlyTypeName(t: string) {
  const map: Record<string, string> = {
    CASH_COUPON: "Cash Coupon",
    WELCOME_BONUS: "Welcome Bonus",
    BFUSD_REWARD: "BFUSD Reward",
    STRATEGY_UMFUTURES_TRANSFER: "Futures GridBot Transfer",
  };
  return map[t] || titleCaseWords(t);
}
export function splitColumns(line: string) {
  if (line.includes("\t")) return line.split(/\t+/);
  return line.trim().split(/\s{2,}|\s\|\s|\s+/);
}
export function firstDateIn(line: string) {
  const m = line.match(DATE_RE);
  return m ? m[1] : "";
}
