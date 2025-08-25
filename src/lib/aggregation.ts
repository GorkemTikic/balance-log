// lib/aggregation.ts
import { Row, TYPE, EVENT_PREFIX } from "./types";
import { abs } from "./number";

export function sumByAsset<T extends Row>(rows: T[]) {
  const acc: Record<string, { pos: number; neg: number; net: number }> = {};
  for (const r of rows) {
    const a = (acc[r.asset] ||= { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount; else a.neg += abs(r.amount);
    a.net += r.amount;
  }
  return acc;
}

export const onlyEvents    = (rows: Row[]) => rows.filter(r => r.type.startsWith(EVENT_PREFIX));
export const onlyNonEvents = (rows: Row[]) => rows.filter(r => !r.type.startsWith(EVENT_PREFIX));

export function groupBySymbol(rows: Row[]) {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.symbol) continue;
    (m.get(r.symbol) || m.set(r.symbol, []).get(r.symbol)!).push(r);
  }
  return m;
}

export function bySymbolSummary(nonEventRows: Row[]) {
  const sym = groupBySymbol(nonEventRows);
  const out: Array<{
    symbol: string;
    realizedByAsset: Record<string, { pos: number; neg: number }>;
    fundingByAsset:  Record<string, { pos: number; neg: number }>;
    commByAsset:     Record<string, { pos: number; neg: number }>;
    insByAsset:      Record<string, { pos: number; neg: number }>;
  }> = [];

  for (const [symbol, rs] of sym.entries()) {
    const realized = rs.filter(r => r.type === TYPE.REALIZED_PNL);
    const funding  = rs.filter(r => r.type === TYPE.FUNDING_FEE);
    const comm     = rs.filter(r => r.type === TYPE.COMMISSION);
    const ins      = rs.filter(r => r.type === TYPE.INSURANCE_CLEAR || r.type === TYPE.LIQUIDATION_FEE);

    const realizedByAsset = sumByAsset(realized);
    const fundingByAsset  = sumByAsset(funding);
    const commByAsset     = sumByAsset(comm);
    const insByAsset      = sumByAsset(ins);

    const magnitude =
      Object.values(realizedByAsset).reduce((a,v)=>a+abs(v.pos)+abs(v.neg),0) +
      Object.values(fundingByAsset).reduce((a,v)=>a+abs(v.pos)+abs(v.neg),0) +
      Object.values(commByAsset).reduce((a,v)=>a+abs(v.pos)+abs(v.neg),0);
    if (magnitude <= 1e-12) continue;

    out.push({ symbol, realizedByAsset, fundingByAsset, commByAsset, insByAsset });
  }
  out.sort((a,b)=>a.symbol.localeCompare(b.symbol));
  return out;
}

type SwapKind = "COIN_SWAP" | "AUTO_EXCHANGE";
export function groupSwaps(rows: Row[], kind: SwapKind) {
  const isCoin = (t: string) => t === TYPE.COIN_SWAP_DEPOSIT || t === TYPE.COIN_SWAP_WITHDRAW;
  const filtered = rows.filter(r => kind === "COIN_SWAP" ? isCoin(r.type) : r.type === TYPE.AUTO_EXCHANGE);

  const map = new Map<string, Row[]>();
  for (const r of filtered) {
    const idHint = (r.extra && r.extra.split("@")[0]) || "";
    const key = `${r.time}|${idHint}`;
    (map.get(key) || map.set(key, []).get(key)!).push(r);
  }

  const lines: { time: string; ts: number; text: string }[] = [];
  for (const [, group] of map) {
    const t = group[0].time, ts = group[0].ts;
    const byAsset = new Map<string, number>();
    for (const g of group) byAsset.set(g.asset, (byAsset.get(g.asset) || 0) + g.amount);

    const outs: string[] = [], ins: string[] = [];
    for (const [asset, amt] of byAsset) {
      if (amt < 0) outs.push(`${amt} ${asset}`);
      if (amt > 0) ins.push(`+${amt} ${asset}`);
    }
    lines.push({ time: t, ts, text: `${t} (UTC+0) — Out: ${outs.length?outs.join(", "):"0"} → In: ${ins.length?ins.join(", "):"0"}` });
  }
  lines.sort((a,b)=>a.ts-b.ts);
  return lines;
}

export function sumByTypeAndAsset(rows: Row[]) {
  const out = {
    realized: {}, funding: {}, commission: {}, insurance: {}, referral: {},
    transferGen: {}, gridbot: {}, coinSwap: {}, autoEx: {},
    eventOrders: {}, eventPayouts: {}, otherNonEvent: {} as Record<string, Record<string,{pos:number;neg:number;net:number}>>
  } as any;

  const push = (map: any, r: Row) => {
    const v = (map[r.asset] ||= { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) v.pos += r.amount; else v.neg += Math.abs(r.amount);
    v.net += r.amount;
  };

  rows.forEach((r) => {
    switch (r.type) {
      case TYPE.REALIZED_PNL: push(out.realized, r); break;
      case TYPE.FUNDING_FEE:  push(out.funding, r); break;
      case TYPE.COMMISSION:   push(out.commission, r); break;
      case TYPE.INSURANCE_CLEAR:
      case TYPE.LIQUIDATION_FEE: push(out.insurance, r); break;
      case TYPE.REFERRAL_KICKBACK: push(out.referral, r); break;
      case TYPE.TRANSFER: push(out.transferGen, r); break;
      case TYPE.GRIDBOT_TRANSFER: push(out.gridbot, r); break;
      case TYPE.COIN_SWAP_DEPOSIT:
      case TYPE.COIN_SWAP_WITHDRAW: push(out.coinSwap, r); break;
      case TYPE.AUTO_EXCHANGE: push(out.autoEx, r); break;
      case TYPE.EVENT_ORDER: push(out.eventOrders, r); break;
      case TYPE.EVENT_PAYOUT: push(out.eventPayouts, r); break;
      default:
        if (!r.type.startsWith(EVENT_PREFIX)) {
          const m = (out.otherNonEvent[r.type] ||= {});
          push(m, r);
        }
    }
  });
  return out as ReturnType<typeof sumByTypeAndAsset>;
}

export function addMaps(a: Record<string, number>, b: Record<string, { net: number }>) {
  Object.entries(b).forEach(([asset, v]) => (a[asset] = (a[asset] || 0) + (v?.net || 0)));
}
export function addNestedMaps(a: Record<string, number>, nested: Record<string, Record<string, { net: number }>>) {
  Object.values(nested).forEach((perAsset) => addMaps(a, perAsset));
}
