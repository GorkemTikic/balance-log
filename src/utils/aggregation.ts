import { Row, ByAssetMap } from "../types";
import { TYPE, EVENT_PREFIX } from "../constants";

export function sumByAsset(rows: Row[]): ByAssetMap {
  const m: ByAssetMap = {};
  rows.forEach(r => {
    const k = r.asset || "—";
    const o = (m[k] ||= { pos:0, neg:0, net:0 });
    if (r.amount >= 0) o.pos += r.amount; else o.neg += -r.amount;
    o.net += r.amount;
  });
  return m;
}

export function bySymbolSummary(rows: Row[]){
  const nonEvent = rows.filter(r => !r.type.startsWith(EVENT_PREFIX));
  const bucket = new Map<string, Row[]>();
  nonEvent.forEach(r=>{
    const k = r.symbol || "(no symbol)";
    (bucket.get(k) || bucket.set(k, []).get(k)!).push(r);
  });
  return Array.from(bucket, ([symbol, rs]) => ({
    symbol,
    realizedByAsset: sumByAsset(rs.filter(r => r.type === TYPE.REALIZED_PNL)),
    fundingByAsset:  sumByAsset(rs.filter(r => r.type === TYPE.FUNDING_FEE)),
    commByAsset:     sumByAsset(rs.filter(r => r.type === TYPE.COMMISSION)),
    insByAsset:      sumByAsset(rs.filter(r => r.type === TYPE.INSURANCE_CLEAR || r.type === TYPE.LIQUIDATION_FEE)),
  }));
}

export function select(rows: Row[], type: string){
  return rows.filter(r => r.type === type);
}

export function eventsByAsset(rows: Row[]){
  const orders = sumByAsset(rows.filter(r => r.type === TYPE.EVENT_ORDER));
  const payouts= sumByAsset(rows.filter(r => r.type === TYPE.EVENT_PAYOUT));
  return { orders, payouts };
}
