// src/lib/story.ts
// Public API used by StoryDrawer:
// - buildNarrativeParagraphs(rows, anchorISO?, opts)
// - buildAudit(rows, opts)
// - buildSummaryRows(rows)
// - totalsByType(rows)  (diagnostic)
// - Lang type

export type Lang = "en" | "tr" | "ar" | "vi" | "ru";

export type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

type NarrativeOpts = {
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

// ---------------- i18n ----------------

const T = {
  // Short labels & headings used in the narrative and summary
  headingUTC: {
    en: "All dates and times are UTC+0. Please adjust for your time zone.",
    tr: "Tüm tarih ve saatler UTC+0’dır. Lütfen saat diliminize göre yorumlayın.",
    ar: "جميع التواريخ والأوقات بتوقيت UTC+0. يرجى ضبطها حسب منطقتك الزمنية.",
    vi: "Mọi ngày giờ đều là UTC+0. Vui lòng quy đổi theo múi giờ của bạn.",
    ru: "Все даты и время указаны в UTC+0. Пожалуйста, учитывайте свой часовой пояс.",
  },
  anchorIntro: {
    en: (iso: string, a: number, asset: string, before?: number, after?: number) =>
      `${iso} — At this date and time, you transferred ${fmt(a)} ${asset} to your Futures USDs-M Wallet.` +
      (isNum(before) && isNum(after) ? ` After this transfer your balance increased from ${fmt(before)} ${asset} to ${fmt(after)} ${asset}.` : ""),
    tr: (iso: string, a: number, asset: string, before?: number, after?: number) =>
      `${iso} — Bu tarih ve saatte, Futures USDs-M cüzdanına ${fmt(a)} ${asset} transfer ettiniz.` +
      (isNum(before) && isNum(after) ? ` Bu transferle bakiyeniz ${fmt(before)} ${asset} seviyesinden ${fmt(after)} ${asset} seviyesine yükseldi.` : ""),
    ar: (iso: string, a: number, asset: string, before?: number, after?: number) =>
      `${iso} — في هذا التاريخ والوقت، قمت بتحويل ${fmt(a)} ${asset} إلى محفظة العقود الدائمة (USDs-M).` +
      (isNum(before) && isNum(after) ? ` وبعد التحويل ارتفع رصيدك من ${fmt(before)} ${asset} إلى ${fmt(after)} ${asset}.` : ""),
    vi: (iso: string, a: number, asset: string, before?: number, after?: number) =>
      `${iso} — Vào thời điểm này, bạn đã chuyển ${fmt(a)} ${asset} vào ví Futures USDs-M.` +
      (isNum(before) && isNum(after) ? ` Sau chuyển khoản, số dư tăng từ ${fmt(before)} ${asset} lên ${fmt(after)} ${asset}.` : ""),
    ru: (iso: string, a: number, asset: string, before?: number, after?: number) =>
      `${iso} — В этот момент вы перевели ${fmt(a)} ${asset} на кошелёк Futures USDs-M.` +
      (isNum(before) && isNum(after) ? ` После перевода баланс вырос с ${fmt(before)} ${asset} до ${fmt(after)} ${asset}.` : ""),
  },
  anchorOnlyBalance: {
    en: (iso: string, bal: string) => `${iso} — At this date and time your Futures USDs-M Wallet balance was: ${bal}.`,
    tr: (iso: string, bal: string) => `${iso} — Bu tarih ve saatte Futures USDs-M cüzdan bakiyeniz: ${bal}.`,
    ar: (iso: string, bal: string) => `${iso} — في هذا التوقيت كان رصيد محفظة العقود الدائمة (USDs-M): ${bal}.`,
    vi: (iso: string, bal: string) => `${iso} — Tại thời điểm này, số dư ví Futures USDs-M của bạn là: ${bal}.`,
    ru: (iso: string, bal: string) => `${iso} — В этот момент баланс вашего кошелька Futures USDs-M составлял: ${bal}.`,
  },
  afterTransferLead: {
    en: "If we check your transaction records after this transfer:",
    tr: "Bu transferden sonraki işlem kayıtlarını incelersek:",
    ar: "عند مراجعة سجلات معاملاتك بعد هذا التحويل:",
    vi: "Nếu xem các giao dịch sau lần chuyển này:",
    ru: "Если взглянуть на операции после этого перевода:",
  },
  plainLead: {
    en: "Here are your transaction records:",
    tr: "İşlem kayıtlarınız aşağıdadır:",
    ar: "فيما يلي سجلات معاملاتك:",
    vi: "Dưới đây là các giao dịch của bạn:",
    ru: "Ниже приведены ваши операции:",
  },
  // section labels
  sections: {
    realizedProfit: { en: "Realized Profit", tr: "Gerçekleşen Kâr", ar: "الأرباح المحققة", vi: "Lợi nhuận đã chốt", ru: "Реализованная прибыль" },
    realizedLoss:   { en: "Realized Loss",   tr: "Gerçekleşen Zarar", ar: "الخسائر المحققة", vi: "Lỗ đã chốt", ru: "Реализованный убыток" },
    commission:     { en: "Trading Fees",    tr: "İşlem Ücretleri", ar: "عمولات التداول", vi: "Phí giao dịch", ru: "Комиссии" },
    funding:        { en: "Funding Fees",    tr: "Funding Ücretleri", ar: "رسوم التمويل", vi: "Phí funding", ru: "Фандинг" },
    insurance:      { en: "Liquidation/Insurance Clearance Fees", tr: "Likidasyon/Insurance Ücretleri", ar: "رسوم التصفية/صندوق التأمين", vi: "Phí thanh lý/bảo hiểm", ru: "Ликвидация/Страховой фонд" },
    referral:       { en: "Referral Incomes", tr: "Referral Gelirleri", ar: "عوائد الإحالة", vi: "Thu nhập giới thiệu", ru: "Партнёрские начисления" },
    rebate:         { en: "Trading Fee Rebates", tr: "Komisyon İadeleri", ar: "استرداد العمولات", vi: "Hoàn phí giao dịch", ru: "Ребейты комиссий" },
    gift:           { en: "Gift Money", tr: "Hediye Bakiye", ar: "أموال هدية", vi: "Tiền thưởng", ru: "Подарочные средства" },
    limitFee:       { en: "Position Limit Increase Fee", tr: "Pozisyon Limiti Artış Ücreti", ar: "رسوم زيادة حد المراكز", vi: "Phí tăng hạn mức vị thế", ru: "Плата за увеличение лимита позиции" },
    freePos:        { en: "Free Positions", tr: "Ücretsiz Pozisyonlar", ar: "مراكز مجانية", vi: "Vị thế miễn phí", ru: "Бесплатные позиции" },
    delivered:      { en: "Delivery Contracts Settlement Amount", tr: "Teslim Sözleşmeleri Mutabakatı", ar: "تسوية عقود التسليم", vi: "Quyết toán hợp đồng giao nhận", ru: "Расчёты по контрактам поставки" },
    gridOut:        { en: "Transfer To the GridBot", tr: "GridBot’a Transfer", ar: "تحويل إلى GridBot", vi: "Chuyển tới GridBot", ru: "Перевод в GridBot" },
    gridIn:         { en: "Transfer From the GridBot", tr: "GridBot’tan Transfer", ar: "تحويل من GridBot", vi: "Chuyển từ GridBot", ru: "Перевод из GridBot" },
    presents:       { en: "Futures Presents", tr: "Futures Hediyeleri", ar: "هدايا العقود الدائمة", vi: "Quà tặng Futures", ru: "Подарки Futures" },
    evOrder:        { en: "Event Contracts — Order", tr: "Etkinlik Kontratları — Order", ar: "عقود الفعاليات — أمر", vi: "Hợp đồng sự kiện — Lệnh", ru: "Событийные контракты — Ордер" },
    evPayout:       { en: "Event Contracts — Payout", tr: "Etkinlik Kontratları — Ödeme", ar: "عقود الفعاليات — دفعة", vi: "Hợp đồng sự kiện — Trả thưởng", ru: "Событийные контракты — Выплата" },
    busdReward:     { en: "BUSD Rewards", tr: "BUSD Ödülleri", ar: "مكافآت BUSD", vi: "Thưởng BUSD", ru: "Награды BUSD" },
    coinswap:       { en: "Coin Swaps", tr: "Coin Swap’lar", ar: "مقايضات العملات", vi: "Hoán đổi coin", ru: "Обмены монет" },
    autoex:         { en: "Auto-Exchange", tr: "Oto-Exchange", ar: "التحويل التلقائي", vi: "Tự động quy đổi", ru: "Авто-обмен" },
    other:          { en: "Other Transactions", tr: "Diğer İşlemler", ar: "معاملات أخرى", vi: "Giao dịch khác", ru: "Прочие операции" },
    overall:        { en: "Total effect in this range (by asset)", tr: "Bu aralıktaki toplam etki (varlığa göre)", ar: "إجمالي الأثر في هذه الفترة (حسب الأصل)", vi: "Tổng ảnh hưởng trong khoảng này (theo tài sản)", ru: "Итоговый эффект в диапазоне (по активам)" },
    final:          { en: "Final wallet balance (computed)", tr: "Nihai cüzdan bakiyesi (hesaplandı)", ar: "الرصيد النهائي للمحفظة (محسوب)", vi: "Số dư ví cuối (tính toán)", ru: "Итоговый баланс кошелька (расчёт)" },
    noActivity:     { en: "There is no activity in the selected range.", tr: "Seçilen aralıkta hareket yok.", ar: "لا توجد معاملات ضمن الفترة المحددة.", vi: "Không có giao dịch trong khoảng đã chọn.", ru: "В заданном диапазоне нет операций." }
  },
};

// TYPE → slot mapping for narrative sections
const TYPE_MAP = {
  REALIZED_PNL: ["realizedProfit", "realizedLoss"] as const,
  COMMISSION: ["commission"] as const,
  FUNDING_FEE: ["funding"] as const,
  INSURANCE_CLEAR: ["insurance"] as const,
  LIQUIDATION_FEE: ["insurance"] as const,
  REFERRAL_KICKBACK: ["referral"] as const,
  COMISSION_REBATE: ["rebate"] as const,
  CASH_COUPON: ["gift"] as const,
  POSITION_LIMIT_INCREASE_FEE: ["limitFee"] as const,
  POSITION_CLAIM_TRANSFER: ["freePos"] as const,
  DELIVERED_SETTELMENT: ["delivered"] as const,
  STRATEGY_UMFUTURES_TRANSFER: ["gridIn","gridOut"] as const, // positive -> from bot, negative -> to bot
  FUTURES_PRESENT: ["presents"] as const,
  EVENT_CONTRACTS_ORDER: ["evOrder"] as const,
  EVENT_CONTRACTS_PAYOUT: ["evPayout"] as const,
  BFUSD_REWARD: ["busdReward"] as const,
  // coinswap & auto-exchange handled separately
} as const;

const EPS = 1e-12;
const HIDE_SMALL_FOR = new Set(["BFUSD","FDUSD","LDUSDT"]);

// ---------------- utilities ----------------

function isNum(v: any): v is number { return typeof v === "number" && Number.isFinite(v); }
function sign(v: number) { return v >= 0 ? "+" : "−"; } // nice minus for readability
function fmt(v: number) {
  // Keep full precision; avoid stripping trailing zeros by using toString but normalize -0
  if (Math.abs(v) < EPS) return "0";
  const s = String(v);
  return s === "-0" ? "0" : s;
}
function groupBy<T, K extends string | number>(arr: T[], key: (x:T)=>K) {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = key(x);
    const a = m.get(k); if (a) a.push(x); else m.set(k, [x]);
  }
  return m;
}
function assetOrder(a: string, b: string) {
  // Sort stable USDT first, then USDC, then others A→Z
  const prio = (s: string) => (s==="USDT"?0 : s==="USDC"?1 : 2);
  const pa = prio(a), pb = prio(b);
  if (pa !== pb) return pa - pb;
  return a < b ? -1 : a > b ? 1 : 0;
}
function typeLabel(key: keyof typeof T.sections, lang: Lang) {
  const ent = (T.sections as any)[key];
  return ent ? ent[lang] : String(key);
}

