import React, { useMemo, useRef, useState } from "react";

/**
 * Balance Log Analyzer — light theme, UTC+0
 * - GridPasteBox (paste table from web)
 * - Summary cards (includes “Other Types (non-event)” in-card, above By Symbol)
 * - By Symbol with per-row Copy / Save PNG (sticky Actions)
 * - Coin Swaps tab split: Auto-Exchange vs Coin Swaps
 * - “Save Symbols PNG” exports the whole table as one tall PNG
 */

type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string;
  symbol: string;
  extra: string;
  raw: string;
};

const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/; // UTC+0
const SYMBOL_RE = /^[A-Z0-9]{2,}(USDT|USDC|USD|BTC|ETH|BNB)$/;

const SWAP_TYPES = new Set(["COIN_SWAP_DEPOSIT", "COIN_SWAP_WITHDRAW", "AUTO_EXCHANGE"]);
const EVENT_PREFIX = "EVENT_CONTRACTS_";
const EVENT_KNOWN_CORE = new Set(["EVENT_CONTRACTS_ORDER", "EVENT_CONTRACTS_PAYOUT"]);
const KNOWN_TYPES = new Set([
  "REALIZED_PNL",
  "FUNDING_FEE",
  "COMMISSION",
  "INSURANCE_CLEAR",
  "LIQUIDATION_FEE",
  "REFERRAL_KICKBACK",
  "TRANSFER",
  ...Array.from(SWAP_TYPES),
]);

const EPS = 1e-12;

/* ---------- utils ---------- */
function fmtAbs(x: number, maxDp = 8) {
  const v = Math.abs(Number(x) || 0);
  const s = v.toFixed(maxDp);
  return s.replace(/\.0+$/, "").replace(/(\.[0-9]*?)0+$/, "$1");
}
function fmtSigned(x: number, maxDp = 8) {
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
const sumMapMagnitude = (m: Record<string, { pos: number; neg: number }>) =>
  Object.values(m).reduce((acc, v) => acc + Math.abs(v.pos) + Math.abs(v.neg), 0);

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

    rows.push({
      id,
      uid,
      asset,
      type,
      amount,
      time: timeCol.match(DATE_RE)?.[1] || when,
      symbol,
      extra,
      raw: line,
    });
  }

  return { rows, diags };
}

