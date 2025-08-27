// src/lib/story.ts
// Narrative + Audit + Summary helpers with multi-language labels
// Covers all TYPES dynamically; no rounding; preserves full precision.

export type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

export type SummaryRow = { label: string; asset: string; in: number; out: number; net: number };

type Lang = "en" | "tr" | "ar" | "vi" | "ru";

const L = {
  en: {
    utcNote: "All dates/times below are UTC+0. Please adjust to your timezone.",
    introWithAnchor: (iso: string, t?: {asset:string,amount:number}, before?: Record<string,number>, after?: Record<string,number>) =>
      `${iso} — At this date/time, ${t ? `you transferred ${fmtNum(t.amount)} ${t.asset} into your Futures USDⓈ-M wallet. ` : ""}` +
      (before && after ? `After this transfer, your wallet balances changed from ${fmtBalances(before)} to ${fmtBalances(after)}.` : ""),
    introNoAnchor: "Here are your transaction records:",
    afterAnchor: "If we check your transaction records after this point:",
    sectionTitle: (label: string) => label,
    line: (asset: string, pos: number, neg?: number) =>
      typeof neg === "number"
        ? `${asset}  +${fmtNum(pos)}  −${fmtNum(neg)}  = ${fmtNum(pos - neg)}`
        : `${asset}  ${pos >= 0 ? "+" : ""}${fmtNum(pos)}`,
    swapsPair: (gave: string, got: string) => `Swaps: gave ${gave}; received ${got}`,
    autoX: "Auto-Exchange",
    unknownTail: "Other activity (unlisted TYPES):",
    final: (map: Record<string,number>) => {
      const list = Object.entries(map).map(([a,v]) => `• ${a}  ${fmtNum(v)}`).join("\n  ");
      return `Final expected balances:\n  ${list}`;
    },
  },
  tr: {
    utcNote: "Aşağıdaki tüm tarih/saatler UTC+0’dır. Lütfen kendi zaman diliminize göre değerlendirin.",
    introWithAnchor: (iso: string, t?: {asset:string,amount:number}, before?: Record<string,number>, after?: Record<string,number>) =>
      `${iso} — Bu tarih/saatte${t ? ` ${fmtNum(t.amount)} ${t.asset} tutarında Futures USDⓈ-M cüzdanına transfer yapılmış. ` : " "}` +
      (before && after ? `Bu transfer sonrası cüzdan bakiyeleri ${fmtBalances(before)} → ${fmtBalances(after)} olarak güncellenmiş.` : ""),
    introNoAnchor: "İşlem kayıtlarınız aşağıdaki gibidir:",
    afterAnchor: "Bu noktadan sonraki işlem kayıtlarına bakarsak:",
    sectionTitle: (label: string) => label,
    line: (asset: string, pos: number, neg?: number) =>
      typeof neg === "number"
        ? `${asset}  +${fmtNum(pos)}  −${fmtNum(neg)}  = ${fmtNum(pos - neg)}`
        : `${asset}  ${pos >= 0 ? "+" : ""}${fmtNum(pos)}`,
    swapsPair: (gave: string, got: string) => `Swap işlemleri: verilen ${gave}; alınan ${got}`,
    autoX: "Oto-Dönüşüm (Auto-Exchange)",
    unknownTail: "Diğer (listede olmayan TYPE’lar):",
    final: (map: Record<string,number>) => {
      const list = Object.entries(map).map(([a,v]) => `• ${a}  ${fmtNum(v)}`).join("\n  ");
      return `Beklenen nihai bakiyeler:\n  ${list}`;
    },
  },
  ar: {
    utcNote: "جميع التواريخ/الأوقات أدناه بتوقيت UTC+0. يرجى ضبط المنطقة الزمنية لديك.",
    introWithAnchor: (iso: string, t?: {asset:string,amount:number}, before?: Record<string,number>, after?: Record<string,number>) =>
      `${iso} — في هذا التوقيت${t ? ` تم تحويل ${fmtNum(t.amount)} ${t.asset} إلى محفظة العقود الدائمة USDⓈ-M. ` : " "}` +
      (before && after ? `بعد التحويل أصبحت الأرصدة ${fmtBalances(before)} ← ${fmtBalances(after)}.` : ""),
    introNoAnchor: "سجل معاملاتك كالتالي:",
    afterAnchor: "وبعد هذا الوقت، تفاصيل معاملاتك:",
    sectionTitle: (label: string) => label,
    line: (asset: string, pos: number, neg?: number) =>
      typeof neg === "number"
        ? `${asset}  +${fmtNum(pos)}  −${fmtNum(neg)}  = ${fmtNum(pos - neg)}`
        : `${asset}  ${pos >= 0 ? "+" : ""}${fmtNum(pos)}`,
    swapsPair: (gave: string, got: string) => `عمليات المبادلة: تم إعطاء ${gave}؛ وتم استلام ${got}`,
    autoX: "التحويل التلقائي (Auto-Exchange)",
    unknownTail: "أنواع أخرى (غير مُدرجة):",
    final: (map: Record<string,number>) => {
      const list = Object.entries(map).map(([a,v]) => `• ${a}  ${fmtNum(v)}`).join("\n  ");
      return `الأرصدة المتوقعة نهائياً:\n  ${list}`;
    },
  },
  vi: {
    utcNote: "Mọi ngày/giờ bên dưới dùng UTC+0. Vui lòng quy đổi sang múi giờ của bạn.",
    introWithAnchor: (iso: string, t?: {asset:string,amount:number}, before?: Record<string,number>, after?: Record<string,number>) =>
      `${iso} — Ở thời điểm này${t ? ` bạn đã chuyển ${fmtNum(t.amount)} ${t.asset} vào ví Futures USDⓈ-M. ` : " "}` +
      (before && after ? `Sau chuyển khoản, số dư thay đổi từ ${fmtBalances(before)} → ${fmtBalances(after)}.` : ""),
    introNoAnchor: "Bản ghi giao dịch của bạn:",
    afterAnchor: "Sau mốc thời gian trên, chi tiết giao dịch:",
    sectionTitle: (label: string) => label,
    line: (asset: string, pos: number, neg?: number) =>
      typeof neg === "number"
        ? `${asset}  +${fmtNum(pos)}  −${fmtNum(neg)}  = ${fmtNum(pos - neg)}`
        : `${asset}  ${pos >= 0 ? "+" : ""}${fmtNum(pos)}`,
    swapsPair: (gave: string, got: string) => `Hoán đổi: đã đưa ${gave}; nhận ${got}`,
    autoX: "Tự hoán đổi (Auto-Exchange)",
    unknownTail: "Loại khác (không liệt kê):",
    final: (map: Record<string,number>) => {
      const list = Object.entries(map).map(([a,v]) => `• ${a}  ${fmtNum(v)}`).join("\n  ");
      return `Số dư kỳ vọng cuối cùng:\n  ${list}`;
    },
  },
  ru: {
    utcNote: "Все даты/время ниже указаны в UTC+0. При необходимости переведите в ваш часовой пояс.",
    introWithAnchor: (iso: string, t?: {asset:string,amount:number}, before?: Record<string,number>, after?: Record<string,number>) =>
      `${iso} — В этот момент${t ? ` вы перевели ${fmtNum(t.amount)} ${t.asset} на кошелёк Futures USDⓈ-M. ` : " "}` +
      (before && after ? `После перевода балансы изменились с ${fmtBalances(before)} на ${fmtBalances(after)}.` : ""),
    introNoAnchor: "Ваши записи операций:",
    afterAnchor: "После этой точки в логах видно:",
    sectionTitle: (label: string) => label,
    line: (asset: string, pos: number, neg?: number) =>
      typeof neg === "number"
        ? `${asset}  +${fmtNum(pos)}  −${fmtNum(neg)}  = ${fmtNum(pos - neg)}`
        : `${asset}  ${pos >= 0 ? "+" : ""}${fmtNum(pos)}`,
    swapsPair: (gave: string, got: string) => `Свопы: отдано ${gave}; получено ${got}`,
    autoX: "Автообмен (Auto-Exchange)",
    unknownTail: "Прочие (не в списке) типы:",
    final: (map: Record<string,number>) => {
      const list = Object.entries(map).map(([a,v]) => `• ${a}  ${fmtNum(v)}`).join("\n  ");
      return `Итоговые ожидаемые балансы:\n  ${list}`;
    },
  },
} as const;