// Filter rows by time bounds
function windowRows(rows: Row[], anchorISO?: string, endISO?: string) {
  const startTs = anchorISO ? Date.parse(anchorISO + "Z") : undefined;
  const endTs = endISO ? Date.parse(endISO + "Z") : undefined;
  return rows.filter(r => (startTs===undefined || r.ts >= startTs) && (endTs===undefined || r.ts <= endTs));
}

// Compute nets per asset for a set of rows
function netByAsset(rows: Row[]) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.asset, (map.get(r.asset)||0) + r.amount);
  return map;
}

// ---------------- Narrative ----------------

export function buildNarrativeParagraphs(
  allRows: Row[],
  anchorISO?: string,
  opts?: NarrativeOpts
): string {
  const lang: Lang = opts?.lang || "en";
  const rows = windowRows(allRows, anchorISO, undefined);

  // Headline
  const out: string[] = [T.headingUTC[lang]];

  // Anchor line
  if (opts?.anchorTransfer) {
    // If initialBalances present, compute before/after (same asset)
    const a = opts.anchorTransfer.amount, asset = opts.anchorTransfer.asset.toUpperCase();
    const before = opts.initialBalances?.[asset];
    const after = isNum(before) ? before + a : undefined;
    out.push(T.anchorIntro[lang](anchorISO || "—", a, asset, before, after));
    out.push(T.afterTransferLead[lang]);
  } else if (anchorISO && opts?.initialBalances && Object.keys(opts.initialBalances).length) {
    // If only anchor + baseline was given without a transfer
    const mainAsset = "USDT";
    const bal = Object.entries(opts.initialBalances)
      .sort((a,b)=>assetOrder(a[0], b[0]))
      .map(([as, v]) => `${fmt(v)} ${as}`).join(" • ");
    out.push(T.anchorOnlyBalance[lang](anchorISO, bal));
    out.push(T.afterTransferLead[lang]);
  } else {
    out.push(T.plainLead[lang]);
  }

  if (rows.length === 0) {
    out.push(T.sections.noActivity[lang]);
    return out.join("\n\n");
  }

  // Buckets
  // 1) Coinswap / Auto-exchange are described in prose
  const swapsOut = new Map<string, number>(), swapsIn = new Map<string, number>();
  const autoOut = new Map<string, number>(), autoIn = new Map<string, number>();

  // 2) Structured sections
  const profit = new Map<string, number>(), loss = new Map<string, number>();
  const bucket = {
    commission: new Map<string, number>(),
    fundingIn: new Map<string, number>(), fundingOut: new Map<string, number>(),
    insuranceIn: new Map<string, number>(), insuranceOut: new Map<string, number>(),
    referral: new Map<string, number>(), rebate: new Map<string, number>(),
    gift: new Map<string, number>(),
    limitFee: new Map<string, number>(),
    freePos: new Map<string, number>(),
    delivered: new Map<string, number>(),
    gridIn: new Map<string, number>(), gridOut: new Map<string, number>(),
    presents: new Map<string, number>(),
    evOrder: new Map<string, number>(), evPayout: new Map<string, number>(),
    busdReward: new Map<string, number>(),
    otherPos: new Map<string, number>(), otherNeg: new Map<string, number>(),
  };

  // Classify
  for (const r of rows) {
    const t = r.type.toUpperCase();
    const a = r.asset.toUpperCase();
    const v = r.amount;

    if (t === "COIN_SWAP_DEPOSIT") { add(swapsIn, a, v); continue; }
    if (t === "COIN_SWAP_WITHDRAW") { add(swapsOut, a, Math.abs(v)); continue; }

    if (t === "AUTO_EXCHANGE") {
      // Positive amounts are "in", negative are "out"
      if (v >= 0) add(autoIn, a, v); else add(autoOut, a, Math.abs(v));
      continue;
    }

    // Realized PnL split into Profit and Loss
    if (t === "REALIZED_PNL") {
      if (v >= 0) add(profit, a, v); else add(loss, a, Math.abs(v));
      continue;
    }

    // Strategy grid transfers split by sign
    if (t === "STRATEGY_UMFUTURES_TRANSFER") {
      if (v >= 0) add(bucket.gridIn, a, v); else add(bucket.gridOut, a, Math.abs(v));
      continue;
    }

    // Funding: keep in/out separately (we do NOT show net in narrative)
    if (t === "FUNDING_FEE") {
      if (v >= 0) add(bucket.fundingIn, a, v); else add(bucket.fundingOut, a, Math.abs(v));
      continue;
    }

    // Insurance/Liquidation: also split by sign
    if (t === "INSURANCE_CLEAR" || t === "LIQUIDATION_FEE") {
      if (v >= 0) add(bucket.insuranceIn, a, v); else add(bucket.insuranceOut, a, Math.abs(v));
      continue;
    }

    // Straight buckets (always treated as incoming unless amount is negative by nature)
    if (t === "COMMISSION") { add(bucket.commission, a, Math.abs(v)); continue; }
    if (t === "REFERRAL_KICKBACK") { add(bucket.referral, a, v); continue; }
    if (t === "COMISSION_REBATE")  { add(bucket.rebate, a, v); continue; }
    if (t === "CASH_COUPON")       { add(bucket.gift, a, v); continue; }
    if (t === "POSITION_LIMIT_INCREASE_FEE") { add(bucket.limitFee, a, Math.abs(v)); continue; }
    if (t === "POSITION_CLAIM_TRANSFER")     { add(bucket.freePos, a, v); continue; }
    if (t === "DELIVERED_SETTELMENT")        { add(bucket.delivered, a, v); continue; }
    if (t === "FUTURES_PRESENT")             { add(bucket.presents, a, v); continue; }
    if (t === "EVENT_CONTRACTS_ORDER")       { add(bucket.evOrder, a, Math.abs(v)); continue; }
    if (t === "EVENT_CONTRACTS_PAYOUT")      { add(bucket.evPayout, a, v); continue; }
    if (t === "BFUSD_REWARD")                { add(bucket.busdReward, a, v); continue; }

    // Unknown types → other
    if (v >= 0) add(bucket.otherPos, `${t}:${a}`, v);
    else add(bucket.otherNeg, `${t}:${a}`, Math.abs(v));
  }

  // Print helpers
  const lines = (labelKey: keyof typeof T.sections, mp: Map<string, number>, signPositive: boolean) => {
    if (mp.size === 0) return;
    const label = typeLabel(labelKey, lang);
    const parts = Array.from(mp.entries()).sort(([a],[b])=>assetOrder(a,b))
      .map(([asset, val]) => `${asset}  ${signPositive?"+":"-"}${fmt(val)}`);
    out.push(`${label}: ${parts.join("  •  ")}`);
  };

  // 1) Realized PnL (profit positive, loss negative)
  lines("realizedProfit", profit, true);
  lines("realizedLoss",   loss,   false);

  // 2) Fees & misc (each prints separate “in/out” where applicable; no net shown)
  lines("commission", bucket.commission, false);
  // Funding
  if (bucket.fundingIn.size || bucket.fundingOut.size) {
    const pIn  = Array.from(bucket.fundingIn.entries()).sort(([a],[b])=>assetOrder(a,b)).map(([as,v]) => `${as}  +${fmt(v)}`).join("  •  ");
    const pOut = Array.from(bucket.fundingOut.entries()).sort(([a],[b])=>assetOrder(a,b)).map(([as,v]) => `${as}  -${fmt(v)}`).join("  •  ");
    const txt = [pIn && pIn, pOut && pOut].filter(Boolean).join("  /  ");
    out.push(`${typeLabel("funding", lang)}: ${txt}`);
  }
  // Insurance/Liquidation
  if (bucket.insuranceIn.size || bucket.insuranceOut.size) {
    const pIn  = Array.from(bucket.insuranceIn.entries()).sort(([a],[b])=>assetOrder(a,b)).map(([as,v]) => `${as}  +${fmt(v)}`).join("  •  ");
    const pOut = Array.from(bucket.insuranceOut.entries()).sort(([a],[b])=>assetOrder(a,b)).map(([as,v]) => `${as}  -${fmt(v)}`).join("  •  ");
    const txt = [pIn && pIn, pOut && pOut].filter(Boolean).join("  /  ");
    out.push(`${typeLabel("insurance", lang)}: ${txt}`);
  }

  lines("referral",   bucket.referral, true);
  lines("rebate",     bucket.rebate,   true);
  lines("gift",       bucket.gift,     true);
  lines("limitFee",   bucket.limitFee, false);
  lines("freePos",    bucket.freePos,  true);
  lines("delivered",  bucket.delivered,true);
  lines("gridOut",    bucket.gridOut,  false);
  lines("gridIn",     bucket.gridIn,   true);
  lines("presents",   bucket.presents, true);
  lines("evOrder",    bucket.evOrder,  false);
  lines("evPayout",   bucket.evPayout, true);
  lines("busdReward", bucket.busdReward, true);

  // 3) Coin Swaps / Auto-Exchange prose
  if (swapsOut.size || swapsIn.size) {
    const outP = Array.from(swapsOut.entries()).sort(([a],[b])=>assetOrder(a,b)).map(([as,v]) => `${as} ${fmt(v)}`).join("  •  ");
    const inP  = Array.from(swapsIn .entries()).sort(([a],[b])=>assetOrder(a,b)).map(([as,v]) => `${as} ${fmt(v)}`).join("  •  ");
    out.push(`${typeLabel("coinswap", lang)}: Swapped out: ${outP || "—"} — Received: ${inP || "—"}`);
  }
  if (autoOut.size || autoIn.size) {
    const outP = Array.from(autoOut.entries()).sort(([a],[b])=>assetOrder(a,b)).map(([as,v]) => `${as} ${fmt(v)}`).join("  •  ");
    const inP  = Array.from(autoIn .entries()).sort(([a],[b])=>assetOrder(a,b)).map(([as,v]) => `${as} ${fmt(v)}`).join("  •  ");
    out.push(`${typeLabel("autoex", lang)}: Converted out: ${outP || "—"} — Converted in: ${inP || "—"}`);
  }

  // 4) Other transactions (unknown types)
  if (bucket.otherPos.size || bucket.otherNeg.size) {
    const pos = Array.from(bucket.otherPos.entries()).map(([k,v]) => `${k}  +${fmt(v)}`);
    const neg = Array.from(bucket.otherNeg.entries()).map(([k,v]) => `${k}  -${fmt(v)}`);
    out.push(`${typeLabel("other", lang)}: ${[...pos, ...neg].join("  •  ")}`);
  }

  // Total effect & final balances
  const nets = netByAsset(rows);
  const effect = Array.from(nets.entries()).sort(([a],[b])=>assetOrder(a,b))
    .map(([as, v]) => `${as}  ${fmt(v)}`).join("  •  ");
  out.push(`${typeLabel("overall", lang)}: ${effect}`);

  // Final balances with baseline + anchor transfer
  const final = new Map<string, number>();
  // baseline
  if (opts?.initialBalances) for (const [as, v] of Object.entries(opts.initialBalances)) final.set(as.toUpperCase(), (final.get(as.toUpperCase())||0) + v);
  // anchor transfer
  if (opts?.anchorTransfer) {
    const a = opts.anchorTransfer;
    final.set(a.asset.toUpperCase(), (final.get(a.asset.toUpperCase())||0) + a.amount);
  }
  // net rows
  for (const [as, v] of nets.entries()) final.set(as, (final.get(as)||0) + v);

  const finalParts = Array.from(final.entries())
    .filter(([as, v]) => Math.abs(v) > (HIDE_SMALL_FOR.has(as) ? 1e-7 : EPS) || as === "USDT")
    .sort(([a],[b]) => assetOrder(a,b))
    .map(([as, v]) => `${as}  ${fmt(v)}`)
    .join("  •  ");

  out.push(`${typeLabel("final", lang)}: ${finalParts || "—"}`);
  return out.join("\n\n");
}

