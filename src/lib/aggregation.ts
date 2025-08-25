// src/lib/aggregation.ts
import { Row } from "./types";
import { abs } from "./utils";

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
  const TYPE = {
    REALIZED_PNL: "REALIZED_PNL",
    FUNDING_FEE: "FUNDING_FEE",
    COMMISSION: "COMMISSION",
    INSURANCE_CLEAR: "INSURANCE_CLEAR",
    LIQUIDATION_FEE: "LIQUIDATION_FEE",
  };
  const sym = groupBySymbol(nonEventRows);
  const out: Array<{
    symbol: string;
    realizedByAsset: Record<string, { pos: number; neg: number }>;
    fundingByAsset: Record<string, { pos: number; neg: number }>;
    commByAsset: Record<string, { pos: number; neg: number }>;
    insByAsset: Record<string, { pos: number; neg: number }>;
  }> = [];

  for (const [symbol, rs] of sym.entries()) {
    const realized = rs.filter((r) => r.type === TYPE.REALIZED_PNL);
    const funding = rs.filter((r) => r.type === TYPE.FUNDING_FEE);
    const comm = rs.filter((r) => r.type === TYPE.COMMISSION);
    const ins = rs.filter((r) => r.type === TYPE.INSURANCE_CLEAR || r.type === TYPE.LIQUIDATION_FEE);

    const realizedByAsset = sumByAsset(realized);
    const fundingByAsset = sumByAsset(funding);
    const commByAsset = sumByAsset(comm);
    const insByAsset = sumByAsset(ins);

    const coreMagnitude =
      Object.values(realizedByAsset).reduce((a, v) => a + Math.abs(v.pos) + Math.abs(v.neg), 0) +
      Object.values(fundingByAsset).reduce((a, v) => a + Math.abs(v.pos) + Math.abs(v.neg), 0) +
      Object.values(commByAsset).reduce((a, v) => a + Math.abs(v.pos) + Math.abs(v.neg), 0);
    if (coreMagnitude <= 1e-12) continue;

    out.push({ symbol, realizedByAsset, fundingByAsset, commByAsset, insByAsset });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

export function addMaps(a: Record<string, number>, b: Record<string, { net: number }>) {
  Object.entries(b).forEach(([asset, v]) => (a[asset] = (a[asset] || 0) + (v?.net || 0)));
}
export function addNestedMaps(a: Record<string, number>, nested: Record<string, Record<string, { net: number }>>) {
  Object.values(nested).forEach((perAsset) => addMaps(a, perAsset));
}
