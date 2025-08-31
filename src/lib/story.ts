// src/lib/story.ts
// PURE LOGIC — no JSX. Used by StoryDrawer for narrative/audit/summary.

// ---------- Types ----------
export type Lang = "en" | "tr" | "ar" | "vi" | "ru";

export type Row = {
  id: string;
  uid: string;
  asset: string; // e.g. USDT, USDC, BNB, BFUSD, FDUSD, LDUSDT, ...
  type: string;  // e.g. REALIZED_PNL, COMMISSION, TRANSFER, ...
  amount: number; // positive=inflow, negative=outflow
  time: string;  // original string
  ts: number;    // epoch ms (UTC)
  symbol: string;
  extra: string;
  raw: string;
};

// ---------- i18n labels (short & safe) ----------
const L = {
  en: {
    utcNotice:
      "All dates and times are UTC+0. Please adjust for your time zone.",
    anchorWithTransfer:
      (iso: string, amt: string, asset: string, before: string, after: string) =>
        `${iso} UTC+0 — At this date and time, you transferred ${amt} ${asset} to your Futures USDs-M Wallet. After this transfer your balance increased from ${before} ${asset} to ${after} ${asset}.`,
    anchorOnly: (iso: string, bal: string, asset: string) =>
      `${iso} UTC+0 — At this date and time your Futures USDs-M Wallet balance was: ${bal} ${asset}.`,
    introNoAnchor: "Here are your transaction records:",
    afterAnchor: "If we check your transaction records after this transfer:",
    sections: {
      REALIZED_PROFIT: "Realized Profit",
      REALIZED_LOSS: "Realized Loss",
      COMMISSION: "Trading Fees",
      FUNDING_FEE: "Funding Fees",
      INSURANCE_CLEAR: "Liquidation/Insurance Clearance Fees",
      REFERRAL_KICKBACK: "Referral Incomes",
      COMISSION_REBATE: "Trading Fee Rebates",
      CASH_COUPON: "Gift Money",
      POSITION_LIMIT_INCREASE_FEE: "Position Limit Increase Fee",
      POSITION_CLAIM_TRANSFER: "Free Positions",
      DELIVERED_SETTELMENT: "Delivery Contracts Settlement Amount",
      STRATEGY_UMFUTURES_TRANSFER_IN: "Transfer From the GridBot",
      STRATEGY_UMFUTURES_TRANSFER_OUT: "Transfer To the GridBot",
      FUTURES_PRESENT: "Futures Presents",
      EVENT_CONTRACTS_ORDER: "Event Contracts — Order",
      EVENT_CONTRACTS_PAYOUT: "Event Contracts — Payout",
      BFUSD_REWARD: "BUSD Rewards",
      API_REBATE: "API Rebate",
      CONTEST_REWARD: "Contest Reward",
      INTERNAL: "Other Internal",
      OTHER: "Other Transactions",
      COIN_SWAP: "Coin Swaps",
      AUTO_EXCHANGE: "Auto-Exchange",
      TRANSFER_IN: "Transfers (In)",
      TRANSFER_OUT: "Transfers (Out)",
    },
    swapsOutIn: (out: string, inn: string) =>
      `Swapped out: ${out} — Received: ${inn}`,
    autoOutIn: (out: string, inn: string) =>
      `Converted out: ${out} — Converted in: ${inn}`,
    totalEffect: "Total effect in this range (by asset):",
    finalWallet: "Final wallet balance (computed):",
    none: "No data",
  },
  tr: {
    utcNotice:
      "Tüm tarih ve saatler UTC+0’dır. Lütfen zaman diliminize göre yorumlayın.",
    anchorWithTransfer:
      (iso, amt, asset, before, after) =>
        `${iso} UTC+0 — Bu tarih ve saatte, Futures USDs-M cüzdanınıza ${amt} ${asset} transfer ettiniz. İşlem sonrası bakiye ${before} ${asset} → ${after} ${asset} oldu.`,
    anchorOnly: (iso, bal, asset) =>
      `${iso} UTC+0 — Bu tarih ve saatte Futures USDs-M cüzdan bakiyeniz: ${bal} ${asset}.`,
    introNoAnchor: "İşlem kayıtlarınız şöyle:",
    afterAnchor: "Bu transfer sonrası işlem kayıtlarınız:",
    sections: {
      REALIZED_PROFIT: "Gerçekleşen Kâr",
      REALIZED_LOSS: "Gerçekleşen Zarar",
      COMMISSION: "İşlem Ücretleri",
      FUNDING_FEE: "Funding Ücretleri",
      INSURANCE_CLEAR: "Likidasyon / Sigorta Kesintileri",
      REFERRAL_KICKBACK: "Referans Gelirleri",
      COMISSION_REBATE: "Komisyon İadeleri",
      CASH_COUPON: "Hediye Para",
      POSITION_LIMIT_INCREASE_FEE: "Pozisyon Limit Artış Ücreti",
      POSITION_CLAIM_TRANSFER: "Ücretsiz Pozisyonlar",
      DELIVERED_SETTELMENT: "Teslim Sözleşmeleri Sonuç Bakiye",
      STRATEGY_UMFUTURES_TRANSFER_IN: "GridBot’tan Transfer",
      STRATEGY_UMFUTURES_TRANSFER_OUT: "GridBot’a Transfer",
      FUTURES_PRESENT: "Futures Hediyeleri",
      EVENT_CONTRACTS_ORDER: "Etkinlik Sözleşmeleri — Gönderim",
      EVENT_CONTRACTS_PAYOUT: "Etkinlik Sözleşmeleri — Ödeme",
      BFUSD_REWARD: "BUSD Ödülleri",
      API_REBATE: "API İadesi",
      CONTEST_REWARD: "Yarışma Ödülü",
      INTERNAL: "Diğer Dahili",
      OTHER: "Diğer İşlemler",
      COIN_SWAP: "Coin Swap",
      AUTO_EXCHANGE: "Otomatik Dönüşüm",
      TRANSFER_IN: "Transferler (Gelen)",
      TRANSFER_OUT: "Transferler (Giden)",
    },
    swapsOutIn: (out, inn) => `Çevrilen (giden): ${out} — Alınan: ${inn}`,
    autoOutIn: (out, inn) => `Dönüşen (giden): ${out} — Dönüşen (gelen): ${inn}`,
    totalEffect: "Bu aralıktaki toplam etki (varlık bazında):",
    finalWallet: "Hesaplanan nihai cüzdan bakiyesi:",
    none: "Veri yok",
  },
  ar: {
    utcNotice:
      "جميع التواريخ والأوقات بتوقيت UTC+0. يرجى ضبط التوقيت حسب منطقتك.",
    anchorWithTransfer:
      (iso, amt, asset, before, after) =>
        `${iso} UTC+0 — في هذا الوقت قمت بتحويل ${amt} ${asset} إلى محفظة العقود الآجلة. بعد التحويل أصبح الرصيد من ${before} ${asset} إلى ${after} ${asset}.`,
    anchorOnly: (iso, bal, asset) =>
      `${iso} UTC+0 — في هذا الوقت كان رصيد محفظتك للعقود الآجلة: ${bal} ${asset}.`,
    introNoAnchor: "سجل معاملاتك:",
    afterAnchor: "بعد هذا التحويل، معاملاتك:",
    sections: {
      REALIZED_PROFIT: "أرباح محققة",
      REALIZED_LOSS: "خسائر محققة",
      COMMISSION: "عمولات التداول",
      FUNDING_FEE: "رسوم التمويل",
      INSURANCE_CLEAR: "رسوم التصفية/التأمين",
      REFERRAL_KICKBACK: "عوائد الإحالة",
      COMISSION_REBATE: "استرداد العمولات",
      CASH_COUPON: "أموال هدايا",
      POSITION_LIMIT_INCREASE_FEE: "رسوم زيادة حد المركز",
      POSITION_CLAIM_TRANSFER: "مراكز مجانية",
      DELIVERED_SETTELMENT: "تسوية عقود التسليم",
      STRATEGY_UMFUTURES_TRANSFER_IN: "تحويل من GridBot",
      STRATEGY_UMFUTURES_TRANSFER_OUT: "تحويل إلى GridBot",
      FUTURES_PRESENT: "هدايا العقود الآجلة",
      EVENT_CONTRACTS_ORDER: "عقود الأحداث — إرسال",
      EVENT_CONTRACTS_PAYOUT: "عقود الأحداث — استلام",
      BFUSD_REWARD: "مكافآت BUSD",
      API_REBATE: "استرداد API",
      CONTEST_REWARD: "جائزة مسابقة",
      INTERNAL: "عمليات داخلية أخرى",
      OTHER: "عمليات أخرى",
      COIN_SWAP: "مبادلة العملات",
      AUTO_EXCHANGE: "تحويل تلقائي",
      TRANSFER_IN: "تحويلات (واردة)",
      TRANSFER_OUT: "تحويلات (صادرة)",
    },
    swapsOutIn: (out, inn) => `المحوّل خارجًا: ${out} — المستلم: ${inn}`,
    autoOutIn: (out, inn) => `المحوّل خارجًا: ${out} — المحوّل داخلاً: ${inn}`,
    totalEffect: "الأثر الإجمالي في هذه الفترة (حسب الأصل):",
    finalWallet: "الرصيد النهائي المحسوب:",
    none: "لا توجد بيانات",
  },
  vi: {
    utcNotice:
      "Mọi ngày giờ đều theo UTC+0. Vui lòng quy đổi theo múi giờ của bạn.",
    anchorWithTransfer:
      (iso, amt, asset, before, after) =>
        `${iso} UTC+0 — Tại thời điểm này, bạn đã chuyển ${amt} ${asset} vào ví Futures USDs-M. Sau chuyển khoản, số dư tăng từ ${before} ${asset} lên ${after} ${asset}.`,
    anchorOnly: (iso, bal, asset) =>
      `${iso} UTC+0 — Tại thời điểm này, số dư ví Futures USDs-M của bạn là: ${bal} ${asset}.`,
    introNoAnchor: "Các giao dịch của bạn:",
    afterAnchor: "Sau chuyển khoản này, các giao dịch:",
    sections: {
      REALIZED_PROFIT: "Lợi nhuận đã chốt",
      REALIZED_LOSS: "Thua lỗ đã chốt",
      COMMISSION: "Phí giao dịch",
      FUNDING_FEE: "Phí Funding",
      INSURANCE_CLEAR: "Phí thanh lý/bảo hiểm",
      REFERRAL_KICKBACK: "Thu nhập giới thiệu",
      COMISSION_REBATE: "Hoàn phí giao dịch",
      CASH_COUPON: "Tiền thưởng/phiếu quà",
      POSITION_LIMIT_INCREASE_FEE: "Phí tăng hạn mức vị thế",
      POSITION_CLAIM_TRANSFER: "Vị thế miễn phí",
      DELIVERED_SETTELMENT: "Kết toán hợp đồng giao nhận",
      STRATEGY_UMFUTURES_TRANSFER_IN: "Chuyển từ GridBot",
      STRATEGY_UMFUTURES_TRANSFER_OUT: "Chuyển đến GridBot",
      FUTURES_PRESENT: "Quà tặng Futures",
      EVENT_CONTRACTS_ORDER: "Hợp đồng sự kiện — Gửi",
      EVENT_CONTRACTS_PAYOUT: "Hợp đồng sự kiện — Nhận",
      BFUSD_REWARD: "Thưởng BUSD",
      API_REBATE: "Hoàn API",
      CONTEST_REWARD: "Thưởng cuộc thi",
      INTERNAL: "Nội bộ khác",
      OTHER: "Giao dịch khác",
      COIN_SWAP: "Hoán đổi coin",
      AUTO_EXCHANGE: "Tự động chuyển đổi",
      TRANSFER_IN: "Chuyển vào",
      TRANSFER_OUT: "Chuyển ra",
    },
    swapsOutIn: (out, inn) => `Đã hoán đổi ra: ${out} — Nhận về: ${inn}`,
    autoOutIn: (out, inn) => `Chuyển đổi ra: ${out} — Chuyển đổi vào: ${inn}`,
    totalEffect: "Tổng tác động trong khoảng (theo tài sản):",
    finalWallet: "Số dư ví cuối cùng (tính toán):",
    none: "Không có dữ liệu",
  },
  ru: {
    utcNotice:
      "Все даты и время — UTC+0. Пожалуйста, учитывайте ваш часовой пояс.",
    anchorWithTransfer:
      (iso, amt, asset, before, after) =>
        `${iso} UTC+0 — В этот момент вы перевели ${amt} ${asset} на кошелёк Futures USDs-M. Баланс изменился с ${before} ${asset} до ${after} ${asset}.`,
    anchorOnly: (iso, bal, asset) =>
      `${iso} UTC+0 — В этот момент баланс кошелька Futures USDs-M: ${bal} ${asset}.`,
    introNoAnchor: "Ваши записи транзакций:",
    afterAnchor: "После этого перевода ваши операции:",
    sections: {
      REALIZED_PROFIT: "Реализованная прибыль",
      REALIZED_LOSS: "Реализованный убыток",
      COMMISSION: "Комиссии",
      FUNDING_FEE: "Фандинг",
      INSURANCE_CLEAR: "Ликвидация/страховой фонд",
      REFERRAL_KICKBACK: "Реферальный доход",
      COMISSION_REBATE: "Ребейт комиссии",
      CASH_COUPON: "Подарочные средства",
      POSITION_LIMIT_INCREASE_FEE: "Плата за увеличение лимита позиции",
      POSITION_CLAIM_TRANSFER: "Бесплатные позиции",
      DELIVERED_SETTELMENT: "Расчёт срочных контрактов",
      STRATEGY_UMFUTURES_TRANSFER_IN: "Перевод из GridBot",
      STRATEGY_UMFUTURES_TRANSFER_OUT: "Перевод в GridBot",
      FUTURES_PRESENT: "Подарки Futures",
      EVENT_CONTRACTS_ORDER: "Контракты-события — отправка",
      EVENT_CONTRACTS_PAYOUT: "Контракты-события — выплата",
      BFUSD_REWARD: "Награды BUSD",
      API_REBATE: "API-ребейт",
      CONTEST_REWARD: "Приз конкурса",
      INTERNAL: "Прочее внутреннее",
      OTHER: "Прочие операции",
      COIN_SWAP: "Обмен (Swap)",
      AUTO_EXCHANGE: "Авто-конвертация",
      TRANSFER_IN: "Переводы (входящие)",
      TRANSFER_OUT: "Переводы (исходящие)",
    },
    swapsOutIn: (out, inn) => `Списано в обмен: ${out} — Получено: ${inn}`,
    autoOutIn: (out, inn) => `Преобразовано из: ${out} — Преобразовано в: ${inn}`,
    totalEffect: "Суммарный эффект за период (по активам):",
    finalWallet: "Итоговый баланс кошелька (расчёт):",
    none: "Нет данных",
  },
} as const;

