import { Row } from "../types";
import { parseUtcMs } from "./time";

/**
 * Ultra-tolerant balance log parser.
 * - Accepts TAB/Comma/Semicolon/Pipe and quoted CSV.
 * - Works with or without a header. For your headerless 10-column format,
 *   it locks the mapping to avoid wrong guesses (so we never sum IDs again).
 * - Skips 1-column menu/banner lines.
 * - Robust amount parsing (commas/spaces/unicode minus/(123) negatives/"0.12 BTC").
 * - Normalizes many exchange type labels -> canonical types used by the UI.
 */
export function parseBalanceLog(raw: string): { rows: Row[]; diags: string[] } {
  const diags: string[] = [];
  if (!raw || !raw.trim()) return { rows: [], diags: ["No input."] };

  // Normalize newlines & trim BOM
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  if (!lines.length) return { rows: [], diags: ["No non-empty lines."] };

  const delim = detectDelimiter(lines);
  const headerCells = splitCsv(lines[0], delim);
  const hasHeader = looksLikeHeader(headerCells);

  const start = hasHeader ? 1 : 0;
  const headerIdx = hasHeader ? indexMap(headerCells) : {};
  const guessedIdx = !hasHeader ? guessColumnIndexes(lines.slice(start, Math.min(lines.length, start + 300)), delim) : {};

  // --- FORCE MAPPING FOR YOUR KNOWN HEADERLESS FORMAT (prevents mis-summing IDs) ---
  // Expected order (0-based): id, uid, asset, type, amount, time, symbol, txid, email, timeAgain
  let forced: Partial<Idx> | null = null;
  const probe = lines.slice(start).find(l => splitCsv(l, delim).length >= 7);
  if (probe) {
    const c = splitCsv(probe, delim);
    if (
      c.length >= 7 &&
      isLikelyTime(c[5]) &&
      looksLikeTypeWord(c[3]) &&
      looksLikeAsset(c[2]) &&
      isLikelyAmountCell(c[4])
    ) {
      forced = { time: 5, type: 3, asset: 2, amount: 4, symbol: 6, id: 0, uid: 1 };
    }
  }

  const getIdx = (k: keyof Idx) =>
    (forced as any)?.[k] ??
    (headerIdx as any)[k] ??
    (guessedIdx as any)[k];

  const out: Row[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitCsv(lines[i], delim);

    // Skip menu/banner/noise lines (1–2 columns)
    if (cols.length < 5) {
      diags.push(`Line ${i + 1}: skipped (only ${cols.length} column${cols.length === 1 ? "" : "s"})`);
      continue;
    }

    // Accessor with fallback positions (still keep sane defaults)
    const get = (j?: number, fallback?: number) =>
      j != null && j < cols.length ? cols[j] ?? "" : (fallback != null && fallback < cols.length ? cols[fallback] ?? "" : "");

    // Use forced/header/guessed indexes; if any missing, fall back to your format’s positions
    const timeStr  = (get(getIdx("time"),   5) as string).trim();
    const typeStr0 = (get(getIdx("type"),   3) as string).trim();
    const assetStr = (get(getIdx("asset"),  2) as string).trim();
    const amtStr   = (get(getIdx("amount"), 4) as string).trim();
    const symStr   = (get(getIdx("symbol"), 6) as string).trim();
    const idStr    = (get(getIdx("id"),     0) as string).trim();
    const uidStr   = (get(getIdx("uid"),    1) as string).trim();
    const extraStr = (get(getIdx("extra")) || [cols[7], cols[8], cols[9]].filter(Boolean).join(" ")).trim();

    if (!timeStr && !typeStr0 && !assetStr && !amtStr) {
      diags.push(`Line ${i + 1}: skipped (empty/insufficient values)`);
      continue;
    }

    const amount = parseAmount(amtStr);
    if (!Number.isFinite(amount)) {
      diags.push(`Line ${i + 1}: amount not numeric → "${amtStr}"`);
      continue;
    }

    const normType = normalizeType(typeStr0, { asset: assetStr, symbol: symStr, extra: extraStr });
    const ts = parseUtcMs(timeStr);

    out.push({
      time: timeStr || "-",
      ts: Number.isFinite(ts) ? ts : Date.now(),
      type: normType || typeStr0 || "-",
      asset: assetStr || "-",
      amount,
      symbol: symStr || "",
      id: idStr || "",
      uid: uidStr || "",
      extra: extraStr || ""
    });
  }

  if (!out.length) {
    diags.push(
      "Parsed 0 rows.",
      `• Detected delimiter: "${delim}". If wrong, try a different export/paste.`,
      "• Ensure you pasted the plain table/CSV (not formatted HTML)."
    );
  }

  return { rows: out, diags };
}

