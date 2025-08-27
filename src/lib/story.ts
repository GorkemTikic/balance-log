// src/lib/story.ts
// Text generators for Balance Story: Narrative (GPT-style) and Agent Audit.
// Requirements:
// - Friendly but clear tone (not too casual).
// - No rounding: show full precision (as parsed / summed).
// - Hide zero-only lines (no +0, -0, = 0 noise).
// - Mention ALL types that exist in the given rows.

export type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string;
  ts: number;         // UTC ms
  symbol: string;
  extra: string;
  raw: string;
};

export type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;

function fmt(n: number) {
  // No rounding; keep JS native precision printing
  // Ensures "-0" is normalized to "0"
  const s = Number.isFinite(n) ? String(n) : "0";
  return s === "-0" ? "0" : s;
}

function humanType(t: string) {
  return t.replace(/_/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function sumByAsset(rows: Row[]): TotalsMap {
  const acc: TotalsMap = {};
  for (const r of rows) {
    const a = (acc[r.asset] ||= { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount;
    else a.neg += Math.abs(r.amount);
    a.net += r.amount;
  }
  return acc;
}

function pruneZeroTotals(m: TotalsMap) {
  for (const k of Object.keys(m)) {
    const v = m[k];
    if (v.pos === 0 && v.neg === 0 && v.net === 0) {
      delete (m as any)[k];
    }
  }
}

function clampRange(rows: Row[], t0?: number, t1?: number) {
  const lo = typeof t0 === "number" ? t0 : -Infinity;
  const hi = typeof t1 === "number" ? t1 : Infinity;
  return rows.filter((r) => r.ts >= lo && r.ts <= hi).sort((a, b) => a.ts - b.ts);
}

function timeRangeHeader(t0?: number, t1?: number) {
  const f = (ts?: number) =>
    typeof ts === "number" && Number.isFinite(ts)
      ? new Date(ts).toISOString().replace("T", " ").replace(".000Z", "")
      : "—";
  return `Range (UTC+0): ${f(t0)} → ${f(t1)}`;
}

/** Join non-empty parts with separator */
function joinParts(parts: string[], sep = "  •  ") {
  return parts.filter(Boolean).join(sep);
}

/** Build simple line " +X ...  −Y ...  = Z " hiding +0/−0 */
function partsLine(v: { pos: number; neg: number; net: number }) {
  const parts: string[] = [];
  if (v.pos !== 0) parts.push(`+${fmt(v.pos)}`);
  if (v.neg !== 0) parts.push(`−${fmt(v.neg)}`);
  // Always show net (even if 0) but upstream prunes all-zero rows.
  parts.push(`= ${fmt(v.net)}`);
  return parts.join("  ");
}

/** Group COIN_SWAP_* and AUTO_EXCHANGE into readable sentences per timestamp */
function buildSwapLines(rows: Row[]) {
  // key by exact timestamp string for grouping
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.time; // already normalized "YYYY-MM-DD HH:mm:ss"
    (groups.get(key) || groups.set(key, []).get(key)!)!.push(r);
  }
  const out: string[] = [];
  for (const [time, list] of groups.entries()) {
    const byAsset = new Map<string, number>();
    for (const g of list) byAsset.set(g.asset, (byAsset.get(g.asset) || 0) + g.amount);
    const outs: string[] = [];
    const ins: string[] = [];
    for (const [asset, amt] of byAsset.entries()) {
      if (amt < 0) outs.push(`−${fmt(Math.abs(amt))} ${asset}`);
      if (amt > 0) ins.push(`+${fmt(amt)} ${asset}`);
    }
    if (!outs.length && !ins.length) continue;
    const parts: string[] = [];
    if (outs.length) parts.push(`Out: ${outs.join(", ")}`);
    if (ins.length) parts.push(`In: ${ins.join(", ")}`);
    out.push(`  ${time} — ${parts.join("  →  ")}`);
  }
  return out.sort();
}

/* ===================== NARRATIVE ===================== */

export function buildNarrative(allRows: Row[], opts?: { t0?: string; t1?: string }) {
  const t0 = opts?.t0 ? Date.parse(opts.t0 + "Z") : undefined;
  const t1 = opts?.t1 ? Date.parse(opts.t1 + "Z") : undefined;
  const rows = clampRange(allRows, t0, t1);

  if (!rows.length) {
    return [
      "Balance Story",
      timeRangeHeader(t0, t1),
      "",
      "No activity found in the selected range.",
    ].join("\n");
  }

  const header = ["Balance Story", timeRangeHeader(t0, t1), ""];
  const byType = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.type || "(UNKNOWN)";
    (byType.get(k) || byType.set(k, []).get(k)!)!.push(r);
  }

  const typeKeys = Array.from(byType.keys()).sort();

  const body: string[] = [];
  for (const typeKey of typeKeys) {
    const list = byType.get(typeKey)!;

    // For swaps/auto-exchange we render per-timestamp lines
    const isSwapLike =
      typeKey.includes("COIN_SWAP") || typeKey === "AUTO_EXCHANGE";

    body.push(`• ${humanType(typeKey)}`);
    if (isSwapLike) {
      const lines = buildSwapLines(list);
      if (lines.length) {
        body.push(...lines);
      } else {
        // If nothing meaningful remains, don’t print empty section details
      }
    } else if (typeKey === "EVENT_CONTRACTS_ORDER" || typeKey === "EVENT_CONTRACTS_PAYOUT") {
      const totals = sumByAsset(list);
      pruneZeroTotals(totals);
      const keys = Object.keys(totals).sort();
      if (keys.length) {
        for (const a of keys) {
          body.push(`  ${a}  ${partsLine(totals[a])}`);
        }
      }
    } else {
      // General types: aggregate by asset, hide zero-only
      const totals = sumByAsset(list);
      pruneZeroTotals(totals);
      const keys = Object.keys(totals).sort();
      if (keys.length) {
        for (const a of keys) {
          body.push(`  ${a}  ${partsLine(totals[a])}`);
        }
      }
    }

    body.push(""); // section spacer
  }

  // Global net effect by asset across all rows in range
  const grand = sumByAsset(rows);
  pruneZeroTotals(grand);
  const grandKeys = Object.keys(grand).sort();
  if (grandKeys.length) {
    body.push("Summary (net effect):");
    for (const a of grandKeys) {
      const v = grand[a];
      // Only show net here to keep summary concise
      body.push(`  ${a}  = ${fmt(v.net)}`);
    }
  }

  return [...header, ...body].join("\n");
}

/* ===================== AGENT AUDIT ===================== */

export type AuditInput = {
  anchorTs: string;                     // "YYYY-MM-DD HH:mm:ss" in UTC+0
  endTs?: string;                       // optional end
  baseline?: Record<string, number>;    // optional baseline balances (pre-transfer)
  anchorTransfer?: { asset: string; amount: number }; // optional transfer applied at anchor
};

/**
 * Agent Audit:
 * - Start from anchor time (and optional baseline & transfer).
 * - Apply transfer to baseline (if provided).
 * - Accumulate all movements strictly AFTER anchor up to end.
 * - Produce per-asset final expected balances.
 */
export function buildAudit(allRows: Row[], input: AuditInput) {
  const tAnchor = Date.parse(input.anchorTs + "Z");
  const tEnd = input.endTs ? Date.parse(input.endTs + "Z") : undefined;

  const rowsAfter = clampRange(
    allRows,
    tAnchor + 1, // strictly after anchor moment
    tEnd
  );

  // Baseline (pre-transfer)
  const baseline: Record<string, number> = {};
  if (input.baseline) {
    for (const [a, n] of Object.entries(input.baseline)) {
      baseline[a] = n;
    }
  }

  // Apply anchor transfer (if provided) to get "post-transfer expected"
  const post: Record<string, number> = { ...baseline };
  if (input.anchorTransfer && input.anchorTransfer.asset) {
    const a = input.anchorTransfer.asset;
    post[a] = (post[a] || 0) + input.anchorTransfer.amount;
  }

  // Aggregate all rows AFTER anchor
  const delta = sumByAsset(rowsAfter);

  // Final expected = post + delta.net
  const final: Record<string, number> = { ...post };
  for (const [a, v] of Object.entries(delta)) {
    final[a] = (final[a] || 0) + v.net;
  }

  // Build text
  const lines: string[] = [];
  lines.push("Agent Balance Audit");
  lines.push(`Anchor (UTC+0): ${input.anchorTs}`);
  lines.push(`End (UTC+0): ${input.endTs ? input.endTs : "—"}`);
  lines.push("");

  // Baseline
  if (Object.keys(baseline).length) {
    lines.push("Baseline (before anchor transfer):");
    for (const a of Object.keys(baseline).sort()) {
      lines.push(`  ${a}  ${fmt(baseline[a])}`);
    }
    lines.push("");
  } else {
    lines.push("Baseline: not provided (working relatively from anchor).");
    lines.push("");
  }

  // Anchor transfer
  if (input.anchorTransfer && input.anchorTransfer.asset) {
    lines.push("Anchor transfer (applied at anchor):");
    lines.push(
      `  ${input.anchorTransfer.asset}  ${fmt(input.anchorTransfer.amount)}`
    );
    lines.push("");
  }

  // Post-transfer expected
  if (Object.keys(post).length) {
    lines.push("Expected after anchor (baseline + transfer):");
    for (const a of Object.keys(post).sort()) {
      lines.push(`  ${a}  ${fmt(post[a])}`);
    }
    lines.push("");
  }

  // Movements after anchor (by type + asset) for full transparency
  if (rowsAfter.length) {
    lines.push("Activity after anchor:");
    const byType = new Map<string, Row[]>();
    for (const r of rowsAfter) {
      (byType.get(r.type) || byType.set(r.type, []).get(r.type)!)!.push(r);
    }
    for (const typeKey of Array.from(byType.keys()).sort()) {
      const list = byType.get(typeKey)!;
      lines.push(`• ${humanType(typeKey)}`);
      if (typeKey.includes("COIN_SWAP") || typeKey === "AUTO_EXCHANGE") {
        const swapLines = buildSwapLines(list);
        if (swapLines.length) lines.push(...swapLines);
      } else {
        const totals = sumByAsset(list);
        pruneZeroTotals(totals);
        for (const a of Object.keys(totals).sort()) {
          lines.push(`  ${a}  ${partsLine(totals[a])}`);
        }
      }
      lines.push("");
    }
  } else {
    lines.push("No activity after anchor.");
    lines.push("");
  }

  // Final expected balances
  lines.push("Final expected balances:");
  for (const a of Object.keys(final).sort()) {
    lines.push(`  ${a}  ${fmt(final[a])}`);
  }

  return lines.join("\n");
}
