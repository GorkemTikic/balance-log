// src/lib/story.ts
// Single-source narrative + audit + summary helpers.
//
// Goals from user:
// - Friendly "GPT style" narrative (EN/TR/AR/VI/RU) with clear +/- semantics
// - No fake zeros: omit types/assets that are 0 (or -0)
// - Precise math (no rounding), but readable (trim trailing zeros)
// - Coin Swaps & Auto-Exchange explained clearly (out vs in)
// - Optional anchor time, optional baseline balances, optional anchor transfer
// - Final wallet balance only (no extra "computed" wording)
// - Suppress sub-dust tiny balances for BFUSD/FDUSD/LDUSDT in "final balances"

export type Lang = "en" | "tr" | "ar" | "vi" | "ru";

export type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string; // "YYYY-MM-DD HH:MM:SS"
  ts: number;   // epoch ms (UTC)
  symbol: string;
  extra: string;
  raw: string;
};

type BuildOpts = {
  initialBalances?: Record<string, number> | undefined;
  anchorTransfer?: { asset: string; amount: number } | undefined;
  lang?: Lang;
};

type AuditOpts = {
  anchorTs: number;
  endTs?: number;
  baseline?: Record<string, number> | undefined;
  anchorTransfer?: { asset: string; amount: number } | undefined;
};

// —————————————————————————————————————————————————————————————
// utilities

const DUST_HIDE: Record<string, number> = {
  BFUSD: 1e-7,
  FDUSD: 1e-7,
  LDUSDT: 1e-7,
};

function isZero(n: number) {
  // treat -0 as 0
  return Object.is(n, -0) || n === 0;
}

function fmt(n: number) {
  // show full precision but avoid sci-notation; trim trailing zeros
  // 18 dp is plenty for these logs and keeps sums exact enough for UI
  const s = n.toFixed(18);
  return s.replace(/\.?0+$/, "");
}

function sumInto(map: Record<string, number>, k: string, v: number) {
  map[k] = (map[k] ?? 0) + v;
  if (Math.abs(map[k]) < 1e-18) map[k] = 0; // normalize -0 noise
}

function filterByTime(rows: Row[], anchorISO?: string) {
  if (!anchorISO) return rows;
  const ts = Date.parse(anchorISO + "Z");
  if (!Number.isFinite(ts)) return rows;
  return rows.filter(r => r.ts >= ts);
}

