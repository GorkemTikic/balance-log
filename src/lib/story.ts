// src/lib/story.ts
// Utilities for Balance Story: totals, narrative (multilingual), audit, summary.

export type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

export type SummaryRow = { label: string; asset: string; in: number; out: number; net: number };

// ---------- i18n ----------
export type Lang = "en" | "tr" | "ar" | "vi" | "ru";

const L = {
  en: {
    utcNote: "All dates and times below are in UTC+0. Please adjust to your timezone if needed.",
    intro_anchor_full: (dt: string, amt: string, asset: string, before?: string, after?: string) =>
      `${dt} UTC+0 — At this date and time, you transferred ${amt} ${asset} to your Futures USDs-M Wallet.` +
      (before && after ? ` After this transfer your wallet balance increased from ${before} to ${after}.` : ""),
    intro_anchor_balance_only: (dt: string, bal: string) =>
      `${dt} UTC+0 — At this date and time your Futures USDs-M Wallet balance was ${bal}.`,
    intro_no_anchor: "Here are your transaction records:",
    after_anchor: "If we check your Transaction Records after this point:",
    section_realized: "Realized Profit/Loss",
    realized_profit: "Realized Profit",
    realized_loss: "Realized Loss",
    trading_fees: "Trading Fees",
    funding_fees: "Funding Fees",
    insurance: "Liquidation / Insurance Clearance Fees",
    referral: "Referral Incomes",
    fee_rebate: "Trading Fee Rebates",
    gift: "Gift Money",
    pos_limit_fee: "Position Limit Increase Fee",
    free_positions: "Free Positions",
    delivered: "Delivery Contracts Settlement Amount",
    strat_to: "Transfer To the GridBot",
    strat_from: "Transfer From the GridBot",
    presents: "Futures Presents",
    event_order: "Event Contracts Order",
    event_payout: "Event Contracts Payout",
    busd_reward: "BUSD Rewards",
    autoswap: "Auto-Exchange",
    coinswap: "Coin Swaps",
    coinswap_given: "Given for swaps",
    coinswap_received: "Received from swaps",
    autoex_in: "Auto-exchanged in",
    autoex_out: "Auto-exchanged out",
    other: "Other Transactions",
    overall: "Overall effect in this range",
    final_wallet: (asset: string) => `Final expected wallet balance (${asset})`,
    summary_heading: "Summary (by Type & Asset)",
    th_type: "Type", th_asset: "Asset", th_in: "In", th_out: "Out", th_net: "Net",
  },
  tr: {
    utcNote: "Aşağıdaki tüm tarih ve saatler UTC+0’dır. Lütfen saat diliminize göre yorumlayın.",
    intro_anchor_full: (dt: string, amt: string, asset: string, before?: string, after?: string) =>
      `${dt} UTC+0 — Bu tarih ve saatte, ${amt} ${asset} tutarında Futures USDs-M cüzdanınıza transfer yaptınız.` +
      (before && after ? ` Bu transfer sonrası cüzdan bakiyeniz ${before} değerinden ${after} değerine yükseldi.` : ""),
    intro_anchor_balance_only: (dt: string, bal: string) =>
      `${dt} UTC+0 — Bu tarih ve saatte Futures USDs-M cüzdan bakiyeniz ${bal} idi.`,
    intro_no_anchor: "İşlem kayıtlarınız aşağıdadır:",
    after_anchor: "Bu transferden/andan sonraki işlem kayıtlarını incelersek:",
    section_realized: "Gerçekleşen Kâr/Zarar",
    realized_profit: "Gerçekleşen Kâr",
    realized_loss: "Gerçekleşen Zarar",
    trading_fees: "Alım-satım Ücretleri",
    funding_fees: "Funding Ücretleri",
    insurance: "Likidasyon / Sigorta Kesintileri",
    referral: "Referans Gelirleri",
    fee_rebate: "Komisyon İadeleri",
    gift: "Hediye Para",
    pos_limit_fee: "Pozisyon Limiti Artış Ücreti",
    free_positions: "Ücretsiz Pozisyonlar",
    delivered: "Teslim Sözleşmeleri Mutabakatı",
    strat_to: "GridBot’a Transfer",
    strat_from: "GridBot’tan Transfer",
    presents: "Futures Hediyeleri",
    event_order: "Event Sözleşme Emri",
    event_payout: "Event Sözleşme Ödemesi",
    busd_reward: "BUSD Ödülleri",
    autoswap: "Oto-Dönüşüm (Auto-Exchange)",
    coinswap: "Coin Swap’lar",
    coinswap_given: "Swap için verilen",
    coinswap_received: "Swap sonrası alınan",
    autoex_in: "Oto-dönüşümle giren",
    autoex_out: "Oto-dönüşümle çıkan",
    other: "Diğer İşlemler",
    overall: "Bu aralıktaki toplam etki",
    final_wallet: (asset: string) => `Beklenen nihai cüzdan bakiyesi (${asset})`,
    summary_heading: "Özet (Türe & Varlığa göre)",
    th_type: "Tür", th_asset: "Varlık", th_in: "Giriş", th_out: "Çıkış", th_net: "Net",
  },
  ar: {
    utcNote: "جميع التواريخ والأوقات أدناه بالتوقيت UTC+0. يرجى ضبطها حسب منطقتك الزمنية.",
    intro_anchor_full: (dt: string, amt: string, asset: string, before?: string, after?: string) =>
      `${dt} UTC+0 — في هذا الوقت قمت بتحويل ${amt} ${asset} إلى محفظة العقود الدائمة (USDs-M).` +
      (before && after ? ` بعد التحويل ارتفع رصيد محفظتك من ${before} إلى ${after}.` : ""),
    intro_anchor_balance_only: (dt: string, bal: string) =>
      `${dt} UTC+0 — في هذا الوقت كان رصيد محفظة العقود الدائمة ${bal}.`,
    intro_no_anchor: "هذه هي سجلات معاملاتك:",
    after_anchor: "وبعد ذلك، عند مراجعة السجلات:",
    section_realized: "الأرباح/الخسائر المحققة",
    realized_profit: "أرباح محققة",
    realized_loss: "خسائر محققة",
    trading_fees: "رسوم التداول",
    funding_fees: "رسوم الفاندنج",
    insurance: "رسوم التصفية/التأمين",
    referral: "دخل الإحالة",
    fee_rebate: "استرداد رسوم التداول",
    gift: "أموال هدية",
    pos_limit_fee: "رسوم زيادة حدّ المراكز",
    free_positions: "مراكز مجانية",
    delivered: "تسوية عقود التسليم",
    strat_to: "تحويل إلى GridBot",
    strat_from: "تحويل من GridBot",
    presents: "هدايا العقود الدائمة",
    event_order: "أوامر عقود الأحداث",
    event_payout: "مدفوعات عقود الأحداث",
    busd_reward: "مكافآت BUSD",
    autoswap: "التحويل التلقائي (Auto-Exchange)",
    coinswap: "مقايضات العملات",
    coinswap_given: "المبالغ الممنوحة للمقايضة",
    coinswap_received: "المبالغ المستلمة من المقايضة",
    autoex_in: "دخل عبر التحويل التلقائي",
    autoex_out: "خرج عبر التحويل التلقائي",
    other: "معاملات أخرى",
    overall: "التأثير الإجمالي في هذه الفترة",
    final_wallet: (asset: string) => `الرصيد النهائي المتوقع (${asset})`,
    summary_heading: "الملخص (حسب النوع والأصل)",
    th_type: "النوع", th_asset: "الأصل", th_in: "داخل", th_out: "خارج", th_net: "صافي",
  },
  vi: {
    utcNote: "Tất cả ngày giờ bên dưới đều ở UTC+0. Vui lòng quy đổi theo múi giờ của bạn.",
    intro_anchor_full: (dt: string, amt: string, asset: string, before?: string, after?: string) =>
      `${dt} UTC+0 — Tại thời điểm này bạn đã chuyển ${amt} ${asset} vào ví Futures USDs-M.` +
      (before && after ? ` Sau chuyển khoản, số dư tăng từ ${before} lên ${after}.` : ""),
    intro_anchor_balance_only: (dt: string, bal: string) =>
      `${dt} UTC+0 — Tại thời điểm này số dư ví Futures USDs-M của bạn là ${bal}.`,
    intro_no_anchor: "Các bản ghi giao dịch của bạn:",
    after_anchor: "Sau thời điểm này, chi tiết giao dịch như sau:",
    section_realized: "Lãi/Lỗ đã thực hiện",
    realized_profit: "Lãi đã thực hiện",
    realized_loss: "Lỗ đã thực hiện",
    trading_fees: "Phí giao dịch",
    funding_fees: "Phí funding",
    insurance: "Phí thanh lý/Bảo hiểm",
    referral: "Thu nhập giới thiệu",
    fee_rebate: "Hoàn trả phí giao dịch",
    gift: "Tiền thưởng/Quà tặng",
    pos_limit_fee: "Phí tăng giới hạn vị thế",
    free_positions: "Vị thế miễn phí",
    delivered: "Thanh toán hợp đồng giao nhận",
    strat_to: "Chuyển sang GridBot",
    strat_from: "Chuyển từ GridBot",
    presents: "Quà tặng Futures",
    event_order: "Lệnh Hợp đồng Sự kiện",
    event_payout: "Chi trả Hợp đồng Sự kiện",
    busd_reward: "Phần thưởng BUSD",
    autoswap: "Tự quy đổi (Auto-Exchange)",
    coinswap: "Coin Swap",
    coinswap_given: "Đã đưa vào swap",
    coinswap_received: "Đã nhận từ swap",
    autoex_in: "Nhận nhờ auto-exchange",
    autoex_out: "Chuyển ra nhờ auto-exchange",
    other: "Giao dịch khác",
    overall: "Tác động tổng trong giai đoạn",
    final_wallet: (asset: string) => `Số dư ví dự kiến cuối cùng (${asset})`,
    summary_heading: "Tổng hợp (theo Loại & Tài sản)",
    th_type: "Loại", th_asset: "Tài sản", th_in: "Vào", th_out: "Ra", th_net: "Ròng",
  },
  ru: {
    utcNote: "Все даты и время ниже указаны в UTC+0. При необходимости скорректируйте под свой часовой пояс.",
    intro_anchor_full: (dt: string, amt: string, asset: string, before?: string, after?: string) =>
      `${dt} UTC+0 — В это время вы перевели ${amt} ${asset} на кошелёк Futures USDs-M.` +
      (before && after ? ` После перевода баланс вырос с ${before} до ${after}.` : ""),
    intro_anchor_balance_only: (dt: string, bal: string) =>
      `${dt} UTC+0 — В это время баланс кошелька Futures USDs-M составлял ${bal}.`,
    intro_no_anchor: "Вот ваши записи операций:",
    after_anchor: "После этой точки операции выглядят так:",
    section_realized: "Реализованная прибыль/убыток",
    realized_profit: "Реализованная прибыль",
    realized_loss: "Реализованный убыток",
    trading_fees: "Комиссии за сделки",
    funding_fees: "Funding-комиссии",
    insurance: "Сборы за ликвидацию/страхование",
    referral: "Реферальные доходы",
    fee_rebate: "Возврат торговых комиссий",
    gift: "Подарочные средства",
    pos_limit_fee: "Плата за увеличение лимита позиции",
    free_positions: "Бесплатные позиции",
    delivered: "Расчёты по поставочным контрактам",
    strat_to: "Перевод в GridBot",
    strat_from: "Перевод из GridBot",
    presents: "Подарки Futures",
    event_order: "Заявки Event-контрактов",
    event_payout: "Выплаты Event-контрактов",
    busd_reward: "Награды BUSD",
    autoswap: "Auto-Exchange (автоконвертация)",
    coinswap: "Coin Swaps",
    coinswap_given: "Отдано на свап",
    coinswap_received: "Получено со свапа",
    autoex_in: "Вход из автоконвертации",
    autoex_out: "Выход в автоконвертацию",
    other: "Прочие операции",
    overall: "Суммарный эффект за период",
    final_wallet: (asset: string) => `Ожидаемый конечный баланс кошелька (${asset})`,
    summary_heading: "Сводка (по типу и активу)",
    th_type: "Тип", th_asset: "Актив", th_in: "Приход", th_out: "Расход", th_net: "Итог",
  },
} as const;

