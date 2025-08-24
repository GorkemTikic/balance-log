// src/App.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";

/**
 * Balance Log Analyzer — light theme, UTC+0
 * Dual-pane Summary layout: LEFT analysis cards | SPLITTER | RIGHT By Symbol (resizable)
 * Balance Story tool with robust UTC filtering and single-source-of-truth deltas
 */

type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string; // canonical "YYYY-MM-DD HH:MM:SS" UTC+0 (hour zero-padded)
  ts: number;   // UTC epoch milliseconds
  symbol: string;
  extra: string;
  raw: string;
};

const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/; // UTC+0
const SYMBOL_RE = /^[A-Z0-9]{2,}(USDT|USDC|USD|BTC|ETH|BNB|BNFCR)$/;

const TYPE = {
  REALIZED_PNL: "REALIZED_PNL",
  FUNDING_FEE: "FUNDING_FEE",
  COMMISSION: "COMMISSION",
  INSURANCE_CLEAR: "INSURANCE_CLEAR",
  LIQUIDATION_FEE: "LIQUIDATION_FEE",
  REFERRAL_KICKBACK: "REFERRAL_KICKBACK",
  TRANSFER: "TRANSFER",
  GRIDBOT_TRANSFER: "STRATEGY_UMFUTURES_TRANSFER",
  COIN_SWAP_DEPOSIT: "COIN_SWAP_DEPOSIT",
  COIN_SWAP_WITHDRAW: "COIN_SWAP_WITHDRAW",
  AUTO_EXCHANGE: "AUTO_EXCHANGE",
  EVENT_ORDER: "EVENT_CONTRACTS_ORDER",
  EVENT_PAYOUT: "EVENT_CONTRACTS_PAYOUT",
};

const EVENT_PREFIX = "EVENT_CONTRACTS_";
const EVENT_KNOWN_CORE = new Set([TYPE.EVENT_ORDER, TYPE.EVENT_PAYOUT]);

const KNOWN_TYPES = new Set<string>([
  TYPE.REALIZED_PNL,
  TYPE.FUNDING_FEE,
  TYPE.COMMISSION,
  TYPE.INSURANCE_CLEAR,
  TYPE.LIQUIDATION_FEE,
  TYPE.REFERRAL_KICKBACK,
  TYPE.TRANSFER,
  TYPE.GRIDBOT_TRANSFER,
  TYPE.COIN_SWAP_DEPOSIT,
  TYPE.COIN_SWAP_WITHDRAW,
  TYPE.AUTO_EXCHANGE,
  TYPE.EVENT_ORDER,
  TYPE.EVENT_PAYOUT,
]);

const EPS = 1e-12;
const SPLIT_W = 12; // splitter width (px)
const ALL_ASSETS = ["BTC","LDUSDT","BFUSD","FDUSD","BNB","ETH","USDT","USDC","BNFCR"] as const;
type AssetCode = typeof ALL_ASSETS[number];

/* ---------- time utils (true UTC) ---------- */
function normalizeTimeString(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return s;
  const [, y, mo, d, h, mi, se] = m;
  const hh = h.padStart(2, "0");
  return `${y}-${mo}-${d} ${hh}:${mi}:${se}`;
}
function parseUtcMs(s: string): number {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const [, Y, Mo, D, H, Mi, S] = m;
  return Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
}
function tsToUtcString(millis: number): string {
  const d = new Date(millis);
  const pad = (n: number) => String(n).padStart(2, "0");
  const Y = d.getUTCFullYear();
  const M = pad(d.getUTCMonth() + 1);
  const D = pad(d.getUTCDate());
  const H = pad(d.getUTCHours());
  const I = pad(d.getUTCMinutes());
  const S = pad(d.getUTCSeconds());
  return `${Y}-${M}-${D} ${H}:${I}:${S}`;
}

/* ---------- general utils ---------- */
const abs = (x: number) => Math.abs(Number(x) || 0);
const gt = (x: number) => abs(x) > EPS;