function add(map: Map<string, number>, k: string, v: number) {
  map.set(k, (map.get(k)||0) + v);
}

// ---------------- Summary table ----------------

export type SummaryRow = { label: string; asset: string; in: number; out: number; net: number };

export function buildSummaryRows(allRows: Row[]): SummaryRow[] {
  if (!allRows?.length) return [];

  // Group by (type, asset) and aggregate in/out separately (no rounding)
  const groups = groupBy(allRows, r => `${r.type.toUpperCase()}::${r.asset.toUpperCase()}`);
  const rows: SummaryRow[] = [];
  for (const [key, arr] of groups.entries()) {
    const [type, asset] = key.split("::");
    let inSum = 0, outSum = 0;
    for (const r of arr) { if (r.amount >= 0) inSum += r.amount; else outSum += Math.abs(r.amount); }
    const net = inSum - outSum;

    rows.push({
      label: friendlyType(type),
      asset,
      in: +inSum, out: +outSum, net: +net,
    });
  }

  rows.sort((a,b) => a.label === b.label ? assetOrder(a.asset,b.asset) : (a.label < b.label ? -1 : 1));
  return rows;
}

function friendlyType(t: string): string {
  const tt = t.toUpperCase();
  if (tt in TYPE_MAP) return tt;
  if (tt === "COIN_SWAP_DEPOSIT") return "COIN_SWAP_DEPOSIT";
  if (tt === "COIN_SWAP_WITHDRAW") return "COIN_SWAP_WITHDRAW";
  if (tt === "AUTO_EXCHANGE") return "AUTO_EXCHANGE";
  return `OTHER:${tt}`;
}