// TYPE display name translations (default: raw type)
const TYPE_NAME: Record<string, Partial<Record<Lang, string>>> = {
  REALIZED_PNL: { tr: "Gerçekleşen PnL", ar: "الربح/الخسارة المحققة", vi: "Lãi/Lỗ đã thực hiện", ru: "Реализованный PnL" },
  COMMISSION: { tr: "Alım-satım Ücreti", ar: "رسوم التداول", vi: "Phí giao dịch", ru: "Комиссия" },
  FUNDING_FEE: { tr: "Funding Ücreti", ar: "رسوم الفاندنج", vi: "Phí funding", ru: "Funding-комиссия" },
  INSURANCE_CLEAR: { tr: "Sigorta/Likidasyon", ar: "التأمين/التصفية", vi: "Bảo hiểm/Thanh lý", ru: "Страхование/Ликвидация" },
  REFERRAL_KICKBACK: { tr: "Referans Geliri", ar: "دخل الإحالة", vi: "Thu nhập giới thiệu", ru: "Реферальный доход" },
  COMISSION_REBATE: { tr: "Komisyon İadesi", ar: "استرداد العمولة", vi: "Hoàn phí", ru: "Ребейт комиссии" },
  CASH_COUPON: { tr: "Hediye Para", ar: "أموال هدية", vi: "Tiền thưởng", ru: "Подарочные средства" },
  POSITION_LIMIT_INCREASE_FEE: { tr: "Pozisyon Limit Ücreti", ar: "رسوم زيادة حدّ", vi: "Phí tăng giới hạn", ru: "Плата за лимит позиции" },
  POSITION_CLAIM_TRANSFER: { tr: "Ücretsiz Pozisyon", ar: "مركز مجاني", vi: "Vị thế miễn phí", ru: "Бесплатная позиция" },
  DELIVERED_SETTELMENT: { tr: "Teslim Mutabakatı", ar: "تسوية التسليم", vi: "Quyết toán giao nhận", ru: "Расчёт поставки" },
  STRATEGY_UMFUTURES_TRANSFER: { tr: "GridBot Transferi", ar: "تحويل GridBot", vi: "Chuyển GridBot", ru: "Перевод GridBot" },
  FUTURES_PRESENT: { tr: "Futures Hediyesi", ar: "هدية Futures", vi: "Quà tặng Futures", ru: "Подарок Futures" },
  EVENT_CONTRACTS_ORDER: { tr: "Event Emir", ar: "أمر عقد حدث", vi: "Lệnh Hợp đồng Sự kiện", ru: "Заявка Event-контракта" },
  EVENT_CONTRACTS_PAYOUT: { tr: "Event Ödeme", ar: "دفعة عقد حدث", vi: "Chi trả Hợp đồng Sự kiện", ru: "Выплата Event-контракта" },
  BFUSD_REWARD: { tr: "BFUSD Ödülü", ar: "مكافأة BFUSD", vi: "Phần thưởng BFUSD", ru: "Награда BFUSD" },
  AUTO_EXCHANGE: { tr: "Oto-Dönüşüm", ar: "تحويل تلقائي", vi: "Tự quy đổi", ru: "Автоконвертация" },
  COIN_SWAP_DEPOSIT: { tr: "Coin Swap (Verilen)", ar: "مقايضة (ممنوح)", vi: "Coin Swap (đưa vào)", ru: "Coin Swap (отдано)" },
  COIN_SWAP_WITHDRAW: { tr: "Coin Swap (Alınan)", ar: "مقايضة (مستلم)", vi: "Coin Swap (nhận)", ru: "Coin Swap (получено)" },
};