// ----- public builders -----

export function buildNarrativeParagraphs(
  rows: Row[],
  anchorISO?: string,
  opts?: {
    initialBalances?: Record<string, number> | undefined;
    anchorTransfer?: { asset: string; amount: number } | undefined;
    lang?: Lang;
  }
): string {
  const lang: Lang = opts?.lang || "en";
  const i18n = L[lang];
  const parts: string[] = [];

  // UTC note
  parts.push(i18n.utcNote);

  // Optional intro (anchor / baseline / transfer)
  if (anchorISO) {
    // If baseline balances provided and transfer known, compute "after" = before + transfer
    const before = opts?.initialBalances;
    const after = before && opts?.anchorTransfer
      ? addMaps(before, { [opts.anchorTransfer.asset]: opts.anchorTransfer.amount })
      : undefined;

    parts.push(i18n.introWithAnchor(anchorISO, opts?.anchorTransfer, before, after));
    parts.push(i18n.afterAnchor);
  } else {
    parts.push(i18n.introNoAnchor);
  }

  if (!rows?.length) {
    parts.push("No activity in the selected range.");
    return parts.filter(Boolean).join("\n\n").trim();
  }

  // Group by TYPE + asset
  const byType = groupTotals(rows);

  // Explicit sections per your spec
  const wantedOrder: Array<[string,string]> = [
    ["REALIZED_PNL","Realized Profit / Loss"],
    ["COMMISSION","Trading Fees"],
    ["FUNDING_FEE","Funding Fees"],
    ["INSURANCE_CLEAR","Liquidation / Insurance Clearance"],
    ["REFERRAL_KICKBACK","Referral Incomes"],
    ["COMISSION_REBATE","Trading Fee Rebates"],
    ["CASH_COUPON","Gift Money"],
    ["POSITION_LIMIT_INCREASE_FEE","Position Limit Increase Fee"],
    ["POSITION_CLAIM_TRANSFER","Free Positions"],
    ["DELIVERED_SETTELMENT","Delivery Contracts Settlement Amount"],
    ["STRATEGY_UMFUTURES_TRANSFER","Grid Bot Transfers"],
    ["FUTURES_PRESENT","Futures Presents"],
    ["EVENT_CONTRACTS_ORDER","Event Contracts — Order"],
    ["EVENT_CONTRACTS_PAYOUT","Event Contracts — Payout"],
  ];

  // Helper to render a TYPE block
  const renderBlock = (typeKey: string, label: string) => {
    const m = byType[typeKey];
    if (!m) return;
    const lines: string[] = [];
    for (const asset of sortAssets(Object.keys(m))) {
      const { pos, neg } = m[asset];
      // For REALIZED_PNL split profit/loss into two lines
      if (typeKey === "REALIZED_PNL") {
        if (pos !== 0) lines.push(i18n.line(`${asset} (profit)`, pos));
        if (neg !== 0) lines.push(i18n.line(`${asset} (loss)`, -neg));
      } else {
        lines.push(i18n.line(asset, pos, neg));
      }
    }
    if (!lines.length) return;
    parts.push(i18n.sectionTitle(label));
    parts.push("  " + lines.join("\n  "));
  };

  // 1) Render ordered explicit sections
  for (const [k, label] of wantedOrder) renderBlock(k, label);

  // 2) Coin Swaps: render as “gave/received” summary per-asset
  const csd = byType["COIN_SWAP_DEPOSIT"];
  const csw = byType["COIN_SWAP_WITHDRAW"];
  if (csd || csw) {
    const gave: string[] = [];
    const got: string[]  = [];
    if (csw) for (const a of sortAssets(Object.keys(csw))) {
      const { pos, neg } = csw[a];
      const totalOut = pos + neg; // withdraw reduces the asset in Futures
      if (totalOut !== 0) gave.push(`${fmtNum(totalOut)} ${a}`);
    }
    if (csd) for (const a of sortAssets(Object.keys(csd))) {
      const { pos, neg } = csd[a];
      const totalIn = pos - neg; // deposit increases the asset in Futures
      if (totalIn !== 0) got.push(`${fmtNum(totalIn)} ${a}`);
    }
    parts.push("Coin Swaps");
    parts.push("  " + i18n.swapsPair(gave.join(" + "), got.join(" + ")));
  }

  // 3) Auto-Exchange separate
  if (byType["AUTO_EXCHANGE"]) {
    const lines: string[] = [];
    for (const a of sortAssets(Object.keys(byType["AUTO_EXCHANGE"]))) {
      const { pos, neg } = byType["AUTO_EXCHANGE"][a];
      const net = pos - neg;
      if (net !== 0) lines.push(`${a}  ${net > 0 ? "+" : ""}${fmtNum(net)}`);
    }
    if (lines.length) {
      parts.push(L[lang].autoX);
      parts.push("  " + lines.join("\n  "));
    }
  }

  // 4) TRANSFER (general)
  renderBlock("TRANSFER", "Transfers (general)");

  // 5) Any other TYPES not in the list → “Other activity”
  const used = new Set([
    ...wantedOrder.map(([k]) => k),
    "COIN_SWAP_DEPOSIT","COIN_SWAP_WITHDRAW","AUTO_EXCHANGE","TRANSFER"
  ]);
  const tail: string[] = [];
  for (const tk of Object.keys(byType).sort()) {
    if (used.has(tk)) continue;
    const m = byType[tk];
    const details: string[] = [];
    for (const a of sortAssets(Object.keys(m))) {
      const { pos, neg } = m[a];
      if (pos !== 0 || neg !== 0) details.push(`${tk} — ${i18n.line(a, pos, neg)}`);
    }
    if (details.length) tail.push(...details);
  }
  if (tail.length) {
    parts.push(i18n.unknownTail);
    parts.push("  " + tail.join("\n  "));
  }

  // Final expected balances (from totals across all rows)
  const finalMap = netByAsset(rows);

  // Drop tiny dust for BFUSD/FDUSD/LDUSDT if below 1e-7 (your request)
  for (const dustAsset of ["BFUSD","FDUSD","LDUSDT"]) {
    if (Math.abs(finalMap[dustAsset] || 0) < 1e-7) delete finalMap[dustAsset];
  }

  parts.push(i18n.final(finalMap));

  return parts.filter(Boolean).join("\n\n").trim();
}