function fmtAbs(x: number, maxDp = 12) {
  const v = abs(x);
  const s = v.toString().includes("e") ? v.toFixed(12) : v.toString();
  // Keep as many decimals as JS preserves; do not clamp or round further.
  return s;
}
function fmtSigned(x: number, maxDp = 12) {
  const n = Number(x) || 0;
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${fmtAbs(n, maxDp)}`;
}
function toCsv<T extends object>(rows: T[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]) as (keyof T)[];
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const body = rows.map((r) => headers.map((h) => escape((r as any)[h])).join(","));
  return [headers.join(","), ...body].join("\n");
}

function titleCaseWords(s: string) {
  if (!s) return s;
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function friendlyTypeName(t: string) {
  const map: Record<string, string> = {
    CASH_COUPON: "Cash Coupon",
    WELCOME_BONUS: "Welcome Bonus",
    BFUSD_REWARD: "BFUSD Reward",
    STRATEGY_UMFUTURES_TRANSFER: "Futures GridBot Transfer",
  };
  return map[t] || titleCaseWords(t);
}

/* ---------- parsing ---------- */
function splitColumns(line: string) {
  if (line.includes("\t")) return line.split(/\t+/);
  return line.trim().split(/\s{2,}|\s\|\s|\s+/);
}
function firstDateIn(line: string) {
  const m = line.match(DATE_RE);
  return m ? m[1] : "";
}
function parseBalanceLog(text: string) {
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
    if (symbolCandidate && SYMBOL_RE.test(symbolCandidate)) symbol = symbolCandidate;

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

/* ---------- aggregation ---------- */
function sumByAsset<T extends Row>(rows: T[]) {
  const acc: Record<string, { pos: number; neg: number; net: number }> = {};
  for (const r of rows) {
    const a = (acc[r.asset] = acc[r.asset] || { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount;
    else a.neg += abs(r.amount);
    a.net += r.amount;
  }
  return acc;
}
const onlyEvents = (rows: Row[]) => rows.filter((r) => r.type.startsWith(EVENT_PREFIX));
const onlyNonEvents = (rows: Row[]) => rows.filter((r) => !r.type.startsWith(EVENT_PREFIX));

function groupBySymbol(rows: Row[]) {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.symbol) continue;
    const g = m.get(r.symbol) || [];
    g.push(r);
    m.set(r.symbol, g);
  }
  return m;
}

function bySymbolSummary(nonEventRows: Row[]) {
  const sym = groupBySymbol(nonEventRows);
  const out: Array<{
    symbol: string;
    realizedByAsset: Record<string, { pos: number; neg: number }>;
    fundingByAsset: Record<string, { pos: number; neg: number }>;
    commByAsset: Record<string, { pos: number; neg: number }>;
    insByAsset: Record<string, { pos: number; neg: number }>;
  }> = [];

  for (const [symbol, rs] of sym.entries()) {
    const realized = rs.filter((r) => r.type === TYPE.REALIZED_PNL);
    const funding = rs.filter((r) => r.type === TYPE.FUNDING_FEE);
    const comm = rs.filter((r) => r.type === TYPE.COMMISSION);
    const ins = rs.filter((r) => r.type === TYPE.INSURANCE_CLEAR || r.type === TYPE.LIQUIDATION_FEE);

    const realizedByAsset = sumByAsset(realized);
    const fundingByAsset = sumByAsset(funding);
    const commByAsset = sumByAsset(comm);
    const insByAsset = sumByAsset(ins);

    const coreMagnitude =
      Object.values(realizedByAsset).reduce((a, v) => a + abs(v.pos) + abs(v.neg), 0) +
      Object.values(fundingByAsset).reduce((a, v) => a + abs(v.pos) + abs(v.neg), 0) +
      Object.values(commByAsset).reduce((a, v) => a + abs(v.pos) + abs(v.neg), 0);
    if (coreMagnitude <= EPS) continue;

    out.push({
      symbol,
      realizedByAsset,
      fundingByAsset,
      commByAsset,
      insByAsset,
    });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

/* --- swap-grouping split strictly by kind --- */
type SwapKind = "COIN_SWAP" | "AUTO_EXCHANGE";
function groupSwaps(rows: Row[], kind: SwapKind) {
  const isCoin = (t: string) => t === TYPE.COIN_SWAP_DEPOSIT || t === TYPE.COIN_SWAP_WITHDRAW;
  const filtered = rows.filter((r) =>
    kind === "COIN_SWAP" ? isCoin(r.type) : r.type === TYPE.AUTO_EXCHANGE
  );

  const map = new Map<string, Row[]>();
  for (const r of filtered) {
    const idHint = (r.extra && r.extra.split("@")[0]) || "";
    // group by normalized time string + id-hint (per second)
    const key = `${r.time}|${idHint}`;
    const g = map.get(key) || [];
    g.push(r);
    map.set(key, g);
  }

  const lines: { time: string; ts: number; text: string }[] = [];
  for (const [, group] of map.entries()) {
    const t = group[0].time;
    const ts = group[0].ts;
    const byAsset = new Map<string, number>();
    for (const g of group) byAsset.set(g.asset, (byAsset.get(g.asset) || 0) + g.amount);

    const outs: string[] = [];
    const ins: string[] = [];
    for (const [asset, amt] of byAsset.entries()) {
      if (amt < 0) outs.push(`${fmtSigned(amt)} ${asset}`);
      if (amt > 0) ins.push(`${fmtSigned(amt)} ${asset}`);
    }
    lines.push({
      time: t,
      ts,
      text: `${t} (UTC+0) — Out: ${outs.length ? outs.join(", ") : "0"} → In: ${ins.length ? ins.join(", ") : "0"}`,
    });
  }
  lines.sort((a, b) => a.ts - b.ts);
  return lines;
}

/* ---------- Excel-like paste box ---------- */
function GridPasteBox({
  onUseTSV,
  onError,
}: {
  onUseTSV: (tsv: string) => void;
  onError: (msg: string) => void;
}) {
  const [grid, setGrid] = useState<string[][]>([]);
  const [info, setInfo] = useState<string>("");

  function parseHtmlToGrid(html: string): string[][] {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tables = Array.from(doc.querySelectorAll("table"));
    if (!tables.length) return [];
    let best: HTMLTableElement | null = null;
    let bestScore = -1;
    tables.forEach((t) => {
      const score = t.querySelectorAll("tr").length * t.querySelectorAll("td,th").length;
      if (score > bestScore) {
        bestScore = score;
        best = t as HTMLTableElement;
      }
    });
    if (!best) return [];
    const rows: string[][] = [];
    best.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll<HTMLElement>("th,td"));
      const row = cells.map((c) => (c.textContent ?? "").trim());
      if (row.length) rows.push(row);
    });
    return rows;
  }

  function parseTextToGrid(text: string): string[][] {
    if (!text) return [];
    if (text.includes("\t")) {
      return text
        .split(/\r?\n/)
        .filter((l) => l.trim().length)
        .map((l) => l.split("\t"));
    }
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim().length)
      .map((l) => l.trim().split(/\s{2,}|\s\|\s|\s+/));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    setInfo("");
    const cd = e.clipboardData;
    const html = cd.getData("text/html");
    const text = cd.getData("text/plain");
    let g: string[][] = [];
    if (html) g = parseHtmlToGrid(html);
    if (!g.length) g = parseTextToGrid(text);
    if (!g.length) {
      onError("Nothing parseable was found on the clipboard. Try copying the table itself.");
      return;
    }
    setGrid(g);
    setInfo(`Detected ${g.length} row(s) × ${Math.max(...g.map((r) => r.length))} col(s).`);
  }

  function useAndParse() {
    if (!grid.length) {
      onError("Paste a table first.");
      return;
    }
    const tsv = grid.map((r) => r.join("\t")).join("\n");
    onUseTSV(tsv);
  }

  return (
    <div className="card">
      <div className="card-head">
        <h3>Paste Table (Excel-like)</h3>
      </div>
      <div
        className="dropzone"
        contentEditable
        suppressContentEditableWarning
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey) || (e.key.toLowerCase() !== "v" && e.key !== "V")) {
            e.preventDefault();
          }
        }}
      >
        Click here and press <b>Ctrl/⌘+V</b> to paste directly from the Balance Log web page.
      </div>

      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn btn-dark" onClick={useAndParse}>
          Use & Parse
        </button>
        <span className="muted">{info}</span>
      </div>

      {grid.length > 0 && (
        <div className="tablewrap" style={{ marginTop: 10, maxHeight: 280 }}>
          <table className="table mono small">
            <tbody>
              {grid.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- UI helpers ---------- */
function RpnCard({
  title,
  map,
}: {
  title: string;
  map: Record<string, { pos: number; neg: number; net: number }>;
}) {
  const keys = Object.keys(map);
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
      </div>
      {keys.length ? (
        <ul className="kv">
          {keys.map((asset) => {
            const v = map[asset];
            const chunks: React.ReactNode[] = [];
            if (gt(v.pos)) chunks.push(<span key="p" className="num good">+{fmtAbs(v.pos)}</span>);
            if (gt(v.neg)) chunks.push(<span key="n" className="num bad">−{fmtAbs(v.neg)}</span>);
            const netEl = gt(v.net) ? (
              <span key="net" className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span>
            ) : (
              <span key="dash" className="num muted">–</span>
            );
            return (
              <li key={asset} className="kv-row">
                <span className="label">{asset}</span>
                {chunks.length ? chunks : <span className="num muted">–</span>}
                {chunks.length > 1 ? null : <span className="num muted"></span>}
                {netEl}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">None</p>
      )}
    </div>
  );
}

function renderAssetPairs(map: Record<string, { pos: number; neg: number }>) {
  const entries = Object.entries(map).filter(([, v]) => gt(v.pos) || gt(v.neg));
  if (!entries.length) return <span>–</span>;
  return (
    <>
      {entries.map(([asset, v], i) => (
        <span key={asset} className="pair">
          {gt(v.pos) && <span className="good">+{fmtAbs(v.pos)}</span>}
          {gt(v.pos) && gt(v.neg) && " / "}
          {gt(v.neg) && <span className="bad">−{fmtAbs(v.neg)}</span>}{" "}
          {asset}
          {i < entries.length - 1 ? ", " : ""}
        </span>
      ))}
    </>
  );
}
function pairsToText(map: Record<string, { pos: number; neg: number }>) {
  const entries = Object.entries(map).filter(([, v]) => gt(v.pos) || gt(v.neg));
  if (!entries.length) return "–";
  return entries
    .map(([a, v]) => {
      if (gt(v.pos) && gt(v.neg)) return `+${fmtAbs(v.pos)} / −${fmtAbs(v.neg)} ${a}`;
      if (gt(v.pos)) return `+${fmtAbs(v.pos)} ${a}`;
      return `−${fmtAbs(v.neg)} ${a}`;
    })
    .join("; ");
}

/* ---------- PNG canvas renderer ---------- */
type SymbolBlock = ReturnType<typeof bySymbolSummary>[number];

function drawSymbolsCanvas(blocks: SymbolBlock[], downloadName: string) {
  if (!blocks.length) return;

  const dpr = Math.max(1, Math.min(2, (window.devicePixelRatio || 1)));
  const padX = 16;
  const rowH = 36;
  const headH = 44;
  const colSymbol = 160;
  const cols = [
    { key: "Realized PnL", width: 260 },
    { key: "Funding", width: 220 },
    { key: "Trading Fees", width: 220 },
    { key: "Insurance", width: 220 },
  ];
  const width = padX * 2 + colSymbol + cols.reduce((s, c) => s + c.width, 0);
  const height = headH + rowH * blocks.length + padX;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const bg = "#ffffff";
  const line = "#e6e9ee";
  const txt = "#0f1720";
  const good = "#059669";
  const bad = "#dc2626";
  const headBg = "#fbfcfe";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = line;
  ctx.fillStyle = headBg;
  ctx.fillRect(0, 0, width, headH);
  ctx.fillStyle = txt;
  ctx.font = "600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("By Symbol (Futures, not Events)", padX, 26);

  let x = padX + colSymbol;
  ctx.font = "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  cols.forEach((c) => {
    ctx.fillText(c.key, x + 6, 42);
    x += c.width;
  });

  ctx.beginPath();
  ctx.moveTo(0, headH + 0.5);
  ctx.lineTo(width, headH + 0.5);
  ctx.stroke();

  blocks.forEach((b, i) => {
    const y = headH + i * rowH;

    ctx.beginPath();
    ctx.moveTo(0, y + rowH + 0.5);
    ctx.lineTo(width, y + rowH + 0.5);
    ctx.stroke();

    ctx.font = "600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillStyle = txt;
    ctx.fillText(b.symbol, padX, y + 24);

    const cellTxt = (m: Record<string, { pos: number; neg: number }>) => {
      const parts: string[] = [];
      Object.entries(m).forEach(([asset, v]) => {
        const pos = v.pos > EPS ? `+${fmtAbs(v.pos)} ${asset}` : "";
        const neg = v.neg > EPS ? `−${fmtAbs(v.neg)} ${asset}` : "";
        if (pos) parts.push(pos);
        if (neg) parts.push(neg);
      });
      return parts.join(", ");
    };

    let cx = padX + colSymbol;
    const values = [
      cellTxt(b.realizedByAsset),
      cellTxt(b.fundingByAsset),
      cellTxt(b.commByAsset),
      cellTxt(b.insByAsset),
    ];

    values.forEach((val, idx) => {
      const tokens = val.split(/( [+,−][0-9.]+ [A-Z0-9]+)(?=,|$)/g).filter(Boolean);
      let tx = cx + 6;
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
      tokens.length ? tokens.forEach((t) => {
        const isGood = /^\s*\+/.test(t);
        const isBad = /^\s*−/.test(t);
        ctx.fillStyle = isGood ? good : isBad ? bad : txt;
        ctx.fillText(t.trim(), tx, y + 24);
        tx += ctx.measureText(t.trim()).width + 4;
      }) : (ctx.fillStyle = "#6b7280", ctx.fillText("–", tx, y + 24));
      cx += cols[idx].width;
    });
  });

  const link = document.createElement("a");
  link.download = downloadName;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
function drawSingleRowCanvas(block: SymbolBlock) {
  drawSymbolsCanvas([block], `${block.symbol}.png`);
}

/* ---------- Balance Story helpers ---------- */
type BalanceRow = { asset: AssetCode; amount: string }; // amount as string for exact paste
const emptyRow = (): BalanceRow => ({ asset: "USDT", amount: "" });

const parseBalanceRowsToMap = (rows: BalanceRow[]) => {
  const m: Record<string, number> = {};
  rows.forEach((r) => {
    const n = Number(r.amount);
    if (!Number.isFinite(n)) return;
    m[r.asset] = (m[r.asset] || 0) + n;
  });
  return m;
};
const mapToPrettyList = (m: Record<string, number>) => {
  const ks = Object.keys(m).filter((k) => gt(m[k]));
  if (!ks.length) return "—";
  return ks.sort().map((a) => `${fmtAbs(m[a])} ${a}`).join(", ");
};

// Allow TSV pasting like "USDT<TAB>300"
function pasteToRows(pasted: string): BalanceRow[] {
  const out: BalanceRow[] = [];
  pasted.split(/\r?\n/).forEach((line) => {
    const [a, val] = line.split(/\t|,|\s{2,}/);
    if (!a || !val) return;
    if (!ALL_ASSETS.includes(a as AssetCode)) return;
    out.push({ asset: a as AssetCode, amount: val.trim() });
  });
  return out.length ? out : [emptyRow()];
}

function filterRowsInRangeUTC(rows: Row[], start?: string, end?: string, exclusiveStart = false) {
  const s = start ? parseUtcMs(normalizeTimeString(start)) : Number.NEGATIVE_INFINITY;
  const e = end ? parseUtcMs(normalizeTimeString(end)) : Number.POSITIVE_INFINITY;
  return rows.filter((r) => {
    if (exclusiveStart ? !(r.ts > s) : !(r.ts >= s)) return false;
    if (!(r.ts <= e)) return false;
    return true;
  });
}

function sumByTypeAndAsset(rows: Row[]) {
  const out = {
    realized: {} as Record<string, { pos: number; neg: number; net: number }>,
    funding: {} as Record<string, { pos: number; neg: number; net: number }>,
    commission: {} as Record<string, { pos: number; neg: number; net: number }>,
    insurance: {} as Record<string, { pos: number; neg: number; net: number }>,
    referral: {} as Record<string, { pos: number; neg: number; net: number }>,
    transferGen: {} as Record<string, { pos: number; neg: number; net: number }>,
    gridbot: {} as Record<string, { pos: number; neg: number; net: number }>,
    coinSwap: {} as Record<string, { pos: number; neg: number; net: number }>,
    autoEx: {} as Record<string, { pos: number; neg: number; net: number }>,
    eventOrders: {} as Record<string, { pos: number; neg: number; net: number }>,
    eventPayouts: {} as Record<string, { pos: number; neg: number; net: number }>,
    otherNonEvent: {} as Record<string, Record<string, { pos: number; neg: number; net: number }>>,
  };

  const push = (map: Record<string, { pos: number; neg: number; net: number }>, r: Row) => {
    const v = (map[r.asset] = map[r.asset] || { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) v.pos += r.amount;
    else v.neg += abs(r.amount);
    v.net += r.amount;
  };

  rows.forEach((r) => {
    switch (r.type) {
      case TYPE.REALIZED_PNL: push(out.realized, r); break;
      case TYPE.FUNDING_FEE: push(out.funding, r); break;
      case TYPE.COMMISSION: push(out.commission, r); break;
      case TYPE.INSURANCE_CLEAR:
      case TYPE.LIQUIDATION_FEE: push(out.insurance, r); break;
      case TYPE.REFERRAL_KICKBACK: push(out.referral, r); break;
      case TYPE.TRANSFER: push(out.transferGen, r); break;
      case TYPE.GRIDBOT_TRANSFER: push(out.gridbot, r); break;
      case TYPE.COIN_SWAP_DEPOSIT:
      case TYPE.COIN_SWAP_WITHDRAW: push(out.coinSwap, r); break;
      case TYPE.AUTO_EXCHANGE: push(out.autoEx, r); break;
      case TYPE.EVENT_ORDER: push(out.eventOrders, r); break;
      case TYPE.EVENT_PAYOUT: push(out.eventPayouts, r); break;
      default:
        if (!r.type.startsWith(EVENT_PREFIX)) {
          const m = (out.otherNonEvent[r.type] = out.otherNonEvent[r.type] || {});
          push(m, r);
        }
    }
  });

  return out;
}

function addMaps(a: Record<string, number>, b: Record<string, { net: number }>) {
  Object.entries(b).forEach(([asset, v]) => (a[asset] = (a[asset] || 0) + (v?.net || 0)));
}
function addNestedMaps(a: Record<string, number>, nested: Record<string, Record<string, { net: number }>>) {
  Object.values(nested).forEach((perAsset) => addMaps(a, perAsset));
}

/* ---------- main app ---------- */
export default function App() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [diags, setDiags] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "swaps" | "events" | "raw">("summary");
  const [error, setError] = useState("");

  const [showFullPreview, setShowFullPreview] = useState(false);
  const [fullPreviewText, setFullPreviewText] = useState("");

  const [symbolFilter, setSymbolFilter] = useState<string>("ALL");

  // Balance Story drawer state
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyMode, setStoryMode] = useState<"A" | "B" | "C">(() => (localStorage.getItem("storyMode") as any) || "A");

  const [storyT0, setStoryT0] = useState<string>(() => localStorage.getItem("storyT0") || "");
  const [storyT1, setStoryT1] = useState<string>(() => localStorage.getItem("storyT1") || ""); // end or To

  const [transferAsset, setTransferAsset] = useState<AssetCode>("USDT");
  const [transferAmount, setTransferAmount] = useState<string>("");

  const [beforeRows, setBeforeRows] = useState<BalanceRow[]>([emptyRow()]);
  const [afterRows, setAfterRows] = useState<BalanceRow[]>([emptyRow()]);
  const [fromRows, setFromRows] = useState<BalanceRow[]>([emptyRow()]);

  const [includeEvents, setIncludeEvents] = useState<boolean>(() => localStorage.getItem("storyIncEvents") === "1" ? true : false);
  const [includeGridbot, setIncludeGridbot] = useState<boolean>(() => localStorage.getItem("storyIncGridbot") !== "0");

  const [storyPreviewOpen, setStoryPreviewOpen] = useState(false);
  const [storyText, setStoryText] = useState("");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rightPct, setRightPct] = useState<number>(() => {
    const v = localStorage.getItem("paneRightPct");
    const n = v ? Number(v) : 45;
    return isFinite(n) ? Math.min(60, Math.max(36, n)) : 45;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const cw = rect.width;
      const newRightPct = ((cw - x) / cw) * 100;
      const minPct = (420 / cw) * 100; // raised min width
      const clamped = Math.min(60, Math.max(minPct, newRightPct));
      setRightPct(clamped);
    }
    function onUp() {
      if (dragging) {
        setDragging(false);
        localStorage.setItem("paneRightPct", String(Math.round(rightPct)));
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, rightPct]);

  const parsed = rows;
  const nonEvent = useMemo(() => onlyNonEvents(parsed), [parsed]);
  const events = useMemo(() => onlyEvents(parsed), [parsed]);

  const realized = useMemo(() => nonEvent.filter((r) => r.type === TYPE.REALIZED_PNL), [nonEvent]);
  const commission = useMemo(() => parsed.filter((r) => r.type === TYPE.COMMISSION), [parsed]);
  const referralKick = useMemo(() => parsed.filter((r) => r.type === TYPE.REFERRAL_KICKBACK), [parsed]);
  const funding = useMemo(() => parsed.filter((r) => r.type === TYPE.FUNDING_FEE), [parsed]);
  const insurance = useMemo(
    () => parsed.filter((r) => r.type === TYPE.INSURANCE_CLEAR || r.type === TYPE.LIQUIDATION_FEE),
    [parsed]
  );
  const transfers = useMemo(() => parsed.filter((r) => r.type === TYPE.TRANSFER), [parsed]);
  const gridbotTransfers = useMemo(() => parsed.filter((r) => r.type === TYPE.GRIDBOT_TRANSFER), [parsed]);

  const coinSwapLines = useMemo(() => groupSwaps(parsed, "COIN_SWAP"), [parsed]);
  const autoExLines = useMemo(() => groupSwaps(parsed, "AUTO_EXCHANGE"), [parsed]);

  const otherTypesNonEvent = useMemo(
    () => parsed.filter((r) => !KNOWN_TYPES.has(r.type) && !r.type.startsWith(EVENT_PREFIX)),
    [parsed]
  );
  const eventOther = useMemo(() => events.filter((r) => !EVENT_KNOWN_CORE.has(r.type)), [events]);

  // Per-asset summaries
  const realizedByAsset = useMemo(() => sumByAsset(realized), [realized]);
  const commissionByAsset = useMemo(() => sumByAsset(commission), [commission]);
  const referralByAsset = useMemo(() => sumByAsset(referralKick), [referralKick]);
  const fundingByAsset = useMemo(() => sumByAsset(funding), [funding]);
  const insuranceByAsset = useMemo(() => sumByAsset(insurance), [insurance]);
  const transfersByAsset = useMemo(() => sumByAsset(transfers), [transfers]);
  const gridbotByAsset = useMemo(() => sumByAsset(gridbotTransfers), [gridbotTransfers]);

  // Events & KPIs
  const eventsOrderByAsset = useMemo(() => sumByAsset(events.filter((r) => r.type === TYPE.EVENT_ORDER)), [events]);
  const eventsPayoutByAsset = useMemo(() => sumByAsset(events.filter((r) => r.type === TYPE.EVENT_PAYOUT)), [events]);

  const coinSwapAggByAsset = useMemo(
    () => sumByAsset(parsed.filter((r) => r.type === TYPE.COIN_SWAP_DEPOSIT || r.type === TYPE.COIN_SWAP_WITHDRAW)),
    [parsed]
  );
  const autoExAggByAsset = useMemo(
    () => sumByAsset(parsed.filter((r) => r.type === TYPE.AUTO_EXCHANGE)),
    [parsed]
  );

  const allSymbolBlocks = useMemo(() => bySymbolSummary(nonEvent), [nonEvent]);

  const symbolBlocks = useMemo(() => {
    if (symbolFilter === "ALL") return allSymbolBlocks;
    return allSymbolBlocks.filter((b) => b.symbol === symbolFilter);
  }, [allSymbolBlocks, symbolFilter]);

  // Boundaries (true UTC)
  const minTs = useMemo(() => (rows.length ? Math.min(...rows.map((r) => r.ts)) : NaN), [rows]);
  const maxTs = useMemo(() => (rows.length ? Math.max(...rows.map((r) => r.ts)) : NaN), [rows]);
  const minTime = Number.isFinite(minTs) ? tsToUtcString(minTs) : "";
  const maxTime = Number.isFinite(maxTs) ? tsToUtcString(maxTs) : "";

  function runParse(tsv: string) {
    setError("");
    try {
      const { rows: rs, diags } = parseBalanceLog(tsv);
      if (!rs.length) throw new Error("No valid rows detected.");
      setRows(rs);
      setDiags(diags);
      setActiveTab("summary");
    } catch (e: any) {
      setError(e?.message || String(e));
      setRows([]);
      setDiags([]);
    }
  }
  function onParse() {
    runParse(input);
  }
  function onPasteAndParseText() {
    if (navigator.clipboard?.readText) {
      navigator.clipboard.readText().then((t) => {
        setInput(t);
        setTimeout(() => runParse(t), 0);
      });
    }
  }
  function copyText(text: string) {
    if (!navigator.clipboard) return alert("Clipboard API not available");
    navigator.clipboard.writeText(text).catch(() => alert("Copy failed"));
  }

  /* ---------- Copy helpers ---------- */
  function copySummary() {
    const L: string[] = [];
    L.push("FD Summary (UTC+0)", "");
    const section = (title: string, map: Record<string, { pos: number; neg: number; net?: number }>) => {
      const keys = Object.keys(map);
      if (!keys.length) return;
      L.push(title + ":");
      keys.forEach((asset) => {
        const v = map[asset];
        if (gt(v.pos)) L.push(`  Received ${asset}: +${fmtAbs(v.pos)}`);
        if (gt(v.neg)) L.push(`  Paid ${asset}: −${fmtAbs(v.neg)}`);
        if (typeof v.net === "number" && gt(v.net)) L.push(`  Net ${asset}: ${fmtSigned(v.net)}`);
      });
      L.push("");
    };
    section("Realized PnL (Futures, not Events)", realizedByAsset);
    section("Trading Fees / Commission", commissionByAsset);
    section("Referral Kickback", referralByAsset);
    section("Funding Fees", fundingByAsset);
    section("Insurance / Liquidation", insuranceByAsset);
    section("Transfers (General)", transfersByAsset);
    if (Object.keys(gridbotByAsset).length) section("Futures GridBot Wallet Transfers", gridbotByAsset);

    if (otherTypesNonEvent.length) {
      const byType: Record<string, Row[]> = {};
      otherTypesNonEvent.forEach((r) => ((byType[r.type] = byType[r.type] || []).push(r)));
      L.push("Other Types (non-event):");
      Object.keys(byType)
        .sort()
        .forEach((t) => {
          const m = sumByAsset(byType[t]);
          L.push(`  ${friendlyTypeName(t)}:`);
          Object.entries(m).forEach(([asset, v]) => {
            if (gt(v.pos)) L.push(`    Received ${asset}: +${fmtAbs(v.pos)}`);
            if (gt(v.neg)) L.push(`    Paid ${asset}: −${fmtAbs(v.neg)}`);
            if (gt(v.net)) L.push(`    Net ${asset}: ${fmtSigned(v.net)}`);
          });
        });
    }
    copyText(L.join("\n"));
  }

  const totalByAsset = useMemo(() => {
    const totals: Record<string, number> = {};
    const bump = (map: Record<string, { net: number }>) => {
      Object.entries(map).forEach(([a, v]) => (totals[a] = (totals[a] ?? 0) + (v?.net ?? 0)));
    };
    bump(realizedByAsset);
    bump(commissionByAsset);
    bump(referralByAsset);
    bump(fundingByAsset);
    bump(insuranceByAsset);
    bump(coinSwapAggByAsset);
    bump(autoExAggByAsset);
    bump(eventsOrderByAsset);
    bump(eventsPayoutByAsset);
    bump(transfersByAsset);
    bump(gridbotByAsset);
    return totals;
  }, [
    realizedByAsset,
    commissionByAsset,
    referralByAsset,
    fundingByAsset,
    insuranceByAsset,
    coinSwapAggByAsset,
    autoExAggByAsset,
    eventsOrderByAsset,
    eventsPayoutByAsset,
    transfersByAsset,
    gridbotByAsset,
  ]);

  function buildFullResponse(): string {
    if (!rows.length) return "No data.";

    const otherByType: Record<string, { [asset: string]: { pos: number; neg: number; net: number } }> = {};
    otherTypesNonEvent.forEach((r) => {
      const bucket = (otherByType[r.type] = otherByType[r.type] || {});
      const cur = (bucket[r.asset] = bucket[r.asset] || { pos: 0, neg: 0, net: 0 });
      if (r.amount >= 0) cur.pos += r.amount; else cur.neg += abs(r.amount);
      cur.net += r.amount;
    });

    const assets = new Set<string>([
      ...Object.keys(realizedByAsset),
      ...Object.keys(commissionByAsset),
      ...Object.keys(referralByAsset),
      ...Object.keys(fundingByAsset),
      ...Object.keys(insuranceByAsset),
      ...Object.keys(coinSwapAggByAsset),
      ...Object.keys(autoExAggByAsset),
      ...Object.keys(eventsOrderByAsset),
      ...Object.keys(eventsPayoutByAsset),
      ...Object.keys(transfersByAsset),
      ...Object.keys(gridbotByAsset),
      ...Object.values(otherByType).flatMap((m) => Object.keys(m)),
    ]);

    const L: string[] = [];
    L.push("Summary of your balance log (UTC+0):", "");
    const pushIf = (cond: boolean, line: string) => { if (cond) L.push(line); };

    Array.from(assets).sort().forEach((asset) => {
      const r = realizedByAsset[asset];
      const c = commissionByAsset[asset];
      const rk = referralByAsset[asset];
      const f = fundingByAsset[asset];
      const i = insuranceByAsset[asset];
      const cs = coinSwapAggByAsset[asset];
      const ae = autoExAggByAsset[asset];
      const eo = eventsOrderByAsset[asset];
      const ep = eventsPayoutByAsset[asset];
      const tr = transfersByAsset[asset];
      const gb = gridbotByAsset[asset];

      L.push(`Asset: ${asset}`);

      if (r) { pushIf(gt(r.pos), `  Profit in ${asset}: +${fmtAbs(r.pos)}`); pushIf(gt(r.neg), `  Loss in ${asset}: −${fmtAbs(r.neg)}`); }
      if (c) { pushIf(gt(c.neg), `  Trading Fee in ${asset}: −${fmtAbs(c.neg)}`); pushIf(gt(c.pos), `  Trading Fee refunds in ${asset}: +${fmtAbs(c.pos)}`); }
      if (rk){ pushIf(gt(rk.pos), `  Fee Rebate in ${asset}: +${fmtAbs(rk.pos)}`); pushIf(gt(rk.neg), `  Fee Rebate adjustments in ${asset}: −${fmtAbs(rk.neg)}`); }
      if (f) { pushIf(gt(f.pos), `  Funding Fee Received in ${asset}: +${fmtAbs(f.pos)}`); pushIf(gt(f.neg), `  Funding Fee Paid in ${asset}: −${fmtAbs(f.neg)}`); }
      if (i) { pushIf(gt(i.pos), `  Liquidation Clearance Fee Received in ${asset}: +${fmtAbs(i.pos)}`); pushIf(gt(i.neg), `  Liquidation Clearance Fee Paid in ${asset}: −${fmtAbs(i.neg)}`); }
      if (cs){ pushIf(gt(cs.pos), `  Coin Swaps Received ${asset}: +${fmtAbs(cs.pos)}`); pushIf(gt(cs.neg), `  Coin Swaps Used ${asset}: −${fmtAbs(cs.neg)}`); }
      if (ae){ pushIf(gt(ae.pos), `  Auto-Exchange Received ${asset}: +${fmtAbs(ae.pos)}`); pushIf(gt(ae.neg), `  Auto-Exchange Used ${asset}: −${fmtAbs(ae.neg)}`); }
      if (ep) pushIf(gt(ep.pos), `  Event Contracts Payout ${asset}: +${fmtAbs(ep.pos)}`);
      if (eo) pushIf(gt(eo.neg), `  Event Contracts Order ${asset}: −${fmtAbs(eo.neg)}`);

      if (tr && (gt(tr.pos) || gt(tr.neg))) {
        L.push(`  Transfers (General) — Received ${asset}: +${fmtAbs(tr.pos)} / Paid ${asset}: −${fmtAbs(tr.neg)}`);
      }
      if (gb && (gt(gb.pos) || gt(gb.neg))) {
        L.push(`  Total Transfer To/From the Futures GridBot Wallet — ${asset}: −${fmtAbs(gb.neg)} / +${fmtAbs(gb.pos)}`);
      }

      const net = totalByAsset[asset] ?? 0;
      if (gt(net)) L.push(`  The Total Amount in ${asset} for all the transaction history is: ${fmtSigned(net)} ${asset}`);
      L.push("");
    });

    return L.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function copyFullResponse() { copyText(buildFullResponse()); }
  function openFullPreview() { setFullPreviewText(buildFullResponse()); setShowFullPreview(true); }
  function copySwaps(list: { text: string }[], title: string) {
    const L: string[] = [`${title} (UTC+0)`, ""];
    if (!list.length) L.push("None"); else list.forEach((s) => L.push(`- ${s.text}`));
    copyText(L.join("\n"));
  }
  function copyEvents() {
    const byOrder = eventsOrderByAsset;
    const byPayout = eventsPayoutByAsset;
    const assets = Array.from(new Set([...Object.keys(byOrder), ...Object.keys(byPayout)])).sort();

    const L: string[] = ["Event Contracts (UTC+0)", ""];
    if (!assets.length) L.push("None");
    else {
      assets.forEach((asset) => {
        const p = byPayout[asset] || { pos: 0, neg: 0, net: 0 };
        const o = byOrder[asset] || { pos: 0, neg: 0, net: 0 };
        const net = (p.net || 0) + (o.net || 0);
        L.push(`${asset}: Payouts +${fmtAbs(p.pos)}, Orders −${fmtAbs(o.neg)}, Net ${fmtSigned(net)}`);
      });
    }
    const eventOther = events.filter((r) => !EVENT_KNOWN_CORE.has(r.type));
    if (eventOther.length) {
      L.push("", "Event – Other Activity:");
      const byType: Record<string, Row[]> = {};
      eventOther.forEach((r) => ((byType[r.type] = byType[r.type] || []).push(r)));
      Object.keys(byType).sort().forEach((t) => {
        const m = sumByAsset(byType[t]);
        L.push(`  ${friendlyTypeName(t)}:`);
        Object.entries(m).forEach(([asset, v]) => {
          L.push(`    Received ${asset}: +${fmtAbs(v.pos)}`);
          L.push(`    Paid ${asset}: −${fmtAbs(v.neg)}`);
          L.push(`    Net ${asset}: ${fmtSigned(v.net)}`);
        });
      });
    }
    copyText(L.join("\n"));
  }
  function copyOneSymbol(b: SymbolBlock) {
    const L: string[] = [];
    L.push(`${b.symbol} (UTC+0)`);
    const push = (name: string, m: Record<string, { pos: number; neg: number }>) => {
      const txt = pairsToText(m);
      if (txt !== "–") L.push(`  ${name}: ${txt}`);
    };
    push("Realized PnL", b.realizedByAsset);
    push("Funding", b.fundingByAsset);
    push("Trading Fees", b.commByAsset);
    push("Insurance", b.insByAsset);
    copyText(L.join("\n"));
  }
  function copyAllSymbolsText() {
    if (!allSymbolBlocks.length) return copyText("No symbol activity.");
    const L: string[] = ["By Symbol (Futures, not Events)", ""];
    allSymbolBlocks.forEach((b) => {
      const lines: string[] = [];
      const add = (name: string, m: Record<string, { pos: number; neg: number }>) => {
        const txt = pairsToText(m);
        if (txt !== "–") lines.push(`  ${name}: ${txt}`);
      };
      add("Realized PnL", b.realizedByAsset);
      add("Funding", b.fundingByAsset);
      add("Trading Fees", b.commByAsset);
      add("Insurance", b.insByAsset);
      if (lines.length) {
        L.push(b.symbol);
        L.push(...lines);
        L.push("");
      }
    });
    copyText(L.join("\n").trim());
  }
  function saveSymbolsPng() {
    const blocks = (symbolBlocks.length ? symbolBlocks : allSymbolBlocks);
    if (!blocks.length) return;
    drawSymbolsCanvas(blocks, "symbols_table.png");
  }
  function copyRaw() {
    if (!rows.length) return;
    const headers = ["time", "type", "asset", "amount", "symbol", "id", "uid", "extra"];
    const L = [headers.join("\t")];
    rows.forEach((r) => L.push([r.time, r.type, r.asset, r.amount, r.symbol, r.id, r.uid, r.extra].join("\t")));
    copyText(L.join("\n"));
  }

  /* ---------- KPIs ---------- */
  const symbolNetStats = useMemo(() => {
    const stats: { symbol: string; net: number }[] = [];
    allSymbolBlocks.forEach((b) => {
      let net = 0;
      const addMap = (m: Record<string, { pos: number; neg: number }>) => {
        Object.values(m).forEach((v) => (net += v.pos - v.neg));
      };
      addMap(b.realizedByAsset); addMap(b.fundingByAsset); addMap(b.commByAsset); addMap(b.insByAsset);
      stats.push({ symbol: b.symbol, net });
    });
    stats.sort((a, b) => b.net - a.net);
    return stats;
  }, [allSymbolBlocks]);

  const topWinner = symbolNetStats[0];
  const topLoser = symbolNetStats.slice().reverse()[0];

  const kpis = useMemo(() => ({
    tradesParsed: rows.length,
    activeSymbols: allSymbolBlocks.length,
    topWinner,
    topLoser,
  }), [rows.length, allSymbolBlocks.length, topWinner, topLoser]);

  const focusSymbolRow = (symbol?: string) => {
    if (!symbol) return;
    setTimeout(() => {
      const el = document.getElementById(`row-${symbol}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.animate([{ backgroundColor: "#fff2" }, { backgroundColor: "transparent" }], { duration: 1200 });
    }, 60);
  };

  // persist some story settings
  useEffect(() => { localStorage.setItem("storyMode", storyMode); }, [storyMode]);
  useEffect(() => { localStorage.setItem("storyT0", storyT0); }, [storyT0]);
  useEffect(() => { localStorage.setItem("storyT1", storyT1); }, [storyT1]);
  useEffect(() => { localStorage.setItem("storyIncEvents", includeEvents ? "1" : "0"); }, [includeEvents]);
  useEffect(() => { localStorage.setItem("storyIncGridbot", includeGridbot ? "1" : "0"); }, [includeGridbot]);

  // Auto-compute AFTER in Mode A based on BEFORE + transfer
  useEffect(() => {
    if (storyMode !== "A") return;
    const before = parseBalanceRowsToMap(beforeRows);
    const aft = { ...before };
    const amt = Number(transferAmount);
    if (Number.isFinite(amt)) aft[transferAsset] = (aft[transferAsset] || 0) + amt;
    // sync afterRows UI to the computed values (preserve ordering)
    const list: BalanceRow[] = [];
    const aset: AssetCode[] = [...ALL_ASSETS];
    aset.forEach((a) => {
      if (a in aft) list.push({ asset: a, amount: String(aft[a]) });
    });
    if (!list.length) list.push(emptyRow());
    setAfterRows(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyMode, beforeRows, transferAsset, transferAmount]);

  /* ---------- Balance Story generator ---------- */
  function buildBalanceStory(): string {
    if (!rows.length) return "No parsed rows yet. Paste & Parse first.";

    // Figure time window
    let T0 = storyT0 || minTime || "";
    let T1 = storyT1 || maxTime || "";
    if (!T0) return "Please provide a start time (UTC+0).";
    T0 = normalizeTimeString(T0);
    if (T1) T1 = normalizeTimeString(T1);

    // Mode A/B: exclude the anchor second (since BEFORE→AFTER happens exactly at T0)
    const exclusiveStart = storyMode === "A" || (storyMode === "B");

    // Anchor balances
    let anchorAfter: Record<string, number> | undefined;
    let anchorBefore: Record<string, number> | undefined;

    if (storyMode === "A") {
      anchorBefore = parseBalanceRowsToMap(beforeRows);
      const amt = Number(transferAmount) || 0;
      anchorAfter = { ...anchorBefore };
      anchorAfter[transferAsset] = (anchorAfter[transferAsset] || 0) + amt;
    } else if (storyMode === "B") {
      anchorAfter = parseBalanceRowsToMap(afterRows);
      // If transfer provided in mode B, infer BEFORE
      if (transferAmount.trim()) {
        const amt = Number(transferAmount) || 0;
        anchorBefore = { ...anchorAfter };
        anchorBefore[transferAsset] = (anchorBefore[transferAsset] || 0) - amt;
      }
    } else if (storyMode === "C") {
      anchorAfter = undefined; // not used for calc
      anchorBefore = parseBalanceRowsToMap(fromRows);
      if (!storyT1) T1 = maxTime;
      if (!storyT0) T0 = minTime;
    }

    // Filter window rows (robust UTC compare)
    const windowRows = filterRowsInRangeUTC(rows, T0, T1, exclusiveStart);

    // Split events if needed for math
    const rowsForMath = windowRows.filter((r) => {
      if (!includeGridbot && r.type === TYPE.GRIDBOT_TRANSFER) return false;
      if (!includeEvents && r.type.startsWith(EVENT_PREFIX)) return false;
      return true;
    });

    // Single-source aggregation for display and for math
    const catsDisplay = sumByTypeAndAsset(windowRows);
    const catsMath = sumByTypeAndAsset(rowsForMath);

    // Unified delta map (includes Other Types)
    const deltaByAsset: Record<string, number> = {};
    addMaps(deltaByAsset, catsMath.realized);
    addMaps(deltaByAsset, catsMath.funding);
    addMaps(deltaByAsset, catsMath.commission);
    addMaps(deltaByAsset, catsMath.insurance);
    addMaps(deltaByAsset, catsMath.referral);
    addMaps(deltaByAsset, catsMath.transferGen);
    addMaps(deltaByAsset, catsMath.gridbot);
    addMaps(deltaByAsset, catsMath.coinSwap);
    addMaps(deltaByAsset, catsMath.autoEx);
    if (includeEvents) {
      addMaps(deltaByAsset, catsMath.eventPayouts);
      addMaps(deltaByAsset, catsMath.eventOrders);
    }
    addNestedMaps(deltaByAsset, catsMath.otherNonEvent); // include Other Types in delta

    // Expected balances at T1
    let expectedAtEnd: Record<string, number> | undefined;
    if (storyMode === "A" || storyMode === "B") {
      if (!anchorAfter) return "Please provide AFTER balances at the anchor time.";
      expectedAtEnd = { ...anchorAfter };
      Object.entries(deltaByAsset).forEach(([a, v]) => { expectedAtEnd![a] = (expectedAtEnd![a] || 0) + v; });
    } else if (storyMode === "C") {
      if (Object.keys(anchorBefore || {}).length) {
        expectedAtEnd = { ...(anchorBefore as Record<string, number>) };
        Object.entries(deltaByAsset).forEach(([a, v]) => { expectedAtEnd![a] = (expectedAtEnd![a] || 0) + v; });
      }
    }

    // Build narrative
    const L: string[] = [];

    if (storyMode === "A") {
      const amt = Number(transferAmount) || 0;
      L.push(`${T0} (UTC+0) — You made a TRANSFER of ${fmtSigned(amt)} ${transferAsset} to your Futures USDⓂ Wallet.`);
      if (anchorBefore && anchorAfter) {
        L.push(`With this transfer your wallet moved from:`);
        L.push("  BEFORE at T0:");
        L.push(`    ${mapToPrettyList(anchorBefore)}`);
        L.push("  AFTER at T0:");
        L.push(`    ${mapToPrettyList(anchorAfter)}`);
      }
      L.push("");
    } else if (storyMode === "B") {
      L.push(`Snapshot at ${T0} (UTC+0) — Wallet AFTER snapshot:`);
      if (anchorAfter) L.push(`  ${mapToPrettyList(anchorAfter)}`);
      if (anchorBefore) {
        L.push("Inferred BEFORE (from provided transfer):");
        L.push(`  ${mapToPrettyList(anchorBefore)}`);
      }
      L.push("");
    } else {
      L.push(`Between ${T0} and ${T1} (UTC+0):`);
      if (anchorBefore && Object.keys(anchorBefore).length) {
        L.push("  Balances at start (agent-provided):");
        L.push(`    ${mapToPrettyList(anchorBefore)}`);
      }
      L.push("");
    }

    L.push("From your transaction history in this window, here's what happened:");

    const section = (title: string, m: Record<string, { pos: number; neg: number; net: number }>, opts?: { showNet?: boolean }) => {
      const assets = Object.keys(m).filter((a) => gt(m[a].pos) || gt(m[a].neg) || gt(m[a].net));
      if (!assets.length) return;
      L.push(`- ${title}:`);
      assets.sort().forEach((a) => {
        const v = m[a];
        const parts: string[] = [];
        if (gt(v.pos)) parts.push(`+${fmtAbs(v.pos)}`);
        if (gt(v.neg)) parts.push(`−${fmtAbs(v.neg)}`);
        if (opts?.showNet && gt(v.net)) parts.push(`${fmtSigned(v.net)}`);
        L.push(`    ${a}: ${parts.join(" / ") || "0"}`);
      });
    };

    section("Realized PnL", catsDisplay.realized);
    section("Trading Fees / Commission", catsDisplay.commission);
    section("Referral Kickback", catsDisplay.referral);
    section("Funding Fees", catsDisplay.funding);
    section("Insurance / Liquidation", catsDisplay.insurance);
    section("Transfers (General)", catsDisplay.transferGen, { showNet: true });
    if (includeGridbot) section("Futures GridBot Wallet transfers", catsDisplay.gridbot, { showNet: true });
    section("Coin Swaps", catsDisplay.coinSwap, { showNet: true });
    section("Auto-Exchange", catsDisplay.autoEx, { showNet: true });

    // Event Contracts always listed; note inclusion status
    const eventNote = includeEvents
      ? " (included in balance math)"
      : " (not included in balance math)";
    section(`Event Contracts — Payouts${eventNote}`, catsDisplay.eventPayouts);
    section(`Event Contracts — Orders${eventNote}`, catsDisplay.eventOrders);

    // Other non-event types
    const otherKeys = Object.keys(catsDisplay.otherNonEvent).sort();
    otherKeys.forEach((t) => {
      section(`Other — ${friendlyTypeName(t)}`, catsDisplay.otherNonEvent[t], { showNet: true });
    });

    L.push("");

    if (expectedAtEnd) {
      const endLabel = T1 || maxTime;
      L.push(`${endLabel} (UTC+0) — Expected wallet balances based on this activity:`);
      const ks = Object.keys(expectedAtEnd).filter((k) => gt(expectedAtEnd![k]));
      if (ks.length) {
        L.push("  " + ks.sort().map((a) => `${fmtAbs(expectedAtEnd![a])} ${a}`).join(", "));
      } else {
        L.push("  —");
      }

      // Reconciliation line (per anchored asset)
      const anchor = (storyMode === "A" || storyMode === "B") ? (anchorAfter || {}) : (anchorBefore || {});
      const assets = Array.from(new Set([...Object.keys(anchor), ...Object.keys(deltaByAsset)])).sort();
      if (assets.length) {
        L.push("");
        L.push("Reconciliation (per asset):");
        assets.forEach((a) => {
          const start = anchor[a] || 0;
          const d = deltaByAsset[a] || 0;
          const exp = (expectedAtEnd![a] || 0);
          L.push(`  ${a}: T0 ${fmtAbs(start)} + Net ${fmtSigned(d)} = ${fmtAbs(exp)}`);
        });
      }
    } else if (storyMode === "C" && !Object.keys(anchorBefore || {}).length) {
      L.push("Note: No starting balances were provided for the window, so this story lists activity but does not compute expected balances at the end.");
    }

    return L.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function openStoryPreview() {
    const txt = buildBalanceStory();
    setStoryText(txt);
    setStoryPreviewOpen(true);
  }

  return (
    <div className="wrap">
      <style>{css}</style>

      <header className="header">
        <div>
          <h1>Balance Log Analyzer</h1>
          <div className="muted">All times are UTC+0</div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onPasteAndParseText}>Paste plain text & Parse</button>
          <button className="btn" onClick={() => alert('To parse, paste a table below or raw text, then click Parse.')}>Help</button>
        </div>
      </header>

      {/* Paste */}
      <section className="space">
        <GridPasteBox onUseTSV={(tsv) => { setInput(tsv); runParse(tsv); }} onError={(m) => setError(m)} />
        <details className="card" style={{ marginTop: 8 }}>
          <summary className="card-head" style={{ cursor: "pointer" }}><h3>Manual Paste (fallback)</h3></summary>
          <textarea className="paste" placeholder="Paste raw text or TSV here" value={input} onChange={(e) => setInput(e.target.value)} />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn btn-dark" onClick={onParse}>Parse</button>
            <button className="btn" onClick={() => { setInput(""); setError(""); }}>Clear</button>
          </div>
          {error && <p className="error">{error}</p>}
          {!!diags.length && (
            <details className="diags">
              <summary>Diagnostics ({diags.length})</summary>
              <textarea className="diagbox" value={diags.join("\n")} readOnly />
            </details>
          )}
        </details>
      </section>

      {/* Tabs */}
      <nav className="tabs">
        {[
          { key: "summary", label: "Summary" },
          { key: "swaps", label: "Coin Swaps" },
          { key: "events", label: "Event Contracts" },
          { key: "raw", label: "Raw Log" },
        ].map((t) => (
          <button key={t.key} className={`tab ${activeTab === (t.key as any) ? "active" : ""}`} onClick={() => setActiveTab(t.key as any)}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* SUMMARY */}
      {activeTab === "summary" && rows.length > 0 && (
        <section className="space">
          {/* KPI HEADER */}
          <div className="kpi sticky card">
            {/* Asset tiles row (USDT/USDC/BNFCR Realized PnL only) */}
            <div className="kpi-row asset-tiles">
              {["USDT", "USDC", "BNFCR"].map((a) => {
                const v = realizedByAsset[a] || { pos: 0, neg: 0, net: 0 };
                const hasPos = gt(v.pos);
                const hasNeg = gt(v.neg);
                const net = v.net || 0;
                const netClass = net > 0 ? "good" : net < 0 ? "bad" : "muted";
                const aria = `${a} — Net ${gt(net) ? fmtSigned(net) : "0"}; Received ${hasPos ? `+${fmtAbs(v.pos)}` : "0"}; Paid ${hasNeg ? `−${fmtAbs(v.neg)}` : "0"} (UTC+0)`;
                return (
                  <div key={a} className="asset-tile" aria-label={aria} title={`Realized PnL in ${a}`}>
                    <div className="asset-title">{a}</div>
                    <div className={`asset-net ${netClass}`}>{gt(net) ? fmtSigned(net) : "0"}</div>
                    <div className="asset-chips">
                      <span className={`chip ${hasPos ? "good" : "muted"}`}>{hasPos ? `+${fmtAbs(v.pos)}` : "—"}</span>
                      <span className={`chip ${hasNeg ? "bad" : "muted"}`}>{hasNeg ? `−${fmtAbs(v.neg)}` : "—"}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* KPIs & actions row */}
            <div className="kpi-row topbar">
              <div className="kpigrid">
                <div className="kpi-block"><div className="kpi-title">Trades parsed</div><div className="kpi-num">{kpis.tradesParsed}</div></div>
                <div className="kpi-block"><div className="kpi-title">Active symbols</div><div className="kpi-num">{kpis.activeSymbols}</div></div>
                <button className="kpi-block as-btn" onClick={() => { if (!kpis.topWinner) return; setSymbolFilter(kpis.topWinner.symbol); focusSymbolRow(kpis.topWinner.symbol); }} disabled={!kpis.topWinner}>
                  <div className="kpi-title">Top winner</div><div className="kpi-num">{kpis.topWinner ? `${kpis.topWinner.symbol} ${fmtSigned(kpis.topWinner.net)}` : "—"}</div>
                </button>
                <button className="kpi-block as-btn" onClick={() => { if (!kpis.topLoser) return; setSymbolFilter(kpis.topLoser.symbol); focusSymbolRow(kpis.topLoser.symbol); }} disabled={!kpis.topLoser}>
                  <div className="kpi-title">Top loser</div><div className="kpi-num">{kpis.topLoser ? `${kpis.topLoser.symbol} ${fmtSigned(kpis.topLoser.net)}` : "—"}</div>
                </button>
              </div>

              <div className="kpi-actions btn-row">
                <button className="btn btn-success" onClick={copySummary}>Copy Summary (no Swaps)</button>
                <button className="btn" onClick={copyFullResponse}>Copy Response (Full)</button>
                <button className="btn" onClick={openFullPreview}>Preview/Edit Full Response</button>
                <button className="btn btn-dark" onClick={() => setStoryOpen(true)}>Balance Story</button>
              </div>
            </div>
          </div>

          {/* Dual-pane: LEFT | SPLITTER | RIGHT */}
          <div
            className="dual"
            ref={containerRef}
            style={{ gridTemplateColumns: `minmax(0,1fr) ${SPLIT_W}px ${Math.round(rightPct)}%` }}
          >
            {/* LEFT */}
            <div className="left">
              <div className="grid three">
                <RpnCard title="Trading Fees / Commission" map={commissionByAsset} />
                <RpnCard title="Referral Kickback" map={referralByAsset} />
                <RpnCard title="Funding Fees" map={fundingByAsset} />
                <RpnCard title="Insurance / Liquidation" map={insuranceByAsset} />

                <div className="card">
                  <div className="card-head"><h3>Transfers</h3></div>
                  <div className="stack">
                    <div className="typecard">
                      <div className="card-head"><h4>General</h4></div>
                      <ul className="kv">
                        {Object.keys(transfersByAsset).length ? (
                          Object.entries(transfersByAsset).map(([asset, v]) => (
                            <li key={asset} className="kv-row">
                              <span className="label">{asset}</span>
                              {gt(v.pos) ? <span className="num good">+{fmtAbs(v.pos)}</span> : <span className="num muted">–</span>}
                              {gt(v.neg) ? <span className="num bad">−{fmtAbs(v.neg)}</span> : <span className="num muted">–</span>}
                              {gt(v.net) ? <span className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span> : <span className="num muted">–</span>}
                            </li>
                          ))
                        ) : (<li className="kv-row"><span className="muted">None</span></li>)}
                      </ul>
                    </div>

                    <div className="typecard">
                      <div className="card-head"><h4>Futures GridBot Wallet</h4></div>
                      <ul className="kv">
                        {Object.keys(gridbotByAsset).length ? (
                          Object.entries(gridbotByAsset).map(([asset, v]) => (
                            <li key={asset} className="kv-row">
                              <span className="label">{asset}</span>
                              {gt(v.pos) ? <span className="num good">+{fmtAbs(v.pos)}</span> : <span className="num muted">–</span>}
                              {gt(v.neg) ? <span className="num bad">−{fmtAbs(v.neg)}</span> : <span className="num muted">–</span>}
                              {gt(v.net) ? <span className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span> : <span className="num muted">–</span>}
                            </li>
                          ))
                        ) : (<li className="kv-row"><span className="muted">None</span></li>)}
                      </ul>
                    </div>
                  </div>
                </div>

                {otherTypesNonEvent.length > 0 && (
                  <div className="card">
                    <div className="card-head"><h3>Other Types (non-event)</h3></div>
                    <OtherTypesBlock rows={otherTypesNonEvent} />
                  </div>
                )}
              </div>
            </div>

            {/* SPLITTER */}
            <div className={`splitter ${dragging ? "drag" : ""}`} onMouseDown={() => setDragging(true)} title="Drag to resize" />

            {/* RIGHT */}
            <div className="right card">
              <div className="card-head" style={{ gap: 12 }}>
                <h3>By Symbol (Futures, not Events)</h3>
                <div className="btn-row">
                  <label className="muted" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span>Filter:</span>
                    <select className="select" value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)}>
                      <option value="ALL">All symbols</option>
                      {allSymbolBlocks.map((b) => <option key={b.symbol} value={b.symbol}>{b.symbol}</option>)}
                    </select>
                  </label>
                  <button className="btn" onClick={copyAllSymbolsText}>Copy Symbols (text)</button>
                  <button className="btn" onClick={saveSymbolsPng}>Save Symbols PNG</button>
                </div>
              </div>

              {symbolBlocks.length ? (
                <div className="tablewrap right-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Realized PnL</th>
                        <th>Funding</th>
                        <th>Trading Fees</th>
                        <th>Insurance</th>
                        <th className="actcol">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {symbolBlocks.map((b) => (
                        <tr key={b.symbol} id={`row-${b.symbol}`}>
                          <td className="label">{b.symbol}</td>
                          <td className="num">{renderAssetPairs(b.realizedByAsset)}</td>
                          <td className="num">{renderAssetPairs(b.fundingByAsset)}</td>
                          <td className="num">{renderAssetPairs(b.commByAsset)}</td>
                          <td className="num">{renderAssetPairs(b.insByAsset)}</td>
                          <td className="actcol">
                            <div className="btn-row">
                              <button className="btn btn-ico" aria-label="Copy details" title="Copy details" onClick={() => copyOneSymbol(b)}>📝</button>
                              <button className="btn btn-ico" aria-label="Save PNG" title="Save PNG" onClick={() => drawSingleRowCanvas(b)}>🖼️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (<p className="muted">No symbol activity.</p>)}
            </div>
          </div>
        </section>
      )}

      {/* SWAPS */}
      {activeTab === "swaps" && (
        <section className="space">
          <div className="card">
            <div className="card-head" style={{ justifyContent: "space-between" }}>
              <h2>Swaps (UTC+0)</h2>
              <div className="btn-row">
                <button className="btn" onClick={() => copySwaps(coinSwapLines, "Coin Swaps")}>Copy Coin Swaps</button>
                <button className="btn" onClick={() => copySwaps(autoExLines, "Auto-Exchange")}>Copy Auto-Exchange</button>
              </div>
            </div>
            <div className="grid two" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
              <div>
                <h4 className="muted">Coin Swaps</h4>
                {coinSwapLines.length ? <ul className="list">{coinSwapLines.map((s, i) => <li key={i} className="num">{s.text}</li>)}</ul> : <p className="muted">None</p>}
              </div>
              <div>
                <h4 className="muted">Auto-Exchange</h4>
                {autoExLines.length ? <ul className="list">{autoExLines.map((s, i) => <li key={i} className="num">{s.text}</li>)}</ul> : <p className="muted">None</p>}
              </div>
            </div>
            <p className="hint">Each line groups all legs that happened at the same second (UTC+0). Types are kept separate.</p>
          </div>
        </section>
      )}

      {/* EVENTS */}
      {activeTab === "events" && (
        <section className="space">
          <div className="card">
            <div className="card-head" style={{ justifyContent: "space-between" }}>
              <h2>Event Contracts (separate product)</h2>
              <button className="btn" onClick={copyEvents}>Copy Events</button>
            </div>
            <EventSummary rows={events} />
            <div className="subcard">
              <h3>Event – Other Activity</h3>
              {eventOther.length ? <OtherTypesBlock rows={eventOther} /> : <p className="muted">None</p>}
            </div>
          </div>
        </section>
      )}

      {/* RAW */}
      {activeTab === "raw" && rows.length > 0 && (
        <section className="space">
          <div className="card">
            <div className="card-head" style={{ justifyContent: "space-between" }}>
              <h2>Raw Parsed Table (Excel-like)</h2>
              <div className="btn-row">
                <button className="btn" onClick={copyRaw}>Copy TSV</button>
                <button className="btn" onClick={() => {
                  const headers = ["time","type","asset","amount","symbol","id","uid","extra"];
                  const csv = toCsv(rows.map(r => ({
                    time: r.time, type: r.type, asset: r.asset, amount: r.amount, symbol: r.symbol, id: r.id, uid: r.uid, extra: r.extra
                  })));
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = "balance_log.csv"; a.click();
                  URL.revokeObjectURL(url);
                }}>Download CSV</button>
              </div>
            </div>
            <div className="tablewrap">
              <table className="table mono small">
                <thead>
                  <tr>{["time","type","asset","amount","symbol","id","uid","extra"].map((h) => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.time}</td><td>{r.type}</td><td>{r.asset}</td><td className="num">{fmtSigned(r.amount)}</td>
                      <td>{r.symbol}</td><td>{r.id}</td><td>{r.uid}</td><td>{r.extra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Full response preview modal */}
      {showFullPreview && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Full response preview">
          <div className="modal">
            <div className="modal-head">
              <h3>Copy Response (Full) — Preview &amp; Edit</h3>
              <button className="btn" onClick={() => setShowFullPreview(false)}>Close</button>
            </div>
            <textarea className="modal-text" value={fullPreviewText} onChange={(e) => setFullPreviewText(e.target.value)} />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn-success" onClick={() => copyText(fullPreviewText)}>Copy Edited Text</button>
              <button className="btn" onClick={() => setFullPreviewText(buildFullResponse())}>Reset to Auto Text</button>
            </div>
            <p className="hint">All times are UTC+0. Zero-suppression (EPS = 1e-12) applies in the auto text.</p>
          </div>
        </div>
      )}

      {/* Balance Story Drawer */}
      {storyOpen && (
        <div className="drawer-overlay" onClick={() => setStoryOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Balance Story">
            <div className="drawer-head">
              <h3>Balance Story</h3>
              <button className="btn" onClick={() => setStoryOpen(false)}>Close</button>
            </div>

            <div className="form-row">
              <label>Mode</label>
              <div className="btn-row">
                <button className={`btn ${storyMode==="A"?"btn-dark":""}`} onClick={() => setStoryMode("A")}>A) Transfer Snapshot</button>
                <button className={`btn ${storyMode==="B"?"btn-dark":""}`} onClick={() => setStoryMode("B")}>B) Known After Only</button>
                <button className={`btn ${storyMode==="C"?"btn-dark":""}`} onClick={() => setStoryMode("C")}>C) Between Dates</button>
              </div>
            </div>

            <div className="form-grid">
              {(storyMode==="A" || storyMode==="B") && (
                <>
                  <label>Anchor time (UTC+0)</label>
                  <input className="input" placeholder="YYYY-MM-DD HH:MM:SS" value={storyT0} onChange={(e)=>setStoryT0(e.target.value)} />
                </>
              )}
              <label>{storyMode==="C" ? "To time (UTC+0)" : "End time (UTC+0)"} (optional)</label>
              <input className="input" placeholder={maxTime || "YYYY-MM-DD HH:MM:SS"} value={storyT1} onChange={(e)=>setStoryT1(e.target.value)} />
            </div>

            {(storyMode==="A" || storyMode==="B") && (
              <details className="subcard" open={storyMode==="A"}>
                <summary className="bold">Transfer (optional in Mode B)</summary>
                <div className="form-grid">
                  <label>Asset</label>
                  <select className="select" value={transferAsset} onChange={(e)=>setTransferAsset(e.target.value as AssetCode)}>
                    {ALL_ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <label>Amount (can be negative)</label>
                  <input className="input" placeholder="e.g. 300 or -25.5" value={transferAmount} onChange={(e)=>setTransferAmount(e.target.value)} />
                </div>
              </details>
            )}

            {storyMode==="A" && (
              <>
                <h4>Wallet BEFORE at anchor time</h4>
                <BalancesEditor rows={beforeRows} setRows={setBeforeRows} />
                <div className="hint">AFTER is auto-calculated from BEFORE + Transfer.</div>
                <h4 style={{marginTop:10}}>Wallet AFTER at anchor time (computed)</h4>
                <BalancesEditor rows={afterRows} setRows={setAfterRows} readonly />
              </>
            )}

            {storyMode==="B" && (
              <>
                <h4>Wallet AFTER at anchor time</h4>
                <BalancesEditor rows={afterRows} setRows={setAfterRows} />
                <div className="hint">If you also enter a Transfer above, BEFORE will be inferred and shown in the story.</div>
              </>
            )}

            {storyMode==="C" && (
              <>
                <div className="form-grid">
                  <label>From time (UTC+0)</label>
                  <input className="input" placeholder={minTime || "YYYY-MM-DD HH:MM:SS"} value={storyT0} onChange={(e)=>setStoryT0(e.target.value)} />
                </div>
                <h4>Balances at From (optional)</h4>
                <BalancesEditor rows={fromRows} setRows={setFromRows} />
              </>
            )}

            <div className="subcard">
              <h4>Options</h4>
              <label className="check">
                <input type="checkbox" checked={includeEvents} onChange={(e)=>setIncludeEvents(e.target.checked)} /> Include Event Contracts in balance math
              </label>
              <label className="check">
                <input type="checkbox" checked={includeGridbot} onChange={(e)=>setIncludeGridbot(e.target.checked)} /> Include Futures GridBot transfers
              </label>
            </div>

            <div className="btn-row" style={{ justifyContent:"flex-end", marginTop:8 }}>
              <button className="btn btn-success" onClick={openStoryPreview}>Build & Preview Story</button>
            </div>
          </aside>
        </div>
      )}

      {/* Balance Story preview modal */}
      {storyPreviewOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Balance Story preview">
          <div className="modal">
            <div className="modal-head">
              <h3>Balance Story — Preview &amp; Edit</h3>
              <button className="btn" onClick={() => setStoryPreviewOpen(false)}>Close</button>
            </div>
            <textarea className="modal-text" value={storyText} onChange={(e) => setStoryText(e.target.value)} />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn-success" onClick={() => copyText(storyText)}>Copy Balance Story</button>
              <button className="btn" onClick={() => setStoryText(buildBalanceStory())}>Rebuild</button>
            </div>
            <p className="hint">All times are UTC+0. Zero-suppression (EPS = 1e-12) applies to the text only.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- small components ---------- */
function EventSummary({ rows }: { rows: Row[] }) {
  const orders = rows.filter((r) => r.type === TYPE.EVENT_ORDER);
  const payouts = rows.filter((r) => r.type === TYPE.EVENT_PAYOUT);
  const byOrder = sumByAsset(orders);
  const byPayout = sumByAsset(payouts);
  const assets = Array.from(new Set([...Object.keys(byOrder), ...Object.keys(byPayout)])).sort();

  if (!assets.length) return <p className="muted">No event activity.</p>;

  return (
    <div className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Payout (Received)</th>
            <th>Orders (Paid)</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const p = byPayout[asset] || { pos: 0, neg: 0, net: 0 };
            const o = byOrder[asset] || { pos: 0, neg: 0, net: 0 };
            const net = (p.net || 0) + (o.net || 0);
            return (
              <tr key={asset}>
                <td className="label">{asset}</td>
                <td className="num good">+{fmtAbs(p.pos)}</td>
                <td className="num bad">−{fmtAbs(o.neg)}</td>
                <td className={`num ${net >= 0 ? "good" : "bad"}`}>{fmtSigned(net)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OtherTypesBlock({ rows }: { rows: Row[] }) {
  const byType = new Map<string, Row[]>();
  rows.forEach((r) => {
    const g = byType.get(r.type) || [];
    g.push(r);
    byType.set(r.type, g);
  });
  const keys = Array.from(byType.keys()).sort();

  return (
    <div className="stack">
      {keys.map((t) => {
        const byAsset = sumByAsset(byType.get(t) || []);
        const ks = Object.keys(byAsset);
        return (
          <div key={t} className="typecard">
            <div className="card-head"><h4>{friendlyTypeName(t)}</h4></div>
            {ks.length ? (
              <ul className="kv">
                {ks.map((asset) => {
                  const v = byAsset[asset];
                  return (
                    <li key={asset} className="kv-row">
                      <span className="label">{asset}</span>
                      {gt(v.pos) ? <span className="num good">+{fmtAbs(v.pos)}</span> : <span className="num muted">–</span>}
                      {gt(v.neg) ? <span className="num bad">−{fmtAbs(v.neg)}</span> : <span className="num muted">–</span>}
                      {gt(v.net) ? <span className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span> : <span className="num muted">–</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (<p className="muted">None</p>)}
          </div>
        );
      })}
    </div>
  );
}

function BalRow({
  row,
  onChange,
  readonly,
  onRemove,
}: {
  row: BalanceRow;
  onChange?: (r: BalanceRow) => void;
  readonly?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="bal-row">
      <select className="select" disabled={readonly} value={row.asset} onChange={(e) => onChange?.({ ...row, asset: e.target.value as AssetCode })}>
        {ALL_ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <input className="input" disabled={readonly} placeholder="amount (can be negative)" value={row.amount} onChange={(e)=>onChange?.({ ...row, amount: e.target.value })} />
      {!readonly && <button className="btn" onClick={onRemove}>✕</button>}
    </div>
  );
}
function BalancesEditor({
  rows,
  setRows,
  readonly,
}: {
  rows: BalanceRow[];
  setRows: (r: BalanceRow[]) => void;
  readonly?: boolean;
}) {
  return (
    <div className="bal-editor">
      {rows.map((r, i) => (
        <BalRow
          key={i}
          row={r}
          readonly={readonly}
          onRemove={() => setRows(rows.filter((_, idx) => idx !== i))}
          onChange={(nr) => setRows(rows.map((x, idx) => (idx === i ? nr : x)))}
        />
      ))}
      {!readonly && (
        <div className="btn-row" style={{marginTop:6}}>
          <button className="btn" onClick={() => setRows([...rows, emptyRow()])}>+ Add row</button>
          <details>
            <summary className="btn">Paste TSV</summary>
            <div style={{marginTop:6}}>
              <textarea className="paste" placeholder="Asset[TAB]Amount per line" onPaste={(e)=>{
                setTimeout(()=>{
                  const ta = e.target as HTMLTextAreaElement;
                  const next = pasteToRows(ta.value);
                  setRows(next);
                  ta.value = "";
                },0);
              }} />
              <div className="hint">Example:{"\n"}USDT↹300{"\n"}BTC↹-0.12</div>
            </div>
          </details>
          <div className="btn-row">
            {ALL_ASSETS.map(a => <button key={a} className="btn btn-small" onClick={()=>setRows([...rows, {asset:a as AssetCode, amount:""}])}>{a}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- CSS (embedded) ---------- */
const css = `
:root{
  --bg:#f7f9fc; --txt:#0f1720; --muted:#64748b; --card:#ffffff; --line:#e6e9ee;
  --primary:#0f62fe; --dark:#0f172a; --success:#10b981; --danger:#ef4444; --pill:#f7f8fa;
}
*{box-sizing:border-box} body{margin:0}
.wrap{min-height:100vh;background:var(--bg);color:var(--txt);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial}

/* Header */
.header{max-width:1200px;margin:24px auto 12px;padding:0 16px;display:flex;gap:12px;align-items:flex-end;justify-content:space-between}
.header h1{margin:0 0 2px;font-size:26px}
.muted{color:var(--muted)}
.good{color:#059669}
.bad{color:#dc2626}
.bold{font-weight:700}
.btn-row{display:flex;gap:8px;flex-wrap:wrap}
.btn{border:1px solid var(--line);background:#fff;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600}
.btn:hover{background:#f9fafb}
.btn-primary{background:var(--primary);border-color:var(--primary);color:#fff}
.btn-dark{background:var(--dark);border-color:var(--dark);color:#fff}
.btn-success{background:var(--success);border-color:var(--success);color:#fff}
.btn-small{padding:6px 10px}
.btn-ico{padding:6px 8px;font-size:16px;line-height:1;border-radius:8px}

/* Sections & Cards */
.space{max-width:1200px;margin:0 auto;padding:0 16px 24px}
.card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.04);padding:16px;margin:12px 0;overflow:hidden}
.card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap}
.subcard{border:1px dashed var(--line);padding:10px;border-radius:10px;background:#fcfdfd}
.grid{display:grid;gap:12px;align-items:start}
.grid.two{grid-template-columns:repeat(2,minmax(340px,1fr))}
.grid.three{grid-template-columns:repeat(auto-fit,minmax(340px,1fr))}
.kv{display:grid;gap:8px}
.kv-row{display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;background:var(--pill);border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.label{font-weight:600}
.num{font-variant-numeric:tabular-nums}
.paste{width:100%;height:120px;border:1px solid var(--line);border-radius:12px;padding:10px;font-family:ui-monospace,Menlo,Consolas,monospace;background:#fff}
.error{color:#b91c1c;margin:8px 0 0}
.diags summary{cursor:pointer;font-weight:600}
.diagbox{width:100%;height:120px;background:#fbfcfe;border:1px solid var(--line);border-radius:8px;padding:8px;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace}

/* Tabs */
.tabs{max-width:1200px;margin:6px auto 0;padding:0 16px;display:flex;gap:8px;flex-wrap:wrap}
.tab{border:1px solid var(--line);background:#fff;padding:8px 12px;border-radius:999px;cursor:pointer}
.tab.active{background:var(--dark);border-color:var(--dark);color:#fff}

/* Tables */
.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff}
.table{width:100%;border-collapse:separate;border-spacing:0}
.table th{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;white-space:nowrap;background:#fbfcfe;position:sticky;top:0;z-index:1}
.table td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;white-space:normal;word-break:break-word}
.table .label{font-weight:600}
.table.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.table.small td,.table.small th{padding:8px 10px}
.select{border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:#fff}
.input{border:1px solid var(--line);border-radius:8px;padding:8px 10px;width:100%;background:#fff}
.list{margin:0;padding:0 0 0 18px}
.hint{margin-top:8px;font-size:12px;color:var(--muted)}
.typecard{background:#fcfdfd;border:1px dashed var(--line);border-radius:12px;padding:10px}
.pair{display:inline-block;margin-right:2px}

/* Sticky right "Actions" column */
.actcol{position:sticky;right:0;background:#fff;box-shadow:-1px 0 0 var(--line);z-index:2;min-width:120px}
.table thead .actcol{z-index:4}

/* Sticky KPI header */
.kpi.sticky{position:sticky; top:8px; z-index:5}
.kpi-row{display:grid; gap:10px; align-items:center}
.kpi-row.topbar{grid-template-columns:1fr auto; align-items:start}
.kpigrid{display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.kpi-actions{display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end}
.kpi-block{background:#fbfcfe;border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:180px}
.kpi-block.as-btn{cursor:pointer}
.kpi-block.as-btn:hover{background:#f3f6ff;border-color:#d9e2ff}
.kpi-title{font-size:12px;color:var(--muted);font-weight:700;margin-bottom:2px}
.kpi-num{font-weight:800}

/* Asset KPI Tiles (USDT/USDC/BNFCR) */
.asset-tiles{grid-template-columns:repeat(3, minmax(240px, 1fr))}
.asset-tile{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-height:86px}
.asset-title{font-size:12px;color:var(--muted);font-weight:800}
.asset-net{font-weight:900;font-size:18px;letter-spacing:0.1px}
.asset-chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-weight:700;font-size:12px;background:#fbfcfe}
.chip.good{color:#059669;border-color:#d1fae5;background:#ecfdf5}
.chip.bad{color:#dc2626;border-color:#fee2e2;background:#fef2f2}
.chip.muted{color:var(--muted);border-color:var(--line);background:#f7f8fb}

/* Dual-pane layout */
.dual{display:grid;gap:10px;grid-template-columns:minmax(0,1fr) ${SPLIT_W}px 45%;align-items:start;margin-top:8px}
.left{min-width:0}
.right{min-width:0;position:sticky;top:96px;align-self:start;max-height:calc(100vh - 120px);display:flex;flex-direction:column}
.right-scroll{max-height:calc(100vh - 180px)}
.splitter{position:relative;width:${SPLIT_W}px;cursor:col-resize;border-left:1px solid var(--line);border-right:1px solid var(--line);background:linear-gradient(to bottom,#f7f9fc,#eef2f9)}
.splitter::before{
  content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  width:4px;height:44px;border-radius:3px;
  background:repeating-linear-gradient(to bottom,#c7cdd8,#c7cdd8 4px,transparent 4px,transparent 8px);
  opacity:.9;
}
.splitter:hover{background:linear-gradient(to bottom,#e6eefc,#dbe7ff)}

/* Dropzone */
.dropzone{width:100%;min-height:64px;border:2px dashed var(--line);border-radius:12px;background:#fff;padding:14px;display:flex;align-items:center;justify-content:center;color:var(--muted);text-align:center;user-select:none;outline:none}
.dropzone:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(15,98,254,0.15)}

/* Modal overlay */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px;z-index:1000}
.modal{width:min(980px, 100%);max-height:85vh;background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.2);padding:14px;display:flex;flex-direction:column}
.modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.modal-text{width:100%;height:55vh;border:1px solid var(--line);border-radius:10px;padding:10px;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre;overflow:auto;background:#fbfcfe}

/* Drawer (Balance Story) */
.drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;justify-content:flex-end;z-index:1000}
.drawer{width:min(560px,100%);height:100%;background:#fff;border-left:1px solid var(--line);box-shadow:-20px 0 40px rgba(0,0,0,.2);padding:14px 16px;overflow:auto}
.drawer-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.form-grid{display:grid;grid-template-columns:180px 1fr;gap:8px;align-items:center}
.form-row{margin:8px 0}
.check{display:flex;align-items:center;gap:8px;margin:6px 0}
.bal-editor{border:1px solid var(--line);border-radius:10px;padding:8px;background:#fbfcfe}
.bal-row{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;margin-bottom:6px}

/* Responsive stacking */
@media (max-width: 980px){
  .asset-tiles{grid-template-columns:1fr}
  .dual{grid-template-columns:1fr}
  .splitter{display:none}
  .right{position:relative;top:auto;max-height:none}
  .right-scroll{max-height:none}
}
`;