function label(lang: Lang | undefined, key: string) {
  const l = lang ?? "en";
  const dict: Record<string, Record<Lang, string>> = {
    headerNotice: {
      en: "All dates and times are UTC+0. Please adjust for your time zone.",
      tr: "Tüm tarih ve saatler UTC+0’dır. Lütfen zaman diliminize göre düşünün.",
      ar: "جميع التواريخ والأوقات بتوقيت UTC+0. يرجى الضبط وفق منطقتك الزمنية.",
      vi: "Mọi ngày giờ đều theo UTC+0. Vui lòng điều chỉnh theo múi giờ của bạn.",
      ru: "Все даты и время указаны в UTC+0. Пожалуйста, учитывайте ваш часовой пояс.",
    },
    introWithTransfer: {
      en: (ts: string, amt: string, asset: string, b0?: string, b1?: string) =>
        `${ts} — At this date and time, you transferred ${amt} ${asset} to your Futures USDs-M Wallet${b0 && b1 ? `. After this transfer your balance increased from ${b0} ${asset} to ${b1} ${asset}.` : "."}`,
      tr: (ts, amt, asset, b0?, b1?) =>
        `${ts} — Bu tarih ve saatte, Futures USDs-M cüzdanına ${amt} ${asset} aktardın${b0 && b1 ? `. Bu transferden sonra bakiyen ${b0} ${asset} değerinden ${b1} ${asset} değerine yükseldi.` : "."}`,
      ar: (ts, amt, asset, b0?, b1?) =>
        `${ts} — في هذا التاريخ والوقت قمت بتحويل ${amt} ${asset} إلى محفظة عقود USDs-M${b0 && b1 ? `. بعد التحويل ارتفع رصيدك من ${b0} ${asset} إلى ${b1} ${asset}.` : "."}`,
      vi: (ts, amt, asset, b0?, b1?) =>
        `${ts} — Tại thời điểm này bạn đã chuyển ${amt} ${asset} vào ví Futures USDs-M${b0 && b1 ? `. Sau chuyển khoản, số dư tăng từ ${b0} ${asset} lên ${b1} ${asset}.` : "."}`,
      ru: (ts, amt, asset, b0?, b1?) =>
        `${ts} — В это время вы перевели ${amt} ${asset} на кошелёк Futures USDs-M${b0 && b1 ? `. После перевода баланс вырос с ${b0} ${asset} до ${b1} ${asset}.` : "."}`,
    },
    introNoTransfer: {
      en: "Here are your transaction records:",
      tr: "İşte işlem kayıtların:",
      ar: "هذه هي سجلات معاملاتك:",
      vi: "Đây là lịch sử giao dịch của bạn:",
      ru: "Вот ваши записи по операциям:",
    },
    introWithBalanceOnly: {
      en: (ts: string, amt: string, asset: string) =>
        `${ts} — At this date and time your Futures USDs-M Wallet balance was: ${amt} ${asset}.`,
      tr: (ts, amt, asset) =>
        `${ts} — Bu tarih ve saatte Futures USDs-M cüzdan bakiyen: ${amt} ${asset}.`,
      ar: (ts, amt, asset) =>
        `${ts} — في هذا التاريخ والوقت كان رصيد محفظة USDs-M لديك: ${amt} ${asset}.`,
      vi: (ts, amt, asset) =>
        `${ts} — Tại thời điểm này, số dư ví Futures USDs-M của bạn là: ${amt} ${asset}.`,
      ru: (ts, amt, asset) =>
        `${ts} — В этот момент баланс кошелька Futures USDs-M составлял: ${amt} ${asset}.`,
    },
    sectionAfter: {
      en: "If we check your transaction records after this point:",
      tr: "Bu noktadan sonraki işlem kayıtlarına bakarsak:",
      ar: "إذا راجعنا السجلات بعد هذه النقطة:",
      vi: "Nếu xem các giao dịch sau thời điểm này:",
      ru: "Если посмотреть операции после этой точки:",
    },
    // Section titles
    realizedProfit: {
      en: "Realized Profit",
      tr: "Gerçekleşen Kâr",
      ar: "الربح المُحقق",
      vi: "Lãi đã chốt",
      ru: "Зафиксированная прибыль",
    },
    realizedLoss: {
      en: "Realized Loss",
      tr: "Gerçekleşen Zarar",
      ar: "الخسارة المُحققة",
      vi: "Lỗ đã chốt",
      ru: "Зафиксированный убыток",
    },
    tradingFees: {
      en: "Trading Fees",
      tr: "İşlem Ücretleri",
      ar: "عمولات التداول",
      vi: "Phí giao dịch",
      ru: "Комиссии",
    },
    fundingFees: {
      en: "Funding Fees",
      tr: "Fonlama Ücretleri",
      ar: "رسوم التمويل",
      vi: "Phí funding",
      ru: "Фандинг",
    },
    insurance: {
      en: "Liquidation / Insurance Clearance",
      tr: "Likidasyon / Sigorta Kesintisi",
      ar: "تصفية / صندوق التأمين",
      vi: "Thanh lý / Quỹ bảo hiểm",
      ru: "Ликвидация / Фонд страхования",
    },
    referral: {
      en: "Referral Incomes",
      tr: "Davet Gelirleri",
      ar: "عوائد الإحالة",
      vi: "Thu nhập giới thiệu",
      ru: "Реферальные доходы",
    },
    rebate: {
      en: "Trading Fee Rebates",
      tr: "Komisyon İadeleri",
      ar: "استرداد عمولات",
      vi: "Hoàn phí giao dịch",
      ru: "Ребейты комиссий",
    },
    gift: {
      en: "Gift Money",
      tr: "Hediye Bakiye",
      ar: "أموال هدية",
      vi: "Tiền thưởng",
      ru: "Подарочные средства",
    },
    posLimit: {
      en: "Position Limit Increase Fee",
      tr: "Pozisyon Limiti Artış Ücreti",
      ar: "رسوم رفع حدود المراكز",
      vi: "Phí tăng hạn mức vị thế",
      ru: "Плата за увеличение лимита позиции",
    },
    freePos: {
      en: "Free Positions",
      tr: "Ücretsiz Pozisyonlar",
      ar: "مراكز مجانية",
      vi: "Vị thế miễn phí",
      ru: "Бесплатные позиции",
    },
    delivered: {
      en: "Delivery Contracts Settlement",
      tr: "Vadeli Teslim Sözleşmelerinin Kapanışı",
      ar: "تسوية عقود التسليم",
      vi: "Thanh toán hợp đồng giao hàng",
      ru: "Расчёт поставочных контрактов",
    },
    umTransferTo: {
      en: "Transfer To the GridBot",
      tr: "Grid Bot’a Transfer",
      ar: "تحويل إلى Grid Bot",
      vi: "Chuyển tới Grid Bot",
      ru: "Перевод в Grid Bot",
    },
    umTransferFrom: {
      en: "Transfer From the GridBot",
      tr: "Grid Bot’tan Transfer",
      ar: "تحويل من Grid Bot",
      vi: "Chuyển từ Grid Bot",
      ru: "Перевод из Grid Bot",
    },
    presents: {
      en: "Futures Presents",
      tr: "Futures Hediyeleri",
      ar: "هدايا العقود",
      vi: "Quà tặng Futures",
      ru: "Подарки Futures",
    },
    eventOrder: {
      en: "Event Contracts — Order",
      tr: "Event Contracts — Order",
      ar: "عقود الفعاليات — أمر",
      vi: "Hợp đồng Sự kiện — Order",
      ru: "Контракты-события — Order",
    },
    eventPayout: {
      en: "Event Contracts — Payout",
      tr: "Event Contracts — Payout",
      ar: "عقود الفعاليات — Payout",
      vi: "Hợp đồng Sự kiện — Payout",
      ru: "Контракты-события — Payout",
    },
    busdReward: {
      en: "BFUSD Reward",
      tr: "BFUSD Ödülü",
      ar: "مكافأة BFUSD",
      vi: "Thưởng BFUSD",
      ru: "Награда BFUSD",
    },
    swaps: {
      en: "Coin Swaps",
      tr: "Coin Swap İşlemleri",
      ar: "مقايضات عملات",
      vi: "Hoán đổi coin",
      ru: "Coin-свопы",
    },
    autoEx: {
      en: "Auto-Exchange",
      tr: "Otomatik Dönüşüm",
      ar: "التحويل التلقائي",
      vi: "Tự động quy đổi",
      ru: "Авто-обмен",
    },
    others: {
      en: "Other Transactions",
      tr: "Diğer İşlemler",
      ar: "معاملات أخرى",
      vi: "Giao dịch khác",
      ru: "Прочие операции",
    },
    final: {
      en: "Final wallet balance",
      tr: "Nihai cüzdan bakiyesi",
      ar: "الرصيد النهائي للمحفظة",
      vi: "Số dư ví cuối cùng",
      ru: "Итоговый баланс кошелька",
    },
  };
  const v = dict[key];
  if (!v) return key;
  return typeof v[l] === "function" ? (v[l] as any) : v[l];
}

