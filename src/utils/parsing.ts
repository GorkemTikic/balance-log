import { Row } from "../types";
import { parseUtcMs } from "./time";

/**
 * Robust parser for Binance/OKX/Generic balance logs.
 * - Accepts TAB, comma, semicolon, or pipe.
 * - Handles quoted CSV fields.
 * - Works with or without header (fuzzy column matching).
 * - Amounts: strips commas/spaces, handles (123.45) negatives, "+/-" signs,
 *   and tokens like "0.123 BTC" (keeps numeric only).
 */
export function parseBalanceLog(raw: string): { rows: Row[]; diags: string[] } {
  const diags: string[] = [];
  if (!raw || !raw.trim()) return { rows: [], diags: ["No input."] };

  // Normalize weird line breaks and trim BOM
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  if (!lines.length) return { rows: [], diags: ["No non-empty lines."] };

  const delim = detectDelimiter(lines);
  const headerLine = lines[0];
  const headerCells = splitCsv(headerLine, delim);

  const maybeHeader = looksLikeHeader(headerCells);
  const start = maybeHeader ? 1 : 0;
  const idx = indexMap(maybeHeader ? headerCells : []);

  const out: Row[] = [];
  for (let i = start; i < lines.length; i++) {
    const rawLine = lines[i];
    const cols = splitCsv(rawLine, delim);

    // Cell getters with graceful fallback positions if no header
    const getCol = (index?: number, fallbackPos?: number) => {
      if (index != null && index < cols.length) return cols[index] ?? "";
      if (fallbackPos != null && fallbackPos < cols.length) return cols[fallbackPos] ?? "";
      return "";
    };

    // Heuristic fallback positions (time, type, asset, amount, symbol, id, uid, extra)
    const timeStr  = (idx.time   != null ? getCol(idx.time)   : getCol(undefined, 0)).trim();
    const typeStr  = (idx.type   != null ? getCol(idx.type)   : getCol(undefined, 1)).trim();
    const assetStr = (idx.asset  != null ? getCol(idx.asset)  : getCol(undefined, 2)).trim();
    const amtStr   = (idx.amount != null ? getCol(idx.amount) : getCol(undefined, 3)).trim();
    const symStr   = (idx.symbol != null ? getCol(idx.symbol) : getCol(undefined, 4)).trim();
    const idStr    = (idx.id     != null ? getCol(idx.id)     : getCol(undefined, 5)).trim();
    const uidStr   = (idx.uid    != null ? getCol(idx.uid)    : getCol(undefined, 6)).trim();
    const extraStr = (idx.extra  != null ? getCol(idx.extra)  : cols.slice(7).join(delim)).trim();

    if (!timeStr && !typeStr && !assetStr && !amtStr) {
      diags.push(`Line ${i + 1}: skipped (too few usable columns)`);
      continue;
    }

    const ts = parseUtcMs(timeStr);
    const amount = parseAmount(amtStr);

    if (!Number.isFinite(amount)) {
      diags.push(`Line ${i + 1}: amount not numeric → "${amtStr}"`);
      continue;
    }

    const row: Row = {
      time: timeStr || "-",
      ts: Number.isFinite(ts) ? ts : Date.now(),
      type: typeStr || "-",
      asset: assetStr || "-",
      amount,
      symbol: symStr || "",
      id: idStr || "",
      uid: uidStr || "",
      extra: extraStr || ""
    };
    out.push(row);
  }

  if (!out.length) {
    diags.push(
      "Parsed 0 rows. Tips:",
      "• Make sure you copied the whole table (not formatted HTML).",
      "• Try exporting CSV from the exchange and pasting that.",
      `• Detected delimiter: "${delim}". If wrong, try another delimiter before pasting again (tab/comma/semicolon/pipe).`
    );
  }

  return { rows: out, diags };
}

/** ---------- helpers ---------- */

function detectDelimiter(lines: string[]): string {
  // Score the first N lines for likely delimiter count
  const sample = lines.slice(0, Math.min(lines.length, 30));
  const cands = ["\t", ",", ";", "|"];
  const scores = cands.map(d => ({
    d,
    score: sample.reduce((acc, l) => acc + (splitCsv(l, d).length - 1), 0),
  }));
  // prefer TAB if equal score with comma (common for Excel pastes)
  scores.sort((a, b) => b.score - a.score || (a.d === "\t" ? 1 : 0));
  return (scores[0]?.score ?? 0) > 0 ? scores[0].d : "\t";
}

function looksLikeHeader(cols: string[]) {
  const f = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const set = new Set(cols.map(f));
  const headerHits = ["time", "timestamp", "date", "type", "asset", "amount", "symbol", "pair"];
  return headerHits.some(h => set.has(h));
}

// Fuzzy header -> index mapping
function indexMap(header: string[]) {
  const idx: any = {};
  const f = (s: string) => s.toLowerCase().trim();

  header.forEach((h, i) => {
    const k = f(h);
    if (["time", "timestamp", "date", "time(utc)", "datetime", "date(utc)"].includes(k)) idx.time = i;
    else if (["type", "txntype", "event", "category"].includes(k)) idx.type = i;
    else if (["asset", "currency", "coin"].includes(k)) idx.asset = i;
    else if (["amount", "qty", "quantity", "change", "delta"].includes(k)) idx.amount = i;
    else if (["symbol", "pair", "instrument"].includes(k)) idx.symbol = i;
    else if (["id", "orderid", "txid", "tradeid"].includes(k)) idx.id = i;
    else if (["uid", "user", "account"].includes(k)) idx.uid = i;
    else if (["extra", "note", "memo", "data", "comment"].includes(k)) idx.extra = i;
  });

  return idx as {
    time?: number; type?: number; asset?: number; amount?: number;
    symbol?: number; id?: number; uid?: number; extra?: number;
  };
}

// CSV splitter with quotes support for any delimiter
function splitCsv(line: string, d: string): string[] {
  if (!line.includes('"') && d !== ",") {
    // Fast path for non-CSV delimiters w/o quotes
    return line.split(d);
  }
  const out: string[] = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'; i++; // escaped quote
      } else {
        inQ = !inQ;
      }
      continue;
    }

    if (!inQ && ch === d) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseAmount(s: string): number {
  if (!s) return 0;

  let t = s.trim();

  // remove currency/asset suffix like "0.12 BTC"
  const tokenized = t.split(/\s+/);
  if (tokenized.length >= 2 && isLikelyNumber(tokenized[0])) t = tokenized[0];

  // parenthesis negative: (123.45)
  const parenNeg = /^\(\s*([^)]+)\s*\)$/.exec(t);
  if (parenNeg) t = "-" + parenNeg[1];

  // remove thousands separators and spaces
  t = t.replace(/[\s, ’']/g, ""); // includes thin space/nbsp variants
  // replace locale decimal comma with dot if needed
  const commaDec = /^-?\d+(?:\.\d+)?\,\d+$/.test(s);
  if (commaDec) t = t.replace(",", ".");

  // keep sign
  if (/^[+−]/.test(t)) t = t.replace("−", "-"); // unicode minus

  // final numeric parse
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function isLikelyNumber(s: string) {
  return /^[-+()]?[\d\s,.'’ ]+(?:[.,]\d+)?$/.test(s);
}
