// src/lib/story.ts
// Narrative & Audit builder with multi-language labels and exact-precision sums.

export type Lang = "en" | "tr" | "ar" | "vi" | "ru";

export type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

type BuildNarrativeOpts = {
  initialBalances?: Record<string, number> | undefined;
  anchorTransfer?: { asset: string; amount: number } | undefined;
  lang: Lang;
};

type AuditOpts = {
  anchorTs: number;
  endTs?: number;
  baseline?: Record<string, number>;
  anchorTransfer?: { asset: string; amount: number };
};

export type SummaryRow = { label: string; asset: string; in: number; out: number; net: number };

// ---------- language & labels ----------
const L = {
  headerUTC: {
    en: "All dates and times are UTC+0. Please adjust for your time zone.",
    tr: "Tüm tarih ve saatler UTC+0’dır. Lütfen zaman diliminize göre yorumlayın.",
    ar: "جميع التواريخ والأوقات بتوقيت UTC+0. يرجى مواءمتها مع منطقتك الزمنية.",
    vi: "Tất cả ngày giờ theo UTC+0. Vui lòng điều chỉnh theo múi giờ của bạn.",
    ru: "Все дата и время указаны в UTC+0. Пожалуйста, учитывайте ваш часовой пояс.",
  },
  startWithAnchor: {
    en: (iso: string, a: number, asset: string, before?: number, after?: number) =>
      `${iso} — You transferred ${fmtNum(a)} ${asset} into your Futures USDs-M wallet.${numOk(before)&&numOk(after) ? ` After this transfer your balance moved from ${fmtNum(before)} ${asset} to ${fmtNum(after)} ${asset}.` : ""}`,
    tr: (iso: string, a: number, asset: string, before?: number, after?: number) =>
      `${iso} — Futures USDs-M cüzdanınıza ${fmtNum(a)} ${asset} transfer ettiniz.${numOk(before)&&numOk(after) ? ` Bu transferle ${asset} bakiyeniz ${fmtNum(before)} → ${fmtNum(after)} olarak güncellendi.` : ""}`,
    ar: (iso: string, a: number, asset: string, before?: number, after?: number) =>
      `${iso} — قمت بتحويل ${fmtNum(a)} ${asset} إلى محفظة العقود الدائمة (USDs-M).${numOk(before)&&numOk(after) ? ` أصبح رصيد ${asset} من ${fmtNum(before)} إلى ${fmtNum(after)}.` : ""}`,
    vi: (iso: string, a: number, asset: string, before?: number, after?: number) =>
      `${iso} — Bạn đã chuyển ${fmtNum(a)} ${asset} vào ví Futures USDs-M.${numOk(before)&&numOk(after) ? ` Số dư ${asset} thay đổi từ ${fmtNum(before)} lên ${fmtNum(after)}.` : ""}`,
    ru: (iso: string, a: number, asset: string, before?: number, after?: number) =>
      `${iso} — Вы перевели ${fmtNum(a)} ${asset} на кошелёк Futures USDs-M.${numOk(before)&&numOk(after) ? ` Баланс ${asset} изменился с ${fmtNum(before)} до ${fmtNum(after)}.` : ""}`,
  },
  startNoAnchor: {
    en: "Here are your transaction records:",
    tr: "İşlem kayıtlarınız aşağıdadır:",
    ar: "سجل معاملاتك كالتالي:",
    vi: "Các giao dịch của bạn:",
    ru: "Ваши записи операций:",
  },
  startWithBalance: {
    en: (iso: string, balTxt: string) => `${iso} — At this time your Futures USDs-M wallet balance was: ${balTxt}`,
    tr: (iso: string, balTxt: string) => `${iso} — Bu anda Futures USDs-M cüzdan bakiyeniz: ${balTxt}`,
    ar: (iso: string, balTxt: string) => `${iso} — في هذا الوقت كان رصيد محفظتك USDs-M: ${balTxt}`,
    vi: (iso: string, balTxt: string) => `${iso} — Tại thời điểm này số dư ví USDs-M của bạn là: ${balTxt}`,
    ru: (iso: string, balTxt: string) => `${iso} — В это время баланс кошелька USDs-M: ${balTxt}`,
  },
  afterAnchorIntro: {
    en: "If we review your transaction records after this point:",
    tr: "Bu noktadan sonraki işlem kayıtlarını incelediğimizde:",
    ar: "إذا راجعنا السجلات بعد هذه اللحظة:",
    vi: "Xem các giao dịch sau mốc này:",
    ru: "Если посмотреть операции после этой точки:",
  },
  finalWallet: {
    en: (txt: string) => `Final wallet balance: ${txt}`,
    tr: (txt: string) => `Nihai cüzdan bakiyesi: ${txt}`,
    ar: (txt: string) => `الرصيد النهائي للمحفظة: ${txt}`,
    vi: (txt: string) => `Số dư ví cuối: ${txt}`,
    ru: (txt: string) => `Итоговый баланс кошелька: ${txt}`,
  },
  other: {
    en: "Other Transactions",
    tr: "Diğer İşlemler",
    ar: "عمليات أخرى",
    vi: "Giao dịch khác",
    ru: "Прочие операции",
  },
  // Section titles
  sections: {
    REALIZED_PNL: { en: "Realized PnL", tr: "Gerçekleşen PnL", ar: "الأرباح/الخسائر المحققة", vi: "Lãi/Lỗ đã thực hiện", ru: "Реализованная PnL" },
    COMMISSION: { en: "Trading Fees", tr: "Komisyonlar", ar: "رسوم التداول", vi: "Phí giao dịch", ru: "Комиссии" },
    FUNDING_FEE: { en: "Funding Fees", tr: "Funding", ar: "تمويل", vi: "Funding", ru: "Funding" },
    INSURANCE_CLEAR: { en: "Liquidation / Insurance Clearance", tr: "Likidasyon / Sigorta", ar: "التصفية/صندوق التأمين", vi: "Thanh lý / Quỹ bảo hiểm", ru: "Ликвидация/Фонд" },
    REFERRAL_KICKBACK: { en: "Referral Incomes", tr: "Referral Gelirleri", ar: "عوائد الإحالة", vi: "Hoa hồng giới thiệu", ru: "Реферальные" },
    COMISSION_REBATE: { en: "Trading Fee Rebates", tr: "Komisyon İadeleri", ar: "استرداد رسوم", vi: "Hoàn phí", ru: "Ребейты" },
    CASH_COUPON: { en: "Gift Money", tr: "Hediye Para", ar: "قسائم/هدايا", vi: "Tiền thưởng", ru: "Подарочные средства" },
    POSITION_LIMIT_INCREASE_FEE: { en: "Position Limit Increase Fee", tr: "Pozisyon Limit Artış Ücreti", ar: "رسوم زيادة الحد", vi: "Phí tăng hạn mức", ru: "Комиссия за лимит позиции" },
    POSITION_CLAIM_TRANSFER: { en: "Free Positions", tr: "Ücretsiz Pozisyonlar", ar: "مراكز مجانية", vi: "Vị thế miễn phí", ru: "Бесплатные позиции" },
    DELIVERED_SETTELMENT: { en: "Delivery Settlement", tr: "Teslimat Kapanışı", ar: "تسوية التسليم", vi: "Thanh toán hợp đồng giao", ru: "Расчёт поставочного" },
    STRATEGY_UMFUTURES_TRANSFER: { en: "Grid Bot Transfers", tr: "Grid Bot Transferleri", ar: "تحويلات Grid Bot", vi: "Chuyển Bot lưới", ru: "Переводы Grid-бота" },
    FUTURES_PRESENT: { en: "Futures Presents", tr: "Futures Hediyeleri", ar: "هدايا العقود", vi: "Quà tặng Futures", ru: "Подарки Futures" },
    EVENT_CONTRACTS_ORDER: { en: "Event Contracts — Order", tr: "Etkinlik Sözleşmeleri — Emir", ar: "عقود الأحداث — أمر", vi: "Hợp đồng sự kiện — Lệnh", ru: "Событийные контракты — Ордер" },
    EVENT_CONTRACTS_PAYOUT: { en: "Event Contracts — Payout", tr: "Etkinlik Sözleşmeleri — Ödeme", ar: "عقود الأحداث — عائد", vi: "Hợp đồng sự kiện — Trả thưởng", ru: "Событийные контракты — Выплата" },
    BFUSD_REWARD: { en: "BFUSD Reward", tr: "BFUSD Ödülü", ar: "مكافأة BFUSD", vi: "Thưởng BFUSD", ru: "Награда BFUSD" },
    AUTO_EXCHANGE: { en: "Auto-Exchange", tr: "Oto-Exchange", ar: "التحويل التلقائي", vi: "Auto-Exchange", ru: "Auto-Exchange" },
    COIN_SWAP_DEPOSIT: { en: "Coin Swap (Deposit)", tr: "Coin Swap (Yatırılan)", ar: "مبادلة عملات (إيداع)", vi: "Hoán đổi coin (Nạp)", ru: "Coin Swap (Депозит)" },
    COIN_SWAP_WITHDRAW: { en: "Coin Swap (Withdraw)", tr: "Coin Swap (Çekilen)", ar: "مبادلة عملات (سحب)", vi: "Hoán đổi coin (Rút)", ru: "Coin Swap (Вывод)" },
    TRANSFER: { en: "Transfers", tr: "Transferler", ar: "التحويلات", vi: "Chuyển khoản", ru: "Переводы" },
  } as Record<string, Record<Lang, string>>,
};

