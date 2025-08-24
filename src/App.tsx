import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Balance Log Analyzer — App.tsx
 * ------------------------------------------------------------
 * What’s new in this file
 * - Single “Balance Story” button (removed Copy Summary / Copy Full / Preview Full)
 * - Dual-story generator modal (User View / Agent View), editable + copyable
 * - Sticky right “Actions” column with compact icons
 * - Wrapped body cells (header is nowrap)
 * - Number formatting: dot-decimal only (no thousands separators)
 * - Top Winner / Top Loser placed below KPIs so header doesn’t look empty
 * - Resizable split: bumped minimum width of the right pane
 *
 * Notes
 * - This file keeps a self-contained parser + summaries so the app builds cleanly.
 * - Times are treated as UTC only. All displays are UTC+0.
 */

// ----------------------------- Utils

const EPS_FULL_COPY = 1e-12; // zero suppression (existing rule)
const STORY_DUST = 4e-8; // story-only: hide micro residues from user view

type Row = {
  id: string;
  uid?: string;
  asset: string; // USDT, USDC, BNB, ...
  type: string; // REALIZED_PNL, COMMISSION, FUNDING_FEE, ...
  amount: number;
  time: string; // "YYYY-MM-DD HH:mm:ss" (UTC+0)
  symbol?: string; // e.g., BTCUSDT
  extra?: string; // extra column
  raw?: string; // whole raw row
};

type TotalsPerAsset = Record<string, number>;

function parseNumberSafe(x: string): number {
  if (x == null) return 0;
  const n = Number(x.trim());
  if (Number.isNaN(n)) return 0;
  return n;
}

// Format: dot-decimal only; never use locale thousands separators.
// Keep full precision (no forced rounding), but trim negligible trailing zeros.
function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // keep up to 12–14 decimals if necessary, then trim trailing zeros
  const s = n.toFixed(14);
  return s.replace(/\.?0+$/, "");
}

function fmtSigned(n: number): string {
  if (n > 0) return `+${fmt(n)}`;
  if (n < 0) return `-${fmt(Math.abs(n))}`;
  return "0";
}

function isZeroish(n: number, eps = EPS_FULL_COPY) {
  return Math.abs(n) <= eps;
}

function parseUTC(ts: string): number {
  // Expect "YYYY-MM-DD HH:mm:ss" — assume UTC
  // Convert to ISO by adding 'Z'
  const t = ts.replace(" ", "T") + "Z";
  const d = new Date(t);
  return d.getTime();
}

// Friendly mapping for unusual non-event types (expandable)
const FRIENDLY_ALIASES: Record<string, string> = {
  BFUSD_REWARD: "BFUSD Reward",
  CASH_COUPON: "Cash Coupon",
};

// Event types
const EVENT_TYPES = new Set([
  "EVENT_CONTRACTS_ORDER",
  "EVENT_CONTRACTS_PAYOUT",
  "EVENT_CONTRACTS_FEE",
]);

// Swap types
const SWAP_IN = new Set(["COIN_SWAP_DEPOSIT"]);
const SWAP_OUT = new Set(["COIN_SWAP_WITHDRAW"]);

// Transfer types
const TRANSFER_GENERAL = new Set(["TRANSFER"]);
const TRANSFER_GRIDBOT = new Set(["STRATEGY_UMFUTURES_TRANSFER"]);

// ----------------------------- Parser (TSV or pasted table-like text)

function guessSplit(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  const parts = line.split(/\s{2,}/);
  if (parts.length > 1) return parts;
  return line.split(","); // very loose fallback
}

function parseTSV(raw: string): Row[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: Row[] = [];
  for (const line of lines) {
    const parts = guessSplit(line);
    // Expect at least 10 cols like the quick fixture. Degrade gracefully.
    const [
      id,
      uid,
      asset,
      type,
      amount,
      time,
      symbol,
      extra,
      idHint,
      time2,
    ] = [...parts, "", "", "", "", "", "", "", ""];

    rows.push({
      id: id || "",
      uid: uid || "",
      asset: (asset || "").toUpperCase(),
      type: (type || "").toUpperCase(),
      amount: parseNumberSafe(amount),
      time: (time || time2 || "").trim(),
      symbol: (symbol || "").toUpperCase(),
      extra: (extra || idHint || "").trim(),
      raw: line,
    });
  }
  return rows;
}

// ----------------------------- Aggregation

type Aggregates = {
  // per asset nets
  pnlPos: TotalsPerAsset;
  pnlNeg: TotalsPerAsset;
  commission: TotalsPerAsset;
  referral: TotalsPerAsset;
  fundingPos: TotalsPerAsset;
  fundingNeg: TotalsPerAsset;
  insurancePos: TotalsPerAsset;
  insuranceNeg: TotalsPerAsset;
  transferGeneralIn: TotalsPerAsset;
  transferGeneralOut: TotalsPerAsset;
  transferGridIn: TotalsPerAsset;
  transferGridOut: TotalsPerAsset;
  swapIn: TotalsPerAsset;
  swapOut: TotalsPerAsset;
  autoIn: TotalsPerAsset;
  autoOut: TotalsPerAsset;
  other: Record<string, TotalsPerAsset>; // friendly non-event types
  eventPayout: TotalsPerAsset; // USDT mostly
  eventOrder: TotalsPerAsset;
  eventFee: TotalsPerAsset;
  // symbol pnl (non-events) for winners/losers & table
  symbolRealized: Record<string, number>;
  symbolFees: Record<string, number>;
  symbolFunding: Record<string, number>;
};