export function buildAudit(
  rows: Row[],
  opts: {
    anchorTs: number;
    endTs?: number;
    baseline?: Record<string, number>;
    anchorTransfer?: { asset: string; amount: number };
  }
): string {
  const { anchorTs, endTs, baseline, anchorTransfer } = opts;

  const after = rows.filter(r => r.ts >= anchorTs && (!endTs || r.ts <= endTs));
  const totals = netByAsset(after);

  const lines: string[] = [];
  lines.push("Agent Balance Audit");
  lines.push(`Anchor (UTC+0): ${new Date(anchorTs).toISOString().replace("T"," ").replace("Z","")}`);
  if (endTs) lines.push(`End (UTC+0): ${new Date(endTs).toISOString().replace("T"," ").replace("Z","")}`);
  if (baseline) {
    lines.push("\nBaseline (before anchor):");
    for (const a of sortAssets(Object.keys(baseline))) lines.push(`  • ${a}  ${fmtNum(baseline[a])}`);
  }
  if (anchorTransfer) {
    lines.push(`\nApplied anchor transfer: ${anchorTransfer.amount >= 0 ? "+" : ""}${fmtNum(anchorTransfer.amount)} ${anchorTransfer.asset}`);
  }

  // Net effect lines
  lines.push("\nNet effect (after anchor):");
  for (const a of sortAssets(Object.keys(totals))) {
    lines.push(`  • ${a}  ${totals[a] >= 0 ? "+" : ""}${fmtNum(totals[a])}`);
  }

  // Final expected = baseline + transfer + netEffect
  let expected = { ...baseline };
  if (!expected) expected = {};
  if (anchorTransfer) expected = addMaps(expected, { [anchorTransfer.asset]: anchorTransfer.amount });
  expected = addMaps(expected, totals);

  // Dust suppression for BFUSD/FDUSD/LDUSDT
  for (const dust of ["BFUSD","FDUSD","LDUSDT"]) {
    if (Math.abs(expected[dust] || 0) < 1e-7) delete expected[dust];
  }

  lines.push("\nFinal expected balances:");
  const keys = sortAssets(Object.keys(expected));
  if (!keys.length) lines.push("  • (none)");
  for (const a of keys) lines.push(`  • ${a}  ${fmtNum(expected[a])}`);

  return lines.join("\n");
}

