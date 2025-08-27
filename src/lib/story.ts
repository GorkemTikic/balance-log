// src/lib/story.ts
// Single source of truth for Balance Story + Agent Audit.
// - sums with full precision-ish (JS Number) without rounding/formatting
// - avoids printing “-0” by using epsilon
// - hides tiny dust balances for BFUSD/FDUSD/LDUSDT in "final expected"

export type Row = {
  id?: string;
  type: string;
  asset: string;
  amount: number; // positive=in, negative=out (as pasted)
  ts?: number;    // epoch ms (UTC)
  time?: string;  // raw time string if any
  symbol?: string;
  extra?: string;
};

export type Baseline = Record<string, number>;

export type AnchorTransfer = { amount: number; asset: string } | null;

const EPS = 1e-12;
const DUST: Record<string, number> = {
  BFUSD: 1e-7,
  FDUSD: 1e-7,
  LDUSDT: 1e-7,
};

export function nearlyZero(n: number) {
  return Math.abs(n) < EPS;
}

export function isDust(asset: string, n: number) {
  const lim = DUST[asset.toUpperCase()];
  return lim !== undefined && Math.abs(n) < lim;
}

export function safeAdd(a: number, b: number) {
  return a + b; // keep raw precision; caller never rounds
}

export function parseBaselineText(text: string): Baseline {
  // Expects lines like: "USDT 3450.12345678"
  const out: Baseline = {};
  (text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((line) => {
      const m = line.match(/^([A-Za-z0-9_]+)\s+([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
      if (m) {
        const asset = m[1].toUpperCase();
        const amt = Number(m[2]);
        if (!Number.isNaN(amt)) out[asset] = amt;
      }
    });
  return out;
}

export function aggregateByTypeAsset(rows: Row[]) {
  // return: { [type]: { [asset]: {in, out, net, count} } }
  const map: Record<
    string,
    Record<string, { in: number; out: number; net: number; count: number }>
  > = {};
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
  for (const r of rows) {
    const k = r.asset.toUpperCase();
    acc[k] = safeAdd(acc[k] ?? 0, r.amount);
  }
  return acc;
}

// ---- Friendly section names & routing --------------------------------------

export const SECTION_LABELS: Record<string, string> = {
  REALIZED_PNL: "Realized Profit / Loss",
  COMMISSION: "Trading Fees",
  FUNDING_FEE: "Funding Fees",
  INSURANCE_CLEAR: "Liquidation / Insurance Clearance",
  LIQUIDATION_FEE: "Liquidation / Insurance Clearance",

  REFERRAL_KICKBACK: "Referral Incomes",
  COMISSION_REBATE: "Trading Fee Rebates", // (spelling as in source)
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

const ORDER: string[] = [
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

function fmtLine(parts: Array<string | false | null | undefined>) {
  // join non-empty parts with "  —  "
  return parts.filter(Boolean).join("  —  ");
}

function fmtIO(asset: string, vIn: number, vOut: number) {
  const segs: string[] = [];
  if (!nearlyZero(vIn)) segs.push(`${asset} +${vIn}`);
  if (!nearlyZero(vOut)) segs.push(`${asset} -${vOut}`);
  if (segs.length === 0) return "";
  const net = vIn - vOut;
  segs.push(`= ${net >= 0 ? "+" : ""}${net}`);
  return "• " + segs.join("  ");
}

export type BuildOpts = {
  // narrative header controls
  anchorIso?: string; // "YYYY-MM-DD HH:MM:SS"
  baselineText?: string; // lines per asset
  anchorTransfer?: AnchorTransfer;

  // hide-dust in finals
  hideDustFinal?: boolean;

  // if present, rows are already filtered by time window
  rows: Row[];
};

export function buildAgentAudit(opts: BuildOpts) {
  const baseline = parseBaselineText(opts.baselineText || "");
  const transfer = opts.anchorTransfer;

  // All rows after anchor
  const rows = opts.rows ?? [];

  // effect after anchor:
  const byAsset = netByAsset(rows);

  // final = baseline (+ transfer) + effect
  const finals: Record<string, number> = {};
  // seed with baseline
  for (const [asset, amt] of Object.entries(baseline)) finals[asset] = amt;

  // apply transfer first (user said: “applied on the baseline first”)
  if (transfer && !Number.isNaN(transfer.amount)) {
    const a = transfer.asset.toUpperCase();
    finals[a] = safeAdd(finals[a] ?? 0, transfer.amount);
  }

  // apply activity
  for (const [asset, net] of Object.entries(byAsset)) {
    finals[asset] = safeAdd(finals[asset] ?? 0, net);
  }

  // Build preview text
  const lines: string[] = [];
  lines.push("Agent Balance Audit");
  if (opts.anchorIso) lines.push(`Anchor (UTC+0): ${opts.anchorIso}`);
  lines.push("");

  if (Object.keys(baseline).length) {
    lines.push("Baseline (before anchor):");
    for (const [asset, amt] of Object.entries(baseline)) {
      lines.push(`  • ${asset}  ${amt}`);
    }
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
  for (const [asset, net] of Object.entries(byAsset)) {
    lines.push(`  • ${asset}  ${net >= 0 ? "+" : ""}${net}`);
  }

  lines.push("");
  lines.push("Final expected balances:");
  const finalEntries = Object.entries(finals).sort(([a], [b]) => a.localeCompare(b));
  for (const [asset, val] of finalEntries) {
    if (opts.hideDustFinal && isDust(asset, val)) continue;
    lines.push(`  • ${asset}  ${val}`);
  }

  return { text: lines.join("\n"), finals, effect: byAsset };
}

export function buildNarrative(opts: BuildOpts) {
  // Use same math as audit, plus per-type breakdown.
  const audit = buildAgentAudit(opts);

  const agg = aggregateByTypeAsset(opts.rows ?? []);

  // section assembly
  const sections: Array<{ title: string; lines: string[] }> = [];

  // REALIZED_PNL split profit/loss
  if (agg.REALIZED_PNL) {
    const items = agg.REALIZED_PNL;
    const prof: string[] = [];
    const loss: string[] = [];
    for (const [asset, v] of Object.entries(items)) {
      if (!nearlyZero(v.in)) prof.push(`• ${asset}  +${v.in}`);
      if (!nearlyZero(v.out)) loss.push(`• ${asset}  -${v.out}`);
    }
    const lines: string[] = [];
    if (prof.length) {
      lines.push("Realized Profit:");
      lines.push(...prof.map((s) => "  " + s));
    }
    if (loss.length) {
      if (prof.length) lines.push("");
      lines.push("Realized Loss:");
      lines.push(...loss.map((s) => "  " + s));
    }
    if (lines.length) sections.push({ title: "Realized Profit / Loss", lines });
  }

  // General helper for simple sections
  function pushSimpleSection(typeKey: string) {
    const bag = agg[typeKey];
    if (!bag) return;
    const lines: string[] = [];
    for (const [asset, v] of Object.entries(bag)) {
      const s = fmtIO(asset, v.in, v.out);
      if (s) lines.push(s);
    }
    if (lines.length) sections.push({ title: SECTION_LABELS[typeKey] || typeKey, lines });
  }

  // Dedicated sections in order (excluding Realized handled above)
  for (const key of ORDER) {
    if (key === "REALIZED_PNL") continue;
    if (key === "COIN_SWAP_DEPOSIT" || key === "COIN_SWAP_WITHDRAW") continue; // handled later
    pushSimpleSection(key);
  }

  // Coin Swaps combined note
  const dep = agg.COIN_SWAP_DEPOSIT || {};
  const wdr = agg.COIN_SWAP_WITHDRAW || {};
  const csLines: string[] = [];
  const assetSet = new Set<string>([
    ...Object.keys(dep),
    ...Object.keys(wdr),
  ]);
  for (const a of Array.from(assetSet).sort()) {
    const di = dep[a]?.in ?? dep[a]?.net ?? 0; // deposits counted on "in"
    const wo = wdr[a]?.out ?? (wdr[a] ? Math.abs(wdr[a].net) : 0);
    if (nearlyZero(di) && nearlyZero(wo)) continue;
    csLines.push(
      `• ${a} swapped ${!nearlyZero(wo) ? "-" + wo : ""} ${!nearlyZero(di) ? "→ +" + di : ""}`.trim()
    );
  }
  if (csLines.length) sections.push({ title: "Coin Swaps", lines: csLines });

  // Unknown types -> Other Transactions
  const known = new Set(Object.keys(SECTION_LABELS));
  const others: string[] = [];
  for (const [typeKey, assets] of Object.entries(agg)) {
    if (typeKey === "REALIZED_PNL") continue;
    if (typeKey.startsWith("EVENT_CONTRACTS_")) continue; // already covered
    if (typeKey.startsWith("COIN_SWAP_")) continue;
    if (known.has(typeKey)) continue;
    for (const [asset, v] of Object.entries(assets)) {
      const s = fmtIO(asset, v.in, v.out);
      if (s) others.push(`${typeKey}: ${s}`);
    }
  }
  if (others.length) sections.push({ title: "Other Transactions", lines: others });

  // Header
  const head: string[] = [];
  head.push("All dates/times below are UTC+0. Please adjust to your timezone.");
  if (opts.anchorIso && opts.anchorTransfer) {
    // full intro
    const before = (() => {
      const a = opts.anchorTransfer!.asset.toUpperCase();
      const base = parseBaselineText(opts.baselineText || "");
      const valBefore = base[a] ?? 0;
      return `${a} ${valBefore}`;
    })();
    const after = (() => {
      const a = opts.anchorTransfer!.asset.toUpperCase();
      const base = parseBaselineText(opts.baselineText || "");
      const valAfter = safeAdd(base[a] ?? 0, opts.anchorTransfer!.amount);
      return `${a} ${valAfter}`;
    })();
    head.push(
      `${opts.anchorIso} — At this date/time, you transferred ${opts.anchorTransfer.amount} ${opts.anchorTransfer.asset.toUpperCase()} into your Futures USDs-M wallet. After this transfer your wallet balance changed from ${before} to ${after}.`
    );
    head.push("");
    head.push("If we check your transaction records after this point:");
  } else if (opts.anchorIso && !opts.anchorTransfer) {
    head.push(`${opts.anchorIso} — At this date/time your Futures USDs-M wallet baseline is applied.`);
    head.push("");
    head.push("Here are your transaction records after this point:");
  } else {
    head.push("Here are your transaction records:");
  }

  // Body
  const body: string[] = [];
  for (const s of sections) {
    body.push("");
    body.push(s.title + ":");
    body.push(...s.lines.map((x) => "  " + x));
  }

  // Overall effect and finals (use same math as audit)
  const overall: string[] = [];
  overall.push("");
  overall.push("Overall effect (this range):");
  for (const [asset, net] of Object.entries(audit.effect)) {
    overall.push(`  • ${asset}  ${net >= 0 ? "+" : ""}${net}`);
  }

  const finals: string[] = [];
  finals.push("");
  finals.push("Final expected balances:");
  for (const [asset, val] of Object.entries(audit.finals).sort(([a],[b]) => a.localeCompare(b))) {
    if (opts.hideDustFinal && isDust(asset, val)) continue;
    finals.push(`  • ${asset}  ${val}`);
  }

  return [head.join("\n"), body.join("\n"), overall.join("\n"), finals.join("\n")].join("\n");
}