function bump(map: TotalsPerAsset, asset: string, delta: number) {
  if (!asset) return;
  map[asset] = (map[asset] || 0) + delta;
}

function sum(map: TotalsPerAsset) {
  return Object.values(map).reduce((a, b) => a + b, 0);
}

function emptyTotals(): Aggregates {
  return {
    pnlPos: {},
    pnlNeg: {},
    commission: {},
    referral: {},
    fundingPos: {},
    fundingNeg: {},
    insurancePos: {},
    insuranceNeg: {},
    transferGeneralIn: {},
    transferGeneralOut: {},
    transferGridIn: {},
    transferGridOut: {},
    swapIn: {},
    swapOut: {},
    autoIn: {},
    autoOut: {},
    other: {},
    eventPayout: {},
    eventOrder: {},
    eventFee: {},
    symbolRealized: {},
    symbolFees: {},
    symbolFunding: {},
  };
}

function aggregate(rows: Row[], includeEvents: boolean) {
  const agg = emptyTotals();

  for (const r of rows) {
    const t = r.type;
    const a = r.asset;
    const amt = r.amount;

    const isEvent = EVENT_TYPES.has(t);
    if (isEvent && !includeEvents) continue;

    if (t === "REALIZED_PNL") {
      if (amt >= 0) bump(agg.pnlPos, a, amt);
      else bump(agg.pnlNeg, a, amt);
      if (r.symbol) agg.symbolRealized[r.symbol] = (agg.symbolRealized[r.symbol] || 0) + amt;
      continue;
    }
    if (t === "COMMISSION") {
      bump(agg.commission, a, amt);
      if (r.symbol) agg.symbolFees[r.symbol] = (agg.symbolFees[r.symbol] || 0) + amt;
      continue;
    }
    if (t === "FUNDING_FEE") {
      if (amt >= 0) bump(agg.fundingPos, a, amt);
      else bump(agg.fundingNeg, a, amt);
      if (r.symbol) agg.symbolFunding[r.symbol] = (agg.symbolFunding[r.symbol] || 0) + amt;
      continue;
    }
    if (t === "REFERRAL_KICKBACK") {
      bump(agg.referral, a, amt);
      continue;
    }
    if (t === "INSURANCE_CLEAR" || t === "LIQUIDATION_FEE") {
      if (amt >= 0) bump(agg.insurancePos, a, amt);
      else bump(agg.insuranceNeg, a, amt);
      continue;
    }
    if (TRANSFER_GENERAL.has(t)) {
      if (amt >= 0) bump(agg.transferGeneralIn, a, amt);
      else bump(agg.transferGeneralOut, a, Math.abs(amt));
      continue;
    }
    if (TRANSFER_GRIDBOT.has(t)) {
      if (amt >= 0) bump(agg.transferGridIn, a, amt);
      else bump(agg.transferGridOut, a, Math.abs(amt));
      continue;
    }
    if (SWAP_IN.has(t)) {
      bump(agg.swapIn, a, amt);
      continue;
    }
    if (SWAP_OUT.has(t)) {
      bump(agg.swapOut, a, Math.abs(amt));
      continue;
    }
    if (t === "AUTO_EXCHANGE") {
      if (amt >= 0) bump(agg.autoIn, a, amt);
      else bump(agg.autoOut, a, Math.abs(amt));
      continue;
    }
    if (t === "EVENT_CONTRACTS_PAYOUT") {
      bump(agg.eventPayout, a, amt);
      continue;
    }
    if (t === "EVENT_CONTRACTS_ORDER") {
      bump(agg.eventOrder, a, Math.abs(amt));
      continue;
    }
    if (t === "EVENT_CONTRACTS_FEE") {
      bump(agg.eventFee, a, Math.abs(amt));
      continue;
    }

    // friendly non-event catch-all
    if (!EVENT_TYPES.has(t)) {
      const key = FRIENDLY_ALIASES[t] || toTitle(t);
      if (!agg.other[key]) agg.other[key] = {};
      bump(agg.other[key], a, amt);
    }
  }

  return agg;
}

function toTitle(s: string) {
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

// ----------------------------- Story Builders

type StoryInputs = {
  t0?: string; // paste-in UTC time string
  start?: string; // optional start
  end?: string; // optional end
  beforeBalances?: Record<string, number>; // optional T0 before balances
  transfer?: { asset: string; amount: number } | null; // optional anchor transfer
  includeEvents: boolean;
  includeGridBot: boolean;
};

type StoryBundle = {
  userStory: string;
  agentStory: string;
};

function pruneDustForUserLine(finals: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(finals)) {
    if (Math.abs(v) > STORY_DUST) out[k] = v;
  }
  return out;
}

function assetsFromMaps(...maps: TotalsPerAsset[]) {
  const set = new Set<string>();
  for (const m of maps) for (const a of Object.keys(m)) set.add(a);
  return [...set].sort();
}

