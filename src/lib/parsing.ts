// lib/parsing.ts
import { Row, DATE_RE, SYMBOL_RE } from "./types";
import { firstDateIn, splitColumns } from "./utils";
import { normalizeTimeString, parseUtcMs } from "./time";

export function parseBalanceLog(text: string) {
  const rows: Row[] = [];
  const diags: string[] = [];

  const lines = text
    .replace(/[\u00A0\u2000-\u200B]/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const when = firstDateIn(line);
    if (!when) { diags.push(`• Skipped (no time): ${line.slice(0,160)}`); continue; }

    const cols = splitColumns(line);
    if (cols.length < 6) { diags.push(`• Skipped (too few columns): ${line.slice(0,160)}`); continue; }

    const id = cols[0] ?? "";
    const uid = cols[1] ?? "";
    const asset = cols[2] ?? "";
    const type = cols[3] ?? "";
    const amountRaw = cols[4] ?? "";
    const timeCol = cols.find((c) => DATE_RE.test(c)) ?? when;
    const symbolCandidate = cols[6] ?? "";
    const extra = cols.slice(7).join(" ");

    const amount = Number(amountRaw);
    if (Number.isNaN(amount)) { diags.push(`• Skipped (amount not numeric): ${line.slice(0,160)}`); continue; }

    const symbol = symbolCandidate && SYMBOL_RE.test(symbolCandidate) ? symbolCandidate : "";
    const time = normalizeTimeString(timeCol.match(DATE_RE)?.[1] || when);
    const ts = parseUtcMs(time);

    rows.push({ id, uid, asset, type, amount, time, ts, symbol, extra, raw: line });
  }

  return { rows, diags };
}