/* ---------------- helpers ---------------- */

type Idx = {
  time?: number; type?: number; asset?: number; amount?: number; symbol?: number; id?: number; uid?: number; extra?: number;
};

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, Math.min(40, lines.length));
  const cand = ["\t", ",", ";", "|"];
  const score = (d: string) => sample.reduce((s, l) => s + (splitCsv(l, d).length - 1), 0);
  const ranked = cand.map(d => [d, score(d)] as const).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] === 0 ? "\t" : (ranked[0][0] as string);
}

function looksLikeHeader(cols: string[]) {
  const f = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const set = new Set(cols.map(f));
  const hits = ["time", "timestamp", "date", "type", "asset", "amount", "symbol", "pair", "id", "uid", "extra"];
  return hits.some(h => set.has(h));
}

function indexMap(header: string[]) {
  const idx: any = {};
  const f = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  header.forEach((h, i) => {
    const k = f(h);
    if (["time", "timestamp", "date", "datetime", "time(utc)", "date(utc)"].includes(k)) idx.time = i;
    else if (["type", "txntype", "event", "category"].includes(k)) idx.type = i;
    else if (["asset", "currency", "coin"].includes(k)) idx.asset = i;
    else if (["amount", "qty", "quantity", "change", "delta"].includes(k)) idx.amount = i;
    else if (["symbol", "pair", "instrument"].includes(k)) idx.symbol = i;
    else if (["id", "orderid", "txid", "tradeid"].includes(k)) idx.id = i;
    else if (["uid", "user", "account"].includes(k)) idx.uid = i;
    else if (["extra", "note", "memo", "data", "comment"].includes(k)) idx.extra = i;
  });
  return idx as Idx;
}

/** Guess column indexes when there's no header (light heuristic). */
function guessColumnIndexes(lines: string[], d: string) {
  const dataLines = lines.filter(l => splitCsv(l, d).length >= 5);
  if (!dataLines.length) return {};
  const maxCols = Math.max(...dataLines.map(l => splitCsv(l, d).length));
  const score = Array.from({ length: maxCols }, () => ({ time: 0, type: 0, asset: 0, amount: 0, symbol: 0 }));

  const sample = dataLines.slice(0, Math.min(dataLines.length, 300));
  for (const l of sample) {
    const cols = splitCsv(l, d);
    cols.forEach((cell, i) => {
      const t = cell.trim();
      if (isLikelyTime(t)) score[i].time += 3;
      if (isLikelyAmountCell(t)) score[i].amount += 4;
      if (looksLikeTypeWord(t)) score[i].type += 3;
      if (looksLikeAsset(t)) score[i].asset += 2;
      if (looksLikeSymbol(t)) score[i].symbol += 2;
    });
  }

  const pick = (key: keyof typeof score[number]) =>
    score.map((s, i) => [i, (s as any)[key]] as const).sort((a, b) => b[1] - a[1])[0]?.[0];

  const amount = pick("amount");
  const type   = pick("type");
  const time   = pick("time");
  const symbol = pick("symbol");
  const asset  = pick("asset");

  return { time, type, asset, amount, symbol } as Idx;
}