function buildNarratives(
  rows: Row[],
  agg: Aggregates,
  inputs: StoryInputs
): StoryBundle {
  const {
    t0,
    beforeBalances = {},
    transfer,
    includeEvents,
    includeGridBot,
  } = inputs;

  // 1) Final balances per asset = Starting(after T0) + all category nets.
  // If no T0 provided, we start from 0 and just state “Based on your records…”
  const startBalances: Record<string, number> = {};
  if (t0) {
    // AFTER at T0 = user BEFORE + transfer (if provided with same asset)
    for (const [a, v] of Object.entries(beforeBalances)) startBalances[a] = v;
    if (transfer && transfer.asset) {
      startBalances[transfer.asset] = (startBalances[transfer.asset] || 0) + transfer.amount;
    }
  }

  // Build per-asset net deltas
  const assets = assetsFromMaps(
    agg.pnlPos,
    agg.pnlNeg,
    agg.commission,
    agg.referral,
    agg.fundingPos,
    agg.fundingNeg,
    agg.insurancePos,
    agg.insuranceNeg,
    agg.transferGeneralIn,
    agg.transferGeneralOut,
    agg.transferGridIn,
    agg.transferGridOut,
    agg.swapIn,
    agg.swapOut,
    agg.autoIn,
    agg.autoOut,
    agg.eventPayout,
    agg.eventOrder,
    agg.eventFee,
    ...Object.values(agg.other)
  );

  const deltas: Record<string, number> = {};
  for (const a of assets) {
    const d =
      (agg.pnlPos[a] || 0) +
      (agg.pnlNeg[a] || 0) +
      (agg.commission[a] || 0) +
      (agg.referral[a] || 0) +
      (agg.fundingPos[a] || 0) +
      (agg.fundingNeg[a] || 0) +
      (agg.insurancePos[a] || 0) +
      (agg.insuranceNeg[a] || 0) +
      ((agg.transferGeneralIn[a] || 0) - (agg.transferGeneralOut[a] || 0)) +
      (includeGridBot ? (agg.transferGridIn[a] || 0) - (agg.transferGridOut[a] || 0) : 0) +
      ((agg.swapIn[a] || 0) - (agg.swapOut[a] || 0)) +
      ((agg.autoIn[a] || 0) - (agg.autoOut[a] || 0)) +
      (includeEvents ? (agg.eventPayout[a] || 0) - (agg.eventOrder[a] || 0) - (agg.eventFee[a] || 0) : 0);

    deltas[a] = d;
  }

  const finals: Record<string, number> = {};
  for (const a of assets) {
    const start = startBalances[a] || 0;
    finals[a] = start + (deltas[a] || 0);
  }

  // 2) Build narratives

  const intro = (() => {
    if (t0 && transfer) {
      const beforeA = beforeBalances[transfer.asset] || 0;
      const afterA = beforeA + transfer.amount;
      return `On ${t0} (UTC+0) you transferred ${fmt(transfer.amount)} ${transfer.asset} into your Futures wallet. At that time your ${transfer.asset} balance moved from ${fmt(beforeA)} to ${fmt(afterA)}.`;
    }
    if (t0) {
      return `At ${t0} (UTC+0) this window begins.`;
    }
    return `Here’s a clear summary of what happened on your Futures wallet based on your records.`;
  })();

  const explain = (title: string, lines: string[]) =>
    lines.length ? `\n${title}\n${lines.map((l) => `• ${l}`).join("\n")}` : "";

  // Build per-category text (USDT-focused examples where present; works per asset)
  function linesTrading(): string[] {
    const out: string[] = [];
    for (const a of assets) {
      const pos = agg.pnlPos[a] || 0;
      const neg = agg.pnlNeg[a] || 0;
      if (pos || neg)
        out.push(`${a}: profits ${fmtSigned(pos)}, losses ${fmtSigned(neg)}, net ${fmtSigned(pos + neg)}`);
    }
    return out;
  }
  function linesFees(): string[] {
    const out: string[] = [];
    for (const a of assets) {
      const f = agg.commission[a] || 0;
      if (f) out.push(`${a}: ${fmtSigned(f)}`);
    }
    return out;
  }
  function linesFunding(): string[] {
    const out: string[] = [];
    for (const a of assets) {
      const pos = agg.fundingPos[a] || 0;
      const neg = agg.fundingNeg[a] || 0;
      if (pos || neg) out.push(`${a}: received ${fmtSigned(pos)}, paid ${fmtSigned(neg)}, net ${fmtSigned(pos + neg)}`);
    }
    return out;
  }
  function linesInsurance(): string[] {
    const out: string[] = [];
    for (const a of assets) {
      const pos = agg.insurancePos[a] || 0;
      const neg = agg.insuranceNeg[a] || 0;
      if (pos || neg) out.push(`${a}: ${fmtSigned(pos + neg)}`);
    }
    return out;
  }
  function linesTransfers(): string[] {
    const out: string[] = [];
    for (const a of assets) {
      const inn = agg.transferGeneralIn[a] || 0;
      const outv = agg.transferGeneralOut[a] || 0;
      if (inn || outv) out.push(`${a}: in ${fmtSigned(inn)}, out ${fmtSigned(-outv)}, net ${fmtSigned(inn - outv)}`);
    }
    return out;
  }
  function linesGrid(): string[] {
    if (!includeGridBot) return [];
    const out: string[] = [];
    for (const a of assets) {
      const inn = agg.transferGridIn[a] || 0;
      const outv = agg.transferGridOut[a] || 0;
      if (inn || outv) out.push(`${a}: in ${fmtSigned(inn)}, out ${fmtSigned(-outv)}, net ${fmtSigned(inn - outv)}`);
    }
    return out;
  }
  function linesSwaps(): string[] {
    const out: string[] = [];
    for (const a of assets) {
      const inn = agg.swapIn[a] || 0;
      const outv = agg.swapOut[a] || 0;
      if (inn || outv) out.push(`${a}: received ${fmtSigned(inn)}, spent ${fmtSigned(-outv)}, net ${fmtSigned(inn - outv)}`);
    }
    return out;
  }
  function linesAuto(): string[] {
    const out: string[] = [];
    for (const a of assets) {
      const inn = agg.autoIn[a] || 0;
      const outv = agg.autoOut[a] || 0;
      if (inn || outv) out.push(`${a}: ${fmtSigned(inn - outv)}`);
    }
    return out;
  }
  function linesEvents(): string[] {
    if (!includeEvents) return [];
    const out: string[] = [];
    for (const a of assets) {
      const net = (agg.eventPayout[a] || 0) - (agg.eventOrder[a] || 0) - (agg.eventFee[a] || 0);
      if (net) out.push(`${a}: ${fmtSigned(net)}`);
    }
    return out;
  }
  function linesReferral(): string[] {
    const out: string[] = [];
    for (const a of assets) {
      const v = agg.referral[a] || 0;
      if (v) out.push(`${a}: ${fmtSigned(v)}`);
    }
    return out;
  }
  function linesOther(): string[] {
    const out: string[] = [];
    for (const [label, map] of Object.entries(agg.other)) {
      const keys = Object.keys(map);
      if (!keys.length) continue;
      const pieces = keys.map((a) => `${a}: ${fmtSigned(map[a] || 0)}`);
      out.push(`${label} — ${pieces.join(", ")}`);
    }
    return out;
  }

  // Final balances line (user: dust-pruned)
  const finalsUser = pruneDustForUserLine(finals);
  const finalsUserLine = Object.keys(finalsUser)
    .sort()
    .map((a) => `${fmt(finalsUser[a])} ${a}`)
    .join(", ");
  const finalsAgentLine = Object.keys(finals)
    .sort()
    .map((a) => `${fmt(finals[a])} ${a}`)
    .join(", ");

  // Narrative text — USER
  const userStory =
    [
      `Let me walk you through what happened on your Futures wallet.`,
      intro,
      "",
      `Trading (Realized PnL) — profits/losses from closed positions:`,
      ...linesTrading().map((x) => `- ${x}`),
      "",
      `Trading fees — fees charged when an order is executed:`,
      ...linesFees().map((x) => `- ${x}`),
      "",
      `Funding fees — periodic payments between long/short positions:`,
      ...linesFunding().map((x) => `- ${x}`),
      "",
      `Insurance / Liquidation clearance fees — adjustments after liquidations:`,
      ...linesInsurance().map((x) => `- ${x}`),
      "",
      `Transfers — you moved money into and out of your Futures wallet:`,
      ...linesTransfers().map((x) => `- ${x}`),
      "",
      includeGridBot
        ? `GridBot transfers — transfers to and from your GridBot wallet:`
        : "",
      ...(includeGridBot ? linesGrid().map((x) => `- ${x}`) : []),
      includeGridBot ? "" : "",
      `Coin swaps — conversions directly between assets (overall net per asset):`,
      ...linesSwaps().map((x) => `- ${x}`),
      "",
      `Auto-Exchange — automatic conversions to clear negative balances:`,
      ...linesAuto().map((x) => `- ${x}`),
      "",
      includeEvents ? `Event contracts — profit/loss from event orders and payouts:` : "",
      ...(includeEvents ? linesEvents().map((x) => `- ${x}`) : []),
      includeEvents ? "" : "",
      `Referral kickback and bonuses:`,
      ...linesReferral().map((x) => `- ${x}`),
      ...linesOther().length ? ["", "Other activity:", ...linesOther().map((x) => `- ${x}`)] : [],
      "",
      `✅ Based on all of the above, your Futures wallet should now be: ${finalsUserLine || "0"}.`,
    ]
      .flat()
      .filter(Boolean)
      .join("\n");

  // Narrative text — AGENT
  const agentStory =
    [
      `Balance Log Story (Agent View) — full detail`,
      `Window anchor: ${t0 ? `${t0} (UTC+0)` : "none"}`,
      transfer ? `Anchor transfer: ${fmt(transfer.amount)} ${transfer.asset}` : "",
      Object.keys(beforeBalances).length
        ? `T0 BEFORE balances: ${Object.entries(beforeBalances)
            .map(([a, v]) => `${fmt(v)} ${a}`)
            .join(", ")}`
        : "",
      "",
      `Per-category nets (all assets present):`,
      "",
      `• Trading (Realized PnL):`,
      ...linesTrading().map((x) => `  - ${x}`),
      `• Trading fees:`,
      ...linesFees().map((x) => `  - ${x}`),
      `• Funding fees:`,
      ...linesFunding().map((x) => `  - ${x}`),
      `• Insurance / Liquidation clearance fees:`,
      ...linesInsurance().map((x) => `  - ${x}`),
      `• Transfers (General):`,
      ...linesTransfers().map((x) => `  - ${x}`),
      includeGridBot ? `• GridBot transfers:` : "",
      ...(includeGridBot ? linesGrid().map((x) => `  - ${x}`) : []),
      `• Coin swaps:`,
      ...linesSwaps().map((x) => `  - ${x}`),
      `• Auto-Exchange:`,
      ...linesAuto().map((x) => `  - ${x}`),
      includeEvents ? `• Event contracts:` : "",
      ...(includeEvents ? linesEvents().map((x) => `  - ${x}`) : []),
      `• Referral / bonuses:`,
      ...linesReferral().map((x) => `  - ${x}`),
      ...linesOther().length ? ["• Other:", ...linesOther().map((x) => `  - ${x}`)] : [],
      "",
      `Final balances (all assets): ${finalsAgentLine || "0"}`,
    ]
      .flat()
      .filter(Boolean)
      .join("\n");

  return { userStory, agentStory };
}

