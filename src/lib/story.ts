// src/lib/story.ts
// Pure utilities for narrative/audit/summary. No React imports here.

export type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

export type SummaryRow = { label: string; asset: string; in: number; out: number; net: number };

// ---------------- Formatting ----------------
const EPS = 1e-12;
export function fmt(v: number) {
  // “kuruşuna kadar” – tüm küsurat korunur; gereksiz 0’ları budar
  const s = v.toFixed(18).replace(/0+$/,"").replace(/\.$/,"");
  return s === "-0" ? "0" : s;
}
export function fmtSignedPlus(v: number) { return (v >= 0 ? "+" : "") + fmt(v); }
export function nonZero(v: number) { return Math.abs(v) > EPS; }

// ---------------- Known TYPE / i18n ----------------
export type Lang = "en" | "tr" | "ar" | "vi" | "ru";

const DICT: Record<Lang, Record<string,string>> = {
  en: {
    // sections
    infoUTC: "All dates and times are UTC+0. Please adjust for your time zone.",
    narrative: "Narrative",
    afterThisTransfer: "If we check your transaction records after this transfer:",
    yourRecords: "Here are your transaction records:",
    anchorOnly: "At this date and time your Futures USDs-M Wallet balance was:",
    anchorTransferTitle: "At this date and time, you transferred",
    anchorTransferTo: "to your Futures USDs-M Wallet. After this transfer your balance increased from",
    to: "to",
    // lines
    realizedProfit: "Realized Profit",
    realizedLoss: "Realized Loss",
    tradingFees: "Trading Fees",
    fundingFees: "Funding Fees",
    liqInsurance: "Liquidation/Insurance Clearance Fees",
    referralIncomes: "Referral Incomes",
    feeRebates: "Trading Fee Rebates",
    giftMoney: "Gift Money",
    posLimitIncrease: "Position Limit Increase Fee",
    freePositions: "Free Positions",
    deliverySettle: "Delivery Contracts Settlement Amount",
    gridTo: "Transfer To the GridBot",
    gridFrom: "Transfer From the GridBot",
    futuresPresents: "Futures Presents",
    eventsOrder: "Event Contracts — Order",
    eventsPayout: "Event Contracts — Payout",
    busdReward: "BUSD Reward",
    coinSwap: "Coin Swaps",
    coinSwapLine: "Swapped out: {out} — Received: {in}",
    autoExchange: "Auto-Exchange",
    autoExLine: "Converted out: {out} — Converted in: {in}",
    otherTx: "Other Transactions",
    overall: "Total effect in this range (by asset)",
    finalAfter: "Final wallet balance (computed)",
  },
  tr: {
    infoUTC: "Paylaşacağımız tüm tarih ve saatler UTC+0’dır. Lütfen kendi saat diliminize göre yorumlayın.",
    narrative: "Hikâye",
    afterThisTransfer: "Bu transferden sonraki işlem kayıtlarınıza bakarsak:",
    yourRecords: "İşlem kayıtlarınız şöyle:",
    anchorOnly: "Bu tarih ve saatte Futures USDs-M cüzdan bakiyeniz:",
    anchorTransferTitle: "Bu tarih ve saatte",
    anchorTransferTo: "tutarını Futures USDs-M cüzdanınıza aktardınız. Bu transferden sonra bakiyeniz",
    to: "→",
    realizedProfit: "Gerçekleşmiş Kâr",
    realizedLoss: "Gerçekleşmiş Zarar",
    tradingFees: "İşlem Ücretleri",
    fundingFees: "Funding Ücretleri",
    liqInsurance: "Likidasyon/Insurance Fon Kesintileri",
    referralIncomes: "Referans Gelirleri",
    feeRebates: "Komisyon İadeleri",
    giftMoney: "Hediye (Kupon)",
    posLimitIncrease: "Pozisyon Limit Artış Ücreti",
    freePositions: "Ücretsiz Pozisyonlar",
    deliverySettle: "Teslim Sözleşmeleri (Settlement)",
    gridTo: "GridBot’a Transfer",
    gridFrom: "GridBot’tan Transfer",
    futuresPresents: "Futures Hediyeleri",
    eventsOrder: "Event Contracts — Order",
    eventsPayout: "Event Contracts — Payout",
    busdReward: "BUSD Ödülü",
    coinSwap: "Coin Swap",
    coinSwapLine: "Çıkış: {out} — Giriş: {in}",
    autoExchange: "Otomatik Dönüşüm (Auto-Exchange)",
    autoExLine: "Dönüştürülen: {out} — Alınan: {in}",
    otherTx: "Diğer İşlemler",
    overall: "Bu aralıkta toplam etki (varlık bazında)",
    finalAfter: "Hesaplanan nihai cüzdan bakiyesi",
  },
  ar: {
    infoUTC: "جميع التواريخ والأوقات بتوقيت UTC+0. الرجاء ضبط منطقتك الزمنية وفقًا لذلك.",
    narrative: "السرد",
    afterThisTransfer: "إذا فحصنا سجلاتك بعد هذا التحويل:",
    yourRecords: "إليك سجلات معاملاتك:",
    anchorOnly: "في هذا التاريخ والوقت كان رصيد محفظة العقود الدائمة USDs-M لديك:",
    anchorTransferTitle: "في هذا التاريخ والوقت قمت بتحويل",
    anchorTransferTo: "إلى محفظة العقود الدائمة USDs-M. بعد التحويل أصبح الرصيد من",
    to: "إلى",
    realizedProfit: "الربح المحقق",
    realizedLoss: "الخسارة المحققة",
    tradingFees: "رسوم التداول",
    fundingFees: "رسوم التمويل",
    liqInsurance: "رسوم التصفية/صندوق التأمين",
    referralIncomes: "عائدات الإحالة",
    feeRebates: "استردادات الرسوم",
    giftMoney: "أموال الهدايا",
    posLimitIncrease: "رسوم زيادة حد المركز",
    freePositions: "مراكز مجانية",
    deliverySettle: "تسوية عقود التسليم",
    gridTo: "تحويل إلى GridBot",
    gridFrom: "تحويل من GridBot",
    futuresPresents: "هدايا العقود الدائمة",
    eventsOrder: "عقود الأحداث — أمر",
    eventsPayout: "عقود الأحداث — دفعة",
    busdReward: "مكافأة BUSD",
    coinSwap: "تحويل العملات (Coin Swap)",
    coinSwapLine: "المُحوّل للخارج: {out} — المستلم: {in}",
    autoExchange: "التحويل التلقائي (Auto-Exchange)",
    autoExLine: "تم تحويله للخارج: {out} — الوارد: {in}",
    otherTx: "معاملات أخرى",
    overall: "الأثر الإجمالي في هذه الفترة (حسب الأصل)",
    finalAfter: "الرصيد النهائي للمحفظة (محسوب)",
  },
  vi: {
    infoUTC: "Mọi ngày giờ đều theo UTC+0. Vui lòng quy đổi theo múi giờ của bạn.",
    narrative: "Tường thuật",
    afterThisTransfer: "Sau chuyển khoản này, nhật ký giao dịch như sau:",
    yourRecords: "Nhật ký giao dịch của bạn:",
    anchorOnly: "Tại thời điểm này, số dư ví Futures USDs-M của bạn là:",
    anchorTransferTitle: "Tại thời điểm này, bạn đã chuyển",
    anchorTransferTo: "vào ví Futures USDs-M. Sau chuyển khoản số dư tăng từ",
    to: "đến",
    realizedProfit: "Lãi đã chốt",
    realizedLoss: "Lỗ đã chốt",
    tradingFees: "Phí giao dịch",
    fundingFees: "Phí funding",
    liqInsurance: "Phí thanh lý/Bảo hiểm",
    referralIncomes: "Thu nhập giới thiệu",
    feeRebates: "Hoàn phí giao dịch",
    giftMoney: "Tiền thưởng/phiếu",
    posLimitIncrease: "Phí tăng hạn mức vị thế",
    freePositions: "Vị thế miễn phí",
    deliverySettle: "Thanh toán hợp đồng giao nhận",
    gridTo: "Chuyển sang GridBot",
    gridFrom: "Chuyển từ GridBot",
    futuresPresents: "Quà tặng Futures",
    eventsOrder: "Event Contracts — Order",
    eventsPayout: "Event Contracts — Payout",
    busdReward: "Thưởng BUSD",
    coinSwap: "Coin Swap",
    coinSwapLine: "Đã hoán đổi ra: {out} — Nhận về: {in}",
    autoExchange: "Auto-Exchange",
    autoExLine: "Đổi ra: {out} — Nhận: {in}",
    otherTx: "Giao dịch khác",
    overall: "Tổng ảnh hưởng trong kỳ (theo tài sản)",
    finalAfter: "Số dư ví cuối (tính toán)",
  },
  ru: {
    infoUTC: "Все даты и время указаны в UTC+0. Пожалуйста, учитывайте ваш часовой пояс.",
    narrative: "История",
    afterThisTransfer: "После этого перевода в ваших записях:",
    yourRecords: "Ваши записи операций:",
    anchorOnly: "На этот момент баланс кошелька Futures USDs-M был:",
    anchorTransferTitle: "В этот момент вы перевели",
    anchorTransferTo: "на кошелек Futures USDs-M. После перевода баланс изменился с",
    to: "на",
    realizedProfit: "Зафиксированная прибыль",
    realizedLoss: "Зафиксированный убыток",
    tradingFees: "Комиссии за торговлю",
    fundingFees: "Funding комиссии",
    liqInsurance: "Страховой/ликвидационный сбор",
    referralIncomes: "Реферальные доходы",
    feeRebates: "Ребейты комиссий",
    giftMoney: "Подарки/купоны",
    posLimitIncrease: "Плата за увеличение лимита позиции",
    freePositions: "Бесплатные позиции",
    deliverySettle: "Расчеты по поставочным контрактам",
    gridTo: "Перевод в GridBot",
    gridFrom: "Перевод из GridBot",
    futuresPresents: "Подарки Futures",
    eventsOrder: "Event Contracts — Order",
    eventsPayout: "Event Contracts — Payout",
    busdReward: "Награда BUSD",
    coinSwap: "Coin Swap",
    coinSwapLine: "Отдано: {out} — Получено: {in}",
    autoExchange: "Auto-Exchange",
    autoExLine: "Преобразовано: {out} — Зачислено: {in}",
    otherTx: "Прочие операции",
    overall: "Суммарный эффект за период (по активам)",
    finalAfter: "Итоговый баланс кошелька (расчет)",
  }
};