/* ---------- aggregation ---------- */
function sumByAsset(rows: Row[]) {
  const acc: Record<string, { pos: number; neg: number; net: number }> = {};
  for (const r of rows) {
    const a = (acc[r.asset] = acc[r.asset] || { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount;
    else a.neg += Math.abs(r.amount);
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
    realizedByAsset: Record<string, any>;
    fundingByAsset: Record<string, any>;
    commByAsset: Record<string, any>;
    insByAsset: Record<string, any>;
  }> = [];

  for (const [symbol, rs] of sym.entries()) {
    const realized = rs.filter((r) => r.type === "REALIZED_PNL");
    const funding = rs.filter((r) => r.type === "FUNDING_FEE");
    const comm = rs.filter((r) => r.type === "COMMISSION");
    const ins = rs.filter((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE");

    const realizedByAsset = sumByAsset(realized);
    const fundingByAsset = sumByAsset(funding);
    const commByAsset = sumByAsset(comm);
    const insByAsset = sumByAsset(ins);

    // FILTER OUT: if there is no Realized PnL, no Commission, and no Funding (across all assets)
    const coreMagnitude =
      sumMapMagnitude(realizedByAsset) +
      sumMapMagnitude(fundingByAsset) +
      sumMapMagnitude(commByAsset);

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

function coinSwapGroups(rows: Row[]) {
  const swaps = rows.filter((r) => SWAP_TYPES.has(r.type));
  const map = new Map<string, Row[]>();

  for (const r of swaps) {
    const idHint = (r.extra && r.extra.split("@")[0]) || "";
    const key = `${r.time}|${idHint}`;
    const g = map.get(key) || [];
    g.push(r);
    map.set(key, g);
  }

  const lines: { time: string; kind: "AUTO_EXCHANGE" | "COIN_SWAP"; text: string }[] = [];
  for (const [, group] of map.entries()) {
    const t = group[0].time;
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
      kind: group.some((g) => g.type === "AUTO_EXCHANGE") ? "AUTO_EXCHANGE" : "COIN_SWAP",
      text: `${t} (UTC+0) — Out: ${outs.length ? outs.join(", ") : "0"} → In: ${ins.length ? ins.join(", ") : "0"}`,
    });
  }
  lines.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
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
    // choose the largest table (cells count)
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
    // last resort: multiple spaces / pipes
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
            return (
              <li key={asset} className="kv-row">
                <span className="label">{asset}</span>
                <span className="num good">+{fmtAbs(v.pos)}</span>
                <span className="num bad">−{fmtAbs(v.neg)}</span>
                <span className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span>
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

function renderAssetPairs(map: Record<string, { pos: number; neg: number; net: number }>) {
  const entries = Object.entries(map);
  if (!entries.length) return <span>–</span>;
  return (
    <>
      {entries.map(([asset, v], i) => (
        <span key={asset} className="pair">
          <span className="good">+{fmtAbs(v.pos)}</span>
          {" / "}
          <span className="bad">−{fmtAbs(v.neg)}</span>
          {" "}{asset}{i < entries.length - 1 ? ", " : ""}
        </span>
      ))}
    </>
  );
}

function pairsToText(map: Record<string, { pos: number; neg: number }>) {
  const entries = Object.entries(map);
  if (!entries.length) return "–";
  return entries.map(([a, v]) => `+${fmtAbs(v.pos)} / −${fmtAbs(v.neg)} ${a}`).join("; ");
}

/* ---------- PNG helpers (no deps) ---------- */
async function elementToPng(el: HTMLElement, filename: string) {
  const width = Math.ceil(el.scrollWidth);
  const height = Math.ceil(el.scrollHeight);
  const svgNS = "http://www.w3.org/2000/svg";
  const xhtmlNS = "http://www.w3.org/1999/xhtml";

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.margin = "0";
  clone.style.background = "#fff";

  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", xhtmlNS);
  wrapper.style.width = width + "px";
  wrapper.style.height = height + "px";
  wrapper.appendChild(clone);

  const foreign = document.createElementNS(svgNS, "foreignObject");
  foreign.setAttribute("x", "0");
  foreign.setAttribute("y", "0");
  foreign.setAttribute("width", String(width));
  foreign.setAttribute("height", String(height));
  foreign.appendChild(wrapper);

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("xmlns", svgNS);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.appendChild(foreign);

  const data = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  await new Promise((res) => {
    img.onload = () => res(null);
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);

  const pngUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = pngUrl;
  a.download = filename;
  a.click();
}

/* ---------- main app ---------- */
export default function App() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [diags, setDiags] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "swaps" | "events" | "raw">("summary");
  const [error, setError] = useState("");

  const parsed = rows;
  const nonEvent = useMemo(() => onlyNonEvents(parsed), [parsed]);
  const events = useMemo(() => onlyEvents(parsed), [parsed]);

  const realizedNonEvent = useMemo(() => nonEvent.filter((r) => r.type === "REALIZED_PNL"), [nonEvent]);
  const commission = useMemo(() => parsed.filter((r) => r.type === "COMMISSION"), [parsed]);
  const referralKick = useMemo(() => parsed.filter((r) => r.type === "REFERRAL_KICKBACK"), [parsed]);
  const funding = useMemo(() => parsed.filter((r) => r.type === "FUNDING_FEE"), [parsed]);
  const insurance = useMemo(
    () => parsed.filter((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE"),
    [parsed]
  );
  const transfers = useMemo(() => parsed.filter((r) => r.type === "TRANSFER"), [parsed]);

  const swapLines = useMemo(() => coinSwapGroups(parsed), [parsed]);
  const swapAuto = swapLines.filter((s) => s.kind === "AUTO_EXCHANGE");
  const swapCoin = swapLines.filter((s) => s.kind === "COIN_SWAP");

  const otherTypesNonEvent = useMemo(
    () => parsed.filter((r) => !KNOWN_TYPES.has(r.type) && !r.type.startsWith(EVENT_PREFIX)),
    [parsed]
  );
  const eventOther = useMemo(() => events.filter((r) => !EVENT_KNOWN_CORE.has(r.type)), [events]);

  const realizedByAsset = useMemo(() => sumByAsset(realizedNonEvent), [realizedNonEvent]);
  const commissionByAsset = useMemo(() => sumByAsset(commission), [commission]);
  const referralByAsset = useMemo(() => sumByAsset(referralKick), [referralKick]);
  const fundingByAsset = useMemo(() => sumByAsset(funding), [funding]);
  const insuranceByAsset = useMemo(() => sumByAsset(insurance), [insurance]);
  const transfersByAsset = useMemo(() => sumByAsset(transfers), [transfers]);
  const symbolBlocks = useMemo(() => bySymbolSummary(nonEvent), [nonEvent]); // filtered

  const tableRef = useRef<HTMLTableElement | null>(null);

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

  function copySummary() {
    const L: string[] = [];
    L.push("FD Summary (UTC+0)", "");

    const pushPL = (title: string, map: Record<string, { pos: number; neg: number }>) => {
      const keys = Object.keys(map);
      if (!keys.length) return;
      L.push(title + ":");
      keys.forEach((asset) => {
        const v = map[asset];
        L.push(`  Total Profit ${asset}: +${fmtAbs(v.pos)}`);
        L.push(`  Total Loss ${asset}: −${fmtAbs(v.neg)}`);
      });
      L.push("");
    };
    pushPL("Realized PnL (Futures, not Events)", realizedByAsset);

    const pushRPN = (title: string, map: Record<string, { pos: number; neg: number; net: number }>) => {
      const keys = Object.keys(map);
      if (!keys.length) return;
      L.push(title + ":");
      keys.forEach((asset) => {
        const v = map[asset];
        L.push(`  Received ${asset}: +${fmtAbs(v.pos)}`);
        L.push(`  Paid ${asset}: −${fmtAbs(v.neg)}`);
        L.push(`  Net ${asset}: ${fmtSigned(v.net)}`);
      });
      L.push("");
    };
    pushRPN("Trading Fees / Commission", commissionByAsset);
    pushRPN("Referral Kickback", referralByAsset);
    pushRPN("Funding Fees", fundingByAsset);
    pushRPN("Insurance / Liquidation", insuranceByAsset);
    pushRPN("Transfers (General)", transfersByAsset);

    if (otherTypesNonEvent.length) {
      const byType: Record<string, Row[]> = {};
      otherTypesNonEvent.forEach((r) => ((byType[r.type] = byType[r.type] || []).push(r)));
      L.push("Other Types (non-event):");
      Object.keys(byType)
        .sort()
        .forEach((t) => {
          const m = sumByAsset(byType[t]);
          L.push(`  ${t}:`);
          Object.entries(m).forEach(([asset, v]) => {
            L.push(`    Received ${asset}: +${fmtAbs(v.pos)}`);
            L.push(`    Paid ${asset}: −${fmtAbs(v.neg)}`);
            L.push(`    Net ${asset}: ${fmtSigned(v.net)}`);
          });
        });
    }
    copyText(L.join("\n"));
  }

  function copyFullResponse() {
    if (!rows.length) return copyText("No data.");

    const collect = (pred: (r: Row) => boolean) => sumByAsset(rows.filter(pred));

    const realized = collect((r) => r.type === "REALIZED_PNL");
    const comm = collect((r) => r.type === "COMMISSION");
    const refkick = collect((r) => r.type === "REFERRAL_KICKBACK");
    const fund = collect((r) => r.type === "FUNDING_FEE");
    const ins = collect((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE");
    const swapsAgg = collect((r) => SWAP_TYPES.has(r.type));
    const evOrder = sumByAsset(events.filter((r) => r.type === "EVENT_CONTRACTS_ORDER"));
    const evPay = sumByAsset(events.filter((r) => r.type === "EVENT_CONTRACTS_PAYOUT"));
    const transfer = collect((r) => r.type === "TRANSFER");

    const total: Record<string, number> = {};
    const bump = (a: string, v: number) => (total[a] = (total[a] ?? 0) + v);
    for (const [a, v] of Object.entries(realized)) bump(a, v.net);
    for (const [a, v] of Object.entries(comm)) bump(a, v.net);
    for (const [a, v] of Object.entries(refkick)) bump(a, v.net);
    for (const [a, v] of Object.entries(fund)) bump(a, v.net);
    for (const [a, v] of Object.entries(ins)) bump(a, v.net);
    for (const [a, v] of Object.entries(swapsAgg)) bump(a, v.net);
    for (const [a, v] of Object.entries(evOrder)) bump(a, v.net);
    for (const [a, v] of Object.entries(evPay)) bump(a, v.net);
    for (const [a, v] of Object.entries(transfer)) bump(a, v.net);

    const assets = new Set<string>([
      ...Object.keys(realized),
      ...Object.keys(comm),
      ...Object.keys(refkick),
      ...Object.keys(fund),
      ...Object.keys(ins),
      ...Object.keys(swapsAgg),
      ...Object.keys(evOrder),
      ...Object.keys(evPay),
      ...Object.keys(transfer),
    ]);

    const L: string[] = [];
    L.push("Summary of your balance log (UTC+0):", "");

    const pushIf = (cond: boolean, line: string) => {
      if (cond) L.push(line);
    };

    Array.from(assets)
      .sort()
      .forEach((asset) => {
        const r = realized[asset];
        const c = comm[asset];
        const rk = refkick[asset];
        const f = fund[asset];
        const i = ins[asset];
        const sw = swapsAgg[asset];
        const eo = evOrder[asset];
        const ep = evPay[asset];

        L.push(`Asset: ${asset}`);

        if (r) {
          pushIf(r.pos > EPS, `  Profit in ${asset}: +${fmtAbs(r.pos)}`);
          pushIf(r.neg > EPS, `  Loss in ${asset}: −${fmtAbs(r.neg)}`);
        }
        if (c) {
          pushIf(c.neg > EPS, `  Trading Fee in ${asset}: −${fmtAbs(c.neg)}`);
          pushIf(c.pos > EPS, `  Trading Fee refunds in ${asset}: +${fmtAbs(c.pos)}`);
        }
        if (rk) {
          pushIf(rk.pos > EPS, `  Fee Rebate in ${asset}: +${fmtAbs(rk.pos)}`);
          pushIf(rk.neg > EPS, `  Fee Rebate adjustments in ${asset}: −${fmtAbs(rk.neg)}`);
        }
        if (f) {
          pushIf(f.pos > EPS, `  Funding Fee Received in ${asset}: +${fmtAbs(f.pos)}`);
          pushIf(f.neg > EPS, `  Funding Fee Paid in ${asset}: −${fmtAbs(f.neg)}`);
        }
        if (i) {
          pushIf(i.pos > EPS, `  Liquidation Clearance Fee Received in ${asset}: +${fmtAbs(i.pos)}`);
          pushIf(i.neg > EPS, `  Liquidation Clearance Fee Paid in ${asset}: −${fmtAbs(i.neg)}`);
        }
        if (sw) {
          pushIf(sw.pos > EPS, `  Coin-Swap/Auto-Exchange Received ${asset}: +${fmtAbs(sw.pos)}`);
          pushIf(sw.neg > EPS, `  Coin-Swap/Auto-Exchange Used ${asset}: −${fmtAbs(sw.neg)}`);
        }
        if (ep) pushIf(ep.pos > EPS, `  Event Contracts Payout ${asset}: +${fmtAbs(ep.pos)}`);
        if (eo) pushIf(eo.neg > EPS, `  Event Contracts Order ${asset}: −${fmtAbs(eo.neg)}`);

        const net = total[asset] ?? 0;
        pushIf(
          Math.abs(net) > EPS,
          `  The Total Amount in ${asset} for all the transaction history is: ${fmtSigned(net)} ${asset}`
        );
        L.push("");
      });

    copyText(L.join("\n").replace(/\n{3,}/g, "\n\n"));
  }

  function copySwaps(list: { text: string }[], title: string) {
    const L: string[] = [`${title} (UTC+0)`, ""];
    if (!list.length) L.push("None");
    else list.forEach((s) => L.push(`- ${s.text}`));
    copyText(L.join("\n"));
  }

  function copyEvents() {
    const orders = events.filter((r) => r.type === "EVENT_CONTRACTS_ORDER");
    const payouts = events.filter((r) => r.type === "EVENT_CONTRACTS_PAYOUT");
    const byOrder = sumByAsset(orders);
    const byPayout = sumByAsset(payouts);
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
      Object.keys(byType)
        .sort()
        .forEach((t) => {
          const m = sumByAsset(byType[t]);
          L.push(`  ${t}:`);
          Object.entries(m).forEach(([asset, v]) => {
            L.push(`    Received ${asset}: +${fmtAbs(v.pos)}`);
            L.push(`    Paid ${asset}: −${fmtAbs(v.neg)}`);
            L.push(`    Net ${asset}: ${fmtSigned(v.net)}`);
          });
        });
    }

    copyText(L.join("\n"));
  }

  function copyRaw() {
    if (!rows.length) return;
    const headers = ["time", "type", "asset", "amount", "symbol", "id", "uid", "extra"];
    const L = [headers.join("\t")];
    rows.forEach((r) => L.push([r.time, r.type, r.asset, r.amount, r.symbol, r.id, r.uid, r.extra].join("\t")));
    copyText(L.join("\n"));
  }

  // Copy one symbol block
  function copyOneSymbol(b: ReturnType<typeof bySymbolSummary>[number]) {
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

  // Copy all symbols as a readable multi-section text
  function copyAllSymbolsText() {
    if (!symbolBlocks.length) return copyText("No symbol activity.");
    const L: string[] = ["By Symbol (Futures, not Events)", ""];
    symbolBlocks.forEach((b) => {
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

  // Save PNG of full symbols table
  async function saveSymbolsPng() {
    const table = tableRef.current;
    if (!table) return;
    const wrapper = table.closest(".tablewrap") as HTMLElement;
    await elementToPng(wrapper, "symbols_table.png");
  }

  // Save PNG of one row
  async function saveOneSymbolPng(symbol: string) {
    const row = document.getElementById(`row-${symbol}`);
    if (!row) return;
    await elementToPng(row as HTMLElement, `${symbol}.png`);
  }

  function downloadCsvFile(filename: string, data: Row[]) {
    const blob = new Blob([toCsv(data)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function runSelfTest() {
    const fixture = [
      "900000000001\t1059874281\tUSDT\tCOIN_SWAP_WITHDRAW\t-10\t2025-07-03 12:37:46\t\t\tSWAPID123@1.00\t2025-07-03 12:37:46",
      "900000000002\t1059874281\tBNB\tCOIN_SWAP_DEPOSIT\t0.01511633\t2025-07-03 12:37:46\t\t\tSWAPID123@1.00\t2025-07-03 12:37:46",
      "900000000003\t1059874281\tUSDT\tAUTO_EXCHANGE\t-9\t2025-07-03 12:47:32\t\t\tXID@1\t2025-07-03 12:47:32",
      "900000000004\t1059874281\tUSDC\tAUTO_EXCHANGE\t8.97164406\t2025-07-03 12:47:32\t\t\tXID@1\t2025-07-03 12:47:32",
      "93131295767309\t1059874281\tUSDT\tREALIZED_PNL\t-1.03766\t2025-08-19 08:06:10\tAPI3USDT\t295767309\t295767309\t2025-08-19 08:06:10",
      "900605603173683\t1059874281\tUSDT\tCOMMISSION\t-0.01181965\t2025-05-09 07:57:50\tETHUSDT\t5603173683\t5603173683\t2025-05-09 07:57:50",
      "777777777777\t1059874281\tUSDT\tREFERRAL_KICKBACK\t0.005\t2025-05-09 07:58:00\t\t\t\t2025-05-09 07:58:00",
      "731322166832789270\t1059874281\tUSDT\tFUNDING_FEE\t0.0033099\t2025-05-09 08:00:00\tETHUSDT\t\tFUNDING_FEE\t2025-05-09 08:00:00",
      "266369696644\t1059874281\tUSDT\tTRANSFER\t300.0074505\t2025-06-01 18:38:21\t\t\tTRANSFER\t2025-06-01 18:38:21",
      "888888888888\t1059874281\tUSDT\tEVENT_CONTRACTS_ORDER\t-50\t2025-07-01 10:00:00\t\t\t\t2025-07-01 10:00:00",
      "888888888889\t1059874281\tUSDT\tEVENT_CONTRACTS_PAYOUT\t70\t2025-07-02 10:00:00\t\t\t\t2025-07-02 10:00:00",
      "888888888890\t1059874281\tUSDT\tEVENT_CONTRACTS_FEE\t-1.5\t2025-07-02 10:01:00\t\t\t\t2025-07-02 10:01:00",
    ].join("\n");

    const { rows: rs } = parseBalanceLog(fixture);
    const lines = coinSwapGroups(rs);
    if (lines.length !== 2) throw new Error("Swap grouping failed");
    if (!rs.some((r) => r.type === "REFERRAL_KICKBACK")) throw new Error("Referral Kickback missing");
    if (!rs.some((r) => r.type === "EVENT_CONTRACTS_FEE")) throw new Error("Event – Other missing");
    alert("Self-test passed ✅");
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
          <button className="btn btn-primary" onClick={onPasteAndParseText}>
            Paste plain text & Parse
          </button>
          <button className="btn" onClick={runSelfTest}>
            Self-Test
          </button>
        </div>
      </header>

      {/* Paste */}
      <section className="space">
        <GridPasteBox
          onUseTSV={(tsv) => {
            setInput(tsv);
            runParse(tsv);
          }}
          onError={(m) => setError(m)}
        />

        {/* Fallback textarea */}
        <details className="card" style={{ marginTop: 8 }}>
          <summary className="card-head" style={{ cursor: "pointer" }}>
            <h3>Manual Paste (fallback)</h3>
          </summary>
          <textarea
            placeholder="Paste raw text or TSV here"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="paste"
          />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn btn-dark" onClick={onParse}>
              Parse
            </button>
            <button
              className="btn"
              onClick={() => {
                setInput("");
                setError("");
              }}
            >
              Clear
            </button>
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
          <button
            key={t.key}
            className={`tab ${activeTab === (t.key as any) ? "active" : ""}`}
            onClick={() => setActiveTab(t.key as any)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* SUMMARY */}
      {activeTab === "summary" && rows.length > 0 && (
        <section className="space">
          <div className="card">
            <div className="card-head" style={{ justifyContent: "space-between" }}>
              <h2>Summary (UTC+0)</h2>
              <div className="btn-row">
                <button className="btn btn-success" onClick={copySummary}>
                  Copy Summary (no Swaps)
                </button>
                <button className="btn" onClick={copyFullResponse}>
                  Copy Response (Full)
                </button>
              </div>
            </div>

            {/* Realized PnL tiles */}
            <div className="subcard">
              <h3>Realized PnL (Futures, not Events)</h3>
              {Object.keys(realizedByAsset).length ? (
                <ul className="grid two">
                  {Object.entries(realizedByAsset).map(([asset, v]) => (
                    <li key={asset} className="pill">
                      <span className="label">{asset}</span>{" "}
                      <span className="good">+{fmtAbs(v.pos)}</span> •{" "}
                      <span className="bad">−{fmtAbs(v.neg)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No Realized PnL found.</p>
              )}
            </div>

            {/* Main cards grid */}
            <div className="grid three">
              <RpnCard title="Trading Fees / Commission" map={commissionByAsset} />
              <RpnCard title="Referral Kickback" map={referralByAsset} />
              <RpnCard title="Funding Fees" map={fundingByAsset} />
              <RpnCard title="Insurance / Liquidation" map={insuranceByAsset} />
              <RpnCard title="Transfers (General)" map={transfersByAsset} />

              {/* Other Types moved UP here (inside cards area) */}
              {otherTypesNonEvent.length > 0 && (
                <div className="card">
                  <div className="card-head"><h3>Other Types (non-event)</h3></div>
                  <OtherTypesBlock rows={otherTypesNonEvent} />
                </div>
              )}
            </div>

            {/* By Symbol */}
            <div className="subcard">
              <div className="card-head" style={{ padding: 0, marginBottom: 8 }}>
                <h3>By Symbol (Futures, not Events)</h3>
                <div className="btn-row">
                  <button className="btn" onClick={copyAllSymbolsText}>Copy Symbols (text)</button>
                  <button className="btn" onClick={saveSymbolsPng}>Save Symbols PNG</button>
                </div>
              </div>

              {symbolBlocks.length ? (
                <div className="tablewrap">
                  <table className="table" ref={tableRef}>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Realized PnL</th>
                        <th>Funding</th>
                        <th>Trading Fees</th>
                        <th>Insurance</th>
                        <th className="sticky actions">Actions</th>
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
                          <td className="sticky actions">
                            <div className="btn-row">
                              <button className="btn btn-small" onClick={() => copyOneSymbol(b)}>Copy details</button>
                              <button className="btn btn-small" onClick={() => saveOneSymbolPng(b.symbol)}>Save PNG</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No symbol activity.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* SWAPS */}
      {activeTab === "swaps" && (
        <section className="space">
          <div className="card">
            <div className="card-head" style={{ justifyContent: "space-between" }}>
              <h2>Coin Swaps & Auto-Exchange (UTC+0)</h2>
              <div className="btn-row">
                <button className="btn" onClick={() => copySwaps(swapAuto, "Auto-Exchange")}>Copy Auto-Exchange</button>
                <button className="btn" onClick={() => copySwaps(swapCoin, "Coin Swaps")}>Copy Coin Swaps</button>
              </div>
            </div>

            <div className="grid two">
              <div>
                <h4 className="muted">Auto-Exchange</h4>
                {swapAuto.length ? (
                  <ul className="list">
                    {swapAuto.map((s, i) => (
                      <li key={i} className="num">{s.text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None</p>
                )}
              </div>

              <div>
                <h4 className="muted">Coin Swaps</h4>
                {swapCoin.length ? (
                  <ul className="list">
                    {swapCoin.map((s, i) => (
                      <li key={i} className="num">{s.text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None</p>
                )}
              </div>
            </div>

            <p className="hint">Each line groups all legs that happened at the same second (UTC+0).</p>
          </div>
        </section>
      )}

      {/* EVENTS */}
      {activeTab === "events" && (
        <section className="space">
          <div className="card">
            <div className="card-head" style={{ justifyContent: "space-between" }}>
              <h2>Event Contracts (separate product)</h2>
              <button className="btn" onClick={copyEvents}>
                Copy Events
              </button>
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
                <button className="btn" onClick={copyRaw}>
                  Copy TSV
                </button>
                <button className="btn" onClick={() => downloadCsvFile("balance_log.csv", rows)}>
                  Download CSV
                </button>
              </div>
            </div>
            <div className="tablewrap">
              <table className="table mono small">
                <thead>
                  <tr>
                    {["time", "type", "asset", "amount", "symbol", "id", "uid", "extra"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.time}</td>
                      <td>{r.type}</td>
                      <td>{r.asset}</td>
                      <td className="num">{fmtSigned(r.amount)}</td>
                      <td>{r.symbol}</td>
                      <td>{r.id}</td>
                      <td>{r.uid}</td>
                      <td>{r.extra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- small components ---------- */
function EventSummary({ rows }: { rows: Row[] }) {
  const orders = rows.filter((r) => r.type === "EVENT_CONTRACTS_ORDER");
  const payouts = rows.filter((r) => r.type === "EVENT_CONTRACTS_PAYOUT");
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
            <div className="card-head">
              <h4>{t}</h4>
            </div>
            {ks.length ? (
              <ul className="kv">
                {ks.map((asset) => {
                  const v = byAsset[asset];
                  return (
                    <li key={asset} className="kv-row">
                      <span className="label">{asset}</span>
                      <span className="num good">+{fmtAbs(v.pos)}</span>
                      <span className="num bad">−{fmtAbs(v.neg)}</span>
                      <span className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">None</p>
            )}
          </div>
        );
      })}
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
.wrap{min-height:100vh;background:var(--bg);color:var(--txt);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial}
.header{max-width:1080px;margin:24px auto 12px;padding:0 16px;display:flex;gap:12px;align-items:flex-end;justify-content:space-between}
.header h1{margin:0 0 2px;font-size:26px}
.muted{color:var(--muted)}
.good{color:#059669}
.bad{color:#dc2626}
.btn-row{display:flex;gap:8px;flex-wrap:
