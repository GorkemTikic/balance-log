// src/lib/story.ts
// Balance Story + Agent Audit utilities (English narrative + summary table data)
// - No business rounding; only tiny float noise zeroed with EPS
// - Narrative can include baseline & anchor transfer
// - Provides summary rows for colored table

export type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string;   // "YYYY-MM-DD HH:MM:SS" (UTC+0)
  ts: number;     // epoch ms
  symbol: string;
  extra: string;
  raw: string;
};

export type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;
export type TotalsByType = Record<string, TotalsMap>;

const EPS = 1e-10; // float noise cleaner (not business rounding!)
const FINAL_HIDE_THRESHOLD = 1e-7; // hide tiny dust for BFUSD/FDUSD/LDUSDT

function approxZero(n: number) { return Math.abs(n) < EPS ? 0 : n; }

// Print precise numbers (avoid scientific notation); trim useless zeros.
function fmt(n: number): string {
  const v = approxZero(n);
  const s = v.toFixed(18);
  return s.replace(/(?:\.0+|(\.\d*?[1-9]))0+$/,'$1');
}

const HUMAN: Record<string, string> = {
  REALIZED_PNL: "Realized PnL",
  COMMISSION: "Trading Fees",
  FUNDING_FEE: "Funding",
  INSURANCE_CLEAR: "Insurance Fund",
  LIQUIDATION_FEE: "Liquidation Fee",
  TRANSFER: "Transfer",
  WELCOME_BONUS: "Welcome Bonus",
  REFERRAL_KICKBACK: "Referral Kickback",
  COMISSION_REBATE: "Commission Rebate",
  CASH_COUPON: "Cash Coupon",
  COIN_SWAP_DEPOSIT: "Coin Swap (Deposit)",
  COIN_SWAP_WITHDRAW: "Coin Swap (Withdraw)",
  POSITION_LIMIT_INCREASE_FEE: "Position Limit Increase Fee",
  POSITION_CLAIM_TRANSFER: "Position Claim Transfer",
  AUTO_EXCHANGE: "Auto-Exchange",
  DELIVERED_SETTELMENT: "Delivered Settlement",
  STRATEGY_UMFUTURES_TRANSFER: "Strategy Futures Transfer",
  FUTURES_PRESENT: "Futures Present",
  EVENT_CONTRACTS_ORDER: "Event Contracts (Order)",
  EVENT_CONTRACTS_PAYOUT: "Event Contracts (Payout)",
  INTERNAL_COMMISSION: "Internal Commission",
  INTERNAL_TRANSFER: "Internal Transfer",
  BFUSD_REWARD: "BFUSD Reward",
  INTERNAL_AGENT_REWARD: "Internal Agent Reward",
  API_REBATE: "API Rebate",
  CONTEST_REWARD: "Contest Reward",
  INTERNAL_CONTEST_REWARD: "Internal Contest Reward",
  CROSS_COLLATERAL_TRANSFER: "Cross Collateral Transfer",
  OPTIONS_PREMIUM_FEE: "Options Premium Fee",
  OPTIONS_SETTLE_PROFIT: "Options Settle Profit",
  LIEN_CLAIM: "Lien Claim",
  INTERNAL_COMMISSION_REBATE: "Internal Commission Rebate",
  FEE_RETURN: "Fee Return",
  FUTURES_PRESENT_SPONSOR_REFUND: "Futures Present Sponsor Refund",
};

function labelOf(type: string) {
  return HUMAN[type] || type.replace(/_/g, " ").replace(/\b([a-z])/g, s => s.toUpperCase());
}

export function groupByType(rows: Row[]): Record<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.type || "(unknown)";
    (m.get(k) || m.set(k, []).get(k)!)!.push(r);
  }
  const out: Record<string, Row[]> = {};
  for (const [k, v] of m.entries()) out[k] = v;
  return out;
}

