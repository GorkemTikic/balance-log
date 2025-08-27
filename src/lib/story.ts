// src/lib/story.ts
// Balance Story engine — single source of truth for both Narrative and Agent Audit.
// Features:
// - Full-precision arithmetic (JS number) without display rounding
// - Avoid printing “-0” with EPS
// - Hides tiny “dust” finals for BFUSD/FDUSD/LDUSDT when requested
// - Per-TYPE aggregation, friendly section labels, “Other Transactions” funnel
// - Builds summary table rows for UI (Type, Asset, In, Out, Net)

export type Row = {
  id?: string;
  type: string;
  asset: string;
  amount: number; // positive=in, negative=out
  ts?: number;    // epoch ms (UTC)
  time?: string;  // original string
  symbol?: string;
  extra?: string;
};

export type Baseline = Record<string, number>;
export type AnchorTransfer = { amount: number; asset: string } | null;

const EPS = 1e-12;
const DUST: Record<string, number> = { BFUSD: 1e-7, FDUSD: 1e-7, LDUSDT: 1e-7 };

export function nearlyZero(n: number) {
  return Math.abs(n) < EPS;
}
export function isDust(asset: string, n: number) {
  const lim = DUST[asset.toUpperCase()];
  return lim !== undefined && Math.abs(n) < lim;
}
export function safeAdd(a: number, b: number) {
  return a + b; // keep raw
}