// TYPE keys possibly present in logs (extendable)
export const TYPE = {
  TRANSFER: "TRANSFER",
  REALIZED_PNL: "REALIZED_PNL",
  FUNDING_FEE: "FUNDING_FEE",
  COMMISSION: "COMMISSION",
  INSURANCE_CLEAR: "INSURANCE_CLEAR",
  WELCOME_BONUS: "WELCOME_BONUS",
  REFERRAL_KICKBACK: "REFERRAL_KICKBACK",
  COMISSION_REBATE: "COMISSION_REBATE",
  CASH_COUPON: "CASH_COUPON",
  COIN_SWAP_DEPOSIT: "COIN_SWAP_DEPOSIT",
  COIN_SWAP_WITHDRAW: "COIN_SWAP_WITHDRAW",
  POSITION_LIMIT_INCREASE_FEE: "POSITION_LIMIT_INCREASE_FEE",
  POSITION_CLAIM_TRANSFER: "POSITION_CLAIM_TRANSFER",
  AUTO_EXCHANGE: "AUTO_EXCHANGE",
  DELIVERED_SETTELMENT: "DELIVERED_SETTELMENT",
  STRATEGY_UMFUTURES_TRANSFER: "STRATEGY_UMFUTURES_TRANSFER",
  FUTURES_PRESENT: "FUTURES_PRESENT",
  EVENT_CONTRACTS_ORDER: "EVENT_CONTRACTS_ORDER",
  EVENT_CONTRACTS_PAYOUT: "EVENT_CONTRACTS_PAYOUT",
  INTERNAL_COMMISSION: "INTERNAL_COMMISSION",
  INTERNAL_TRANSFER: "INTERNAL_TRANSFER",
  BFUSD_REWARD: "BFUSD_REWARD",
  INTERNAL_AGENT_REWARD: "INTERNAL_AGENT_REWARD",
  API_REBATE: "API_REBATE",
  CONTEST_REWARD: "CONTEST_REWARD",
  INTERNAL_CONTEST_REWARD: "INTERNAL_CONTEST_REWARD",
  CROSS_COLLATERAL_TRANSFER: "CROSS_COLLATERAL_TRANSFER",
  OPTIONS_PREMIUM_FEE: "OPTIONS_PREMIUM_FEE",
  OPTIONS_SETTLE_PROFIT: "OPTIONS_SETTLE_PROFIT",
  LIEN_CLAIM: "LIEN_CLAIM",
  INTERNAL_COMMISSION_REBATE: "INTERNAL_COMMISSION_REBATE",
  FEE_RETURN: "FEE_RETURN",
  FUTURES_PRESENT_SPONSOR_REFUND: "FUTURES_PRESENT_SPONSOR_REFUND",
} as const;