// Types of interest & grouping
const TYPE = {
  REALIZED_PNL: "REALIZED_PNL",
  COMMISSION: "COMMISSION",
  FUNDING_FEE: "FUNDING_FEE",
  INSURANCE_CLEAR: "INSURANCE_CLEAR",
  REFERRAL_KICKBACK: "REFERRAL_KICKBACK",
  COMISSION_REBATE: "COMISSION_REBATE",
  CASH_COUPON: "CASH_COUPON",
  POSITION_LIMIT_INCREASE_FEE: "POSITION_LIMIT_INCREASE_FEE",
  POSITION_CLAIM_TRANSFER: "POSITION_CLAIM_TRANSFER",
  DELIVERED_SETTELMENT: "DELIVERED_SETTELMENT",
  STRATEGY_UMFUTURES_TRANSFER: "STRATEGY_UMFUTURES_TRANSFER",
  FUTURES_PRESENT: "FUTURES_PRESENT",
  EVENT_CONTRACTS_ORDER: "EVENT_CONTRACTS_ORDER",
  EVENT_CONTRACTS_PAYOUT: "EVENT_CONTRACTS_PAYOUT",
  COIN_SWAP_DEPOSIT: "COIN_SWAP_DEPOSIT",     // Out (deposited to swap)
  COIN_SWAP_WITHDRAW: "COIN_SWAP_WITHDRAW",   // In (received from swap)
  AUTO_EXCHANGE: "AUTO_EXCHANGE",
  TRANSFER: "TRANSFER",
  BFUSD_REWARD: "BFUSD_REWARD",
  API_REBATE: "API_REBATE",
  CONTEST_REWARD: "CONTEST_REWARD",
} as const;

const DUST_ASSETS = new Set(["BFUSD", "FDUSD", "LDUSDT"]);
const DUST_EPS = 1e-6;

// ---------- formatting helpers ----------
export function fmtExact(n: number): string {
  if (Object.is(n, -0)) return "0";
  const s = String(n);
  if (/e-?\d+$/i.test(s)) {
    const mag = Math.ceil(Math.abs(Math.log10(Math.abs(n) || 1)));
    const places = Math.min(30, mag + 18);
    return Number(n).toFixed(places).replace(/\.?0+$/, "");
  }
  return s;
}

function fmtAssetMap(map: Record<string, number>): string {
  const parts: string[] = [];
  for (const asset of Object.keys(map)) {
    const val = map[asset];
    parts.push(`${asset} ${fmtExact(val)}`);
  }
  return parts.join("  •  ");
}

function pushIfAny(lines: string[], label: string, body: string | undefined) {
  if (!body) return;
  const clean = body.trim();
  if (clean.length === 0) return;
  lines.push(`${label}: ${clean}`);
}

// Split positive / negative for a row array; returns per asset sums
function splitBySign(rows: Row[]) {
  const pos: Record<string, number> = {};
  const neg: Record<string, number> = {};
  for (const r of rows) {
    if (r.amount > 0) {
      pos[r.asset] = (pos[r.asset] || 0) + r.amount;
    } else if (r.amount < 0) {
      neg[r.asset] = (neg[r.asset] || 0) + Math.abs(r.amount);
    }
  }
  return { pos, neg };
}

// For a given set, return "ASSET +x  •  ASSET2 -y" style lists separately.
function listPos(map: Record<string, number>) {
  return Object.keys(map)
    .map((a) => `${a} +${fmtExact(map[a])}`)
    .join("  •  ");
}
function listNeg(map: Record<string, number>) {
  return Object.keys(map)
    .map((a) => `${a} -${fmtExact(map[a])}`)
    .join("  •  ");
}

// ---------- core computations ----------
export function computeFinalBalances(
  rows: Row[],
  opts: {
    anchorTs?: number;
    endTs?: number;
    baseline?: Record<string, number>;
    anchorTransfer?: { amount: number; asset: string };
  }
): Record<string, number> {
  const { anchorTs = Number.NEGATIVE_INFINITY, endTs, baseline, anchorTransfer } = opts;

  // Start with baseline balances if any
  const acc: Record<string, number> = {};
  if (baseline) {
    for (const a of Object.keys(baseline)) acc[a] = (acc[a] || 0) + baseline[a];
  }

  // Apply anchor transfer first (if provided)
  if (anchorTransfer && anchorTransfer.asset) {
    acc[anchorTransfer.asset] = (acc[anchorTransfer.asset] || 0) + anchorTransfer.amount;
  }

  // Sum net effect in range [anchor, end]
  for (const r of rows) {
    if (r.ts < anchorTs) continue;
    if (endTs !== undefined && r.ts > endTs) continue;
    acc[r.asset] = (acc[r.asset] || 0) + r.amount;
  }

  return acc;
}

// ---------- Narrative ----------
export function buildNarrativeParagraphs(
  rows: Row[],
  anchorISO: string | undefined,
  ctx: {
    initialBalances?: Record<string, number>;
    anchorTransfer?: { amount: number; asset: string };
    lang: Lang;
  },
  auditCtx?: {
    rows: Row[];
    audit: { anchorTs?: number; endTs?: number; baseline?: Record<string, number>; anchorTransfer?: { amount: number; asset: string } };
  }
): string {
  const t = L[ctx.lang];
  const lines: string[] = [];

  // Notice
  lines.push(t.utcNotice);

  // Optional anchor narrative
  if (anchorISO && ctx.anchorTransfer && ctx.initialBalances) {
    const asset = ctx.anchorTransfer.asset;
    const amt = fmtExact(ctx.anchorTransfer.amount);
    const before = fmtExact(ctx.initialBalances[asset] || 0);
    const after = fmtExact((ctx.initialBalances[asset] || 0) + ctx.anchorTransfer.amount);
    lines.push(
      t.anchorWithTransfer(anchorISO, amt, asset, before, after)
    );
    lines.push(t.afterAnchor);
  } else if (anchorISO && ctx.initialBalances) {
    // Only anchor + a referenced balance (pick the first asset for wording)
    const asset = Object.keys(ctx.initialBalances)[0] || "USDT";
    const bal = fmtExact(ctx.initialBalances[asset] || 0);
    lines.push(t.anchorOnly(anchorISO, bal, asset));
    lines.push(t.afterAnchor);
  } else {
    lines.push(t.introNoAnchor);
  }

  // Filter range rows for narrative display (no end bound here; Drawer already filters for table)
  const anchorTs = auditCtx?.audit.anchorTs ?? Number.NEGATIVE_INFINITY;
  const endTs = auditCtx?.audit.endTs;
  const rRows = rows.filter((r) => r.ts >= anchorTs && (endTs === undefined || r.ts <= endTs));

  // Helper to format section with + and - separately; DO NOT net in the line
  function sectionByType(label: string, predicate: (r: Row) => boolean, custom?: (rows: Row[]) => string | undefined) {
    const rs = rRows.filter(predicate);
    if (!rs.length) return;

    if (custom) {
      const body = custom(rs);
      if (body && body.trim()) lines.push(`${label}: ${body}`);
      return;
    }

    const { pos, neg } = splitBySign(rs);
    const parts: string[] = [];
    if (Object.keys(pos).length) parts.push(listPos(pos));
    if (Object.keys(neg).length) parts.push(listNeg(neg));
    if (parts.length) lines.push(`${label}: ${parts.join("  /  ")}`);
  }

  const S = t.sections;

  // Realized Profit (only positives of REALIZED_PNL)
  sectionByType(
    S.REALIZED_PROFIT,
    (r) => r.type === TYPE.REALIZED_PNL && r.amount > 0
  );

  // Realized Loss (only negatives of REALIZED_PNL) — show as negatives
  sectionByType(
    S.REALIZED_LOSS,
    (r) => r.type === TYPE.REALIZED_PNL && r.amount < 0
  );

  // Trading Fees (COMMISSION) — usually negatives
  sectionByType(S.COMMISSION, (r) => r.type === TYPE.COMMISSION);

  // Funding Fees (FUNDING_FEE) — both directions, but show + and - separately
  sectionByType(S.FUNDING_FEE, (r) => r.type === TYPE.FUNDING_FEE);

  // Insurance/Liquidation
  sectionByType(S.INSURANCE_CLEAR, (r) => r.type === TYPE.INSURANCE_CLEAR);

  // Referral incomes
  sectionByType(S.REFERRAL_KICKBACK, (r) => r.type === TYPE.REFERRAL_KICKBACK);

  // Trading fee rebates
  sectionByType(S.COMISSION_REBATE, (r) => r.type === TYPE.COMISSION_REBATE);

  // Gift money
  sectionByType(S.CASH_COUPON, (r) => r.type === TYPE.CASH_COUPON);

  // Position limit increase fee
  sectionByType(
    S.POSITION_LIMIT_INCREASE_FEE,
    (r) => r.type === TYPE.POSITION_LIMIT_INCREASE_FEE
  );

  // Free positions
  sectionByType(
    S.POSITION_CLAIM_TRANSFER,
    (r) => r.type === TYPE.POSITION_CLAIM_TRANSFER
  );

  // Delivery settlement
  sectionByType(
    S.DELIVERED_SETTELMENT,
    (r) => r.type === TYPE.DELIVERED_SETTELMENT
  );

  // Strategy transfers: split IN/OUT by sign
  sectionByType(
    S.STRATEGY_UMFUTURES_TRANSFER_IN,
    (r) => r.type === TYPE.STRATEGY_UMFUTURES_TRANSFER && r.amount > 0
  );
  sectionByType(
    S.STRATEGY_UMFUTURES_TRANSFER_OUT,
    (r) => r.type === TYPE.STRATEGY_UMFUTURES_TRANSFER && r.amount < 0
  );

  // Futures presents
  sectionByType(S.FUTURES_PRESENT, (r) => r.type === TYPE.FUTURES_PRESENT);

  // Event contracts
  sectionByType(S.EVENT_CONTRACTS_ORDER, (r) => r.type === TYPE.EVENT_CONTRACTS_ORDER);
  sectionByType(S.EVENT_CONTRACTS_PAYOUT, (r) => r.type === TYPE.EVENT_CONTRACTS_PAYOUT);

  // BUSD reward
  sectionByType(S.BFUSD_REWARD, (r) => r.type === TYPE.BFUSD_REWARD);

  // API rebate
  sectionByType(S.API_REBATE, (r) => r.type === TYPE.API_REBATE);

  // Contest reward
  sectionByType(S.CONTEST_REWARD, (r) => r.type === TYPE.CONTEST_REWARD);

  // Transfers (split)
  sectionByType(S.TRANSFER_IN, (r) => r.type === TYPE.TRANSFER && r.amount > 0);
  sectionByType(S.TRANSFER_OUT, (r) => r.type === TYPE.TRANSFER && r.amount < 0);

  // Coin swaps: DEPOSIT (out) / WITHDRAW (in) — very explicit
  sectionByType(S.COIN_SWAP, (r) =>
    r.type === TYPE.COIN_SWAP_DEPOSIT || r.type === TYPE.COIN_SWAP_WITHDRAW,
    (rs) => {
      const outRows = rs.filter((x) => x.type === TYPE.COIN_SWAP_DEPOSIT);
      const inRows = rs.filter((x) => x.type === TYPE.COIN_SWAP_WITHDRAW);
      const out = listPos(sumByAbs(outRows)); // DEPOSIT absolute "out"
      const inn = listPos(sumByAbs(inRows));  // WITHDRAW absolute "in"
      if (!out && !inn) return undefined;
      return t.swapsOutIn(out || t.none, inn || t.none);
    }
  );

  // Auto-Exchange: show converted out/in (absolute)
  sectionByType(S.AUTO_EXCHANGE, (r) => r.type === TYPE.AUTO_EXCHANGE, (rs) => {
    const out = listPos(sumByAbs(rs.filter((x) => x.amount < 0)));
    const inn = listPos(sumByAbs(rs.filter((x) => x.amount > 0)));
    if (!out && !inn) return undefined;
    return t.autoOutIn(out || t.none, inn || t.none);
  });

  // Any remaining/unknown types → "Other Transactions"
  const known = new Set(Object.values(TYPE));
  const other = rRows.filter((r) => !known.has(r.type));
  if (other.length) {
    sectionByType(S.OTHER, () => true, () => {
      const { pos, neg } = splitBySign(other);
      const parts: string[] = [];
      if (Object.keys(pos).length) parts.push(listPos(pos));
      if (Object.keys(neg).length) parts.push(listNeg(neg));
      return parts.join("  /  ");
    });
  }

  // Total effect (by asset), then final wallet balances
  const final = computeFinalBalances(rows, auditCtx?.audit || {});
  const effect: Record<string, number> = {};
  for (const r of rRows) {
    effect[r.asset] = (effect[r.asset] || 0) + r.amount;
  }

  // Effect line — include all assets (but keep exact numbers)
  const effParts: string[] = [];
  Object.keys(effect)
    .sort()
    .forEach((a) => {
      effParts.push(`${a} ${fmtExact(effect[a])}`);
    });
  if (effParts.length) {
    lines.push("");
    lines.push(`${t.totalEffect} ${effParts.join("  •  ")}`);
  }

  // Final wallet Balanes — suppress dust on BFUSD/FDUSD/LDUSDT
  const finParts: string[] = [];
  Object.keys(final)
    .sort()
    .forEach((a) => {
      const v = final[a];
      if (DUST_ASSETS.has(a) && Math.abs(v) < DUST_EPS) return; // suppress
      finParts.push(`${a}  ${fmtExact(v)}`);
    });
  if (finParts.length) {
    lines.push("");
    lines.push(`${t.finalWallet} ${finParts.join("  •  ")}`);
  }

  return lines.join("\n");
}

