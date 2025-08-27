// src/lib/story.ts
// Human-friendly Balance Stories (no rounding; all decimals kept)

export type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string;   // "YYYY-MM-DD HH:MM:SS" (UTC+0)
  ts: number;     // epoch ms (UTC)
  symbol: string;
  extra: string;
  raw: string;
};

export type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;
export type TotalsByType = Record<string, TotalsMap>;

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
  return HUMAN[type] || type.replace(/_/g, " ").replace(/\b([a-z])/g, (s) => s.toUpperCase());
}
function fmt(n: number) { return Number.isFinite(n) ? n.toString() : "0"; }

function sumByAsset(rows: Row[]): TotalsMap {
  const acc: TotalsMap = {};
  for (const r of rows) {
    const a = (acc[r.asset] ||= { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount; else a.neg += Math.abs(r.amount);
    a.net += r.amount;
  }
  return acc;
}
function pruneZeros(map: TotalsMap): TotalsMap {
  const out: TotalsMap = {};
  for (const [asset, v] of Object.entries(map)) {
    if (v.pos === 0 && v.neg === 0 && v.net === 0) continue;
    out[asset] = v;
  }
  return out;
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
export function totalsByType(rows: Row[]): TotalsByType {
  const byType = groupByType(rows);
  const out: TotalsByType = {};
  for (const [t, list] of Object.entries(byType)) out[t] = pruneZeros(sumByAsset(list));
  return out;
}

type NarrativeOpts = {
  includeTimeline?: boolean;       // default false
  maxTimelinePerType?: number;     // default 8
  includeTopSymbols?: boolean;     // default true
  topSymbolsLimit?: number;        // default 6
};

/** Build a friendly, concise story. By default NO timeline, sadece özet + net etkiler. */
export function buildNarrative(rows: Row[], t0?: string, t1?: string, opts?: NarrativeOpts): string {
  const { includeTimeline = false, maxTimelinePerType = 8, includeTopSymbols = true, topSymbolsLimit = 6 } = opts || {};
  if (!rows?.length) return "No activity in the selected range.";

  const sorted = [...rows].sort((a, b) => a.ts - b.ts);
  const byType = groupByType(sorted);

  // Basic stats
  const symbols = new Set(sorted.map(r => r.symbol).filter(Boolean));
  const typeKeys = Object.keys(byType).sort();
  const lines: string[] = [];

  lines.push("Balance Story");
  if (t0 || t1) lines.push(`Range (UTC+0): ${t0 || "—"} → ${t1 || "—"}`);
  lines.push(`Activity summary: ${sorted.length} record(s), ${typeKeys.length} TYPE(s), ${symbols.size} symbol(s).`);
  lines.push("");

  // Optional: top symbols by absolute net across all rows
  if (includeTopSymbols) {
    const bySym = new Map<string, number>();
    for (const r of sorted) bySym.set(r.symbol || "-", (bySym.get(r.symbol || "-") || 0) + r.amount);
    const top = [...bySym.entries()]
      .filter(([s]) => s !== "-" && s !== "")
      .map(([s, v]) => [s, Math.abs(v), v] as [string, number, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, topSymbolsLimit);
    if (top.length) {
      lines.push("Top symbols by net impact:");
      for (const [sym, , net] of top) lines.push(`  • ${sym}  = ${fmt(net as number)}`);
      lines.push("");
    }
  }

  // Per TYPE section (concise totals; timeline optional)
  for (const typeKey of typeKeys) {
    const label = labelOf(typeKey);
    const list = byType[typeKey];

    // Totals per asset (skip pure-zero types)
    const totals = pruneZeros(sumByAsset(list));
    const assets = Object.keys(totals).sort();
    if (!assets.length) continue;

    lines.push(`${label}: (${list.length} record${list.length>1?"s":""})`);

    // Totals block (always)
    for (const a of assets) {
      const v = totals[a];
      const parts: string[] = [];
      if (v.pos !== 0) parts.push(`+${fmt(v.pos)}`);
      if (v.neg !== 0) parts.push(`−${fmt(v.neg)}`);
      parts.push(`= ${fmt(v.net)}`);
      lines.push(`  • ${a}  ${parts.join("  ")}`);
    }

    // Optional short timeline sample (first N meaningful rows)
    if (includeTimeline) {
      let shown = 0;
      for (const r of list) {
        if (r.amount === 0) continue;
        const sign = r.amount >= 0 ? "+" : "−";
        lines.push(`    · ${r.time.split(" ")[1]} — ${sign}${fmt(Math.abs(r.amount))} ${r.asset}${r.symbol ? `  (${r.symbol})` : ""}`);
        shown++;
        if (shown >= maxTimelinePerType) { lines.push("    · …"); break; }
      }
    }

    lines.push("");
  }

  // Overall effect across all types
  const grandTotals = pruneZeros(sumByAsset(sorted));
  if (Object.keys(grandTotals).length) {
    lines.push("Overall Effect:");
    for (const [asset, v] of Object.entries(grandTotals).sort(([a], [b]) => a.localeCompare(b))) {
      const parts: string[] = [];
      if (v.pos !== 0) parts.push(`+${fmt(v.pos)}`);
      if (v.neg !== 0) parts.push(`−${fmt(v.neg)}`);
      parts.push(`= ${fmt(v.net)}`);
      lines.push(`  • ${asset}  ${parts.join("  ")}`);
    }
  }

  return lines.join("\n");
}

/** Agent audit pieces (unchanged) */
export type AuditInput = {
  anchorTs: number;
  endTs?: number;
  baseline?: Record<string, number>;
  anchorTransfer?: { asset: string; amount: number };
};

export function buildAudit(rows: Row[], input: AuditInput): string {
  const { anchorTs, endTs, baseline, anchorTransfer } = input;
  const lines: string[] = [];

  lines.push("Agent Balance Audit");
  const from = anchorTs ?? -Infinity;
  const to = endTs ?? Infinity;

  const before: Record<string, number> = { ...(baseline || {}) };
  if (anchorTransfer && anchorTransfer.asset) {
    before[anchorTransfer.asset] = (before[anchorTransfer.asset] || 0) + anchorTransfer.amount;
  }

  const tail = rows.filter((r) => r.ts >= from && r.ts <= to).sort((a, b) => a.ts - b.ts);
  const deltas = sumByAsset(tail);
  const deltasPruned = pruneZeros(deltas);

  const final: Record<string, number> = {};
  const assets = new Set<string>([...Object.keys(before), ...Object.keys(deltasPruned)]);
  for (const a of assets) final[a] = (before[a] || 0) + (deltasPruned[a]?.net || 0);

  lines.push(`Anchor (UTC+0): ${new Date(anchorTs).toISOString().replace("T", " ").replace("Z","")}`);
  if (endTs) lines.push(`End (UTC+0):    ${new Date(endTs).toISOString().replace("T", " ").replace("Z","")}`);
  lines.push("");

  if (baseline && Object.keys(baseline).length) {
    lines.push("Baseline (before anchor):");
    for (const [a, v] of Object.entries(baseline).sort(([x],[y]) => x.localeCompare(y))) lines.push(`  • ${a}  ${fmt(v)}`);
    if (anchorTransfer) {
      const s = anchorTransfer.amount >= 0 ? "+" : "−";
      lines.push(`Applied anchor transfer: ${s}${fmt(Math.abs(anchorTransfer.amount))} ${anchorTransfer.asset}`);
    }
  } else {
    lines.push("Baseline: not provided (rolling forward from zero).");
    if (anchorTransfer) {
      const s = anchorTransfer.amount >= 0 ? "+" : "−";
      lines.push(`Note: applied anchor transfer on zero baseline → ${s}${fmt(Math.abs(anchorTransfer.amount))} ${anchorTransfer.asset}`);
    }
  }
  lines.push("");

  if (tail.length) {
    lines.push("Activity after anchor:");
    const byType = groupByType(tail);
    for (const typeKey of Object.keys(byType).sort()) {
      const label = labelOf(typeKey);
      const list = byType[typeKey].filter(r => r.amount !== 0);
      if (!list.length) continue;
      lines.push(`  ${label}:`);
      for (const r of list) {
        const sign = r.amount >= 0 ? "+" : "−";
        lines.push(`    • ${r.time.split(" ")[1]} — ${sign}${fmt(Math.abs(r.amount))} ${r.asset}${r.symbol ? `  (${r.symbol})` : ""}`);
      }
    }
    lines.push("");
  } else {
    lines.push("No activity found after anchor in the selected range.");
    lines.push("");
  }

  if (Object.keys(deltasPruned).length) {
    lines.push("Net effect (after anchor):");
    for (const [a, v] of Object.entries(deltasPruned).sort(([x],[y]) => x.localeCompare(y))) {
      const parts: string[] = [];
      if (v.pos !== 0) parts.push(`+${fmt(v.pos)}`);
      if (v.neg !== 0) parts.push(`−${fmt(v.neg)}`);
      parts.push(`= ${fmt(v.net)}`);
      lines.push(`  • ${a}  ${parts.join("  ")}`);
    }
    lines.push("");
  }

  lines.push("Final expected balances:");
  for (const a of [...assets].sort((x, y) => x.localeCompare(y))) lines.push(`  • ${a}  ${fmt(final[a])}`);

  return lines.join("\n");
}
