// src/lib/story.ts
/* Pure helpers: NO JSX here. Provides:
   - buildNarrativeParagraphs(rows, anchorISO?, opts)
   - buildAudit(rows, opts)
   - buildSummaryRows(rows)

   Types kept in sync with StoryDrawer.tsx
*/

export type Row = {
  id: string;
  uid: string;
  asset: string;   // e.g., USDT
  type: string;    // e.g., REALIZED_PNL, COMMISSION, ...
  amount: number;  // signed
  time: string;    // "YYYY-MM-DD HH:MM:SS"
  ts: number;      // epoch ms
  symbol: string;  // extra symbol if any
  extra: string;
  raw: string;
};

export type Lang = "en" | "tr" | "ar" | "vi" | "ru";

export type SummaryRow = {
  label: string;   // localized type label
  type: string;    // raw type key
  asset: string;
  in: number;      // sum of >=0
  out: number;     // sum of <0 as positive magnitude
  net: number;     // in - out
};

/* ---------------------------------- i18n ---------------------------------- */

const L = {
  headingUTC: {
    en: "All dates and times are UTC+0. Please adjust for your time zone.",
    tr: "Tüm tarih ve saatler UTC+0’dır. Lütfen kendi saat diliminize göre yorumlayın.",
    ar: "جميع التواريخ والأوقات بتوقيت UTC+0. يرجى ضبطها وفق منطقتك الزمنية.",
    vi: "Tất cả ngày giờ là UTC+0. Vui lòng điều chỉnh theo múi giờ của bạn.",
    ru: "Все даты и время указаны в UTC+0. Отрегулируйте под ваш часовой пояс.",
  },
  introWithAnchor: {
    en: (iso: string, amt: number, asset: string, before?: number, after?: number) =>
      `${iso} — At this date and time, you transferred ${fmtSigned(amt)} ${asset} to your Futures USDs-M Wallet.${numDefined(before) && numDefined(after) ? ` After this transfer your balance changed from ${fmtExact(before)} ${asset} to ${fmtExact(after)} ${asset}.` : ""}`,
    tr: (iso: string, amt: number, asset: string, before?: number, after?: number) =>
      `${iso} — Bu tarih ve saatte ${fmtSigned(amt)} ${asset} tutarında transfer gerçekleştirdiniz.${numDefined(before) && numDefined(after) ? ` Bu transferle bakiyeniz ${fmtExact(before)} ${asset} değerinden ${fmtExact(after)} ${asset} değerine güncellendi.` : ""}`,
    ar: (iso: string, amt: number, asset: string, before?: number, after?: number) =>
      `${iso} — في هذا التاريخ والوقت قمت بتحويل ${fmtSigned(amt)} ${asset} إلى محفظة العقود الدائمة USDs-M.${numDefined(before) && numDefined(after) ? ` بعد هذا التحويل تغير رصيدك من ${fmtExact(before)} ${asset} إلى ${fmtExact(after)} ${asset}.` : ""}`,
    vi: (iso: string, amt: number, asset: string, before?: number, after?: number) =>
      `${iso} — Tại thời điểm này bạn đã chuyển ${fmtSigned(amt)} ${asset} vào ví Futures USDs-M.${numDefined(before) && numDefined(after) ? ` Sau giao dịch, số dư thay đổi từ ${fmtExact(before)} ${asset} lên ${fmtExact(after)} ${asset}.` : ""}`,
    ru: (iso: string, amt: number, asset: string, before?: number, after?: number) =>
      `${iso} — В этот момент вы перевели ${fmtSigned(amt)} ${asset} на кошелёк Futures USDs-M.${numDefined(before) && numDefined(after) ? ` После перевода баланс изменился с ${fmtExact(before)} ${asset} до ${fmtExact(after)} ${asset}.` : ""}`,
  },
  introNoAnchor: {
    en: "Here are your transaction records:",
    tr: "İşlem kayıtlarınız şöyle:",
    ar: "فيما يلي سجلات معاملاتك:",
    vi: "Các giao dịch của bạn như sau:",
    ru: "Ваши записи по транзакциям:",
  },
  introAnchorOnlyBalance: {
    en: (iso: string, amt: number, asset: string) =>
      `${iso} — At this date and time, your Futures USDs-M Wallet balance was: ${fmtExact(amt)} ${asset}.`,
    tr: (iso: string, amt: number, asset: string) =>
      `${iso} — Bu tarih ve saatte Futures USDs-M cüzdan bakiyeniz: ${fmtExact(amt)} ${asset}.`,
    ar: (iso: string, amt: number, asset: string) =>
      `${iso} — في هذا التاريخ والوقت كان رصيد محفظة Futures USDs-M لديك: ${fmtExact(amt)} ${asset}.`,
    vi: (iso: string, amt: number, asset: string) =>
      `${iso} — Tại thời điểm này, số dư ví Futures USDs-M của bạn là: ${fmtExact(amt)} ${asset}.`,
    ru: (iso: string, amt: number, asset: string) =>
      `${iso} — На этот момент баланс кошелька Futures USDs-M: ${fmtExact(amt)} ${asset}.`,
  },
  sectionAfter: {
    en: "If we check your transaction records after this transfer:",
    tr: "Bu transferden sonraki işlem kayıtlarınıza bakarsak:",
    ar: "إذا راجعنا سجلات معاملاتك بعد هذا التحويل:",
    vi: "Nếu xem các giao dịch sau lần chuyển này:",
    ru: "Если посмотреть на записи после этого перевода:",
  },
  sectionTotals: {
    en: "Total effect in this range (by asset):",
    tr: "Bu aralıktaki toplam etki (varlık bazında):",
    ar: "الأثر الإجمالي في هذه الفترة (حسب الأصل):",
    vi: "Tác động tổng (theo tài sản) trong khoảng này:",
    ru: "Итоговый эффект за период (по активам):",
  },
  sectionFinal: {
    en: "Final wallet balance (computed):",
    tr: "Nihai cüzdan bakiyesi (hesaplanan):",
    ar: "الرصيد النهائي للمحفظة (محسوب):",
    vi: "Số dư ví cuối cùng (tính toán):",
    ru: "Итоговый баланс кошелька (расчёт):",
  },
  // Type labels:
  typeLabels: {
    en: {
      REALIZED_PNL: "Realized PnL",
      COMMISSION: "Trading Fees",
      FUNDING_FEE: "Funding Fees",
      INSURANCE_CLEAR: "Insurance/Liquidation",
      LIQUIDATION_FEE: "Insurance/Liquidation",
      REFERRAL_KICKBACK: "Referral Incomes",
      COMISSION_REBATE: "Trading Fee Rebates",
      CASH_COUPON: "Gift Money",
      POSITION_LIMIT_INCREASE_FEE: "Position Limit Increase Fee",
      POSITION_CLAIM_TRANSFER: "Free Positions",
      DELIVERED_SETTELMENT: "Delivery Contracts Settlement Amount",
      STRATEGY_UMFUTURES_TRANSFER: "Strategy Futures Transfer",
      FUTURES_PRESENT: "Futures Presents",
      EVENT_CONTRACTS_ORDER: "Event Contracts — Order",
      EVENT_CONTRACTS_PAYOUT: "Event Contracts — Payout",
      BFUSD_REWARD: "BFUSD Reward",
      API_REBATE: "API Rebate",
      CONTEST_REWARD: "Contest Reward",
      INTERNAL_*: "Internal",
      INTERNAL_COMMISSION: "Internal Commission",
      INTERNAL_TRANSFER: "Internal Transfer",
      INTERNAL_AGENT_REWARD: "Internal Agent Reward",
      INTERNAL_CONTEST_REWARD: "Internal Contest Reward",
      INTERNAL_COMMISSION_REBATE: "Internal Commission Rebate",
      CROSS_COLLATERAL_TRANSFER: "Cross-Collateral Transfer",
      OPTIONS_PREMIUM_FEE: "Options Premium Fee",
      OPTIONS_SETTLE_PROFIT: "Options Settle Profit",
      LIEN_CLAIM: "Lien Claim",
      FEE_RETURN: "Fee Return",
      TRANSFER: "Transfer",
      COIN_SWAP_DEPOSIT: "Coin Swap (Deposit)",
      COIN_SWAP_WITHDRAW: "Coin Swap (Withdraw)",
      AUTO_EXCHANGE: "Auto-Exchange",
      OTHER: "Other Transactions",
    },
    tr: {
      REALIZED_PNL: "Gerçekleşen K/Z",
      COMMISSION: "İşlem Ücretleri",
      FUNDING_FEE: "Funding Ücretleri",
      INSURANCE_CLEAR: "Sigorta/Likidasyon",
      LIQUIDATION_FEE: "Sigorta/Likidasyon",
      REFERRAL_KICKBACK: "Referral Gelirleri",
      COMISSION_REBATE: "Komisyon İadesi",
      CASH_COUPON: "Hediye Para",
      POSITION_LIMIT_INCREASE_FEE: "Pozisyon Limiti Artış Ücreti",
      POSITION_CLAIM_TRANSFER: "Ücretsiz Pozisyonlar",
      DELIVERED_SETTELMENT: "Teslim Sözleşmesi Mutabakatı",
      STRATEGY_UMFUTURES_TRANSFER: "Strateji Vadeli Transfer",
      FUTURES_PRESENT: "Futures Hediye",
      EVENT_CONTRACTS_ORDER: "Event Contracts — Order",
      EVENT_CONTRACTS_PAYOUT: "Event Contracts — Payout",
      BFUSD_REWARD: "BFUSD Ödülü",
      API_REBATE: "API İadesi",
      CONTEST_REWARD: "Yarışma Ödülü",
      INTERNAL_*: "Dahili",
      INTERNAL_COMMISSION: "Dahili Komisyon",
      INTERNAL_TRANSFER: "Dahili Transfer",
      INTERNAL_AGENT_REWARD: "Dahili Ajan Ödülü",
      INTERNAL_CONTEST_REWARD: "Dahili Yarışma Ödülü",
      INTERNAL_COMMISSION_REBATE: "Dahili Komisyon İadesi",
      CROSS_COLLATERAL_TRANSFER: "Çapraz Teminat Transferi",
      OPTIONS_PREMIUM_FEE: "Opsiyon Prim Ücreti",
      OPTIONS_SETTLE_PROFIT: "Opsiyon Mutabakat Kârı",
      LIEN_CLAIM: "Haciz Talebi",
      FEE_RETURN: "Ücret İadesi",
      TRANSFER: "Transfer",
      COIN_SWAP_DEPOSIT: "Coin Swap (Yatırılan)",
      COIN_SWAP_WITHDRAW: "Coin Swap (Çekilen)",
      AUTO_EXCHANGE: "Oto-Değişim",
      OTHER: "Diğer İşlemler",
    },
    ar: {
      REALIZED_PNL: "الربح/الخسارة المحققة",
      COMMISSION: "رسوم التداول",
      FUNDING_FEE: "رسوم التمويل",
      INSURANCE_CLEAR: "صندوق التأمين/التصفية",
      LIQUIDATION_FEE: "رسوم التصفية",
      REFERRAL_KICKBACK: "عوائد الإحالة",
      COMISSION_REBATE: "استرداد عمولة",
      CASH_COUPON: "أموال هدية",
      POSITION_LIMIT_INCREASE_FEE: "رسوم زيادة حد المركز",
      POSITION_CLAIM_TRANSFER: "مراكز مجانية",
      DELIVERED_SETTELMENT: "تسوية عقود التسليم",
      STRATEGY_UMFUTURES_TRANSFER: "تحويل استراتيجية العقود",
      FUTURES_PRESENT: "هدايا العقود",
      EVENT_CONTRACTS_ORDER: "عقود الأحداث — أمر",
      EVENT_CONTRACTS_PAYOUT: "عقود الأحداث — دفعة",
      BFUSD_REWARD: "مكافأة BFUSD",
      API_REBATE: "استرداد API",
      CONTEST_REWARD: "مكافأة مسابقة",
      INTERNAL_*: "داخلي",
      INTERNAL_COMMISSION: "عمولة داخلية",
      INTERNAL_TRANSFER: "تحويل داخلي",
      INTERNAL_AGENT_REWARD: "مكافأة وكيل داخلية",
      INTERNAL_CONTEST_REWARD: "مكافأة مسابقة داخلية",
      INTERNAL_COMMISSION_REBATE: "استرداد عمولة داخلي",
      CROSS_COLLATERAL_TRANSFER: "تحويل الضمان المتقاطع",
      OPTIONS_PREMIUM_FEE: "رسوم قسط الخيارات",
      OPTIONS_SETTLE_PROFIT: "ربح تسوية الخيارات",
      LIEN_CLAIM: "مطالبة حجز",
      FEE_RETURN: "إرجاع رسوم",
      TRANSFER: "تحويل",
      COIN_SWAP_DEPOSIT: "مبادلة عملات (إيداع)",
      COIN_SWAP_WITHDRAW: "مبادلة عملات (سحب)",
      AUTO_EXCHANGE: "تحويل تلقائي",
      OTHER: "معاملات أخرى",
    },
    vi: {
      REALIZED_PNL: "Lãi/Lỗ đã thực hiện",
      COMMISSION: "Phí giao dịch",
      FUNDING_FEE: "Phí funding",
      INSURANCE_CLEAR: "Quỹ bảo hiểm/Thanh lý",
      LIQUIDATION_FEE: "Phí thanh lý",
      REFERRAL_KICKBACK: "Thu nhập giới thiệu",
      COMISSION_REBATE: "Hoàn phí giao dịch",
      CASH_COUPON: "Tiền quà tặng",
      POSITION_LIMIT_INCREASE_FEE: "Phí tăng giới hạn vị thế",
      POSITION_CLAIM_TRANSFER: "Vị thế miễn phí",
      DELIVERED_SETTELMENT: "Thanh toán hợp đồng giao nhận",
      STRATEGY_UMFUTURES_TRANSFER: "Chuyển chiến lược Futures",
      FUTURES_PRESENT: "Quà tặng Futures",
      EVENT_CONTRACTS_ORDER: "Hợp đồng sự kiện — Lệnh",
      EVENT_CONTRACTS_PAYOUT: "Hợp đồng sự kiện — Chi trả",
      BFUSD_REWARD: "Thưởng BFUSD",
      API_REBATE: "Hoàn API",
      CONTEST_REWARD: "Thưởng cuộc thi",
      INTERNAL_*: "Nội bộ",
      INTERNAL_COMMISSION: "Phí nội bộ",
      INTERNAL_TRANSFER: "Chuyển nội bộ",
      INTERNAL_AGENT_REWARD: "Thưởng đại lý nội bộ",
      INTERNAL_CONTEST_REWARD: "Thưởng cuộc thi nội bộ",
      INTERNAL_COMMISSION_REBATE: "Hoàn phí nội bộ",
      CROSS_COLLATERAL_TRANSFER: "Chuyển tài sản thế chấp chéo",
      OPTIONS_PREMIUM_FEE: "Phí premium quyền chọn",
      OPTIONS_SETTLE_PROFIT: "Lãi quyết toán quyền chọn",
      LIEN_CLAIM: "Yêu cầu cầm giữ",
      FEE_RETURN: "Hoàn trả phí",
      TRANSFER: "Chuyển",
      COIN_SWAP_DEPOSIT: "Hoán đổi coin (Nạp)",
      COIN_SWAP_WITHDRAW: "Hoán đổi coin (Rút)",
      AUTO_EXCHANGE: "Tự hoán đổi",
      OTHER: "Giao dịch khác",
    },
    ru: {
      REALIZED_PNL: "Реализ. прибыль/убыток",
      COMMISSION: "Комиссии",
      FUNDING_FEE: "Фандинг",
      INSURANCE_CLEAR: "Страховой фонд/Ликвидация",
      LIQUIDATION_FEE: "Сбор за ликвидацию",
      REFERRAL_KICKBACK: "Реферальный доход",
      COMISSION_REBATE: "Возврат комиссии",
      CASH_COUPON: "Подарочные средства",
      POSITION_LIMIT_INCREASE_FEE: "Плата за увеличение лимита позиции",
      POSITION_CLAIM_TRANSFER: "Бесплатные позиции",
      DELIVERED_SETTELMENT: "Расчёт по поставочным контрактам",
      STRATEGY_UMFUTURES_TRANSFER: "Стратегия: перевод фьючерсов",
      FUTURES_PRESENT: "Подарки фьючерсами",
      EVENT_CONTRACTS_ORDER: "Событийные контракты — Ордер",
      EVENT_CONTRACTS_PAYOUT: "Событийные контракты — Выплата",
      BFUSD_REWARD: "Награда BFUSD",
      API_REBATE: "API-кэшбэк",
      CONTEST_REWARD: "Приз конкурса",
      INTERNAL_*: "Внутреннее",
      INTERNAL_COMMISSION: "Внутренняя комиссия",
      INTERNAL_TRANSFER: "Внутренний перевод",
      INTERNAL_AGENT_REWARD: "Внутренняя награда агента",
      INTERNAL_CONTEST_REWARD: "Внутренняя призовая",
      INTERNAL_COMMISSION_REBATE: "Внутренний возврат комиссии",
      CROSS_COLLATERAL_TRANSFER: "Перевод кросс-залогов",
      OPTIONS_PREMIUM_FEE: "Опционы: премия",
      OPTIONS_SETTLE_PROFIT: "Опционы: расчётная прибыль",
      LIEN_CLAIM: "Иск о залоге",
      FEE_RETURN: "Возврат комиссии",
      TRANSFER: "Перевод",
      COIN_SWAP_DEPOSIT: "Обмен монет (внесено)",
      COIN_SWAP_WITHDRAW: "Обмен монет (получено)",
      AUTO_EXCHANGE: "Автообмен",
      OTHER: "Прочие операции",
    },
  },
};

function tLabel(lang: Lang, type: string): string {
  const dict = L.typeLabels[lang] as Record<string, string>;
  return dict[type] || dict[typePrefix(type)] || dict.OTHER;
}
function typePrefix(s: string) {
  const i = s.indexOf("_");
  return i > 0 ? s.slice(0, i) + "_*" : s;
}

/* -------------------------------- summarize -------------------------------- */

type PM = { pos: number; neg: number };
type TypeAsset = Record<string, Record<string, PM>>;

function accumulate(rows: Row[]): TypeAsset {
  const acc: TypeAsset = {};
  for (const r of rows) {
    const t = r.type || "OTHER";
    const a = r.asset || "UNKNOWN";
    acc[t] = acc[t] || {};
    acc[t][a] = acc[t][a] || { pos: 0, neg: 0 };
    if (r.amount >= 0) acc[t][a].pos += r.amount;
    else acc[t][a].neg += -r.amount;
  }
  return acc;
}

export function buildSummaryRows(rows: Row[]): SummaryRow[] {
  const acc = accumulate(rows);
  const out: SummaryRow[] = [];
  for (const t of Object.keys(acc)) {
    for (const a of Object.keys(acc[t])) {
      const { pos, neg } = acc[t][a];
      if (almostZero(pos) && almostZero(neg)) continue;
      out.push({
        label: tLabel("en", t), // UI renklendirme sabit, başlık İngilizce; StoryDrawer dil çevirisini metinde yapıyor
        type: t,
        asset: a,
        in: roundFull(pos),
        out: roundFull(neg),
        net: roundFull(pos - neg),
      });
    }
  }
  // Sort by |net| desc
  out.sort((x, y) => Math.abs(y.net) - Math.abs(x.net));
  return out;
}

/* ------------------------------- narrative --------------------------------- */

type NarrativeOpts = {
  initialBalances?: Record<string, number>;
  anchorTransfer?: { amount: number; asset: string };
  lang: Lang;
};

/** Build friendly paragraphs. Never net per type; show positives and negatives separately. */
export function buildNarrativeParagraphs(
  rows: Row[],
  anchorISO?: string,
  opts?: NarrativeOpts
): string {
  const lang = opts?.lang ?? "en";
  const parts: string[] = [];

  // Heading
  parts.push(L.headingUTC[lang]);

  // Anchor intro
  if (anchorISO && opts?.anchorTransfer) {
    const before = opts.initialBalances?.[opts.anchorTransfer.asset];
    const after =
      numDefined(before) ? before! + opts.anchorTransfer.amount : undefined;
    parts.push(
      L.introWithAnchor[lang](
        anchorISO,
        opts.anchorTransfer.amount,
        opts.anchorTransfer.asset,
        before,
        after
      )
    );
    parts.push(L.sectionAfter[lang]);
  } else if (anchorISO && numDefined(opts?.initialBalances?.USDT)) {
    // Only anchor + a baseline sample (USDT preferred just to phrase)
    parts.push(
      L.introAnchorOnlyBalance[lang](anchorISO, opts!.initialBalances!.USDT, "USDT")
    );
    parts.push(L.sectionAfter[lang]);
  } else {
    parts.push(L.introNoAnchor[lang]);
  }

  // Summaries by type/asset (post-filter: after anchor if provided)
  const filtered = anchorISO
    ? rows.filter((r) => r.ts >= Date.parse(anchorISO + "Z"))
    : rows.slice();

  // Group by type/asset
  const acc = accumulate(filtered);

  // Explicit sections for Auto-Exchange & Coin Swaps
  const auto = pick(acc, "AUTO_EXCHANGE");
  if (auto.length) {
    parts.push(sectionHeader(lang, "AUTO_EXCHANGE"));
    for (const a of auto) {
      const { asset, pos, neg } = a;
      if (!almostZero(pos)) parts.push(`  • ${asset}  +${fmtExact(pos)}`);
      if (!almostZero(neg)) parts.push(`  • ${asset}  -${fmtExact(neg)}`);
    }
  }

  const csDep = pick(acc, "COIN_SWAP_DEPOSIT");
  const csWdr = pick(acc, "COIN_SWAP_WITHDRAW");
  if (csDep.length || csWdr.length) {
    parts.push(sectionHeader(lang, "COIN_SWAP"));
    if (csWdr.length) {
      parts.push("  Swapped out:");
      for (const a of csWdr)
        if (!almostZero(a.pos) || !almostZero(a.neg))
          parts.push(`    • ${a.asset} ${fmtSignBlock(-a.pos)}${fmtSignBlock(-a.neg)}`.trimEnd());
    }
    if (csDep.length) {
      parts.push("  Received:");
      for (const a of csDep)
        if (!almostZero(a.pos) || !almostZero(a.neg))
          parts.push(`    • ${a.asset} ${fmtSignBlock(+a.pos)}${fmtSignBlock(+a.neg)}`.trimEnd());
    }
  }

  // The rest of types (excluding ones we already wrote explicitly)
  const skip = new Set(["AUTO_EXCHANGE", "COIN_SWAP_DEPOSIT", "COIN_SWAP_WITHDRAW"]);
  const remainingTypes = Object.keys(acc).filter((t) => !skip.has(t));
  remainingTypes.sort();
  for (const t of remainingTypes) {
    const items = acc[t];
    if (!items) continue;
    const lines: string[] = [];
    for (const a of Object.keys(items)) {
      const { pos, neg } = items[a];
      if (almostZero(pos) && almostZero(neg)) continue;
      // For things like REALIZED_PNL negatives are losses — show with minus sign
      if (!almostZero(pos)) lines.push(`  • ${a}  +${fmtExact(pos)}`);
      if (!almostZero(neg)) lines.push(`  • ${a}  -${fmtExact(neg)}`);
    }
    if (lines.length) {
      parts.push(sectionHeader(lang, t));
      parts.push(...lines);
    }
  }

  // Overall totals by asset (this range)
  const totalsByAsset = sumByAsset(filtered);
  const totalLines = Object.keys(totalsByAsset)
    .sort()
    .map((a) => {
      const { pos, neg } = totalsByAsset[a];
      const net = pos - neg;
      return `  • ${a}  +${fmtExact(pos)}  −${fmtExact(neg)}  = ${fmtExact(net)}`;
    });
  if (totalLines.length) {
    parts.push("");
    parts.push(L.sectionTotals[lang]);
    parts.push(...totalLines);
  }

  return parts.join("\n");
}