// ----------------------------- UI — App

type SymbolRow = {
  symbol: string;
  pnl: number;
  fees: number;
  funding: number;
  insurance: number;
};

export default function App() {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "swaps" | "events" | "raw">("summary");

  // Story modal
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyUser, setStoryUser] = useState("");
  const [storyAgent, setStoryAgent] = useState("");

  // Story inputs
  const [includeEvents, setIncludeEvents] = useState(true);
  const [includeGridBot, setIncludeGridBot] = useState(true);
  const [t0, setT0] = useState(""); // paste time UTC
  const [transferAsset, setTransferAsset] = useState("USDT");
  const [transferAmount, setTransferAmount] = useState<string>("");
  const [beforeAsset, setBeforeAsset] = useState("USDT");
  const [beforeAmount, setBeforeAmount] = useState<string>("");

  const parsed = useMemo(() => parseTSV(rawText), [rawText]);

  useEffect(() => {
    setRows(parsed);
  }, [parsed]);

  // Aggregates for Summary
  const agg = useMemo(() => aggregate(rows, includeEvents), [rows, includeEvents]);

  // KPI: realized PnL per asset (non-events)
  const kpiAssets = ["USDT", "USDC", "BNFCR"];
  const kpi = useMemo(() => {
    return kpiAssets.map((a) => {
      const pos = agg.pnlPos[a] || 0;
      const neg = agg.pnlNeg[a] || 0;
      return { asset: a, net: pos + neg, pos, neg };
    });
  }, [agg]);

  // Winners / Losers from symbolRealized
  const { topWinner, topLoser } = useMemo(() => {
    const entries = Object.entries(agg.symbolRealized);
    if (!entries.length) return { topWinner: null as null | [string, number], topLoser: null as null | [string, number] };
    let win: [string, number] | null = null;
    let lose: [string, number] | null = null;
    for (const [sym, v] of entries) {
      if (!win || v > win[1]) win = [sym, v];
      if (!lose || v < lose[1]) lose = [sym, v];
    }
    return { topWinner: win, topLoser: lose };
  }, [agg.symbolRealized]);

  // Symbol table for right pane
  const symbolRows: SymbolRow[] = useMemo(() => {
    const syms = new Set([
      ...Object.keys(agg.symbolRealized),
      ...Object.keys(agg.symbolFees),
      ...Object.keys(agg.symbolFunding),
    ]);
    const out: SymbolRow[] = [];
    for (const s of syms) {
      out.push({
        symbol: s,
        pnl: agg.symbolRealized[s] || 0,
        fees: agg.symbolFees[s] || 0,
        funding: agg.symbolFunding[s] || 0,
        insurance: 0, // minimal (not tracked per symbol in this simplified example)
      });
    }
    return out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [agg]);

  function handleParse() {
    setRows(parseTSV(rawText));
  }

  // Build Story
  function openStory() {
    const beforeBalances: Record<string, number> = {};
    if (beforeAmount && beforeAsset) beforeBalances[beforeAsset] = parseNumberSafe(beforeAmount);

    const transfer = transferAmount
      ? { asset: transferAsset, amount: parseNumberSafe(transferAmount) }
      : null;

    const { userStory, agentStory } = buildNarratives(rows, agg, {
      t0: t0.trim() || undefined,
      beforeBalances,
      transfer,
      includeEvents,
      includeGridBot,
    });

    setStoryUser(userStory);
    setStoryAgent(agentStory);
    setStoryOpen(true);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
  }

  // Resizable panes
  const [split, setSplit] = useState(54); // left width in %
  const dragging = useRef(false);
  function startDrag(e: React.MouseEvent) {
    dragging.current = true;
    e.preventDefault();
  }
  function onMove(e: MouseEvent) {
    if (!dragging.current) return;
    const rect = (document.getElementById("pane-wrap") as HTMLElement).getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const minRight = 36; // min right width bump
    const clamped = Math.min(100 - minRight, Math.max(30, pct));
    setSplit(clamped);
  }
  function stopDrag() {
    dragging.current = false;
  }
  useEffect(() => {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stopDrag);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stopDrag);
    };
  }, []);

  // ----------------------------- Render

  return (
    <div className="app">
      <style>{styles}</style>

      {/* Tabs */}
      <div className="tabs">
        <button className={activeTab === "summary" ? "tab active" : "tab"} onClick={() => setActiveTab("summary")}>
          Summary
        </button>
        <button className={activeTab === "swaps" ? "tab active" : "tab"} onClick={() => setActiveTab("swaps")}>
          Coin Swaps
        </button>
        <button className={activeTab === "events" ? "tab active" : "tab"} onClick={() => setActiveTab("events")}>
          Event Contracts
        </button>
        <button className={activeTab === "raw" ? "tab active" : "tab"} onClick={() => setActiveTab("raw")}>
          Raw Log
        </button>
      </div>

      {/* Paste area */}
      <section className="paste">
        <div className="card">
          <div className="card-head">
            <h2>Paste Balance Log (TSV / table text)</h2>
            <div className="btn-row">
              <button onClick={handleParse}>Parse</button>
              <button className="btn-primary" onClick={openStory}>Balance Story</button>
            </div>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste your balance log rows here (UTC+0 times)…"
          />
          <div className="story-inputs">
            <div className="si-col">
              <div className="si-label">Date &amp; time (UTC+0) — optional</div>
              <input value={t0} onChange={(e) => setT0(e.target.value)} placeholder="YYYY-MM-DD HH:mm:ss" />
            </div>
            <div className="si-col">
              <div className="si-label">Transfer at T0 — optional</div>
              <div className="row">
                <select value={transferAsset} onChange={(e) => setTransferAsset(e.target.value)}>
                  {["BTC","LDUSDT","BFUSD","FDUSD","BNB","ETH","USDT","USDC","BNFCR"].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <input
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="+60.70806999"
                />
              </div>
            </div>
            <div className="si-col">
              <div className="si-label">Wallet balance BEFORE at T0 — optional</div>
              <div className="row">
                <select value={beforeAsset} onChange={(e) => setBeforeAsset(e.target.value)}>
                  {["BTC","LDUSDT","BFUSD","FDUSD","BNB","ETH","USDT","USDC","BNFCR"].map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                <input
                  value={beforeAmount}
                  onChange={(e) => setBeforeAmount(e.target.value)}
                  placeholder="0.60244298"
                />
              </div>
            </div>
            <div className="si-col toggles">
              <label><input type="checkbox" checked={includeEvents} onChange={(e) => setIncludeEvents(e.target.checked)} /> Include Event Contracts</label>
              <label><input type="checkbox" checked={includeGridBot} onChange={(e) => setIncludeGridBot(e.target.checked)} /> Include GridBot transfers</label>
            </div>
          </div>
        </div>
      </section>

      {activeTab === "summary" && (
        <>
          {/* KPI row */}
          <section className="kpis">
            <div className="kpi-grid">
              {kpi.map((k) => (
                <div className="kpi" key={k.asset}>
                  <div className="kpi-asset">{k.asset}</div>
                  <div className={`kpi-net ${k.net >= 0 ? "pos" : "neg"}`}>{fmt(k.net)}</div>
                  <div className="kpi-sub">
                    <span className="pos">{fmtSigned(k.pos)}</span>
                    {" / "}
                    <span className="neg">{fmtSigned(k.neg)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Row 2: meta cards */}
            <div className="meta-grid">
              <div className="meta-card">
                <div className="meta-title">Trades parsed</div>
                <div className="meta-value">{rows.length}</div>
              </div>
              <div className="meta-card">
                <div className="meta-title">Active symbols</div>
                <div className="meta-value">{Object.keys(agg.symbolRealized).length}</div>
              </div>
            </div>

            {/* Row 3: winner/loser + fills the space neatly */}
            <div className="wl-grid">
              <div className="meta-card">
                <div className="meta-title">Top winner</div>
                <div className="meta-value">{topWinner ? `${topWinner[0]} ${fmt(topWinner[1])}` : "—"}</div>
              </div>
              <div className="meta-card">
                <div className="meta-title">Top loser</div>
                <div className="meta-value">{topLoser ? `${topLoser[0]} ${fmt(topLoser[1])}` : "—"}</div>
              </div>
              <div className="meta-card actions-card">
                <div className="meta-title">Actions</div>
                <div className="btn-row">
                  <button className="btn-primary" onClick={openStory}>Balance Story</button>
                </div>
              </div>
            </div>
          </section>

          {/* Split panes */}
          <section id="pane-wrap" className="split">
            <div className="left" style={{ width: `${split}%` }}>
              {/* Core cards - a few examples to keep UI */}
              <div className="card">
                <div className="card-head"><h3>Trading Fees / Commission</h3></div>
                <div className="pill-col">
                  {["USDT","USDC","BNB"].map((a) => (
                    <div className="pill" key={a}>
                      <span className="pill-asset">{a}</span>
                      <span className="neg">{fmtSigned(agg.commission[a] || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Referral Kickback</h3></div>
                <div className="pill-col">
                  {["USDT","USDC"].map((a) => (
                    <div className="pill" key={a}>
                      <span className="pill-asset">{a}</span>
                      <span className="pos">{fmtSigned(agg.referral[a] || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Funding Fees</h3></div>
                <div className="pill-col">
                  {["USDT","USDC"].map((a) => (
                    <div className="pill" key={a}>
                      <span className="pill-asset">{a}</span>
                      <span className="pos">{fmtSigned(agg.fundingPos[a] || 0)}</span>
                      {" / "}
                      <span className="neg">{fmtSigned(agg.fundingNeg[a] || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Insurance / Liquidation</h3></div>
                <div className="pill-col">
                  {["USDT","USDC"].map((a) => (
                    <div className="pill" key={a}>
                      <span className="pill-asset">{a}</span>
                      <span className="pos">{fmtSigned(agg.insurancePos[a] || 0)}</span>
                      {" / "}
                      <span className="neg">{fmtSigned(agg.insuranceNeg[a] || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-head"><h3>Transfers</h3></div>
                <div className="pill-col">
                  <div className="pill">
                    <span className="pill-asset">General / USDT</span>
                    <span className="pos">{fmtSigned(agg.transferGeneralIn["USDT"] || 0)}</span>
                    {" / "}
                    <span className="neg">{fmtSigned(-(agg.transferGeneralOut["USDT"] || 0))}</span>
                  </div>
                  <div className="pill">
                    <span className="pill-asset">General / USDC</span>
                    <span className="pos">{fmtSigned(agg.transferGeneralIn["USDC"] || 0)}</span>
                    {" / "}
                    <span className="neg">{fmtSigned(-(agg.transferGeneralOut["USDC"] || 0))}</span>
                  </div>
                  {includeGridBot && (
                    <>
                      <div className="pill">
                        <span className="pill-asset">GridBot / USDT</span>
                        <span className="pos">{fmtSigned(agg.transferGridIn["USDT"] || 0)}</span>
                        {" / "}
                        <span className="neg">{fmtSigned(-(agg.transferGridOut["USDT"] || 0))}</span>
                      </div>
                      <div className="pill">
                        <span className="pill-asset">GridBot / USDC</span>
                        <span className="pos">{fmtSigned(agg.transferGridIn["USDC"] || 0)}</span>
                        {" / "}
                        <span className="neg">{fmtSigned(-(agg.transferGridOut["USDC"] || 0))}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="divider" onMouseDown={startDrag} title="Drag to resize" />

            <div className="right" style={{ width: `${100 - split}%` }}>
              <div className="card">
                <div className="card-head">
                  <h3>By Symbol (Futures, not Events)</h3>
                  <div className="btn-row">
                    {/* Left empty for future: Copy Symbols, Save PNG */}
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="symbol-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Realized PnL</th>
                        <th>Funding</th>
                        <th>Trading fees</th>
                        <th>Insurance</th>
                        <th className="sticky-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {symbolRows.map((r) => (
                        <tr key={r.symbol}>
                          <td>{r.symbol}</td>
                          <td className={r.pnl >= 0 ? "pos" : "neg"}>{fmtSigned(r.pnl)} USDT</td>
                          <td className={r.funding >= 0 ? "pos" : "neg"}>{fmtSigned(r.funding)} USDT</td>
                          <td className={r.fees >= 0 ? "pos" : "neg"}>{fmtSigned(r.fees)} USDT</td>
                          <td>—</td>
                          <td className="sticky-right">
                            <div className="icon-row">
                              <button title="Copy details" aria-label="Copy details">📝</button>
                              <button title="Save PNG" aria-label="Save PNG">🖼️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!symbolRows.length && (
                        <tr><td colSpan={6} style={{ textAlign: "center", opacity: 0.7 }}>No symbols yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === "swaps" && (
        <section className="space">
          <div className="card"><div className="card-head"><h3>Coin Swaps</h3></div><div className="muted">Grouped swap math is reflected in the story and totals.</div></div>
        </section>
      )}

      {activeTab === "events" && (
        <section className="space">
          <div className="card"><div className="card-head"><h3>Event Contracts</h3></div><div className="muted">Event payouts / orders are included if the toggle is on.</div></div>
        </section>
      )}

      {activeTab === "raw" && (
        <section className="space">
          <div className="card">
            <div className="card-head"><h3>Raw Log</h3></div>
            <pre className="raw">{rows.map((r) => r.raw).join("\n")}</pre>
          </div>
        </section>
      )}

      {/* Story Modal */}
      {storyOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-head">
              <h3>Balance Log Story</h3>
              <button onClick={() => setStoryOpen(false)}>✕</button>
            </div>

            <div className="story-tabs">
              <input type="radio" id="tabUser" name="storytab" defaultChecked />
              <label htmlFor="tabUser">User View</label>
              <input type="radio" id="tabAgent" name="storytab" />
              <label htmlFor="tabAgent">Agent View</label>

              <div className="story-panel">
                <textarea value={storyUser} onChange={(e) => setStoryUser(e.target.value)} />
                <div className="btn-row end">
                  <button className="btn-primary" onClick={() => copy(storyUser)}>Copy User Story</button>
                </div>
              </div>
              <div className="story-panel">
                <textarea value={storyAgent} onChange={(e) => setStoryAgent(e.target.value)} />
                <div className="btn-row end">
                  <button onClick={() => copy(storyAgent)}>Copy Agent Story</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------- Styles (embedded — light theme)

const styles = `
:root {
  --bg: #f7f9fb;
  --card: #ffffff;
  --border: #e8edf3;
  --text: #1c2430;
  --muted: #6b7786;
  --pos: #1e9d63;
  --neg: #d14;
  --primary: #1a9d5c;
  --shadow: 0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.06);
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color: var(--text); background: var(--bg); }

.app { padding: 14px; max-width: 1300px; margin: 0 auto; }

.tabs { display:flex; gap:8px; margin-bottom:10px; }
.tab { background:#eef3f7; border:1px solid var(--border); padding:8px 10px; border-radius:8px; cursor:pointer; }
.tab.active { background:#fff; box-shadow: var(--shadow); }

.card { background:var(--card); border:1px solid var(--border); border-radius:12px; box-shadow: var(--shadow); padding:12px; margin-bottom:12px; }
.card-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
.card h2, .card h3 { margin:0; font-size:16px; }
.muted { color:var(--muted); }

.btn-row { display:flex; gap:8px; align-items:center; }
button { border:1px solid var(--border); background:#fff; padding:6px 10px; border-radius:8px; cursor:pointer; }
button:hover { background:#fafafa; }
.btn-primary { background:var(--primary); color:#fff; border-color:transparent; }
.btn-primary:hover { filter:brightness(0.97); }

.paste textarea { width:100%; min-height:110px; border:1px solid var(--border); border-radius:8px; padding:8px; background:#fff; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.story-inputs { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:10px; margin-top:10px; }
.story-inputs .row { display:flex; gap:8px; }
.story-inputs input, .story-inputs select { width:100%; border:1px solid var(--border); border-radius:8px; padding:6px 8px; background:#fff; }
.si-label { font-size:12px; color:var(--muted); margin-bottom:6px; }
.si-col.toggles { display:flex; flex-direction:column; gap:6px; justify-content:center; }

.kpis .kpi-grid { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:10px; }
.kpi { background:var(--card); border:1px solid var(--border); border-radius:12px; box-shadow: var(--shadow); padding:10px; }
.kpi-asset { font-size:12px; color:var(--muted); margin-bottom:6px; }
.kpi-net { font-size:18px; font-weight:600; }
.kpi-net.pos { color: var(--pos); }
.kpi-net.neg { color: var(--neg); }
.kpi-sub { font-size:12px; color:var(--muted); }
.kpi-sub .pos { color: var(--pos); }
.kpi-sub .neg { color: var(--neg); }

.meta-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; margin-top:10px; }
.meta-card { background:var(--card); border:1px solid var(--border); border-radius:12px; box-shadow: var(--shadow); padding:10px; display:flex; flex-direction:column; gap:6px; }
.meta-title { font-size:12px; color:var(--muted); }
.meta-value { font-size:14px; font-weight:600; }

.wl-grid { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:10px; margin-top:10px; }
.actions-card .btn-row { margin-top:6px; }

.split { display:flex; gap:0; margin-top:12px; }
.left, .right { min-height: 300px; }
.left { min-width: 340px; }
.right { min-width: 420px; } /* bumped min width so useful before dragging */
.divider { width:8px; cursor:col-resize; background:transparent; position:relative; }
.divider::after { content:""; position:absolute; inset:0; border-left:2px dashed var(--border); }

.pill-col { display:flex; flex-direction:column; gap:8px; }
.pill { border:1px dashed var(--border); border-radius:10px; padding:8px; display:flex; gap:8px; align-items:center; justify-content:flex-start; flex-wrap:wrap; }
.pill-asset { font-weight:600; font-size:12px; color:var(--muted); }
.pos { color: var(--pos); }
.neg { color: var(--neg); }

.table-wrap { overflow:auto; }
.symbol-table { width:100%; border-collapse:separate; border-spacing:0 10px; }
.symbol-table thead th { position:sticky; top:0; background:#fff; border-bottom:1px solid var(--border); padding:10px; white-space:nowrap; }
.symbol-table tbody td { background:#fff; border:1px solid var(--border); border-left:none; padding:8px 10px; white-space:normal; word-break:break-word; }
.symbol-table tbody td:first-child { border-left:1px solid var(--border); border-top-left-radius:10px; border-bottom-left-radius:10px; }
.symbol-table tbody td:last-child { border-top-right-radius:10px; border-bottom-right-radius:10px; }
.icon-row { display:flex; gap:6px; justify-content:flex-end; }
.sticky-right { position:sticky; right:0; background:#fff; z-index:2; }

.space { margin-top:12px; }

.raw { background:#0b1220; color:#d8e3ff; padding:12px; border-radius:10px; max-height:340px; overflow:auto; }

.modal { position:fixed; inset:0; background:rgba(12,18,30,0.38); display:flex; align-items:center; justify-content:center; padding:16px; z-index:50; }
.modal-card { background:#fff; border-radius:12px; width:min(980px, 96vw); max-height:88vh; overflow:auto; border:1px solid var(--border); box-shadow: var(--shadow); }
.modal-head { display:flex; align-items:center; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border); }
.story-tabs { padding:12px; }
.story-tabs input[type="radio"] { display:none; }
.story-tabs label { margin-right:8px; background:#eef3f7; padding:6px 10px; border-radius:8px; border:1px solid var(--border); cursor:pointer; }
.story-tabs input#tabUser:checked + label { background:#fff; }
.story-tabs input#tabAgent:checked + label { background:#fff; }
.story-panel { display:none; margin-top:12px; }
.story-tabs input#tabUser:checked + label + input#tabAgent + label + .story-panel { display:block; }
.story-tabs input#tabAgent:checked + label + .story-panel + .story-panel { display:block; }
.story-panel textarea { width:100%; height:38vh; border:1px solid var(--border); border-radius:10px; padding:10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space:pre-wrap; }
.btn-row.end { justify-content:flex-end; margin-top:8px; }
`;