function isLikelyTime(s: string) {
  return /\d{4}-\d{2}-\d{2}/.test(s) || /^\d{10,}$/.test(s);
}
function looksLikeTypeWord(s: string) {
  const t = s.toLowerCase();
  return /(p&?l|pnl|realiz|funding|commission|fee|rebate|referr|insurance|liquid|event|payout|order|convert|swap|transfer|grid)/.test(t);
}
function looksLikeAsset(s: string) { return /^[A-Z]{3,6}$/.test(s.trim()); }
function looksLikeSymbol(s: string) { return /^[A-Z]{2,6}[-_/]?[A-Z]{2,6}$/.test(s.trim()); }

/* --------- CSV splitter with quotes --------- */
function splitCsv(line: string, d: string): string[] {
  if (!line.includes('"') && d !== ",") return line.split(d);
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
      continue;
    }
    if (!inQ && ch === d) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/* --------- Amount parsing --------- */
function parseAmount(s: string): number {
  if (!s) return NaN;
  let t = s.trim();

  // "0.12 BTC" -> "0.12"
  const token = t.split(/\s+/);
  if (token.length >= 2 && isLikelyNumber(token[0])) t = token[0];

  // (123.45) -> -123.45
  const m = /^\(\s*([^)]+)\s*\)$/.exec(t);
  if (m) t = "-" + m[1];

  t = t.replace(/[\s,’']/g, "");   // spaces/thin spaces/apostrophes
  t = t.replace("−", "-");         // unicode minus -> ascii

  // 1.234,56 -> 1234.56
  if (/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(s)) t = t.replace(/\./g, "").replace(",", ".");
  // 1234,56 -> 1234.56
  if (/^-?\d+,\d+$/.test(s)) t = t.replace(",", ".");

  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
function isLikelyNumber(s: string) { return /^[-+()]?[\d\s,.'’ ]+(?:[.,]\d+)?$/.test(s); }
/** Used during guessing to score amount-like cells */
function isLikelyAmountCell(s: string) {
  if (!s) return false;
  const t = s.trim();
  return /^[-+()]?[\d\s,.'’ ]+(?:[.,]\d+)?(?:\s[A-Z]{3,6})?$/.test(t);
}

/* --------- Type normalization --------- */
function normalizeType(rawType: string, ctx: { asset?: string; symbol?: string; extra?: string }): string {
  const t = (rawType || "").toLowerCase().trim();

  if (/^real/.test(t) || /(p&?l|pnl)/.test(t) || /realiz/.test(t)) return "REALIZED_PNL";
  if (/fund/.test(t)) return "FUNDING_FEE";
  if (/(commission|fee)/.test(t) && !/fund/.test(t)) return "COMMISSION";
  if (/(referr|rebate|kickback|cashback)/.test(t)) return "REFERRAL_KICKBACK";
  if (/(insurance|liq(?!uid)|liquidation)/.test(t)) return "INSURANCE_CLEAR";
  if (/liquidation/.test(t)) return "LIQUIDATION_FEE";
  if (/(auto.?exchange|convert|conversion)/.test(t)) return "AUTO_EXCHANGE";
  if (/(coin.?swap.*deposit|swap.*in)/.test(t)) return "COIN_SWAP_DEPOSIT";
  if (/(coin.?swap.*withdraw|swap.*out)/.test(t)) return "COIN_SWAP_WITHDRAW";
  if (/(grid).*(transfer)/.test(t)) return "GRIDBOT_TRANSFER";
  if (/transfer/.test(t)) return "TRANSFER";
  if (/(event).*(order|stake|wager|bet)/.test(t)) return "EVENT_ORDER";
  if (/(event).*(payout|settle|win|loss)/.test(t)) return "EVENT_PAYOUT";

  // contextual hints from extra
  const e = (ctx.extra || "").toLowerCase();
  if (!t && /(funding)/.test(e)) return "FUNDING_FEE";
  if (!t && /(commission|fee)/.test(e)) return "COMMISSION";
  if (!t && /(referr|rebate|kickback)/.test(e)) return "REFERRAL_KICKBACK";
  if (!t && /(insurance|liquidation)/.test(e)) return "INSURANCE_CLEAR";
  if (!t && /(convert|auto.?exchange)/.test(e)) return "AUTO_EXCHANGE";
  if (!t && /(transfer)/.test(e)) return "TRANSFER";

  return rawType; // fallback to original if unknown
}