// ---------------- Diagnostics ----------------

export function totalsByType(allRows: Row[]) {
  const m = new Map<string, number>();
  for (const r of allRows) m.set(r.type.toUpperCase(), (m.get(r.type.toUpperCase())||0) + r.amount);
  return Array.from(m.entries()).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
}

// ---------------- Agent Audit ----------------

export function buildAudit(allRows: Row[], opts: AuditOpts): string {
  const { anchorTs, endTs, baseline, anchorTransfer } = opts;
  const rows = allRows.filter(r => r.ts >= anchorTs && (endTs ? r.ts <= endTs : true));

  const lines: string[] = [];
  lines.push("Agent Balance Audit");
  lines.push(`Anchor (UTC+0): ${new Date(anchorTs).toISOString().replace("T"," ").replace("Z","")}`);
  if (endTs) lines.push(`End (UTC+0): ${new Date(endTs).toISOString().replace("T"," ").replace("Z","")}`);
  lines.push("");

  // Calculate net per asset
  const nets = netByAsset(rows);
  // Apply baseline and anchor transfer to compute final expected balances
  const final = new Map<string, number>();
  if (baseline) for (const [as, v] of Object.entries(baseline)) final.set(as.toUpperCase(), (final.get(as.toUpperCase())||0) + v);
  if (anchorTransfer) final.set(anchorTransfer.asset.toUpperCase(),
    (final.get(anchorTransfer.asset.toUpperCase())||0) + anchorTransfer.amount);
  for (const [as, v] of nets.entries()) final.set(as, (final.get(as)||0) + v);

  // Activity preview (group by type for readability)
  const byType = groupBy(rows, r => r.type.toUpperCase());
  const typeKeys = Array.from(byType.keys()).sort();
  lines.push("Activity after anchor:");
  for (const tk of typeKeys) {
    lines.push(`  ${tk}:`);
    for (const r of byType.get(tk)!) {
      const hhmmss = r.time.split(" ")[1] || r.time;
      lines.push(`    • ${hhmmss} — ${sign(r.amount)}${fmt(Math.abs(r.amount))} ${r.asset}  (${r.symbol || r.extra || tk})`);
    }
  }
  lines.push("");

  // Net effect
  lines.push("Net effect (after anchor):");
  for (const [as, v] of Array.from(nets.entries()).sort(([a],[b])=>assetOrder(a,b))) {
    lines.push(`  • ${as}  ${fmt(v)}`);
  }
  lines.push("");

  // Final expected balances (hide tiny dust on specific assets)
  lines.push("Final expected balances:");
  for (const [as, v] of Array.from(final.entries()).sort(([a],[b])=>assetOrder(a,b))) {
    if (Math.abs(v) <= (HIDE_SMALL_FOR.has(as) ? 1e-7 : EPS) && as !== "USDT") continue;
    lines.push(`  • ${as}  ${fmt(v)}`);
  }

  return lines.join("\n");
}