// Groups for narrative & summary
const MAP: Record<string, { group: string; labelKey: string; role?: "profit" | "loss" | "feeIn" | "feeOut" | "order" | "payout" | "rebate" | "gift" | "transferIn" | "transferOut" } | undefined> = {
  REALIZED_PNL: { group: "rpn", labelKey: "" },
  COMMISSION: { group: "commission", labelKey: "tradingFees", role: "feeOut" },
  FUNDING_FEE: { group: "funding", labelKey: "fundingFees" },
  INSURANCE_CLEAR: { group: "insurance", labelKey: "insurance" },
  LIQUIDATION_FEE: { group: "insurance", labelKey: "insurance" },
  REFERRAL_KICKBACK: { group: "referral", labelKey: "referral", role: "rebate" },
  COMISSION_REBATE: { group: "rebate", labelKey: "rebate", role: "rebate" },
  CASH_COUPON: { group: "gift", labelKey: "gift", role: "gift" },
  POSITION_LIMIT_INCREASE_FEE: { group: "poslimit", labelKey: "posLimit", role: "feeOut" },
  POSITION_CLAIM_TRANSFER: { group: "freepos", labelKey: "freePos" },
  DELIVERED_SETTELMENT: { group: "delivered", labelKey: "delivered" },
  STRATEGY_UMFUTURES_TRANSFER: { group: "um", labelKey: "" },
  FUTURES_PRESENT: { group: "presents", labelKey: "presents" },
  EVENT_CONTRACTS_ORDER: { group: "eventOrder", labelKey: "eventOrder", role: "order" },
  EVENT_CONTRACTS_PAYOUT: { group: "eventPayout", labelKey: "eventPayout", role: "payout" },
  BFUSD_REWARD: { group: "busd", labelKey: "busdReward" },
  AUTO_EXCHANGE: { group: "auto", labelKey: "autoEx" },
  COIN_SWAP_DEPOSIT: { group: "swap", labelKey: "swaps" },
  COIN_SWAP_WITHDRAW: { group: "swap", labelKey: "swaps" },
  TRANSFER: { group: "transfer", labelKey: "" },
};