function t(lang: Lang, key: keyof typeof L["en"], ...args: any[]) {
  const v: any = (L as any)[lang][key];
  return typeof v === "function" ? v(...args) : v;
}
function typeDisplay(lang: Lang, type: string) {
  return TYPE_NAME[type]?.[lang] || type;
}

// ---------- helpers ----------
export function formatFull(n: number) {
  // keep full precision as string, but strip trailing zeros
  const s = String(n);
  if (!s.includes(".")) return s;
  return s.replace(/(\.\d*?[1-9])0+$/,"$1").replace(/\.0+$/,"");
}

export function groupPosNeg(rows: Row[]) {
  const map: Record<string, { pos: Record<string, number>; neg: Record<string, number>; net: Record<string, number> }> = {};
  for (const r of rows) {
    const t = r.type, a = r.asset;
    const bucket = map[t] || (map[t] = { pos: {}, neg: {}, net: {} });
    if (r.amount >= 0) bucket.pos[a] = (bucket.pos[a] || 0) + r.amount;
    else               bucket.neg[a] = (bucket.neg[a] || 0) + Math.abs(r.amount);
    bucket.net[a] = (bucket.net[a] || 0) + r.amount;
  }
  return map;
}

export function totalsByType(rows: Row[]) {
  const map: Record<string, Record<string, { pos: number; neg: number; net: number }>> = {};
  for (const r of rows) {
    const t = r.type, a = r.asset;
    const m = map[t] || (map[t] = {});
    const entry = m[a] || (m[a] = { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) entry.pos += r.amount; else entry.neg += Math.abs(r.amount);
    entry.net += r.amount;
  }
  return map;
}

export function computeNetByAsset(rows: Row[]) {
  const m: Record<string, number> = {};
  for (const r of rows) m[r.asset] = (m[r.asset] || 0) + r.amount;
  return m;
}

// ---------- Narrative ----------
export function buildNarrativeParagraphs(
  rows: Row[],
  anchorISO?: string,
  opts?: { initialBalances?: Record<string, number> | undefined; anchorTransfer?: { asset: string; amount: number } | undefined; },
  lang: Lang = "en"
): string {
  const out: string[] = [];
  out.push(t(lang, "utcNote"));

  // filter by time if anchor is given
  const filtered = (anchorISO)
    ? rows.filter(r => r.time >= anchorISO)
    : rows.slice();

  const totals = totalsByType(filtered);

  // intro variants
  if (anchorISO && opts?.anchorTransfer && opts?.initialBalances) {
    const before = opts.initialBalances[opts.anchorTransfer.asset] ?? 0;
    const after = before + opts.anchorTransfer.amount;
    out.push(
      t(lang, "intro_anchor_full",
        anchorISO,
        formatFull(opts.anchorTransfer.amount),
        opts.anchorTransfer.asset,
        formatFull(before) + " " + opts.anchorTransfer.asset,
        formatFull(after) + " " + opts.anchorTransfer.asset
      )
    );
    out.push(t(lang, "after_anchor"));
  } else if (anchorISO && opts?.initialBalances && Object.keys(opts.initialBalances).length) {
    // date + balances (no transfer)
    const parts = Object.keys(opts.initialBalances)
      .map(a => `${formatFull(opts.initialBalances![a])} ${a}`).join(", ");
    out.push(t(lang, "intro_anchor_balance_only", anchorISO, parts));
    out.push(t(lang, "after_anchor"));
  } else if (anchorISO) {
    out.push(t(lang, "intro_anchor_balance_only", anchorISO, "—"));
    out.push(t(lang, "after_anchor"));
  } else {
    out.push(t(lang, "intro_no_anchor"));
  }

  // helper to render a type block
  function pushTypeBlock(labelKey: keyof typeof L["en"], type: string, sign?: "pos"|"neg"|"both") {
    const block = totals[type];
    if (!block) return;
    const lines: string[] = [];
    const pos = block["pos"] || {};
    const neg = block["neg"] || {};
    const showPos = sign !== "neg";
    const showNeg = sign !== "pos";
    if (showPos) for (const a of Object.keys(pos)) if (pos[a] !== 0) lines.push(`  • ${a}  +${formatFull(pos[a])}`);
    if (showNeg) for (const a of Object.keys(neg)) if (neg[a] !== 0) lines.push(`  • ${a}  -${formatFull(neg[a])}`);
    if (!lines.length) return;
    out.push("");
    out.push(`${t(lang, labelKey)}:`);
    out.push(...lines);
  }

  // Realized PnL split
  if (totals["REALIZED_PNL"]) {
    const b = totals["REALIZED_PNL"];
    const posL: string[] = [], negL: string[] = [];
    Object.keys(b.pos||{}).forEach(a => { if (b.pos[a]!==0) posL.push(`  • ${a}  +${formatFull(b.pos[a])}`); });
    Object.keys(b.neg||{}).forEach(a => { if (b.neg[a]!==0) negL.push(`  • ${a}  -${formatFull(b.neg[a])}`); });
    if (posL.length || negL.length) {
      out.push("");
      out.push(`${t(lang, "section_realized")}:`);
      if (posL.length) { out.push(`- ${t(lang, "realized_profit")}:`); out.push(...posL); }
      if (negL.length) { out.push(`- ${t(lang, "realized_loss")}:`);  out.push(...negL); }
    }
  }

  pushTypeBlock("trading_fees", "COMMISSION");
  pushTypeBlock("funding_fees", "FUNDING_FEE");
  pushTypeBlock("insurance", "INSURANCE_CLEAR");
  pushTypeBlock("referral", "REFERRAL_KICKBACK");
  pushTypeBlock("fee_rebate", "COMISSION_REBATE");
  pushTypeBlock("gift", "CASH_COUPON");
  pushTypeBlock("pos_limit_fee", "POSITION_LIMIT_INCREASE_FEE", "neg");
  pushTypeBlock("free_positions", "POSITION_CLAIM_TRANSFER", "pos");
  pushTypeBlock("delivered", "DELIVERED_SETTELMENT");
  // Strategy: split by sign
  if (totals["STRATEGY_UMFUTURES_TRANSFER"]) {
    const b = totals["STRATEGY_UMFUTURES_TRANSFER"];
    const pos = b.pos || {}, neg = b.neg || {};
    if (Object.keys(neg).some(a => neg[a]!==0)) {
      out.push(""); out.push(`${t(lang,"strat_to")}:`);
      for (const a of Object.keys(neg)) if (neg[a]!==0) out.push(`  • ${a}  -${formatFull(neg[a])}`);
    }
    if (Object.keys(pos).some(a => pos[a]!==0)) {
      out.push(""); out.push(`${t(lang,"strat_from")}:`);
      for (const a of Object.keys(pos)) if (pos[a]!==0) out.push(`  • ${a}  +${formatFull(pos[a])}`);
    }
  }
  pushTypeBlock("presents", "FUTURES_PRESENT");
  pushTypeBlock("event_order", "EVENT_CONTRACTS_ORDER", "neg");
  pushTypeBlock("event_payout", "EVENT_CONTRACTS_PAYOUT", "pos");
  pushTypeBlock("busd_reward", "BFUSD_REWARD", "pos");

  // Auto-Exchange (separate)
  if (totals["AUTO_EXCHANGE"]) {
    const b = totals["AUTO_EXCHANGE"];
    const linesIn: string[]=[]; const linesOut: string[]=[];
    for (const a of Object.keys(b.pos||{})) if (b.pos[a]!==0) linesIn.push(`  • ${a}  +${formatFull(b.pos[a])}`);
    for (const a of Object.keys(b.neg||{})) if (b.neg[a]!==0) linesOut.push(`  • ${a}  -${formatFull(b.neg[a])}`);
    if (linesIn.length || linesOut.length) {
      out.push(""); out.push(`${t(lang,"autoswap")}:`);
      if (linesIn.length)  out.push(`- ${t(lang,"autoex_in")}:`, ...linesIn);
      if (linesOut.length) out.push(`- ${t(lang,"autoex_out")}:`, ...linesOut);
    }
  }

  // Coin Swaps (describe given vs received)
  const dep = totals["COIN_SWAP_DEPOSIT"]; // given
  const wdr = totals["COIN_SWAP_WITHDRAW"]; // received
  if ((dep && (Object.keys(dep.pos||{}).length || Object.keys(dep.neg||{}).length)) ||
      (wdr && (Object.keys(wdr.pos||{}).length || Object.keys(wdr.neg||{}).length))) {
    out.push(""); out.push(`${t(lang,"coinswap")}:`);
    const given: Record<string, number> = {};
    const received: Record<string, number> = {};
    if (dep) {
      // deposit can be + on incoming asset in logs; treat NET < 0 as "given"
      for (const a of Object.keys(dep.net||{})) {
        const v = dep.net[a];
        if (v !== 0) given[a] = (given[a] || 0) + Math.abs(Math.min(0, v));
      }
      // also some exchanges log deposit as strictly positive on source; safer: take 'neg' as given too
      for (const a of Object.keys(dep.neg||{})) if (dep.neg[a]!==0) given[a] = (given[a]||0)+dep.neg[a];
    }
    if (wdr) {
      for (const a of Object.keys(wdr.net||{})) {
        const v = wdr.net[a];
        if (v !== 0) received[a] = (received[a] || 0) + Math.max(0, v);
      }
      for (const a of Object.keys(wdr.pos||{})) if (wdr.pos[a]!==0) received[a] = (received[a]||0)+wdr.pos[a];
    }
    const gKeys = Object.keys(given).filter(a => given[a]!==0);
    const rKeys = Object.keys(received).filter(a => received[a]!==0);
    if (gKeys.length) {
      out.push(`- ${t(lang,"coinswap_given")}:`);
      for (const a of gKeys) out.push(`  • ${a}  ${formatFull(given[a])}`);
    }
    if (rKeys.length) {
      out.push(`- ${t(lang,"coinswap_received")}:`);
      for (const a of rKeys) out.push(`  • ${a}  ${formatFull(received[a])}`);
    }
  }

  // Other transactions: any type not handled above
  const handled = new Set([
    "REALIZED_PNL","COMMISSION","FUNDING_FEE","INSURANCE_CLEAR","REFERRAL_KICKBACK","COMISSION_REBATE","CASH_COUPON",
    "POSITION_LIMIT_INCREASE_FEE","POSITION_CLAIM_TRANSFER","DELIVERED_SETTELMENT","STRATEGY_UMFUTURES_TRANSFER",
    "FUTURES_PRESENT","EVENT_CONTRACTS_ORDER","EVENT_CONTRACTS_PAYOUT","BFUSD_REWARD","AUTO_EXCHANGE",
    "COIN_SWAP_DEPOSIT","COIN_SWAP_WITHDRAW"
  ]);
  const otherLines: string[] = [];
  for (const type of Object.keys(totals).sort()) {
    if (handled.has(type)) continue;
    const b = totals[type];
    const lines: string[] = [];
    for (const a of Object.keys(b.pos||{})) if (b.pos[a]!==0) lines.push(`    • ${a}  +${formatFull(b.pos[a])}`);
    for (const a of Object.keys(b.neg||{})) if (b.neg[a]!==0) lines.push(`    • ${a}  -${formatFull(b.neg[a])}`);
    if (lines.length) {
      otherLines.push(`  - ${typeDisplay(lang,type)}:`);
      otherLines.push(...lines);
    }
  }
  if (otherLines.length) { out.push(""); out.push(`${t(lang,"other")}:`); out.push(...otherLines); }

  // Overall effect + final balances (by asset)
  const net = computeNetByAsset(filtered);
  const overall: string[] = [];
  Object.keys(net).sort().forEach(a => { if (net[a]!==0) overall.push(`  • ${a}  ${formatFull(net[a])}`); });
  if (overall.length) { out.push(""); out.push(`${t(lang,"overall")}:`); out.push(...overall); }

  // If initial + transfer exist, compute final expected for that asset
  if (opts?.initialBalances) {
    const finalLines: string[] = [];
    const base = { ...opts.initialBalances };
    // apply anchor transfer first (if provided)
    if (opts.anchorTransfer) base[opts.anchorTransfer.asset] = (base[opts.anchorTransfer.asset] || 0) + opts.anchorTransfer.amount;
    for (const a of Object.keys(net)) base[a] = (base[a] || 0) + net[a];

    for (const a of Object.keys(base).sort()) {
      const v = base[a];
      // hide tiny dust for BFUSD/FDUSD/LDUSDT
      if ((a==="BFUSD"||a==="FDUSD"||a==="LDUSDT") && Math.abs(v) < 1e-7) continue;
      finalLines.push(`  • ${a}  ${formatFull(v)}`);
    }
    if (finalLines.length) { out.push(""); out.push(`${t(lang,"final_wallet")("All assets")}:`); out.push(...finalLines); }
  }

  return out.join("\n");
}

// ---------- Summary rows ----------
export function buildSummaryRows(rows: Row[], lang: Lang = "en"): SummaryRow[] {
  const tmap = totalsByType(rows);
  const rowsOut: SummaryRow[] = [];
  const order: string[] = Object.keys(tmap).sort();
  for (const type of order) {
    const per = tmap[type];
    for (const asset of Object.keys(per).sort()) {
      const e = per[asset];
      if (e.pos===0 && e.neg===0 && e.net===0) continue;
      rowsOut.push({
        label: typeDisplay(lang, type),
        asset,
        in: e.pos || 0,
        out: e.neg || 0,
        net: e.net || 0,
      });
    }
  }
  return rowsOut;
}

// ---------- Agent audit (text) ----------
export function buildAudit(
  rows: Row[],
  cfg: {
    anchorTs: number;
    endTs?: number;
    baseline?: Record<string, number> | undefined;
    anchorTransfer?: { asset: string; amount: number } | undefined;
  }
) {
  const range = rows.filter(r => {
    if (r.ts < cfg.anchorTs) return false;
    if (cfg.endTs && r.ts > cfg.endTs) return false;
    return true;
  });
  const lines: string[] = [];
  lines.push("Agent Balance Audit");
  lines.push(`Anchor (UTC+0): ${new Date(cfg.anchorTs).toISOString().replace("T"," ").replace("Z","")}`);
  if (cfg.endTs) lines.push(`End (UTC+0): ${new Date(cfg.endTs).toISOString().replace("T"," ").replace("Z","")}`);

  if (cfg.baseline) {
    lines.push("\nBaseline (before anchor):");
    for (const a of Object.keys(cfg.baseline).sort()) lines.push(`  • ${a}  ${formatFull(cfg.baseline[a])}`);
  } else {
    lines.push("\nBaseline: not provided (rolling forward from zero).");
  }

  if (cfg.anchorTransfer) {
    lines.push(`\nApplied anchor transfer: ${cfg.anchorTransfer.amount > 0 ? "+" : ""}${formatFull(cfg.anchorTransfer.amount)} ${cfg.anchorTransfer.asset}`);
  }

  // Activity listing by selected important types
  const impOrder = [
    "AUTO_EXCHANGE","CASH_COUPON","REFERRAL_KICKBACK","BFUSD_REWARD",
    "COIN_SWAP_DEPOSIT","COIN_SWAP_WITHDRAW","COMMISSION","FUNDING_FEE",
    "INSURANCE_CLEAR","REALIZED_PNL","STRATEGY_UMFUTURES_TRANSFER","EVENT_CONTRACTS_ORDER","EVENT_CONTRACTS_PAYOUT","TRANSFER"
  ];
  const byType = new Map<string, Row[]>();
  for (const r of range) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r);
  }
  for (const t of impOrder) {
    const arr = byType.get(t);
    if (!arr || !arr.length) continue;
    lines.push(`\n${t}:`);
    for (const r of arr.sort((a,b)=>a.ts-b.ts)) {
      lines.push(`  • ${r.time.split(" ")[1]} — ${r.amount>=0?"+":""}${formatFull(r.amount)} ${r.asset}  (${r.symbol || r.type})`);
    }
  }

  // Net effect and final
  const startBalances = { ...(cfg.baseline || {}) };
  if (cfg.anchorTransfer) startBalances[cfg.anchorTransfer.asset] = (startBalances[cfg.anchorTransfer.asset]||0) + cfg.anchorTransfer.amount;
  const net = computeNetByAsset(range);
  lines.push("\nNet effect (after anchor):");
  for (const a of Object.keys(net).sort()) {
    const v = net[a];
    if (v===0) continue;
    lines.push(`  • ${a}  ${v>=0?"+":""}${formatFull(v)}`);
  }
  for (const a of Object.keys(net)) startBalances[a] = (startBalances[a] || 0) + net[a];

  lines.push("\nFinal expected balances:");
  for (const a of Object.keys(startBalances).sort()) {
    const v = startBalances[a];
    if ((a==="BFUSD"||a==="FDUSD"||a==="LDUSDT") && Math.abs(v) < 1e-7) continue; // hide tiny dust
    lines.push(`  • ${a}  ${formatFull(v)}`);
  }

  return lines.join("\n");
}