function sumByAbs(rows: Row[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) {
    m[r.asset] = (m[r.asset] || 0) + Math.abs(r.amount);
  }
  return m;
}

// ---------- Agent Audit (compact text) ----------
export function buildAudit(
  rows: Row[],
  opts: {
    anchorTs?: number;
    endTs?: number;
    baseline?: Record<string, number>;
    anchorTransfer?: { amount: number; asset: string };
  },
  lang: Lang
): string {
  const t = L[lang];
  const final = computeFinalBalances(rows, opts);

  const out: string[] = [];
  out.push("Final wallet balance (computed):");

  const assets = Object.keys(final).sort();
  for (const a of assets) {
    const v = final[a];
    if (DUST_ASSETS.has(a) && Math.abs(v) < DUST_EPS) continue; // suppress dust
    out.push(`  • ${a}  ${fmtExact(v)}`);
  }
  if (out.length === 1) out.push("  • " + t.none);
  return out.join("\n");
}

// ---------- Summary table (for the colored table in drawer) ----------
export function buildSummaryRows(rows: Row[]): Array<{
  label: string; // type label
  asset: string;
  in: number;
  out: number;
  net: number;
}> {
  // Group by type + asset (with some label normalization)
  const acc: Record<string, { asset: string; label: string; in: number; out: number }> = {};

  function push(typeLabel: string, r: Row) {
    const k = `${typeLabel}__${r.asset}`;
    if (!acc[k]) acc[k] = { asset: r.asset, label: typeLabel, in: 0, out: 0 };
    if (r.amount > 0) acc[k].in += r.amount;
    else if (r.amount < 0) acc[k].out += Math.abs(r.amount);
  }

  for (const r of rows) {
    let label = r.type;

    // Normalize a few labels for readability
    switch (r.type) {
      case TYPE.REALIZED_PNL:
        label = r.amount >= 0 ? "Realized Profit" : "Realized Loss";
        break;
      case TYPE.COIN_SWAP_DEPOSIT:
        label = "Coin Swap — Out";
        break;
      case TYPE.COIN_SWAP_WITHDRAW:
        label = "Coin Swap — In";
        break;
      case TYPE.STRATEGY_UMFUTURES_TRANSFER:
        label = r.amount >= 0 ? "GridBot — In" : "GridBot — Out";
        break;
      case TYPE.EVENT_CONTRACTS_ORDER:
        label = "Event Contracts — Order";
        break;
      case TYPE.EVENT_CONTRACTS_PAYOUT:
        label = "Event Contracts — Payout";
        break;
      default:
        // keep original for other types
        break;
    }

    push(label, r);
  }

  const rowsOut: Array<{ label: string; asset: string; in: number; out: number; net: number }> = [];
  for (const k of Object.keys(acc)) {
    const it = acc[k];
    rowsOut.push({
      label: it.label,
      asset: it.asset,
      in: it.in,
      out: it.out,
      net: it.in - it.out,
    });
  }

  // stable order: label, then asset
  rowsOut.sort((a, b) => (a.label === b.label ? a.asset.localeCompare(b.asset) : a.label.localeCompare(b.label)));
  return rowsOut;
}