function sectionHeader(lang: Lang, type: string): string {
  if (type === "COIN_SWAP") {
    return lang === "tr" ? "Coin Swap:" :
           lang === "ar" ? "مبادلة العملات:" :
           lang === "vi" ? "Hoán đổi coin:" :
           lang === "ru" ? "Обмен монет:" : "Coin Swaps:";
  }
  return `${tLabel(lang, type)}:`;
}

function pick(acc: TypeAsset, type: string): { asset: string; pos: number; neg: number }[] {
  const m = acc[type];
  if (!m) return [];
  return Object.keys(m).map((asset) => ({ asset, ...m[asset] }));
}

function sumByAsset(rows: Row[]): Record<string, PM> {
  const m: Record<string, PM> = {};
  for (const r of rows) {
    const a = r.asset || "UNKNOWN";
    m[a] = m[a] || { pos: 0, neg: 0 };
    if (r.amount >= 0) m[a].pos += r.amount;
    else m[a].neg += -r.amount;
  }
  return m;
}

/* ---------------------------------- audit ---------------------------------- */

type AuditOpts = {
  anchorTs: number;            // required
  endTs?: number;              // optional inclusive upper bound
  baseline?: Record<string, number>; // optional starting balances at anchor-ε
  anchorTransfer?: { amount: number; asset: string }; // optional
};

