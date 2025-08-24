// src/App.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import "./styles.css";

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
const DUST = 4e-8; // user-facing story only (hide balances <= DUST)
const SPLIT_W = 12; // splitter width (px)
const ALL_ASSETS = ["BTC","LDUSDT","BFUSD","FDUSD","BNB","ETH","USDT","USDC","BNFCR"] as const;
type AssetCode = typeof ALL_ASSETS[number];

/* ---------- time utils (true UTC) ---------- */
function normalizeTimeString(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return s;
  const [, y, mo, d, h, mi, se] = m;
  const hh = (h as string).padStart(2, "0");
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

function fmtAbs(x: number, _maxDp = 12) {
  const v = abs(x);
  const s = v.toString().includes("e") ? v.toFixed(12) : v.toString();
  return s; // no thousands separator
}
function fmtSigned(x: number, _maxDp = 12) {
  const n = Number(x) || 0;
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${fmtAbs(n, _maxDp)}`;
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
    const key = `${r.time}|${idHint}`; // group per second & id-hint
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

/* ---------- Other Types (non-event) block ---------- */
function OtherTypesBlock({ rows }: { rows: Row[] }) {
  const byType: Record<string, Row[]> = {};
  rows.forEach((r) => {
    (byType[r.type] ||= []).push(r);
  });

  const summary = Object.entries(byType).map(([t, rs]) => {
    const m = sumByAsset(rs);
    return { type: t, map: m, label: friendlyTypeName(t) };
  }).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="stack">
      {summary.map((s) => (
        <div key={s.type} className="typecard">
          <div className="card-head"><h4>{s.label}</h4></div>
          <ul className="kv">
            {Object.keys(s.map).length ? (
              Object.entries(s.map).map(([asset, v]) => (
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
      ))}
    </div>
  );
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

  // Dual Story Preview modal state
  const [storyPreviewOpen, setStoryPreviewOpen] = useState(false);
  const [storyUserText, setStoryUserText] = useState("");
  const [storyAgentText, setStoryAgentText] = useState("");
  const [storyTab, setStoryTab] = useState<"user" | "agent">("user");

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

  /* ---------- KPI ---------- */
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

  /* ---------- Build Balance Story (shared data) ---------- */
  type StoryData = {
    T0: string;
    T1: string;
    exclusiveStart: boolean;
    windowRows: Row[];
    rowsForMath: Row[];
    catsDisplay: ReturnType<typeof sumByTypeAndAsset>;
    catsMath: ReturnType<typeof sumByTypeAndAsset>;
    deltaByAsset: Record<string, number>;
    expectedAtEnd?: Record<string, number>;
    anchorAfter?: Record<string, number>;
    anchorBefore?: Record<string, number>;
    endLabel: string;
  };

  function computeStoryData(): StoryData | string {
    if (!rows.length) return "No parsed rows yet. Paste & Parse first.";

    // Figure time window
    let T0 = storyT0 || minTime || "";
    let T1 = storyT1 || maxTime || "";
    if (!T0) return "Please provide a start time (UTC+0).";
    T0 = normalizeTimeString(T0);
    if (T1) T1 = normalizeTimeString(T1);

    const exclusiveStart = storyMode === "A" || storyMode === "B";

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
      if (transferAmount.trim()) {
        const amt = Number(transferAmount) || 0;
        anchorBefore = { ...anchorAfter };
        anchorBefore[transferAsset] = (anchorBefore[transferAsset] || 0) - amt;
      }
    } else if (storyMode === "C") {
      anchorAfter = undefined;
      anchorBefore = parseBalanceRowsToMap(fromRows);
      if (!storyT1) T1 = maxTime;
      if (!storyT0) T0 = minTime;
    }

    // Filter rows by UTC window
    const windowRows = filterRowsInRangeUTC(rows, T0, T1, exclusiveStart);

    // Include/exclude types for math
    const rowsForMath = windowRows.filter((r) => {
      if (!includeGridbot && r.type === TYPE.GRIDBOT_TRANSFER) return false;
      if (!includeEvents && r.type.startsWith(EVENT_PREFIX)) return false;
      return true;
    });

    const catsDisplay = sumByTypeAndAsset(windowRows);
    const catsMath = sumByTypeAndAsset(rowsForMath);

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
    addNestedMaps(deltaByAsset, catsMath.otherNonEvent);

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

    const endLabel = T1 || maxTime;

    return {
      T0, T1, exclusiveStart,
      windowRows, rowsForMath,
      catsDisplay, catsMath,
      deltaByAsset, expectedAtEnd,
      anchorAfter, anchorBefore,
      endLabel: endLabel || "",
    };
  }

  /* ---------- Build User View Story ---------- */
  function buildUserStoryText(): string {
    const data = computeStoryData();
    if (typeof data === "string") return data;
    const {
      T0, endLabel, catsDisplay, expectedAtEnd, anchorAfter, anchorBefore,
    } = data;

    const L: string[] = [];

    if (storyMode === "A") {
      const amt = Number(transferAmount) || 0;
      L.push(`On ${T0} (UTC+0), you transferred ${fmtAbs(amt)} ${transferAsset} into your Futures Wallet.`);
      if (anchorBefore && anchorAfter) {
        const b = (anchorBefore["USDT"] ?? 0);
        const a = (anchorAfter["USDT"] ?? 0);
        if (gt(b) || gt(a)) {
          L.push(`At that time, your USDT balance changed from ${fmtAbs(b)} → ${fmtAbs(a)}.`);
        }
        L.push("");
      }
    } else if (storyMode === "B") {
      L.push(`Snapshot at ${T0} (UTC+0): using your provided balances as the starting point.`);
      L.push("");
    } else {
      L.push(`Between ${T0} and ${data.T1 || endLabel} (UTC+0): here’s what changed.`);
      L.push("");
    }

    L.push(`What happened next:`);

    const pushAssetLines = (
      m: Record<string, { pos: number; neg: number; net: number }>,
      expl: string,
      formatter?: (a: string, v: {pos:number;neg:number;net:number}) => string | null
    ) => {
      const assets = Object.keys(m).filter((a) => gt(m[a].pos) || gt(m[a].neg) || gt(m[a].net));
      if (!assets.length) return;
      L.push("");
      L.push(expl);
      assets.sort().forEach((a) => {
        const v = m[a];
        if (formatter) {
          const line = formatter(a, v);
          if (line) L.push(line);
        } else {
          const parts: string[] = [];
          if (gt(v.pos)) parts.push(`+${fmtAbs(v.pos)}`);
          if (gt(v.neg)) parts.push(`−${fmtAbs(v.neg)}`);
          if (gt(v.net)) parts.push(`${fmtSigned(v.net)}`);
          L.push(`• ${a}: ${parts.join(" / ") || "0"}`);
        }
      });
    };

    pushAssetLines(
      catsDisplay.realized,
      "• Trading (Realized PnL): these are profits and losses from your closed positions.",
      (a, v) => `• ${a}: earned +${fmtAbs(v.pos)} and lost −${fmtAbs(v.neg)} → net ${fmtSigned(v.net)}`
    );

    pushAssetLines(
      catsDisplay.commission,
      "• Trading fees: these are the fees charged each time an order is executed.",
      (a, v) => `• ${a}: fees −${fmtAbs(v.neg)}${gt(v.pos) ? ` (refunds +${fmtAbs(v.pos)})` : ""}`
    );

    pushAssetLines(
      catsDisplay.funding,
      "• Funding fees: periodic payments between long and short positions.",
      (a, v) => `• ${a}: received +${fmtAbs(v.pos)} / paid −${fmtAbs(v.neg)} → net ${fmtSigned(v.net)}`
    );

    pushAssetLines(
      catsDisplay.insurance,
      "• Insurance / Liquidation clearance fees: these are the liquidation clearance fees collected after each liquidation.",
      (a, v) => `• ${a}: received +${fmtAbs(v.pos)} / paid −${fmtAbs(v.neg)} → net ${fmtSigned(v.net)}`
    );

    pushAssetLines(
      catsDisplay.transferGen,
      "• Transfers: you moved money into and out of your Futures Wallet.",
      (a, v) => `• ${a}: in +${fmtAbs(v.pos)} / out −${fmtAbs(v.neg)} → net ${fmtSigned(v.net)}`
    );

    if (includeGridbot) {
      pushAssetLines(
        catsDisplay.gridbot,
        "• GridBot transfers: these are the transfers you made to the GridBot Wallet in and out.",
        (a, v) => `• ${a}: in +${fmtAbs(v.pos)} / out −${fmtAbs(v.neg)} → net ${fmtSigned(v.net)}`
      );
    }

    pushAssetLines(
      catsDisplay.coinSwap,
      "• Coin Swaps: you converted some assets directly between coins.",
      (a, v) => `• ${a}: received +${fmtAbs(v.pos)} / used −${fmtAbs(v.neg)} → net ${fmtSigned(v.net)}`
    );

    pushAssetLines(
      catsDisplay.autoEx,
      "• Auto-Exchange: the system automatically converted to clear the negative balance.",
      (a, v) => `• ${a}: received +${fmtAbs(v.pos)} / used −${fmtAbs(v.neg)} → net ${fmtSigned(v.net)}`
    );

    const eventNote = includeEvents ? "" : " (not included in the final balance calculation below)";
    pushAssetLines(
      catsDisplay.eventPayouts,
      `• Event Contracts — payouts${eventNote}: these are the PnL you made from event contracts (received amounts).`
    );
    pushAssetLines(
      catsDisplay.eventOrders,
      `• Event Contracts — orders${eventNote}: these are amounts you spent to participate.`
    );

    const otherKeys = Object.keys(catsDisplay.otherNonEvent).sort();
    otherKeys.forEach((t) => {
      const friendly = friendlyTypeName(t);
      pushAssetLines(
        catsDisplay.otherNonEvent[t],
        `• ${friendly}: credited/charged during this period.`,
      );
    });

    L.push("");
    if (expectedAtEnd) {
      const visible = Object.keys(expectedAtEnd)
        .filter((a) => abs(expectedAtEnd[a]) > DUST)
        .sort();

      if (visible.length) {
        const line = visible.map((a) => `${fmtAbs(expectedAtEnd[a])} ${a}`).join(", ");
        L.push(`Based on all of the above, your Futures wallet now shows: ${line}`);
      } else {
        L.push("Based on all of the above, there is no balance to show.");
      }
    } else if (storyMode === "C") {
      L.push("This story lists the activity in the window. Add a starting balance if you want the expected ending balances computed.");
    }

    return L.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  /* ---------- Build Agent View Story ---------- */
  function buildAgentStoryText(): string {
    const data = computeStoryData();
    if (typeof data === "string") return data;
    const {
      T0, endLabel, catsDisplay, deltaByAsset, expectedAtEnd, anchorAfter, anchorBefore
    } = data;

    const L: string[] = [];
    if (storyMode === "A") {
      L.push(`Anchor ${T0} (UTC+0) — AFTER balances provided; BEFORE inferred from transfer if any.`);
    } else if (storyMode === "B") {
      L.push(`Anchor ${T0} (UTC+0) — AFTER balances provided${transferAmount.trim() ? "; BEFORE inferred from transfer" : ""}.`);
    } else {
      L.push(`Window ${T0} → ${data.T1 || endLabel} (UTC+0).`);
    }
    L.push("");

    const allAssets = new Set<string>([
      ...Object.keys(catsDisplay.realized),
      ...Object.keys(catsDisplay.commission),
      ...Object.keys(catsDisplay.funding),
      ...Object.keys(catsDisplay.insurance),
      ...Object.keys(catsDisplay.transferGen),
      ...Object.keys(catsDisplay.gridbot),
      ...Object.keys(catsDisplay.coinSwap),
      ...Object.keys(catsDisplay.autoEx),
      ...Object.keys(catsDisplay.eventPayouts),
      ...Object.keys(catsDisplay.eventOrders),
      ...Object.values(catsDisplay.otherNonEvent).flatMap((m) => Object.keys(m)),
      ...Object.keys(deltaByAsset),
      ...(expectedAtEnd ? Object.keys(expectedAtEnd) : []),
      ...(anchorAfter ? Object.keys(anchorAfter) : []),
      ...(anchorBefore ? Object.keys(anchorBefore) : []),
    ]);

    const fmtNetLine = (label: string, v?: { pos: number; neg: number; net: number }) => {
      if (!v || (!gt(v.pos) && !gt(v.neg) && !gt(v.net))) return null;
      return `${label}: ${gt(v.pos) ? `+${fmtAbs(v.pos)}` : "0"} / ${gt(v.neg) ? `−${fmtAbs(v.neg)}` : "0"} → ${gt(v.net) ? fmtSigned(v.net) : "0"}`;
    };

    Array.from(allAssets).sort().forEach((a) => {
      const lines: string[] = [];
      const r = catsDisplay.realized[a];
      const c = catsDisplay.commission[a];
      const f = catsDisplay.funding[a];
      const i = catsDisplay.insurance[a];
      const tr = catsDisplay.transferGen[a];
      const gb = catsDisplay.gridbot[a];
      const cs = catsDisplay.coinSwap[a];
      const ae = catsDisplay.autoEx[a];
      const ep = catsDisplay.eventPayouts[a];
      const eo = catsDisplay.eventOrders[a];

      const others = Object.keys(catsDisplay.otherNonEvent).sort().map(k => ({name: friendlyTypeName(k), map: catsDisplay.otherNonEvent[k][a]})).filter(x => x.map && gt(x.map.net));

      lines.push(...[
        fmtNetLine("Trading (Realized PnL)", r),
        fmtNetLine("Trading fees (Commission)", c),
        fmtNetLine("Funding fees", f),
        fmtNetLine("Insurance / Liquidation", i),
        fmtNetLine("Transfers (General)", tr),
        includeGridbot ? fmtNetLine("GridBot transfers", gb) : null,
        fmtNetLine("Coin Swaps", cs),
        fmtNetLine("Auto-Exchange", ae),
        fmtNetLine("Event payouts", ep),
        fmtNetLine("Event orders", eo),
      ].filter(Boolean) as string[]);

      others.forEach(o => {
        lines.push(fmtNetLine(o.name, o.map)!);
      });

      if (!lines.length) return;
      L.push(`Asset: ${a}`);
      lines.forEach((ln) => L.push(`  ${ln}`));

      const net = deltaByAsset[a] || 0;
      L.push(`  Net delta for ${a}: ${fmtSigned(net)}`);

      const start = (storyMode === "A" || storyMode === "B") ? (anchorAfter?.[a] ?? 0) : (anchorBefore?.[a] ?? 0);
      const end = expectedAtEnd ? (expectedAtEnd[a] ?? 0) : undefined;
      if (typeof end === "number") {
        L.push(`  Calc: Start ${fmtAbs(start)} + Net ${fmtSigned(net)} = ${fmtAbs(end)}`);
      }
      L.push("");
    });

    if (expectedAtEnd) {
      const line = Object.keys(expectedAtEnd).sort().map((a) => `${fmtAbs(expectedAtEnd[a])} ${a}`).join(", ");
      L.push(`${endLabel} (UTC+0) — Expected wallet balances:`);
      L.push(`  ${line || "—"}`);
    } else if (storyMode === "C") {
      L.push("Expected balances not computed (no starting balances were provided).");
    }

    return L.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  /* ---------- Open Story Preview (build both) ---------- */
  function openStoryPreview() {
    const user = buildUserStoryText();
    const agent = buildAgentStoryText();
    setStoryUserText(user);
    setStoryAgentText(agent);
    setStoryTab("user");
    setStoryPreviewOpen(true);
  }

  return (
    <div className="wrap">
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
                {/* Only this button remains, per agreement */}
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
                  <button className="btn" onClick={() => {
                    if (!allSymbolBlocks.length) { copyText("No symbol activity."); return; }
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
                  }}>Copy Symbols (text)</button>
                  <button className="btn" onClick={() => {
                    const blocks = (symbolBlocks.length ? symbolBlocks : allSymbolBlocks);
                    if (!blocks.length) return;
                    drawSymbolsCanvas(blocks, "symbols_table.png");
                  }}>Save Symbols PNG</button>
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
                          <td className="mono">{b.symbol}</td>
                          <td>{renderAssetPairs(b.realizedByAsset)}</td>
                          <td>{renderAssetPairs(b.fundingByAsset)}</td>
                          <td>{renderAssetPairs(b.commByAsset)}</td>
                          <td>{renderAssetPairs(b.insByAsset)}</td>
                          <td className="actcol">
                            <div className="btn-row">
                              <button className="btn small" onClick={() => copyText([
                                b.symbol,
                                `Realized PnL: ${pairsToText(b.realizedByAsset)}`,
                                `Funding: ${pairsToText(b.fundingByAsset)}`,
                                `Trading Fees: ${pairsToText(b.commByAsset)}`,
                                `Insurance: ${pairsToText(b.insByAsset)}`,
                              ].join("\n"))}>Copy</button>
                              <button className="btn small" onClick={() => drawSingleRowCanvas(b)}>PNG</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted" style={{ padding: 12 }}>No symbol activity found.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* SWAPS */}
      {activeTab === "swaps" && (
        <section className="space">
          <div className="card">
            <div className="card-head"><h3>Coin Swaps</h3></div>
            {coinSwapLines.length ? (
              <ul className="list mono">
                {coinSwapLines.map((l, i) => <li key={i}>{l.text}</li>)}
              </ul>
            ) : <p className="muted">No coin swaps found.</p>}
          </div>
          <div className="card" style={{ marginTop: 8 }}>
            <div className="card-head"><h3>Auto-Exchange</h3></div>
            {autoExLines.length ? (
              <ul className="list mono">
                {autoExLines.map((l, i) => <li key={i}>{l.text}</li>)}
              </ul>
            ) : <p className="muted">No auto-exchange entries found.</p>}
          </div>
        </section>
      )}

      {/* EVENTS */}
      {activeTab === "events" && (
        <section className="space">
          <div className="card">
            <div className="card-head"><h3>Event Contracts — Payouts</h3></div>
            <ul className="kv">
              {Object.entries(eventsPayoutByAsset).length ? Object.entries(eventsPayoutByAsset).map(([asset, v]) => (
                <li key={asset} className="kv-row">
                  <span className="label">{asset}</span>
                  {gt(v.pos) ? <span className="num good">+{fmtAbs(v.pos)}</span> : <span className="num muted">–</span>}
                  {gt(v.neg) ? <span className="num bad">−{fmtAbs(v.neg)}</span> : <span className="num muted">–</span>}
                  {gt(v.net) ? <span className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span> : <span className="num muted">–</span>}
                </li>
              )) : <li className="kv-row"><span className="muted">None</span></li>}
            </ul>
          </div>

          <div className="card" style={{ marginTop: 8 }}>
            <div className="card-head"><h3>Event Contracts — Orders</h3></div>
            <ul className="kv">
              {Object.entries(eventsOrderByAsset).length ? Object.entries(eventsOrderByAsset).map(([asset, v]) => (
                <li key={asset} className="kv-row">
                  <span className="label">{asset}</span>
                  {gt(v.pos) ? <span className="num good">+{fmtAbs(v.pos)}</span> : <span className="num muted">–</span>}
                  {gt(v.neg) ? <span className="num bad">−{fmtAbs(v.neg)}</span> : <span className="num muted">–</span>}
                  {gt(v.net) ? <span className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span> : <span className="num muted">–</span>}
                </li>
              )) : <li className="kv-row"><span className="muted">None</span></li>}
            </ul>
          </div>

          {eventOther.length > 0 && (
            <div className="card" style={{ marginTop: 8 }}>
              <div className="card-head"><h3>Other Event Types</h3></div>
              <textarea className="diagbox" value={eventOther.map(r => r.raw).join("\n")} readOnly />
            </div>
          )}
        </section>
      )}

      {/* RAW */}
      {activeTab === "raw" && (
        <section className="space">
          <div className="card">
            <div className="card-head">
              <h3>Raw Log</h3>
              <div className="btn-row">
                <button className="btn" onClick={() => copyText(toCsv(rows))}>Copy CSV</button>
              </div>
            </div>
            <div className="tablewrap">
              <table className="table mono small">
                <thead>
                  <tr>
                    <th>time (UTC+0)</th>
                    <th>id</th>
                    <th>uid</th>
                    <th>asset</th>
                    <th>type</th>
                    <th>amount</th>
                    <th>symbol</th>
                    <th>extra</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.time}</td>
                      <td>{r.id}</td>
                      <td>{r.uid}</td>
                      <td>{r.asset}</td>
                      <td>{r.type}</td>
                      <td>{r.amount}</td>
                      <td>{r.symbol}</td>
                      <td>{r.extra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Balance Story Drawer */}
      {storyOpen && (
        <div className="drawer-backdrop" onClick={() => setStoryOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <h3>Balance Story</h3>
              <button className="btn" onClick={() => setStoryOpen(false)}>Close</button>
            </div>

            <div className="drawer-row">
              <div className="formrow">
                <label>Mode</label>
                <div className="btn-row">
                  <button className={`btn ${storyMode==="A"?"btn-dark":""}`} onClick={() => setStoryMode("A")}>A: Transfer @ T0 → AFTER anchor</button>
                  <button className={`btn ${storyMode==="B"?"btn-dark":""}`} onClick={() => setStoryMode("B")}>B: AFTER anchor (no transfer)</button>
                  <button className={`btn ${storyMode==="C"?"btn-dark":""}`} onClick={() => setStoryMode("C")}>C: From balances → activity</button>
                </div>
              </div>

              <div className="grid two" style={{ marginTop: 8 }}>
                <div className="formrow">
                  <label>Start (T0, UTC+0)</label>
                  <input className="input mono" placeholder="YYYY-MM-DD HH:MM:SS" value={storyT0} onChange={(e) => setStoryT0(e.target.value)} />
                </div>
                <div className="formrow">
                  <label>End (T1, UTC+0, optional)</label>
                  <input className="input mono" placeholder="YYYY-MM-DD HH:MM:SS" value={storyT1} onChange={(e) => setStoryT1(e.target.value)} />
                </div>
              </div>

              <div className="grid two">
                <div className="formrow">
                  <label>Transfer Asset (optional)</label>
                  <select className="select" value={transferAsset} onChange={(e) => setTransferAsset(e.target.value as AssetCode)}>
                    {ALL_ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="formrow">
                  <label>Transfer Amount (e.g., 300 or −300)</label>
                  <input className="input mono" placeholder="0" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} />
                </div>
              </div>

              {storyMode === "A" && (
                <div className="grid two" style={{ marginTop: 8 }}>
                  <BalanceEntryCard
                    title="BEFORE @ T0"
                    rows={beforeRows}
                    setRows={setBeforeRows}
                    help="Paste rows like: USDT<TAB>123.45"
                  />
                  <BalanceEntryCard
                    title="AFTER @ T0 (computed)"
                    rows={afterRows}
                    setRows={setAfterRows}
                    readOnly
                    help="This is computed from BEFORE + transfer."
                  />
                </div>
              )}

              {storyMode === "B" && (
                <div className="grid two" style={{ marginTop: 8 }}>
                  <BalanceEntryCard
                    title="AFTER @ T0 (anchor)"
                    rows={afterRows}
                    setRows={setAfterRows}
                    help="Paste rows like: USDT<TAB>123.45"
                  />
                  <div className="card">
                    <div className="card-head"><h3>Note</h3></div>
                    <p className="muted" style={{ padding: 10 }}>
                      If you also provide Transfer Amount above, BEFORE is inferred as AFTER − transfer (for the selected asset).
                    </p>
                  </div>
                </div>
              )}

              {storyMode === "C" && (
                <div className="grid one" style={{ marginTop: 8 }}>
                  <BalanceEntryCard
                    title="Starting balances (FROM)"
                    rows={fromRows}
                    setRows={setFromRows}
                    help="Optional: provide starting balances to compute expected ending balances."
                  />
                </div>
              )}

              <div className="grid two" style={{ marginTop: 8 }}>
                <label className="check">
                  <input type="checkbox" checked={includeEvents} onChange={(e) => setIncludeEvents(e.target.checked)} />
                  Include Event Contracts in math
                </label>
                <label className="check">
                  <input type="checkbox" checked={includeGridbot} onChange={(e) => setIncludeGridbot(e.target.checked)} />
                  Include GridBot transfers in math
                </label>
              </div>

              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn btn-dark" onClick={openStoryPreview}>Preview: User & Agent</button>
                <button className="btn" onClick={() => {
                  const res = computeStoryData();
                  if (typeof res === "string") { alert(res); return; }
                  alert(`Window rows: ${res.windowRows.length}\nMath rows: ${res.rowsForMath.length}`);
                }}>Quick Check</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Story Preview Modal */}
      {storyPreviewOpen && (
        <div className="modal-backdrop" onClick={() => setStoryPreviewOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="tabs small">
                <button className={`tab ${storyTab==="user"?"active":""}`} onClick={() => setStoryTab("user")}>User View</button>
                <button className={`tab ${storyTab==="agent"?"active":""}`} onClick={() => setStoryTab("agent")}>Agent View</button>
              </div>
              <div className="btn-row">
                <button className="btn" onClick={() => copyText(storyTab==="user" ? storyUserText : storyAgentText)}>Copy {storyTab==="user"?"User":"Agent"}</button>
                <button className="btn" onClick={() => setStoryPreviewOpen(false)}>Close</button>
              </div>
            </div>
            <div className="modal-body">
              {storyTab === "user" ? (
                <textarea className="storybox" value={storyUserText} onChange={(e) => setStoryUserText(e.target.value)} />
              ) : (
                <textarea className="storybox mono" value={storyAgentText} onChange={(e) => setStoryAgentText(e.target.value)} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- small UI components ---------- */
function BalanceEntryCard({
  title,
  rows,
  setRows,
  readOnly,
  help,
}: {
  title: string;
  rows: BalanceRow[];
  setRows: (r: BalanceRow[]) => void;
  readOnly?: boolean;
  help?: string;
}) {
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3></div>
      {help && <div className="muted" style={{ padding: "6px 10px" }}>{help}</div>}
      <div className="tablewrap" style={{ maxHeight: 220 }}>
        <table className="table small">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ width: 160 }}>
                  <select className="select" value={r.asset} disabled={readOnly} onChange={(e) => {
                    const v = [...rows];
                    v[i] = { ...v[i], asset: e.target.value as AssetCode };
                    setRows(v);
                  }}>
                    {ALL_ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </td>
                <td>
                  <input
                    className="input mono"
                    value={r.amount}
                    readOnly={readOnly}
                    onChange={(e) => {
                      const v = [...rows];
                      v[i] = { ...v[i], amount: e.target.value };
                      setRows(v);
                    }}
                    placeholder="e.g., 300 or −300"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="btn-row">
          <button className="btn" onClick={() => setRows([...rows, emptyRow()])}>Add row</button>
          <button className="btn" onClick={() => setRows(rows.length > 1 ? rows.slice(0, -1) : [emptyRow()])}>Remove last</button>
          <button className="btn" onClick={() => {
            const pasted = prompt("Paste TSV: Asset<TAB>Amount per line") || "";
            if (!pasted.trim()) return;
            setRows(pasteToRows(pasted));
          }}>Paste TSV</button>
          <button className="btn" onClick={() => setRows([emptyRow()])}>Clear</button>
        </div>
      )}
    </div>
  );
}