// ---------- helpers ----------
const EPS = 1e-10;
const TINY_HIDE = 1e-7; // for BFUSD/FDUSD/LDUSDT — hide smaller final balances

function numOk(n?: number) { return typeof n === "number" && Number.isFinite(n); }
function clampZero(n: number): number { return Math.abs(n) < EPS ? 0 : n; }
function fmtNum(n: number): string {
  // keep full precision; show sign where natural (+/-) but no rounding
  // Convert -0 to 0.
  const v = clampZero(n);
  const s = String(v);
  return s;
}
function sum(arr: number[]) { return clampZero(arr.reduce((a,b)=>a+b,0)); }
function byRange(rows: Row[], t0?: number, t1?: number) {
  return rows.filter(r => (t0==null || r.ts >= t0) && (t1==null || r.ts <= t1));
}
function groupBy<T>(arr: T[], key: (x:T)=>string) {
  const m = new Map<string,T[]>();
  for (const x of arr) { const k = key(x); const a = m.get(k); if (a) a.push(x); else m.set(k,[x]); }
  return m;
}

// Build per-type/asset totals
function typeAssetTotals(rows: Row[]) {
  // { type: { asset: { in:number, out:number, net:number } } }
  const map = new Map<string, Map<string, {in:number; out:number; net:number}>>();
  for (const r of rows) {
    const tm = map.get(r.type) || new Map(); map.set(r.type, tm);
    const a = tm.get(r.asset) || { in:0, out:0, net:0 };
    if (r.amount >= 0) a.in += r.amount; else a.out += -r.amount;
    a.net += r.amount;
    tm.set(r.asset, a);
  }
  return map;
}

