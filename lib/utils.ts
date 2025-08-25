// lib/utils.ts
import { DATE_RE, SYMBOL_RE, EPS, EVENT_PREFIX, TYPE, Row } from "./types";

/* numbers & formatting */
export const abs = (x: number) => Math.abs(Number(x) || 0);
export const gt = (x: number) => abs(x) > EPS;

export function fmtAbs(x: number) {
  const v = abs(x);
  const s = v.toString().includes("e") ? v.toFixed(12) : v.toString();
  return s;
}
export function fmtSigned(x: number) {
  const n = Number(x) || 0;
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${fmtAbs(n)}`;
}

export function toCsv<T extends object>(rows: T[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]) as (keyof T)[];
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const body = rows.map((r) => headers.map((h) => escape((r as any)[h])).join(","));
  return [headers.join(","), ...body].join("\n");
}

/* labels */
function titleCaseWords(s: string) {
  if (!s) return s;
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

/* parsing */
function splitColumns(line: string) {
  if (line.includes("\t")) return line.split(/\t+/);
  return line.trim().split(/\s{2,}|\s\|\s|\s+/);
}
function firstDateIn(line: string) {
  const m = line.match(DATE_RE);
  return m ? m[1] : "";
}
export function parseBalanceLog(text: string) {
  const rows: Row[] = [];
  const diags: string[] = [];

  const lines = text
    .replace(/[\u00A0\u2000-\u200B]/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const when = firstDateIn(line);
    if (!when) {
      diags.push(`• Skipped (no time): ${line.slice(0, 160)}`);
      continue;
    }
    const cols = splitColumns(line);
    if (cols.length < 6) {
      diags.push(`• Skipped (too few columns): ${line.slice(0, 160)}`);
      continue;
    }

    const id = cols[0] ?? "";
    const uid = cols[1] ?? "";
    const asset = cols[2] ?? "";
    const type = cols[3] ?? "";
    const amountRaw = cols[4] ?? "";
    const timeCol = cols.find((c) => DATE_RE.test(c)) ?? when;
    const symbolCandidate = cols[6] ?? "";
    const extra = cols.slice(7).join(" ");

    const amount = Number(amountRaw);
    if (Number.isNaN(amount)) {
      diags.push(`• Skipped (amount not numeric): ${line.slice(0, 160)}`);
      continue;
    }

    let symbol = "";
    if (symbolCandidate && SYMBOL_RE.test(symbolCandidate)) symbol = symbolCandidate;

    // normalize to HH zero-padded
    const m = timeCol.match(DATE_RE)?.[1] || when;
    const hh = m.replace(/(\d{4}-\d{2}-\d{2}) (\d{1,2})(:\d{2}:\d{2})/, (_, a, h, b) => `${a} ${String(h).padStart(2,"0")}${b}`);
    const ts = Date.parse(hh + "Z"); // treat as UTC

    rows.push({ id, uid, asset, type, amount, time: hh, ts, symbol, extra, raw: line });
  }

  return { rows, diags };
}

/* grouping & summaries */
export function sumByAsset<T extends Row>(rows: T[]) {
  const acc: Record<string, { pos: number; neg: number; net: number }> = {};
  for (const r of rows) {
    const a = (acc[r.asset] = acc[r.asset] || { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount; else a.neg += abs(r.amount);
    a.net += r.amount;
  }
  return acc;
}
export const onlyEvents = (rows: Row[]) => rows.filter((r) => r.type.startsWith(EVENT_PREFIX));
export const onlyNonEvents = (rows: Row[]) => rows.filter((r) => !r.type.startsWith(EVENT_PREFIX));

function groupBySymbol(rows: Row[]) {
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
      Object.values(realizedByAsset).reduce((a, v) => a + abs(v.pos) + abs(v.neg), 0) +
      Object.values(fundingByAsset).reduce((a, v) => a + abs(v.pos) + abs(v.neg), 0) +
      Object.values(commByAsset).reduce((a, v) => a + abs(v.pos) + abs(v.neg), 0);

    if (coreMagnitude <= EPS) continue;
    out.push({ symbol, realizedByAsset, fundingByAsset, commByAsset, insByAsset });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

/* swaps */
export type SwapKind = "COIN_SWAP" | "AUTO_EXCHANGE";
export function groupSwaps(rows: Row[], kind: SwapKind) {
  const isCoin = (t: string) => t === TYPE.COIN_SWAP_DEPOSIT || t === TYPE.COIN_SWAP_WITHDRAW;
  const filtered = rows.filter((r) =>
    kind === "COIN_SWAP" ? isCoin(r.type) : r.type === TYPE.AUTO_EXCHANGE
  );
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
      if (amt < 0) outs.push(`${fmtSigned(amt)} ${asset}`);
      if (amt > 0) ins.push(`${fmtSigned(amt)} ${asset}`);
    }
    lines.push({
      time: t, ts,
      text: `${t} (UTC+0) — Out: ${outs.length ? outs.join(", ") : "0"} → In: ${ins.length ? ins.join(", ") : "0"}`
    });
  }
  lines.sort((a, b) => a.ts - b.ts);
  return lines;
}

/* text helpers for symbol rows */
export function pairsToText(map: Record<string, { pos: number; neg: number }>) {
  const entries = Object.entries(map).filter(([, v]) => gt(v.pos) || gt(v.neg));
  if (!entries.length) return "–";
  return entries
    .map(([a, v]) => {
      if (v.pos > EPS && v.neg > EPS) return `+${fmtAbs(v.pos)} / −${fmtAbs(v.neg)} ${a}`;
      if (v.pos > EPS) return `+${fmtAbs(v.pos)} ${a}`;
      return `−${fmtAbs(v.neg)} ${a}`;
    })
    .join("; ");
}