function pick<T>(obj: Record<string, T>, keys: string[]) {
  const out: Record<string, T> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

// —————————————————————————————————————————————————————————————
// PUBLIC: buildSummaryRows

export type SummaryRow = { label: string; asset: string; in: string | number; out: string | number; net: string | number };

export function buildSummaryRows(rows: Row[]): SummaryRow[] {
  const byTypeAsset: Record<string, Record<string, { in: number; out: number }>> = {};
  for (const r of rows) {
    const m = MAP[r.type] || { group: "other", labelKey: "others" };
    const tLabel = m.labelKey || r.type;
    byTypeAsset[tLabel] ||= {};
    const a = (byTypeAsset[tLabel][r.asset] ||= { in: 0, out: 0 });
    if (r.amount >= 0) a.in += r.amount; else a.out += Math.abs(r.amount);
  }
  const rowsOut: SummaryRow[] = [];
  for (const [label, assets] of Object.entries(byTypeAsset)) {
    for (const [asset, v] of Object.entries(assets)) {
      const net = v.in - v.out;
      if (isZero(v.in) && isZero(v.out) && isZero(net)) continue;
      rowsOut.push({
        label,
        asset,
        in: isZero(v.in) ? 0 : fmt(v.in),
        out: isZero(v.out) ? 0 : fmt(v.out),
        net: isZero(net) ? 0 : fmt(net),
      });
    }
  }
  return rowsOut;
}

// —————————————————————————————————————————————————————————————
// PUBLIC: buildAudit

export function buildAudit(rows: Row[], opts: AuditOpts): string {
  const { anchorTs, endTs, baseline, anchorTransfer } = opts;

  const windowed = rows.filter(r => r.ts >= anchorTs && (!endTs || r.ts <= endTs));
  const nets: Record<string, number> = {};
  for (const r of windowed) sumInto(nets, r.asset, r.amount);

  // start from baseline (if any)
  const final: Record<string, number> = {};
  if (baseline) for (const [asset, bal] of Object.entries(baseline)) final[asset.toUpperCase()] = bal;

  // apply anchor transfer first (if any)
  if (anchorTransfer) sumInto(final, anchorTransfer.asset.toUpperCase(), anchorTransfer.amount);

  // then activity
  for (const [asset, v] of Object.entries(nets)) sumInto(final, asset, v);

  // suppress dust for selected assets
  for (const [asset, thr] of Object.entries(DUST_HIDE)) {
    if (Math.abs(final[asset] ?? 0) < thr) final[asset] = 0;
  }

  const lines: string[] = [];
  lines.push("Agent Balance Audit");
  lines.push("");
  lines.push("Net effect (after anchor):");
  const ordered = Object.entries(nets).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [asset, v] of ordered) if (!isZero(v)) lines.push(`  • ${asset}  ${fmt(v)}`);

  lines.push("");
  lines.push("Final expected balances:");
  const ordF = Object.entries(final).filter(([,v]) => !isZero(v)).sort((a, b) => a[0].localeCompare(b[0]));
  if (!ordF.length) lines.push("  • (no non-zero balances)");
  for (const [asset, v] of ordF) lines.push(`  • ${asset}  ${fmt(v)}`);

  return lines.join("\n");
}

// —————————————————————————————————————————————————————————————
// PUBLIC: buildNarrativeParagraphs