// ---------- public: summary table data ----------
export function buildSummaryRows(rows: Row[]): SummaryRow[] {
  const t = typeAssetTotals(rows);
  const out: SummaryRow[] = [];
  for (const [type, am] of t) for (const [asset, v] of am) {
    out.push({ label: L.sections[type]?.en ?? type, asset, in: clampZero(v.in), out: clampZero(v.out), net: clampZero(v.net) });
  }
  // Sort by abs(net) desc
  out.sort((a,b)=>Math.abs(b.net)-Math.abs(a.net));
  return out;
}

// ---------- public: Audit ----------
export function buildAudit(rows: Row[], opts: AuditOpts): string {
  const ranged = byRange(rows, opts.anchorTs, opts.endTs);
  const totals = groupBy(ranged, r => r.asset);
  const netByAsset = new Map<string, number>();
  for (const [asset, list] of totals) netByAsset.set(asset, sum(list.map(r => r.amount)));

  // apply baseline
  const base = new Map<string, number>();
  if (opts.baseline) for (const k of Object.keys(opts.baseline)) base.set(k.toUpperCase(), opts.baseline[k]!);

  // anchor transfer first
  if (opts.anchorTransfer) {
    const a = opts.anchorTransfer.asset.toUpperCase();
    base.set(a, (base.get(a)||0) + opts.anchorTransfer.amount);
  }

  // final = baseline + netByAsset
  const final = new Map<string, number>();
  const assets = new Set<string>([...base.keys(), ...netByAsset.keys()]);
  for (const a of assets) final.set(a, clampZero((base.get(a)||0) + (netByAsset.get(a)||0)));

  // hide tiny BFUSD/FDUSD/LDUSDT
  for (const a of ["BFUSD","FDUSD","LDUSDT"]) {
    const v = final.get(a);
    if (numOk(v) && Math.abs(v!) < TINY_HIDE) final.delete(a);
  }
  // drop exact zeros everywhere
  for (const a of [...final.keys()]) if (clampZero(final.get(a)!)===0) final.delete(a);

  const lines: string[] = [];
  lines.push("Agent Balance Audit");
  lines.push("");
  lines.push("Net effect (after anchor):");
  for (const a of [...netByAsset.keys()].sort()) {
    lines.push(`  • ${a}  ${fmtNum(netByAsset.get(a)!)}`);
  }
  lines.push("");
  if (base.size) {
    lines.push("Baseline + anchor transfer:");
    for (const a of [...base.keys()].sort()) lines.push(`  • ${a}  ${fmtNum(base.get(a)!)}`);
    lines.push("");
  }
  lines.push("Final expected balances:");
  if ([...final.keys()].length===0) lines.push("  • (no non-zero balances)");
  for (const a of [...final.keys()].sort()) lines.push(`  • ${a}  ${fmtNum(final.get(a)!)}`);
  return lines.join("\n");
}

