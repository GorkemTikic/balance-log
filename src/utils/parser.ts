// src/utils/parser.ts

import { normalizeTimeString, parseUtcMs } from "./time";

export type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string; // "YYYY-MM-DD HH:MM:SS"
  ts: number;   // epoch ms
  symbol: string;
  extra: string;
  raw: string;
};

const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/;
const SYMBOL_RE = /^[A-Z0-9]{2,}(USDT|USDC|USD|BTC|ETH|BNB|BNFCR)$/;

export function splitColumns(line: string): string[] {
  if (line.includes("\t")) return line.split(/\t+/);
  return line.trim().split(/\s{2,}|\s\|\s|\s+/);
}

function firstDateIn(line: string): string {
  const m = line.match(DATE_RE);
  return m ? m[1] : "";
}

export function parseBalanceLog(text: string): { rows: Row[]; diags: string[] } {
  const rows: Row[] = [];
  const diags: string[] = [];

  const lines = text
    .replace(/[\u00A0\u2000-\u200B]/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const when = firstDateIn(line);
    if (!when) {
      diags.push(`• Skipped (no time): ${line.slice(0, 160)}`);
      continue;
    }

    const cols = splitColumns(line);
    if (cols.length < 6) {
      diags.push(`• Skipped (too few columns): ${line.slice(0, 160)}`);
      continue;
    }

    const id = cols[0] ?? "";
    const uid = cols[1] ?? "";
    const asset = cols[2] ?? "";
    const type = cols[3] ?? "";
    const amountRaw = cols[4] ?? "";
    const timeCol = cols.find((c) => DATE_RE.test(c)) ?? when;
    const symbolCandidate = cols[6] ?? "";
    const extra = cols.slice(7).join(" ");

    const amount = Number(amountRaw);
    if (Number.isNaN(amount)) {
      diags.push(`• Skipped (amount not numeric): ${line.slice(0, 160)}`);
      continue;
    }

    let symbol = "";
    if (symbolCandidate && SYMBOL_RE.test(symbolCandidate)) {
      symbol = symbolCandidate;
    }

    const normalized = normalizeTimeString(timeCol.match(DATE_RE)?.[1] || when);
    const ts = parseUtcMs(normalized);

    rows.push({
      id,
      uid,
      asset,
      type,
      amount,
      time: normalized,
      ts,
      symbol,
      extra,
      raw: line,
    });
  }

  return { rows, diags };
}