export function buildNarrativeParagraphs(
  rows: Row[],
  anchorISO?: string,
  opts?: BuildOpts,
): string {
  const lang = opts?.lang ?? "en";
  const filtered = filterByTime(rows, anchorISO);
  const parts: string[] = [];

  // header notice
  parts.push(label(lang, "headerNotice") as string);

  const anchorTransfer = opts?.anchorTransfer;
  if (anchorTransfer) {
    const t = (label(lang, "introWithTransfer") as any)(
      anchorISO ?? "",
      fmt(anchorTransfer.amount),
      anchorTransfer.asset,
      opts?.initialBalances ? fmt(opts.initialBalances[anchorTransfer.asset] ?? 0) : undefined,
      opts?.initialBalances ? fmt((opts.initialBalances[anchorTransfer.asset] ?? 0) + anchorTransfer.amount) : undefined,
    );
    parts.push(t);
    parts.push(label(lang, "sectionAfter") as string);
  } else if (anchorISO && opts?.initialBalances && Object.keys(opts.initialBalances).length === 1) {
    const [asset, bal] = Object.entries(opts.initialBalances)[0];
    parts.push((label(lang, "introWithBalanceOnly") as any)(anchorISO, fmt(bal), asset));
    parts.push(label(lang, "sectionAfter") as string);
  } else if (!anchorISO) {
    parts.push(label(lang, "introNoTransfer") as string);
  }

  // aggregate helpers
  const agg = (filter: (r: Row) => boolean) => {
    const byAsset: Record<string, number> = {};
    for (const r of filtered) if (filter(r)) sumInto(byAsset, r.asset, r.amount);
    return byAsset;
  };

  const realized = filtered.filter(r => r.type === "REALIZED_PNL");
  const realizedProfit = agg(r => r.type === "REALIZED_PNL" && r.amount > 0);
  const realizedLoss = agg(r => r.type === "REALIZED_PNL" && r.amount < 0);
  const commission = agg(r => r.type === "COMMISSION");
  const fundingIn = agg(r => r.type === "FUNDING_FEE" && r.amount > 0);
  const fundingOut = agg(r => r.type === "FUNDING_FEE" && r.amount < 0);
  const insurance = agg(r => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE");
  const referral = agg(r => r.type === "REFERRAL_KICKBACK");
  const rebate = agg(r => r.type === "COMISSION_REBATE");
  const gift = agg(r => r.type === "CASH_COUPON");
  const posLimit = agg(r => r.type === "POSITION_LIMIT_INCREASE_FEE");
  const freePos = agg(r => r.type === "POSITION_CLAIM_TRANSFER");
  const delivered = agg(r => r.type === "DELIVERED_SETTELMENT");
  const umTo = agg(r => r.type === "STRATEGY_UMFUTURES_TRANSFER" && r.amount < 0);
  const umFrom = agg(r => r.type === "STRATEGY_UMFUTURES_TRANSFER" && r.amount > 0);
  const presents = agg(r => r.type === "FUTURES_PRESENT");
  const eventOrder = agg(r => r.type === "EVENT_CONTRACTS_ORDER");
  const eventPayout = agg(r => r.type === "EVENT_CONTRACTS_PAYOUT");
  const busdReward = agg(r => r.type === "BFUSD_REWARD");

  // swaps & auto-exchange (in/out lists)
  function listOutIn(titleKey: string, outs: Record<string, number>, ins: Record<string, number>) {
    const outsL = Object.entries(outs).filter(([,v]) => v < 0 || v > 0 && false).map(([a, v]) => `${a} ${fmt(Math.abs(v))}`).join(" • ");
    const insL  = Object.entries(ins).filter(([,v]) => v < 0 || v > 0 && false).map(([a, v]) => `${a} ${fmt(Math.abs(v))}`).join(" • ");
    if (!outsL && !insL) return;
    const title = label(lang, titleKey) as string;
    const outText = outsL ? `Swapped out: ${outsL}` : "";
    const inText  = insL  ? ` — Received: ${insL}` : "";
    parts.push(`${title}: ${outText}${inText}`.replace(/: $/, ": (no entries)"));
  }

  // Coin Swaps
  const swapOut = agg(r => r.type === "COIN_SWAP_WITHDRAW");
  const swapIn  = agg(r => r.type === "COIN_SWAP_DEPOSIT");
  listOutIn("swaps", swapOut, swapIn);

  // Auto-Exchange
  const autoOut = agg(r => r.type === "AUTO_EXCHANGE" && r.amount < 0);
  const autoIn  = agg(r => r.type === "AUTO_EXCHANGE" && r.amount > 0);
  if (Object.keys(autoOut).length || Object.keys(autoIn).length) {
    const outs = Object.entries(autoOut).map(([a,v]) => `${a} ${fmt(Math.abs(v))}`).join(" • ");
    const ins  = Object.entries(autoIn).map(([a,v]) => `${a} ${fmt(Math.abs(v))}`).join(" • ");
    const line = `${label(lang, "autoEx")}: ${outs ? `Converted out: ${outs}` : ""}${ins ? `${outs ? " — " : ""}Converted in: ${ins}` : ""}`;
    parts.push(line);
  }

  // writer helper
  const writeBlock = (titleKey: string, plus?: Record<string, number>, minus?: Record<string, number>, net?: boolean) => {
    const title = label(lang, titleKey) as string;
    const posL = plus ? Object.entries(plus).filter(([,v]) => v > 0).map(([a,v]) => `${a} +${fmt(v)}`).join("  •  ") : "";
    const negL = minus ? Object.entries(minus).filter(([,v]) => v < 0).map(([a,v]) => `${a} -${fmt(Math.abs(v))}`).join("  •  ") : "";
    if (!posL && !negL) return;
    if (net) {
      // compute per-asset net
      const assets = new Set<string>([
        ...Object.keys(plus || {}),
        ...Object.keys(minus || {}),
      ]);
      const nets: string[] = [];
      for (const a of assets) {
        const p = (plus?.[a] ?? 0);
        const m = Math.abs(minus?.[a] ?? 0);
        const n = p - m;
        if (isZero(n)) continue;
        nets.push(`${a} ${n > 0 ? "+" : ""}${fmt(n)}`);
      }
      parts.push(`${title}: ${[
        posL ? posL : "",
        negL ? negL : "",
        nets.length ? `= ${nets.join("  •  ")}` : "",
      ].filter(Boolean).join("  /  ")}`);
    } else {
      parts.push(`${title}: ${[posL, negL].filter(Boolean).join("  /  ")}`);
    }
  };

  writeBlock("realizedProfit", realizedProfit);
  writeBlock("realizedLoss", Object.fromEntries(Object.entries(realizedLoss).map(([a,v]) => [a, v]))); // keep sign
  writeBlock("tradingFees", undefined, Object.fromEntries(Object.entries(commission).map(([a,v]) => [a, -Math.abs(v)])), false);
  writeBlock("fundingFees", fundingIn, Object.fromEntries(Object.entries(fundingOut).map(([a,v]) => [a, -Math.abs(v)])), true);
  writeBlock("insurance", undefined, Object.fromEntries(Object.entries(insurance).map(([a,v]) => [a, -Math.abs(v)])));
  writeBlock("referral", referral);
  writeBlock("rebate", rebate);
  writeBlock("gift", gift);
  writeBlock("posLimit", undefined, Object.fromEntries(Object.entries(posLimit).map(([a,v]) => [a, -Math.abs(v)])));
  writeBlock("freePos", freePos);
  writeBlock("delivered", delivered);
  writeBlock("umTransferFrom", umFrom);
  writeBlock("umTransferTo", Object.fromEntries(Object.entries(umTo).map(([a,v]) => [a, -Math.abs(v)])));
  writeBlock("presents", presents);
  writeBlock("eventOrder", undefined, Object.fromEntries(Object.entries(eventOrder).map(([a,v]) => [a, -Math.abs(v)])));
  writeBlock("eventPayout", eventPayout);
  writeBlock("busdReward", busdReward);

  // Other types
  const known = new Set(Object.keys(MAP));
  const others = filtered.filter(r => !known.has(r.type));
  if (others.length) {
    const byAsset: Record<string, number> = {};
    for (const r of others) sumInto(byAsset, r.asset, r.amount);
    const list = Object.entries(byAsset).filter(([,v]) => !isZero(v)).map(([a,v]) => `${a} ${v > 0 ? "+" : ""}${fmt(v)}`).join("  •  ");
    if (list) parts.push(`${label(lang, "others")}: ${list}`);
  }

  // Final wallet balance by asset (baseline + anchorTransfer + activity)
  const nets: Record<string, number> = {};
  for (const r of filtered) sumInto(nets, r.asset, r.amount);
  if (opts?.initialBalances) {
    for (const [a, b] of Object.entries(opts.initialBalances)) sumInto(nets, a.toUpperCase(), b);
  }
  if (opts?.anchorTransfer) sumInto(nets, opts.anchorTransfer.asset.toUpperCase(), opts.anchorTransfer.amount);

  // hide tiny dust for BFUSD/FDUSD/LDUSDT
  for (const [asset, thr] of Object.entries(DUST_HIDE)) {
    if (Math.abs(nets[asset] ?? 0) < thr) nets[asset] = 0;
  }

  const finals = Object.entries(nets)
    .filter(([,v]) => !isZero(v))
    .sort((a,b) => a[0].localeCompare(b[0]))
    .map(([a,v]) => `${a} ${fmt(v)}`)
    .join("  •  ");

  if (finals) parts.push(`${label(lang, "final")}: ${finals}`);

  return parts.join("\n\n");
}