// ---------- public: Narrative ----------
export function buildNarrativeParagraphs(
  rows: Row[],
  anchorISO: string | undefined,
  opts: BuildNarrativeOpts
): string {
  const { initialBalances, anchorTransfer, lang } = opts;
  const t = (k: keyof typeof L, ...rest:any[]) =>
    typeof L[k][lang] === "function" ? (L[k][lang] as any)(...rest) : (L[k] as any)[lang];

  const sections: string[] = [];
  sections.push(t("headerUTC"));

  // 1) Opening
  if (anchorISO && anchorTransfer) {
    const before = initialBalances?.[anchorTransfer.asset.toUpperCase()];
    const after = numOk(before) ? clampZero((before || 0) + anchorTransfer.amount) : undefined;
    sections.push(t("startWithAnchor", anchorISO, anchorTransfer.amount, anchorTransfer.asset.toUpperCase(), before, after));
    sections.push(t("afterAnchorIntro"));
  } else if (anchorISO && initialBalances) {
    const balTxt = Object.keys(initialBalances)
      .map(a => `${fmtNum(initialBalances[a])} ${a.toUpperCase()}`).join(", ");
    sections.push(t("startWithBalance", anchorISO, balTxt));
    sections.push(t("afterAnchorIntro"));
  } else {
    sections.push(t("startNoAnchor"));
  }

  // 2) Build per-type summaries only for existing activity
  const totals = typeAssetTotals(rows);
  const pushIf = (typeKey: string, buildLine: (asset: string, v:{in:number; out:number; net:number}) => string) => {
    const map = totals.get(typeKey); if (!map) return;
    const lines: string[] = [];
    for (const [asset, v] of map) {
      const parts: string[] = [];
      if (v.in !== 0) parts.push(`${asset} +${fmtNum(v.in)}`);
      if (v.out !== 0) parts.push(`${asset} -${fmtNum(v.out)}`);
      if (parts.length === 0) continue;
      lines.push(buildLine(asset, v));
    }
    if (lines.length) {
      sections.push(renderSectionTitle(typeKey, lang));
      sections.push(lines.join("\n"));
    }
  };

  // Realized PnL split into profit/loss
  const pnl = totals.get("REALIZED_PNL");
  if (pnl) {
    sections.push(renderSectionTitle("REALIZED_PNL", lang));
    const profit: string[] = [];
    const loss: string[] = [];
    for (const [asset, v] of pnl) {
      if (v.in !== 0) profit.push(`${asset} +${fmtNum(v.in)}`);
      if (v.out !== 0)  loss.push(`${asset} -${fmtNum(v.out)}`);
    }
    if (profit.length) sections.push(label(lang,"profit") + " " + profit.join("  •  "));
    if (loss.length)   sections.push(label(lang,"loss")   + " " + loss.join("  •  "));
  }

  // Simple sections
  pushIf("COMMISSION", (_a,v)=> `• ${_a} -${fmtNum(v.out)}${v.in?` / +${fmtNum(v.in)}`:""}`);
  pushIf("FUNDING_FEE", (_a,v)=> `• ${_a} ${v.in?`+${fmtNum(v.in)} / `:""}${v.out?`-${fmtNum(v.out)} / `:""}= ${fmtNum(v.net)}`);
  pushIf("INSURANCE_CLEAR", (_a,v)=> `• ${_a} ${v.in?`+${fmtNum(v.in)} / `:""}${v.out?`-${fmtNum(v.out)} / `:""}= ${fmtNum(v.net)}`);
  pushIf("REFERRAL_KICKBACK", (_a,v)=> `• ${_a} +${fmtNum(v.in)}`);
  pushIf("COMISSION_REBATE", (_a,v)=> `• ${_a} +${fmtNum(v.in)}`);
  pushIf("CASH_COUPON", (_a,v)=> `• ${_a} +${fmtNum(v.in)}`);
  pushIf("POSITION_LIMIT_INCREASE_FEE", (_a,v)=> `• ${_a} -${fmtNum(v.out)}`);
  pushIf("POSITION_CLAIM_TRANSFER", (_a,v)=> `• ${_a} +${fmtNum(v.in)}`);
  pushIf("DELIVERED_SETTELMENT", (_a,v)=> `• ${_a} ${v.in?`+${fmtNum(v.in)} / `:""}${v.out?`-${fmtNum(v.out)}`:""}`);
  // Grid bot directions split by sign
  const grid = totals.get("STRATEGY_UMFUTURES_TRANSFER");
  if (grid) {
    sections.push(renderSectionTitle("STRATEGY_UMFUTURES_TRANSFER", lang));
    const fromBot: string[] = [], toBot: string[] = [];
    for (const [asset,v] of grid) {
      if (v.in)  fromBot.push(`${asset} +${fmtNum(v.in)}`);
      if (v.out) toBot.push(`${asset} -${fmtNum(v.out)}`);
    }
    if (fromBot.length) sections.push(label(lang,"fromBot")+": " + fromBot.join("  •  "));
    if (toBot.length)   sections.push(label(lang,"toBot")+": "   + toBot.join("  •  "));
  }
  pushIf("FUTURES_PRESENT", (_a,v)=> `• ${_a} ${v.in?`+${fmtNum(v.in)}`:""}${v.out?`  -${fmtNum(v.out)}`:""}`);
  pushIf("EVENT_CONTRACTS_ORDER", (_a,v)=> `• ${_a} -${fmtNum(v.out)}`);
  pushIf("EVENT_CONTRACTS_PAYOUT", (_a,v)=> `• ${_a} +${fmtNum(v.in)}`);
  pushIf("BFUSD_REWARD", (_a,v)=> `• ${_a} +${fmtNum(v.in)}`);

  // Coin Swaps & Auto-Exchange — explain direction
  const swapIn  = totals.get("COIN_SWAP_DEPOSIT");
  const swapOut = totals.get("COIN_SWAP_WITHDRAW");
  if (swapIn || swapOut) {
    sections.push(renderSectionTitle("COIN_SWAP_DEPOSIT", lang).replace(" (Deposit)"," / ").replace("Coin Swap","Coin Swap") + (L.sections["COIN_SWAP_WITHDRAW"][lang]||"Withdraw"));
    const outs: string[] = [];
    const ins: string[]  = [];
    if (swapOut) for (const [asset,v] of swapOut) if (v.out) outs.push(`${asset} ${fmtNum(v.out)}`);
    if (swapIn)  for (const [asset,v] of swapIn)  if (v.in)  ins.push(`${asset} ${fmtNum(v.in)}`);
    if (ins.length || outs.length) {
      sections.push(sent(lang, "swapped", outs, ins));
    }
  }
  const auto = totals.get("AUTO_EXCHANGE");
  if (auto) {
    sections.push(renderSectionTitle("AUTO_EXCHANGE", lang));
    const outs: string[] = [], ins: string[] = [];
    for (const [asset,v] of auto) { if (v.out) outs.push(`${asset} ${fmtNum(v.out)}`); if (v.in) ins.push(`${asset} ${fmtNum(v.in)}`); }
    sections.push(sent(lang, "converted", outs, ins));
  }

  // Transfers
  pushIf("TRANSFER", (_a,v)=> `• ${_a} ${v.in?`+${fmtNum(v.in)} / `:""}${v.out?`-${fmtNum(v.out)} / `:""}= ${fmtNum(v.net)}`);

  // Other types not listed above
  const known = new Set(Object.keys(L.sections));
  const others: string[] = [];
  for (const [type, amap] of totals) {
    if (known.has(type)) continue;
    const label = L.sections[type]?.[lang] || type;
    for (const [asset, v] of amap) {
      if (v.in===0 && v.out===0) continue;
      const parts: string[] = [];
      if (v.in)  parts.push(`+${fmtNum(v.in)}`);
      if (v.out) parts.push(`-${fmtNum(v.out)}`);
      others.push(`${label}: ${asset} ${parts.join(" / ")}`);
    }
  }
  if (others.length) {
    sections.push(L.other[lang]);
    sections.push(others.join("\n"));
  }

  // 3) Final balance (by asset) — computed from rows (+ optional baseline/transfer)
  const netByAsset = new Map<string, number>();
  for (const r of rows) netByAsset.set(r.asset, clampZero((netByAsset.get(r.asset)||0)+r.amount));

  if (initialBalances) {
    for (const a of Object.keys(initialBalances)) {
      netByAsset.set(a.toUpperCase(), clampZero((netByAsset.get(a.toUpperCase())||0) + initialBalances[a]!));
    }
  }
  if (anchorTransfer) {
    const a = anchorTransfer.asset.toUpperCase();
    netByAsset.set(a, clampZero((netByAsset.get(a)||0) + anchorTransfer.amount));
  }

  // hide tiny dust for BFUSD/FDUSD/LDUSDT; remove zeros
  for (const a of ["BFUSD","FDUSD","LDUSDT"]) {
    const v = netByAsset.get(a);
    if (numOk(v) && Math.abs(v!) < TINY_HIDE) netByAsset.delete(a);
  }
  for (const a of [...netByAsset.keys()]) if (clampZero(netByAsset.get(a)!)===0) netByAsset.delete(a);

  const finalTxt = [...netByAsset.entries()].sort(([a],[b])=>a<b?-1:1)
    .map(([a,v])=>`${fmtNum(v)} ${a}`).join(", ") || "(no non-zero balances)";
  sections.push("");
  sections.push(L.finalWallet[lang](finalTxt));

  return sections.join("\n\n");
}