type Totals = Record<string, { pos: number; neg: number; net: number }>;
export function totalsByType(rows: Row[]) {
  const map: Record<string, Totals> = {};
  for (const r of rows) {
    const tt = (map[r.type] = map[r.type] || {});
    const m = (tt[r.asset] = tt[r.asset] || { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) m.pos += r.amount; else m.neg += Math.abs(r.amount);
    m.net += r.amount;
  }
  return map;
}

// ---------- Narrative builder ----------
export function buildNarrativeParagraphs(
  rows: Row[],
  anchorISO?: string,
  opts?: {
    initialBalances?: Record<string, number>;
    anchorTransfer?: { asset: string; amount: number };
    lang?: Lang;
  }
): string {
  const L = DICT[opts?.lang || "en"];
  const tmap = totalsByType(rows);

  // Helper to print a line for a “label: assets (positive/negative grouping)”.
  function lineFor(label: string, fromTypes: string[] | "profitLoss" | "gridSplit") {
    const acc: Record<string, { in: number; out: number; net: number }> = {};
    if (fromTypes === "profitLoss") {
      const tt = tmap[TYPE.REALIZED_PNL] || {};
      for (const a of Object.keys(tt)) {
        const m = acc[a] || (acc[a] = { in: 0, out: 0, net: 0 });
        m.in += Math.max(0, tt[a].pos - 0);       // positive amounts
        m.out += Math.max(0, tt[a].neg - 0);      // negatives as separate
        m.net += tt[a].net;
      }
      const pos: string[] = [], neg: string[] = [];
      for (const a of Object.keys(acc)) {
        if (nonZero(acc[a].in))  pos.push(`${a}  ${fmt(acc[a].in)}`);
        if (nonZero(acc[a].out)) neg.push(`${a}  ${fmt(acc[a].out)}`);
      }
      const lines: string[] = [];
      if (pos.length) lines.push(`${L.realizedProfit}: ${pos.join("  •  ")}`);
      if (neg.length) lines.push(`${L.realizedLoss}: ${neg.join("  •  ")}`);
      return lines;
    }

    if (fromTypes === "gridSplit") {
      const tt = tmap[TYPE.STRATEGY_UMFUTURES_TRANSFER] || {};
      const toGrid: string[] = [], fromGrid: string[] = [];
      for (const a of Object.keys(tt)) {
        const pos = tt[a].pos, neg = tt[a].neg;
        if (nonZero(neg)) toGrid.push(`${a}  ${fmt(neg)}`);
        if (nonZero(pos)) fromGrid.push(`${a}  ${fmt(pos)}`);
      }
      const out: string[] = [];
      if (fromGrid.length) out.push(`${L.gridFrom}: ${fromGrid.join("  •  ")}`);
      if (toGrid.length)   out.push(`${L.gridTo}: ${toGrid.join("  •  ")}`);
      return out;
    }

    for (const k of (fromTypes as string[])) {
      const tt = tmap[k] || {};
      for (const a of Object.keys(tt)) {
        const m = (acc[a] = acc[a] || { in: 0, out: 0, net: 0 });
        m.in += tt[a].pos; m.out += tt[a].neg; m.net += tt[a].net;
      }
    }

    const pieces: string[] = [];
    for (const a of Object.keys(acc)) {
      const m = acc[a];
      const parts: string[] = [];
      if (nonZero(m.in))  parts.push(`+${fmt(m.in)}`);
      if (nonZero(m.out)) parts.push(`-${fmt(m.out)}`);
      if (!parts.length) continue;
      parts.push(`= ${fmt(m.net)}`);
      pieces.push(`${a}  ${parts.join("  /  ")}`);
    }
    return pieces.length ? [`${label}: ${pieces.join("  •  ")}`] : [];
  }

  // Coin Swap / Auto-Exchange – clear phrasing
  function swapOrAutoLines(kind: "coin" | "auto") {
    const deposit = kind === "coin" ? tmap[TYPE.COIN_SWAP_DEPOSIT] || {} : {};
    const withdraw = kind === "coin" ? tmap[TYPE.COIN_SWAP_WITHDRAW] || {} : {};
    const auto = kind === "auto" ? tmap[TYPE.AUTO_EXCHANGE] || {} : {};

    const outMap: Record<string, number> = {};
    const inMap:  Record<string, number> = {};

    if (kind === "coin") {
      for (const a of Object.keys(withdraw)) outMap[a] = (outMap[a] || 0) + withdraw[a].pos + withdraw[a].neg; // totals moved OUT (both signs mapped to absolute out)
      for (const a of Object.keys(deposit))  inMap[a]  = (inMap[a]  || 0) + deposit[a].pos + deposit[a].neg;
    } else {
      // Auto-exchange: negative is converted out, positive converted in (by asset totals)
      for (const a of Object.keys(auto)) {
        const m = auto[a];
        if (nonZero(m.neg)) outMap[a] = (outMap[a] || 0) + m.neg;
        if (nonZero(m.pos)) inMap[a]  = (inMap[a]  || 0) + m.pos;
      }
    }

    const outParts = Object.keys(outMap).filter(a => nonZero(outMap[a])).map(a => `${a} ${fmt(outMap[a])}`);
    const inParts  = Object.keys(inMap).filter(a => nonZero(inMap[a])).map(a  => `${a} ${fmt(inMap[a])}`);

    if (!outParts.length && !inParts.length) return [] as string[];

    const template = kind === "coin" ? DICT[opts?.lang || "en"].coinSwapLine : DICT[opts?.lang || "en"].autoExLine;
    const text = template
      .replace("{out}", outParts.length ? outParts.join("  •  ") : "—")
      .replace("{in}",  inParts.length  ? inParts.join("  •  ") : "—");

    return [(kind === "coin" ? DICT[opts?.lang || "en"].coinSwap : DICT[opts?.lang || "en"].autoExchange) + ": " + text];
  }

  // Build section lines
  const parts: string[] = [];
  parts.push(L.infoUTC);

  // Opening sentence by presence of anchor/baseline/transfer
  const transfer = opts?.anchorTransfer;
  const base = opts?.initialBalances;
  if (anchorISO && transfer && base && base[transfer.asset] !== undefined) {
    const before = base[transfer.asset] || 0;
    const after  = before + transfer.amount;
    parts.push(
      `${anchorISO} UTC+0 — ${L.anchorTransferTitle} ${fmt(transfer.amount)} ${transfer.asset} ${L.anchorTransferTo} ${fmt(before)} ${transfer.asset} ${L.to} ${fmt(after)} ${transfer.asset}.`,
      "",
      L.afterThisTransfer
    );
  } else if (anchorISO && base && Object.keys(base).length) {
    const list = Object.keys(base).map(a => `${a} ${fmt(base[a])}`).join("  •  ");
    parts.push(`${anchorISO} UTC+0 — ${L.anchorOnly} ${list}`, "", L.afterThisTransfer);
  } else if (anchorISO) {
    parts.push(`${anchorISO} UTC+0 — ${L.yourRecords}`, "");
  } else {
    parts.push(L.yourRecords, "");
  }

  // Detailed lines (only when present)
  parts.push(...lineFor("profitLoss", "profitLoss"));
  parts.push(...lineFor(L.tradingFees, [TYPE.COMMISSION]));
  parts.push(...lineFor(L.fundingFees, [TYPE.FUNDING_FEE]));
  parts.push(...lineFor(L.liqInsurance, [TYPE.INSURANCE_CLEAR]));
  parts.push(...lineFor(L.referralIncomes, [TYPE.REFERRAL_KICKBACK]));
  parts.push(...lineFor(L.feeRebates, [TYPE.COMISSION_REBATE]));
  parts.push(...lineFor(L.giftMoney, [TYPE.CASH_COUPON]));
  parts.push(...lineFor(L.posLimitIncrease, [TYPE.POSITION_LIMIT_INCREASE_FEE]));
  parts.push(...lineFor(L.freePositions, [TYPE.POSITION_CLAIM_TRANSFER]));
  parts.push(...lineFor(L.deliverySettle, [TYPE.DELIVERED_SETTELMENT]));
  parts.push(...lineFor(L.futuresPresents, [TYPE.FUTURES_PRESENT]));
  parts.push(...lineFor(L.eventsOrder, [TYPE.EVENT_CONTRACTS_ORDER]));
  parts.push(...lineFor(L.eventsPayout, [TYPE.EVENT_CONTRACTS_PAYOUT]));
  parts.push(...lineFor(L.busdReward, [TYPE.BFUSD_REWARD]));
  parts.push(...lineFor("gridSplit", "gridSplit"));
  parts.push(...swapOrAutoLines("coin"));
  parts.push(...swapOrAutoLines("auto"));

  // Unknown/Other types
  const known = new Set(Object.values(TYPE));
  const otherLines: string[] = [];
  for (const typeKey of Object.keys(tmap)) {
    if (known.has(typeKey as any)) continue;
    const m = tmap[typeKey];
    const items: string[] = [];
    for (const a of Object.keys(m)) {
      const entry = m[a];
      const segs: string[] = [];
      if (nonZero(entry.pos)) segs.push(`+${fmt(entry.pos)}`);
      if (nonZero(entry.neg)) segs.push(`-${fmt(entry.neg)}`);
      if (!segs.length) continue;
      segs.push(`= ${fmt(entry.net)}`);
      items.push(`${a}  ${segs.join("  /  ")}`);
    }
    if (items.length) otherLines.push(`• ${typeKey}: ${items.join("  •  ")}`);
  }
  if (otherLines.length) {
    parts.push("", DICT[opts?.lang || "en"].otherTx + ":", ...otherLines);
  }

  // Overall by asset
  const assetNet: Record<string, number> = {};
  for (const typeKey of Object.keys(tmap)) {
    const m = tmap[typeKey];
    for (const a of Object.keys(m)) assetNet[a] = (assetNet[a] || 0) + m[a].net;
  }
  const overall: string[] = [];
  for (const a of Object.keys(assetNet)) {
    if (!nonZero(assetNet[a])) continue;
    overall.push(`${a}  ${fmtSignedPlus(assetNet[a])}`);
  }
  if (overall.length) {
    parts.push("", `${L.overall}: ${overall.join("  •  ")}`);
  }

  // Final wallet balance (computed): baseline (+ optional anchor transfer) + net( this range )
  if (base && Object.keys(base).length) {
    const final: Record<string, number> = { ...base };
    if (transfer) final[transfer.asset] = (final[transfer.asset] || 0) + transfer.amount;
    for (const a of Object.keys(assetNet)) final[a] = (final[a] || 0) + assetNet[a];

    // Dust filter for BFUSD/FDUSD/LDUSDT per request
    for (const dust of ["BFUSD", "FDUSD", "LDUSDT"]) {
      if (Math.abs(final[dust] || 0) < 1e-7) delete final[dust];
    }

    const finalList = Object.keys(final)
      .filter(a => nonZero(final[a]))
      .sort()
      .map(a => `${a}  ${fmt(final[a])}`);
    if (finalList.length) {
      parts.push("", `${L.finalAfter}: ${finalList.join("  •  ")}`);
    }
  }

  // Remove empty lines that might have accumulated consecutively
  return parts.filter((l, i, arr) => !(l === "" && arr[i-1] === "")).join("\n");
}

// ---------- Summary table (Type & Asset) ----------
export function buildSummaryRows(rows: Row[]): SummaryRow[] {
  const t = totalsByType(rows);
  const out: SummaryRow[] = [];
  for (const typeKey of Object.keys(t)) {
    const m = t[typeKey];
    for (const asset of Object.keys(m)) {
      const e = m[asset];
      const row: SummaryRow = { label: typeKey, asset, in: 0, out: 0, net: 0 };
      if (nonZero(e.pos)) row.in = +fmt(e.pos);
      if (nonZero(e.neg)) row.out = +fmt(e.neg);
      if (nonZero(e.net)) row.net = +fmt(e.net);
      if (row.in || row.out || row.net) out.push(row);
    }
  }
  return out.sort((a,b) => a.label.localeCompare(b.label) || a.asset.localeCompare(b.asset));
}

// ---------- Agent audit text ----------
export function buildAudit(
  rows: Row[],
  params: {
    anchorTs: number;
    endTs?: number;
    baseline?: Record<string, number>;
    anchorTransfer?: { asset: string; amount: number };
  }
): string {
  const { anchorTs, endTs, baseline, anchorTransfer } = params;
  const inRange = rows.filter(r => r.ts >= anchorTs && (endTs ? r.ts <= endTs : true))
                      .sort((a,b) => a.ts - b.ts);

  const t = totalsByType(inRange);

  const lines: string[] = [];
  lines.push("Agent Balance Audit");
  lines.push(`Anchor (UTC+0): ${new Date(anchorTs).toISOString().replace("T"," ").replace("Z","")}${endTs ? `  →  End: ${new Date(endTs).toISOString().replace("T"," ").replace("Z","")}` : ""}`);
  if (baseline && Object.keys(baseline).length) {
    const bl = Object.keys(baseline).map(a => `${a} ${fmt(baseline[a])}`).join("  •  ");
    lines.push("", "Baseline (before anchor):", `  • ${bl}`);
  } else {
    lines.push("", "Baseline: not provided (rolling from zero).");
  }
  if (anchorTransfer) lines.push("", `Applied anchor transfer: ${fmtSignedPlus(anchorTransfer.amount)} ${anchorTransfer.asset}`);

  lines.push("", "Activity after anchor:");
  const perType: string[] = [];
  for (const typeKey of Object.keys(t).sort()) {
    const m = t[typeKey];
    const items: string[] = [];
    for (const a of Object.keys(m)) {
      const e = m[a];
      const segs: string[] = [];
      if (nonZero(e.pos)) segs.push(`+${fmt(e.pos)}`);
      if (nonZero(e.neg)) segs.push(`-${fmt(e.neg)}`);
      if (!segs.length) continue;
      segs.push(`= ${fmt(e.net)}`);
      items.push(`${a}  ${segs.join(" / ")}`);
    }
    if (items.length) perType.push(`• ${typeKey}: ${items.join("  •  ")}`);
  }
  if (perType.length) lines.push(...perType);
  else lines.push("  • No activity.");

  // Net effect and final expected balances
  const assetNet: Record<string, number> = {};
  for (const typeKey of Object.keys(t)) {
    const m = t[typeKey];
    for (const a of Object.keys(m)) assetNet[a] = (assetNet[a] || 0) + m[a].net;
  }
  lines.push("", "Net effect (after anchor):");
  const netLines = Object.keys(assetNet).filter(a => nonZero(assetNet[a]))
    .map(a => `  • ${a}  ${fmtSignedPlus(assetNet[a])}`);
  lines.push(...(netLines.length ? netLines : ["  • 0"]));

  if (baseline && Object.keys(baseline).length) {
    const final: Record<string, number> = { ...baseline };
    if (anchorTransfer) final[anchorTransfer.asset] = (final[anchorTransfer.asset] || 0) + anchorTransfer.amount;
    for (const a of Object.keys(assetNet)) final[a] = (final[a] || 0) + assetNet[a];

    // Dust filter
    for (const dust of ["BFUSD", "FDUSD", "LDUSDT"]) {
      if (Math.abs(final[dust] || 0) < 1e-7) delete final[dust];
    }

    const finalLines = Object.keys(final)
      .filter(a => nonZero(final[a]))
      .sort()
      .map(a => `  • ${a}  ${fmt(final[a])}`);
    if (finalLines.length) {
      lines.push("", "Final expected balances:", ...finalLines);
    }
  }

  return lines.join("\n");
}