export function totalsByType(rows: Row[]) {
  const res: Record<string, Record<string, { pos: number; neg: number; net: number }>> = {};
  for (const r of rows) {
    const t = r.type || "UNKNOWN";
    const a = r.asset || "NA";
    res[t] = res[t] || {};
    res[t][a] = res[t][a] || { pos: 0, neg: 0, net: 0 };
    if (r.amount >= 0) res[t][a].pos += r.amount; else res[t][a].neg += -r.amount;
    res[t][a].net += r.amount;
  }
  return res;
}

export function buildSummaryRows(rows: Row[]): SummaryRow[] {
  const t = totalsByType(rows);
  const out: SummaryRow[] = [];
  for (const typeKey of Object.keys(t)) {
    for (const asset of Object.keys(t[typeKey])) {
      const { pos, neg, net } = t[typeKey][asset];
      out.push({ label: typeKey, asset, in: pos, out: neg, net });
    }
  }
  // stable ordering: by type, then asset
  out.sort((a,b) => a.label === b.label ? a.asset.localeCompare(b.asset) : a.label.localeCompare(b.label));
  return out;
}

// ----- helpers -----

function groupTotals(rows: Row[]) {
  return totalsByType(rows);
}

function netByAsset(rows: Row[]) {
  const map: Record<string, number> = {};
  for (const r of rows) map[r.asset] = (map[r.asset] || 0) + r.amount;
  return map;
}

function addMaps(a: Record<string,number>, b: Record<string,number>) {
  const out: Record<string,number> = { ...a };
  for (const k of Object.keys(b)) out[k] = (out[k] || 0) + b[k];
  return out;
}

function sortAssets(arr: string[]) {
  const order = ["USDT","USDC","BFUSD","FDUSD","LDUSDT","BNB","BTC","ETH","BNFCR"];
  return arr.slice().sort((x,y) => {
    const ix = order.indexOf(x), iy = order.indexOf(y);
    if (ix >= 0 && iy >= 0) return ix - iy;
    if (ix >= 0) return -1;
    if (iy >= 0) return 1;
    return x.localeCompare(y);
  });
}

function fmtNum(n: number) {
  // preserve full precision (no rounding), but normalize -0 to 0
  const s = String(n);
  return s === "-0" ? "0" : s;
}

function fmtBalances(map: Record<string,number>) {
  return Object.keys(map).sort().map(a => `${a} ${fmtNum(map[a])}`).join(", ");
}
