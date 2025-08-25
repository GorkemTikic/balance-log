import { Row } from "../types";
import { EPS } from "../constants";

const abs = (x: number) => Math.abs(Number(x) || 0);

export function sumByAsset<T extends Row>(rows: T[]) {
  const acc: Record<string, { pos: number; neg: number; net: number }> = {};
  for (const r of rows) {
    const a = (acc[r.asset] = acc[r.asset] || { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount;
    else a.neg += abs(r.amount);
    a.net += r.amount;
  }
  return acc;
}

export function groupBySymbol(rows: Row[]) {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.symbol) continue;
    const g = m.get(r.symbol) || [];
    g.push(r);
    m.set(r.symbol, g);
  }
  return m;
}

export function bySymbolSummary(nonEventRows: Row[]) {
  const sym = groupBySymbol(nonEventRows);
  const out: Array<{
    symbol: string;
    realizedByAsset: Record<string, { pos: number; neg: number }>;
    fundingByAsset: Record<string, { pos: number; neg: number }>;
    commByAsset: Record<string, { pos: number; neg: number }>;
    insByAsset: Record<string, { pos: number; neg: number }>;
  }> = [];

  const pick = (rs: Row[], t: string) => rs.filter((r) => r.type === t);

  for (const [symbol, rs] of sym.entries()) {
    const realizedByAsset = sumByAsset(pick(rs, "REALIZED_PNL"));
    const fundingByAsset = sumByAsset(pick(rs, "FUNDING_FEE"));
    const commByAsset = sumByAsset(pick(rs, "COMMISSION"));
    const insByAsset = sumByAsset(rs.filter((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE"));

    const coreMagnitude =
      Object.values(realizedByAsset).reduce((a, v) => a + Math.abs(v.pos) + Math.abs(v.neg), 0) +
      Object.values(fundingByAsset).reduce((a, v) => a + Math.abs(v.pos) + Math.abs(v.neg), 0) +
      Object.values(commByAsset).reduce((a, v) => a + Math.abs(v.pos) + Math.abs(v.neg), 0);
    if (coreMagnitude <= EPS) continue;

    out.push({ symbol, realizedByAsset, fundingByAsset, commByAsset, insByAsset });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

export type SwapKind = "COIN_SWAP" | "AUTO_EXCHANGE";
export function groupSwaps(rows: Row[], kind: SwapKind) {
  const isCoin = (t: string) => t === "COIN_SWAP_DEPOSIT" || t === "COIN_SWAP_WITHDRAW";
  const filtered = rows.filter((r) => (kind === "COIN_SWAP" ? isCoin(r.type) : r.type === "AUTO_EXCHANGE"));

  const map = new Map<string, Row[]>();
  for (const r of filtered) {
    const idHint = (r.extra && r.extra.split("@")[0]) || "";
    const key = `${r.time}|${idHint}`;
    const g = map.get(key) || [];
    g.push(r);
    map.set(key, g);
  }

  const lines: { time: string; ts: number; text: string }[] = [];
  for (const [, group] of map.entries()) {
    const t = group[0].time;
    const ts = group[0].ts;
    const byAsset = new Map<string, number>();
    for (const g of group) byAsset.set(g.asset, (byAsset.get(g.asset) || 0) + g.amount);

    const outs: string[] = [];
    const ins: string[] = [];
    for (const [asset, amt] of byAsset.entries()) {
      if (amt < 0) outs.push(`${amt} ${asset}`);
      if (amt > 0) ins.push(`+${amt} ${asset}`);
    }
    lines.push({ time: t, ts, text: `${t} (UTC+0) — Out: ${outs.length ? outs.join(", ") : "0"} → In: ${ins.length ? ins.join(", ") : "0"}` });
  }
  lines.sort((a, b) => a.ts - b.ts);
  return lines;
}