// ---------- tiny label helpers ----------
function renderSectionTitle(type: string, lang: Lang) {
  const lbl = L.sections[type]?.[lang] ?? type;
  return lbl + ":";
}
function label(lang: Lang, key: "profit"|"loss"|"fromBot"|"toBot") {
  const M: Record<Lang, Record<string,string>> = {
    en: { profit: "Realized Profit:", loss: "Realized Loss:", fromBot: "From Grid Bot", toBot: "To Grid Bot" },
    tr: { profit: "Gerçekleşen Kâr:", loss: "Gerçekleşen Zarar:", fromBot: "Grid Bot’tan", toBot: "Grid Bot’a" },
    ar: { profit: "أرباح محققة:", loss: "خسائر محققة:", fromBot: "من Grid Bot", toBot: "إلى Grid Bot" },
    vi: { profit: "Lợi đã thực hiện:", loss: "Lỗ đã thực hiện:", fromBot: "Từ Bot lưới", toBot: "Sang Bot lưới" },
    ru: { profit: "Реализованная прибыль:", loss: "Реализованный убыток:", fromBot: "Из Grid-бота", toBot: "В Grid-бот" },
  };
  return M[lang][key];
}
function sent(lang: Lang, kind: "swapped"|"converted", outs: string[], ins: string[]) {
  const T: Record<Lang, { swapped:string; recv:string; converted:string; convIn:string }> = {
    en: { swapped: "Swapped out:", recv: "Received:", converted: "Converted out:", convIn: "Converted in:" },
    tr: { swapped: "Swap ile çıkan:", recv: "Alınan:", converted: "Çevrilen (çıkan):", convIn: "Çevrilen (giren):" },
    ar: { swapped: "المخرجات:", recv: "الوارد:", converted: "المحوّل للخارج:", convIn: "المحوّل للداخل:" },
    vi: { swapped: "Đã hoán đổi ra:", recv: "Đã nhận:", converted: "Đã quy đổi ra:", convIn: "Đã quy đổi vào:" },
    ru: { swapped: "Обменяли (выведено):", recv: "Получено:", converted: "Сконвертировано из:", convIn: "Сконвертировано в:" },
  };
  if (kind === "swapped") {
    const a = outs.length ? `${T[lang].swapped} ${outs.join("  •  ")}` : "";
    const b = ins.length  ? `${T[lang].recv} ${ins.join("  •  ")}`   : "";
    return [a,b].filter(Boolean).join("\n");
  } else {
    const a = outs.length ? `${T[lang].converted} ${outs.join("  •  ")}` : "";
    const b = ins.length  ? `${T[lang].convIn} ${ins.join("  •  ")}`     : "";
    return [a,b].filter(Boolean).join("\n");
  }
}
