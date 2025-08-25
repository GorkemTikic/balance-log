// lib/story.ts
import { Row, TYPE, EVENT_PREFIX } from "./types";
import { abs } from "./utils";
import { normalizeTimeString, parseUtcMs } from "./time";

export function filterRowsInRangeUTC(rows: Row[], start?: string, end?: string, exclusiveStart = false) {
  const s = start ? parseUtcMs(normalizeTimeString(start)) : Number.NEGATIVE_INFINITY;
  const e = end ? parseUtcMs(normalizeTimeString(end)) : Number.POSITIVE_INFINITY;
  return rows.filter((r) => {
    if (exclusiveStart ? !(r.ts > s) : !(r.ts >= s)) return false;
    if (!(r.ts <= e)) return false;
    return true;
  });
}

export function sumByTypeAndAsset(rows: Row[]) {
  const out = {
    realized: {} as Record<string, { pos: number; neg: number; net: number }>,
    funding: {} as Record<string, { pos: number; neg: number; net: number }>,
    commission: {} as Record<string, { pos: number; neg: number; net: number }>,
    insurance: {} as Record<string, { pos: number; neg: number; net: number }>,
    referral: {} as Record<string, { pos: number; neg: number; net: number }>,
    transferGen: {} as Record<string, { pos: number; neg: number; net: number }>,
    gridbot: {} as Record<string, { pos: number; neg: number; net: number }>,
    coinSwap: {} as Record<string, { pos: number; neg: number; net: number }>,
    autoEx: {} as Record<string, { pos: number; neg: number; net: number }>,
    eventOrders: {} as Record<string, { pos: number; neg: number; net: number }>,
    eventPayouts: {} as Record<string, { pos: number; neg: number; net: number }>,
    otherNonEvent: {} as Record<string, Record<string, { pos: number; neg: number; net: number }>>,
  };

  const push = (map: Record<string, { pos: number; neg: number; net: number }>, r: Row) => {
    const v = (map[r.asset] = map[r.asset] || { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) v.pos += r.amount; else v.neg += Math.abs(r.amount);
    v.net += r.amount;
  };

  rows.forEach((r) => {
    switch (r.type) {
      case TYPE.REALIZED_PNL: push(out.realized, r); break;
      case TYPE.FUNDING_FEE: push(out.funding, r); break;
      case TYPE.COMMISSION: push(out.commission, r); break;
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
          const m = (out.otherNonEvent[r.type] = out.otherNonEvent[r.type] || {});
          push(m, r);
        }
    }
  });

  return out;
}

export function addMaps(a: Record<string, number>, b: Record<string, { net: number }>) {
  Object.entries(b).forEach(([asset, v]) => (a[asset] = (a[asset] || 0) + (v?.net || 0)));
}
export function addNestedMaps(a: Record<string, number>, nested: Record<string, Record<string, { net: number }>>) {
  Object.values(nested).forEach((perAsset) => addMaps(a, perAsset));
}