export function parseBaselineText(text: string): Baseline {
  const out: Baseline = {};
  (text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((line) => {
      // "USDT 3450.123", "0.1 BTC"
      const m =
        line.match(/^([A-Za-z0-9_]+)\s+([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i) ||
        line.match(/^([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s+([A-Za-z0-9_]+)/i);
      if (m) {
        const a = isNaN(Number(m[1])) ? m[1] : m[2];
        const v = isNaN(Number(m[1])) ? m[2] : m[1];
        const asset = a.toUpperCase();
        const amt = Number(v);
        if (!Number.isNaN(amt)) out[asset] = amt;
      }
    });
  return out;
}

export function aggregateByTypeAsset(rows: Row[]) {
  const map: Record<string, Record<string, { in: number; out: number; net: number; count: number }>> =
    {};
  for (const r of rows) {
    const type = r.type;
    const asset = r.asset.toUpperCase();
    const t = (map[type] ??= {});
    const a = (t[asset] ??= { in: 0, out: 0, net: 0, count: 0 });
    if (r.amount >= 0) a.in = safeAdd(a.in, r.amount);
    else a.out = safeAdd(a.out, Math.abs(r.amount));
    a.net = safeAdd(a.net, r.amount);
    a.count += 1;
  }
  return map;
}

export function netByAsset(rows: Row[]) {
  const acc: Record<string, number> = {};
  for (const r of rows) acc[r.asset.toUpperCase()] = safeAdd(acc[r.asset.toUpperCase()] ?? 0, r.amount);
  return acc;
}

// ---- Friendly labels & order ------------------------------------------------

export const SECTION_LABELS: Record<string, string> = {
  REALIZED_PNL: "Realized Profit / Loss",
  COMMISSION: "Trading Fees",
  FUNDING_FEE: "Funding Fees",
  INSURANCE_CLEAR: "Liquidation / Insurance Clearance",
  LIQUIDATION_FEE: "Liquidation / Insurance Clearance",

  REFERRAL_KICKBACK: "Referral Incomes",
  COMISSION_REBATE: "Trading Fee Rebates",
  CASH_COUPON: "Gift Money",

  POSITION_LIMIT_INCREASE_FEE: "Position Limit Increase Fee",
  POSITION_CLAIM_TRANSFER: "Free Positions",
  DELIVERED_SETTELMENT: "Delivery Contracts Settlement Amount",

  STRATEGY_UMFUTURES_TRANSFER: "Grid Bot Transfers",
  FUTURES_PRESENT: "Futures Presents",

  EVENT_CONTRACTS_ORDER: "Event Contracts (Order)",
  EVENT_CONTRACTS_PAYOUT: "Event Contracts (Payout)",

  AUTO_EXCHANGE: "Auto-Exchange",
  COIN_SWAP_DEPOSIT: "Coin Swaps (Deposit)",
  COIN_SWAP_WITHDRAW: "Coin Swaps (Withdraw)",

  BFUSD_REWARD: "BFUSD Rewards",
};

export const ORDER: string[] = [
  "REALIZED_PNL",
  "COMMISSION",
  "FUNDING_FEE",
  "INSURANCE_CLEAR",
  "LIQUIDATION_FEE",

  "REFERRAL_KICKBACK",
  "COMISSION_REBATE",
  "CASH_COUPON",

  "POSITION_LIMIT_INCREASE_FEE",
  "POSITION_CLAIM_TRANSFER",
  "DELIVERED_SETTELMENT",

  "STRATEGY_UMFUTURES_TRANSFER",
  "FUTURES_PRESENT",

  "EVENT_CONTRACTS_ORDER",
  "EVENT_CONTRACTS_PAYOUT",

  "AUTO_EXCHANGE",
  "COIN_SWAP_DEPOSIT",
  "COIN_SWAP_WITHDRAW",

  "BFUSD_REWARD",
];

// ---- Agent Audit & Narrative ------------------------------------------------

export type BuildOpts = {
  rows: Row[];
  anchorIso?: string;
  baselineText?: string;
  anchorTransfer?: AnchorTransfer;
  hideDustFinal?: boolean;
};

export function buildAgentAudit(opts: BuildOpts) {
  const baseline = parseBaselineText(opts.baselineText || "");
  const transfer = opts.anchorTransfer;
  const rows = opts.rows ?? [];

  const byAsset = netByAsset(rows);

  // Build finals = baseline + transfer + effect
  const finals: Record<string, number> = {};
  for (const [a, v] of Object.entries(baseline)) finals[a] = v;
  if (transfer && !Number.isNaN(transfer.amount)) {
    const a = transfer.asset.toUpperCase();
    finals[a] = safeAdd(finals[a] ?? 0, transfer.amount);
  }
  for (const [a, v] of Object.entries(byAsset)) finals[a] = safeAdd(finals[a] ?? 0, v);

  // Text
  const lines: string[] = [];
  lines.push("Agent Balance Audit");
  if (opts.anchorIso) lines.push(`Anchor (UTC+0): ${opts.anchorIso}`);
  lines.push("");

  if (Object.keys(baseline).length) {
    lines.push("Baseline (before anchor):");
    for (const [asset, amt] of Object.entries(baseline)) lines.push(`  • ${asset}  ${amt}`);
  } else {
    lines.push("Baseline: not provided (rolling forward from zero).");
  }

  if (transfer) {
    lines.push("");
    lines.push(
      `Applied anchor transfer: ${transfer.amount >= 0 ? "+" : ""}${transfer.amount} ${transfer.asset.toUpperCase()}`
    );
  }

  lines.push("");
  lines.push("Net effect (after anchor):");
  for (const [asset, net] of Object.entries(byAsset)) lines.push(`  • ${asset}  ${net >= 0 ? "+" : ""}${net}`);

  lines.push("");
  lines.push("Final expected balances:");
  const sorted = Object.entries(finals).sort(([a], [b]) => a.localeCompare(b));
  for (const [asset, val] of sorted) {
    if (opts.hideDustFinal && isDust(asset, val)) continue;
    lines.push(`  • ${asset}  ${val}`);
  }

  return { text: lines.join("\n"), finals, effect: byAsset };
}

function fmtIO(asset: string, vIn: number, vOut: number) {
  const parts: string[] = [];
  if (!nearlyZero(vIn)) parts.push(`${asset} +${vIn}`);
  if (!nearlyZero(vOut)) parts.push(`${asset} -${vOut}`);
  if (!parts.length) return "";
  const net = vIn - vOut;
  parts.push(`= ${net >= 0 ? "+" : ""}${net}`);
  return "• " + parts.join("  ");
}

export function buildNarrative(opts: BuildOpts) {
  const audit = buildAgentAudit(opts);
  const agg = aggregateByTypeAsset(opts.rows ?? []);
  const sections: Array<{ title: string; lines: string[] }> = [];

  // Realized: profit/loss ayrı
  if (agg.REALIZED_PNL) {
    const bag = agg.REALIZED_PNL;
    const profit: string[] = [];
    const loss: string[] = [];
    for (const [asset, v] of Object.entries(bag)) {
      if (!nearlyZero(v.in)) profit.push(`• ${asset}  +${v.in}`);
      if (!nearlyZero(v.out)) loss.push(`• ${asset}  -${v.out}`);
    }
    const lines: string[] = [];
    if (profit.length) {
      lines.push("Realized Profit:");
      lines.push(...profit.map((x) => "  " + x));
    }
    if (loss.length) {
      if (profit.length) lines.push("");
      lines.push("Realized Loss:");
      lines.push(...loss.map((x) => "  " + x));
    }
    if (lines.length) sections.push({ title: "Realized Profit / Loss", lines });
  }

  // Basit bölümler
  function pushSimple(typeKey: string) {
    const bag = agg[typeKey];
    if (!bag) return;
    const lines: string[] = [];
    for (const [asset, v] of Object.entries(bag)) {
      const s = fmtIO(asset, v.in, v.out);
      if (s) lines.push(s);
    }
    if (lines.length) sections.push({ title: SECTION_LABELS[typeKey] || typeKey, lines });
  }

  for (const key of ORDER) {
    if (key === "REALIZED_PNL") continue;
    if (key === "COIN_SWAP_DEPOSIT" || key === "COIN_SWAP_WITHDRAW") continue; // birleşik aşağıda
    pushSimple(key);
  }

  // Coin swaps birleşik anlatım
  const dep = agg.COIN_SWAP_DEPOSIT || {};
  const wdr = agg.COIN_SWAP_WITHDRAW || {};
  const swapLines: string[] = [];
  const aset = new Set<string>([...Object.keys(dep), ...Object.keys(wdr)]);
  for (const a of Array.from(aset).sort()) {
    const di = dep[a]?.in ?? 0;
    const wo = wdr[a]?.out ?? 0;
    if (nearlyZero(di) && nearlyZero(wo)) continue;
    // “X swapped -wo → +di”
    const minus = !nearlyZero(wo) ? `-${wo}` : "";
    const plus = !nearlyZero(di) ? `+${di}` : "";
    swapLines.push(`• ${a} swapped ${minus}${minus && plus ? " " : ""}${plus ? "→ " + plus : ""}`.trim());
  }
  if (swapLines.length) sections.push({ title: "Coin Swaps", lines: swapLines });

  // Diğer TYPE'lar
  const known = new Set(Object.keys(SECTION_LABELS));
  const others: string[] = [];
  for (const [typeKey, assets] of Object.entries(agg)) {
    if (typeKey === "REALIZED_PNL") continue;
    if (typeKey.startsWith("EVENT_CONTRACTS_")) continue;
    if (typeKey.startsWith("COIN_SWAP_")) continue;
    if (known.has(typeKey)) continue;
    for (const [asset, v] of Object.entries(assets)) {
      const s = fmtIO(asset, v.in, v.out);
      if (s) others.push(`${typeKey}: ${s}`);
    }
  }
  if (others.length) sections.push({ title: "Other Transactions", lines: others });

  // Giriş metni
  const head: string[] = [];
  head.push("All dates/times below are UTC+0. Please adjust to your timezone.");
  const base = parseBaselineText(opts.baselineText || "");

  if (opts.anchorIso && opts.anchorTransfer) {
    const a = opts.anchorTransfer.asset.toUpperCase();
    const before = base[a] ?? 0;
    const after = safeAdd(before, opts.anchorTransfer.amount);
    head.push(
      `${opts.anchorIso} — At this date/time, you transferred ${opts.anchorTransfer.amount} ${a} to your Futures USDs-M wallet. After this transfer your wallet balance changed from ${a} ${before} to ${a} ${after}.`
    );
    head.push("");
    head.push("If we check your transaction records after this transfer:");
  } else if (opts.anchorIso && !opts.anchorTransfer) {
    head.push(`${opts.anchorIso} — At this date/time your Futures USDs-M wallet baseline is applied.`);
    head.push("");
    head.push("Here are your transaction records after this point:");
  } else {
    head.push("Here are your transaction records:");
  }

  // Bölümler
  const body: string[] = [];
  for (const s of sections) {
    body.push("");
    body.push(s.title + ":");
    body.push(...s.lines.map((x) => "  " + x));
  }

  // Overall + Final
  const overall: string[] = [];
  overall.push("");
  overall.push("Overall effect (this range):");
  for (const [asset, net] of Object.entries(audit.effect)) {
    overall.push(`  • ${asset}  ${net >= 0 ? "+" : ""}${net}`);
  }

  const finals: string[] = [];
  finals.push("");
  finals.push("Final expected balances:");
  for (const [asset, val] of Object.entries(audit.finals).sort(([a], [b]) => a.localeCompare(b))) {
    if (opts.hideDustFinal && isDust(asset, val)) continue;
    finals.push(`  • ${asset}  ${val}`);
  }

  return [head.join("\n"), body.join("\n"), overall.join("\n"), finals.join("\n")].join("\n");
}

// ---- Summary table data -----------------------------------------------------

export type SummaryRow = { type: string; asset: string; in: number; out: number; net: number };

export function buildSummaryRows(rows: Row[]): SummaryRow[] {
  const agg = aggregateByTypeAsset(rows);
  const out: SummaryRow[] = [];
  const keys = Object.keys(agg).sort((a, b) => a.localeCompare(b));
  for (const t of keys) {
    for (const [asset, v] of Object.entries(agg[t])) {
      if (nearlyZero(v.in) && nearlyZero(v.out) && nearlyZero(v.net)) continue;
      out.push({ type: t, asset, in: v.in, out: v.out, net: v.net });
    }
  }
  // sort: by type, then asset
  out.sort((a, b) => (a.type === b.type ? a.asset.localeCompare(b.asset) : a.type.localeCompare(b.type)));
  return out;
}