export function sumByAsset(rows: Row[]): TotalsMap {
  const acc: TotalsMap = {};
  for (const r of rows) {
    const a = (acc[r.asset] ||= { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) acc[r.asset].pos += r.amount;
    else acc[r.asset].neg += Math.abs(r.amount);
    acc[r.asset].net += r.amount;
  }
  // normalize float noise
  for (const k of Object.keys(acc)) {
    acc[k].pos = approxZero(acc[k].pos);
    acc[k].neg = approxZero(acc[k].neg);
    acc[k].net = approxZero(acc[k].net);
  }
  return acc;
}

export function pruneZeros(map: TotalsMap): TotalsMap {
  const out: TotalsMap = {};
  for (const [asset, v] of Object.entries(map)) {
    if (approxZero(v.pos) === 0 && approxZero(v.neg) === 0 && approxZero(v.net) === 0) continue;
    out[asset] = v;
  }
  return out;
}

export function totalsByType(rows: Row[]): TotalsByType {
  const byType = groupByType(rows);
  const out: TotalsByType = {};
  for (const [t, list] of Object.entries(byType)) out[t] = pruneZeros(sumByAsset(list));
  return out;
}

// ---------------- Summary table rows ----------------

export type SummaryRow = { type: string; label: string; asset: string; in: number; out: number; net: number };

export function buildSummaryRows(rows: Row[]): SummaryRow[] {
  const byType = totalsByType(rows);
  const out: SummaryRow[] = [];
  for (const typeKey of Object.keys(byType).sort()) {
    const label = labelOf(typeKey);
    const assets = byType[typeKey];
    for (const asset of Object.keys(assets).sort()) {
      const v = assets[asset];
      out.push({ type: typeKey, label, asset, in: v.pos, out: v.neg, net: v.net });
    }
  }
  return out;
}

// ---------------- Narrative (English, paragraph style, TYPE-wise sums) ----------------

type NarrativeOpts = {
  initialBalances?: Record<string, number>;               // optional baseline
  anchorTransfer?: { asset: string; amount: number } | undefined;
};

export function buildNarrativeParagraphs(
  rows: Row[],
  anchorISO?: string,
  opts?: NarrativeOpts
): string {
  const { initialBalances, anchorTransfer } = opts || {};
  if (!rows?.length) return "There is no activity in the selected range.";

  const sorted = [...rows].sort((a, b) => a.ts - b.ts);
  const byType = groupByType(sorted);
  const typeKeys = Object.keys(byType).sort();

  const lines: string[] = [];

  // Opening
  if (anchorISO) {
    lines.push(`Starting from ${anchorISO}, we reviewed all activity in your futures wallet.`);
  } else {
    lines.push(`We reviewed all activity recorded in your futures wallet for the selected period.`);
  }

  if (initialBalances && Object.keys(initialBalances).length) {
    const baseParts = Object.entries(initialBalances).sort(([a],[b]) => a.localeCompare(b)).map(([a,v]) => `${a} ${fmt(v)}`);
    lines.push(`Baseline at the anchor was set as: ${baseParts.join(", ")}.`);
  }
  if (anchorTransfer && anchorTransfer.asset) {
    const s = anchorTransfer.amount >= 0 ? "+" : "−";
    lines.push(`An anchor transfer was applied: ${s}${fmt(Math.abs(anchorTransfer.amount))} ${anchorTransfer.asset}.`);
  }

  // TYPE paragraphs (sums)
  for (const typeKey of typeKeys) {
    const label = labelOf(typeKey);
    const totals = pruneZeros(sumByAsset(byType[typeKey]));
    const assets = Object.keys(totals).sort();
    if (!assets.length) continue;

    // Build a readable sentence per type, compressing assets
    const parts: string[] = [];
    for (const a of assets) {
      const v = totals[a];
      const ins = approxZero(v.pos) !== 0 ? `inflows ${fmt(v.pos)}` : "";
      const outs = approxZero(v.neg) !== 0 ? `outflows ${fmt(v.neg)}` : "";
      const io = [ins, outs].filter(Boolean).join(" and ");
      const netPhrase = `net ${fmt(v.net)}`;
      parts.push(`${a} (${io ? io + ", " : ""}${netPhrase})`);
    }
    // Final sentence
    lines.push(`${label}: ${parts.join("; ")}.`);
  }

  // Overall effect + optional final balances (with baseline+transfer)
  const deltas = pruneZeros(sumByAsset(sorted));
  const deltaAssets = Object.keys(deltas).sort();
  if (deltaAssets.length) {
    const overallParts = deltaAssets.map(a => `${a} net ${fmt(deltas[a].net)}`);
    lines.push(`Overall in this range, cumulative effect was: ${overallParts.join("; ")}.`);
  }

  if (initialBalances || anchorTransfer) {
    const base: Record<string, number> = { ...(initialBalances || {}) };
    if (anchorTransfer && anchorTransfer.asset) {
      base[anchorTransfer.asset] = (base[anchorTransfer.asset] || 0) + anchorTransfer.amount;
    }
    const final: Record<string, number> = { ...base };
    for (const [asset, tv] of Object.entries(deltas)) {
      final[asset] = approxZero((final[asset] || 0) + tv.net);
    }

    // Filter tiny dust in specific assets (BFUSD/FDUSD/LDUSDT)
    const hideDust = new Set(["BFUSD", "FDUSD", "LDUSDT"]);
    const finalsPrintable = Object.entries(final)
      .filter(([asset, v]) => !(hideDust.has(asset) && Math.abs(v) < FINAL_HIDE_THRESHOLD))
      .filter(([, v]) => approxZero(v) !== 0)
      .sort(([a],[b]) => a.localeCompare(b));

    if (finalsPrintable.length) {
      const finalParts = finalsPrintable.map(([a, v]) => `${a} ${fmt(v)}`);
      lines.push(`After applying all changes to the baseline and the anchor transfer, your final balances are: ${finalParts.join(", ")}.`);
    } else {
      lines.push(`After applying all changes, all assets settled back to zero.`);
    }
  }

  return lines.join("\n\n");
}

// ---------------- Agent Audit ----------------

export type AuditInput = {
  anchorTs: number;
  endTs?: number;
  baseline?: Record<string, number>;
  anchorTransfer?: { asset: string; amount: number };
};

export function buildAudit(rows: Row[], input: AuditInput): string {
  const { anchorTs, endTs, baseline, anchorTransfer } = input;
  const lines: string[] = [];

  const from = anchorTs ?? -Infinity;
  const to = endTs ?? Infinity;

  const before: Record<string, number> = {};
  if (baseline) for (const [a, v] of Object.entries(baseline)) before[a] = approxZero((before[a] || 0) + v);
  if (anchorTransfer && anchorTransfer.asset) {
    before[anchorTransfer.asset] = approxZero((before[anchorTransfer.asset] || 0) + anchorTransfer.amount);
  }

  const tail = rows.filter((r) => r.ts >= from && r.ts <= to).sort((a, b) => a.ts - b.ts);
  const deltas = pruneZeros(sumByAsset(tail));

  const final: Record<string, number> = {};
  const assets = new Set<string>([...Object.keys(before), ...Object.keys(deltas)]);
  for (const a of assets) {
    const net = deltas[a]?.net || 0;
    final[a] = approxZero((before[a] || 0) + net);
  }

  const anchorStr = new Date(anchorTs).toISOString().replace("T"," ").replace("Z","");
  lines.push("Agent Balance Audit");
  lines.push(`Anchor (UTC+0): ${anchorStr}`);
  if (endTs) lines.push(`End (UTC+0):    ${new Date(endTs).toISOString().replace("T"," ").replace("Z","")}`);
  lines.push("");

  if (Object.keys(before).length) {
    lines.push("Baseline (before anchor):");
    for (const [a, v] of Object.entries(before).sort(([x],[y]) => x.localeCompare(y))) lines.push(`  • ${a}  ${fmt(v)}`);
  } else {
    lines.push("Baseline: not provided (rolling forward from zero).");
  }
  if (anchorTransfer) {
    const s = anchorTransfer.amount >= 0 ? "+" : "−";
    lines.push(`Anchor transfer: ${s}${fmt(Math.abs(anchorTransfer.amount))} ${anchorTransfer.asset}`);
  }
  lines.push("");

  if (tail.length) {
    lines.push("Activity after anchor:");
    const byType = groupByType(tail);
    for (const typeKey of Object.keys(byType).sort()) {
      const label = labelOf(typeKey);
      const list = byType[typeKey].filter(r => approxZero(r.amount) !== 0);
      if (!list.length) continue;
      lines.push(`  ${label}:`);
      for (const r of list) {
        const sign = r.amount >= 0 ? "+" : "−";
        lines.push(`    • ${r.time.split(" ")[1]} — ${sign}${fmt(Math.abs(r.amount))} ${r.asset}${r.symbol ? `  (${r.symbol})` : ""}`);
      }
    }
    lines.push("");
  } else {
    lines.push("No activity found after anchor in the selected range.\n");
  }

  if (Object.keys(deltas).length) {
    lines.push("Net effect (after anchor):");
    for (const [a, v] of Object.entries(deltas).sort(([x],[y]) => x.localeCompare(y))) {
      const parts: string[] = [];
      if (approxZero(v.pos) !== 0) parts.push(`+${fmt(v.pos)}`);
      if (approxZero(v.neg) !== 0) parts.push(`−${fmt(v.neg)}`);
      parts.push(`= ${fmt(v.net)}`);
      lines.push(`  • ${a}  ${parts.join("  ")}`);
    }
    lines.push("");
  }

  // Final balances (hide dust for BFUSD/FDUSD/LDUSDT)
  const hideDust = new Set(["BFUSD", "FDUSD", "LDUSDT"]);
  const finals = [...assets].sort((a,b)=>a.localeCompare(b)).filter(a => {
    const v = final[a];
    if (hideDust.has(a) && Math.abs(v) < FINAL_HIDE_THRESHOLD) return false;
    return approxZero(v) !== 0;
  });

  lines.push("Final expected balances:");
  if (finals.length) {
    for (const a of finals) lines.push(`  • ${a}  ${fmt(final[a])}`);
  } else {
    lines.push("  • (all zero)");
  }

  return lines.join("\n");
}