export function buildAudit(rows: Row[], opts: AuditOpts): string {
  const { anchorTs, endTs, baseline, anchorTransfer } = opts;

  // Start base
  const bal: Record<string, number> = {};
  if (baseline) {
    for (const a of Object.keys(baseline)) bal[a] = baseline[a];
  }

  // Apply anchor transfer
  if (anchorTransfer && anchorTransfer.asset) {
    const a = anchorTransfer.asset.toUpperCase();
    bal[a] = (bal[a] || 0) + anchorTransfer.amount;
  }

  // Apply all rows >= anchorTs (and <= endTs if provided)
  for (const r of rows) {
    if (r.ts < anchorTs) continue;
    if (numDefined(endTs) && r.ts > endTs!) continue;
    const a = r.asset || "UNKNOWN";
    bal[a] = (bal[a] || 0) + r.amount;
  }

  // Normalize tiny ~0 values
  for (const a of Object.keys(bal)) {
    if (almostZero(bal[a])) bal[a] = 0;
  }

  // Hide tiny dust for BFUSD/FDUSD/LDUSDT if |val| < 1e-7
  const HIDE_DUST = new Set(["BFUSD", "FDUSD", "LDUSDT"]);
  const finalLines: string[] = [];
  const assetsSorted = Object.keys(bal).sort();
  for (const a of assetsSorted) {
    const v = bal[a];
    if (HIDE_DUST.has(a) && Math.abs(v) < 1e-7) continue;
    if (almostZero(v)) continue; // also hide perfect zeros
    finalLines.push(`  • ${a}  ${fmtExact(v)}`);
  }

  if (!finalLines.length) return "No material balance change.";

  return ["Final expected balances:", ...finalLines].join("\n");
}

/* --------------------------------- helpers --------------------------------- */

function numDefined<T>(x: T | undefined | null): x is T {
  return x !== undefined && x !== null;
}

function almostZero(n: number, eps = 1e-12) {
  return Math.abs(n) < eps;
}

function roundFull(n: number) {
  // keep full precision as string, but return Number for table math
  // narrative uses fmtExact which prints full value without trimming significant digits
  return Number(n);
}

function fmtExact(n: number) {
  // No rounding, preserve decimals as-is in JS string (avoid scientific where possible)
  if (Object.is(n, -0)) return "0";
  const s = String(n);
  // Expand scientific notation if needed
  if (/e-?\d+$/i.test(s)) {
    // Fallback: toFixed with enough places
    const mag = Math.ceil(Math.abs(Math.log10(Math.abs(n) || 1)));
    const places = Math.min(30, mag + 18);
    return Number(n).toFixed(places).replace(/\.?0+$/, "");
  }
  return s;
}

function fmtSigned(n: number) {
  return (n >= 0 ? "+" : "") + fmtExact(n);
}

function fmtSignBlock(n: number) {
  if (almostZero(n)) return "";
  return (n >= 0 ? ` +${fmtExact(n)}` : ` ${fmtExact(n)}`); // includes minus
}
