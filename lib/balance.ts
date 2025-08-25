// lib/balance.ts
import { AssetCode, ALL_ASSETS } from "./types";

export type BalanceRow = { asset: AssetCode; amount: string };
export const emptyRow = (): BalanceRow => ({ asset: "USDT", amount: "" });

export const parseBalanceRowsToMap = (rows: BalanceRow[]) => {
  const m: Record<string, number> = {};
  rows.forEach((r) => {
    const n = Number(r.amount);
    if (!Number.isFinite(n)) return;
    m[r.asset] = (m[r.asset] || 0) + n;
  });
  return m;
};
export const mapToPrettyList = (m: Record<string, number>) => {
  const ks = Object.keys(m).filter((k) => Math.abs(m[k]) > 1e-12);
  if (!ks.length) return "—";
  return ks.sort().map((a) => `${m[a]} ${a}`).join(", ");
};

// Allow TSV pasting like "USDT<TAB>300"
export function pasteToRows(pasted: string): BalanceRow[] {
  const out: BalanceRow[] = [];
  pasted.split(/\r?\n/).forEach((line) => {
    const [a, val] = line.split(/\t|,|\s{2,}/);
    if (!a || !val) return;
    if (!ALL_ASSETS.includes(a as AssetCode)) return;
    out.push({ asset: a as AssetCode, amount: val.trim() });
  });
  return out.length ? out : [emptyRow()];
}
