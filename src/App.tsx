import React, { useMemo, useRef, useState } from "react";

/**
 * Balance Log Analyzer – with Excel-like Paste (UTC+0)
 *
 * New:
 * - GridPasteBox: accepts Ctrl/⌘+V from the website; reads text/html, extracts <table>,
 *   preserves empty cells, shows a grid preview, and feeds TSV to the existing parser.
 * - Manual textarea kept under a collapsible block for fallback.
 * - Single PNG export for the entire "By Symbol" table.
 * - "Copy Symbols (text)" for fast sharing.
 * - Filter "By Symbol" to hide symbols with no activity (no PnL/Funding/Commission/Insurance).
 * Everything else (summaries, grouped swaps, events, referral kickback, etc.) stays the same.
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

const EPS = 1e-12; // treat micro values as zero in copy responses

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
function toCsv(rows: Row[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]) as (keyof Row)[];
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const body = rows.map((r) => headers.map((h) => escape((r as any)[h])).join(","));
  return [headers.join(","), ...body].join("\n");
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
    the uid = cols[1] ?? "";
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
function onlyEvents(rows: Row[]) {
  return rows.filter((r) => r.type.startsWith(EVENT_PREFIX));
}
function onlyNonEvents(rows: Row[]) {
  return rows.filter((r) => !r.type.startsWith(EVENT_PREFIX));
}
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
function isEmptyMap(m: Record<string, any>) {
  return !m || Object.keys(m).length === 0;
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

    // NEW: hide symbols where there is no activity (no PnL / Funding / Commission / Insurance)
    if (
      isEmptyMap(realizedByAsset) &&
      isEmptyMap(fundingByAsset) &&
      isEmptyMap(commByAsset) &&
      isEmptyMap(insByAsset)
    ) {
      continue;
    }

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

  const lines: { time: string; kind: string; text: string }[] = [];
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
      // keep empty cells to preserve indexes
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
    // very last resort: split by multiple spaces
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
          // Prevent typing inside; we only want paste
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
                <span className="num">Received: +{fmtAbs(v.pos)}</span>
                <span className="num">Paid: −{fmtAbs(v.neg)}</span>
                <span className="num">Net: {fmtSigned(v.net)}</span>
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
function fmtAssetPairs(map: Record<string, { pos: number; neg: number; net: number }>) {
  const parts: string[] = [];
  Object.entries(map).forEach(([asset, v]) => parts.push(`+${fmtAbs(v.pos)} / −${fmtAbs(v.neg)} ${asset}`));
  return parts.length ? parts.join(", ") : "–";
}

/* ---------- Export helpers (single PNG of a DOM node) ---------- */
async function nodeToPng(node: HTMLElement, filename = "symbols.png") {
  const { width, height } = node.getBoundingClientRect();
  // Include some padding for nicer edges
  const pad = 16;
  const w = Math.ceil(width) + pad * 2;
  const h = Math.ceil(height) + pad * 2;

  const style = new XMLSerializer().serializeToString(document.styleSheets ? document.documentElement : document.documentElement);
  const html = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="padding:${pad}px;background:#ffffff;color:#111">
      ${node.outerHTML}
    </div>`;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <foreignObject x="0" y="0" width="100%" height="100%">
        ${html}
      </foreignObject>
    </svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  // Draw SVG to canvas
  const img = new Image();
  img.src = url;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);

  URL.revokeObjectURL(url);

  // Download PNG
  canvas.toBlob((png) => {
    if (!png) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  });
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
  const swaps = useMemo(() => coinSwapGroups(parsed), [parsed]);

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

  const symbolBlocks = useMemo(() => bySymbolSummary(nonEvent), [nonEvent]);

  // Refs for exporting the full "By Symbol" section
  const symbolExportRef = useRef<HTMLDivElement | null>(null);
  const symbolTableRef = useRef<HTMLTableElement | null>(null);

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
    // legacy: readText only gets plain text
    if (navigator.clipboard?.readText) {
      navigator.clipboard.readText().then((t) => {
        setInput(t);
        setTimeout(() => runParse(t), 0);
      });
    }
  }

  function sectionCopy(text: string) {
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
    sectionCopy(L.join("\n"));
  }

  // >>> Full per-asset response (includes swaps & events, hides zero lines)
  function copyFullResponse() {
    if (!rows.length) return sectionCopy("No data.");

    const collect = (pred: (r: Row) => boolean) => sumByAsset(rows.filter(pred));

    const realized = collect((r) => r.type === "REALIZED_PNL");
    const comm     = collect((r) => r.type === "COMMISSION");
    const refkick  = collect((r) => r.type === "REFERRAL_KICKBACK");
    const fund     = collect((r) => r.type === "FUNDING_FEE");
    const ins      = collect((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE");
    const swapsAgg = collect((r) => SWAP_TYPES.has(r.type));
    const evOrder  = sumByAsset(events.filter((r) => r.type === "EVENT_CONTRACTS_ORDER"));
    const evPay    = sumByAsset(events.filter((r) => r.type === "EVENT_CONTRACTS_PAYOUT"));
    const transfer = collect((r) => r.type === "TRANSFER"); // counted in totals only

    // Build totals
    const total: Record<string, number> = {};
    const bump = (a: string, v: number) => (total[a] = (total[a] ?? 0) + v);
    for (const [a, v] of Object.entries(realized)) bump(a, v.net);
    for (const [a, v] of Object.entries(comm))     bump(a, v.net);
    for (const [a, v] of Object.entries(refkick))  bump(a, v.net);
    for (const [a, v] of Object.entries(fund))     bump(a, v.net);
    for (const [a, v] of Object.entries(ins))      bump(a, v.net);
    for (const [a, v] of Object.entries(swapsAgg)) bump(a, v.net);
    for (const [a, v] of Object.entries(evOrder))  bump(a, v.net);
    for (const [a, v] of Object.entries(evPay))    bump(a, v.net);
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

    const pushIf = (cond: boolean, line: string) => { if (cond) L.push(line); };

    Array.from(assets).sort().forEach((asset) => {
      const r  = realized[asset];
      const c  = comm[asset];
      const rk = refkick[asset];
      const f  = fund[asset];
      const i  = ins[asset];
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
        pushIf(i.pos > EPS, `  Liquidation Clerarance Fee Received in ${asset}: +${fmtAbs(i.pos)}`);
        pushIf(i.neg > EPS, `  Liquidation Clerarance Fee Paid in ${asset}: −${fmtAbs(i.neg)}`);
      }
      if (sw) {
        pushIf(sw.pos > EPS, `  The Coin-Swap Received ${asset}: +${fmtAbs(sw.pos)}`);
        pushIf(sw.neg > EPS, `  The Coin-Swap Used ${asset}: −${fmtAbs(sw.neg)}`);
      }
      if (ep) pushIf(ep.pos > EPS, `  The Event Contacts Payout ${asset}: +${fmtAbs(ep.pos)}`);
      if (eo) pushIf(eo.neg > EPS, `  The Event Contacts Order ${asset}: −${fmtAbs(eo.neg)}`);

      const net = total[asset] ?? 0;
      pushIf(Math.abs(net) > EPS, `  The Total Amount in ${asset} for all the transaction history is: ${fmtSigned(net)} ${asset}`);
      L.push("");
    });

    sectionCopy(L.join("\n").replace(/\n{3,}/g, "\n\n"));
  }
  // <<< end

  function copySwaps() {
    const L: string[] = ["Coin Swaps & Auto-Exchange (UTC+0)", ""];
    const groups = swaps;
    if (!groups.length) L.push("None");
    else groups.forEach((s) => L.push(`- ${s.text}`));
    sectionCopy(L.join("\n"));
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

    sectionCopy(L.join("\n"));
  }
  function copyRaw() {
    if (!rows.length) return;
    const headers = ["time", "type", "asset", "amount", "symbol", "id", "uid", "extra"];
    const L = [headers.join("\t")];
    rows.forEach((r) => L.push([r.time, r.type, r.asset, r.amount, r.symbol, r.id, r.uid, r.extra].join("\t")));
    sectionCopy(L.join("\n"));
  }
  function downloadCsv(filename: string, data: Row[]) {
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
    const swapLines = coinSwapGroups(rs);
    if (swapLines.length !== 2) throw new Error("Swap grouping failed");
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

      {/* Excel-like paste box */}
      <section className="space">
        <GridPasteBox
          onUseTSV={(tsv) => {
            setInput(tsv);
            runParse(tsv);
          }}
          onError={(m) => setError(m)}
        />

        {/* Manual textarea fallback (collapsed) */}
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

            <div className="subcard">
              <h3>Realized PnL (Futures, not Events)</h3>
              {Object.keys(sumByAsset(nonEvent.filter((r) => r.type === "REALIZED_PNL"))).length ? (
                <ul className="grid two">
                  {Object.entries(sumByAsset(nonEvent.filter((r) => r.type === "REALIZED_PNL"))).map(
                    ([asset, v]) => (
                      <li key={asset} className="pill">
                        <span className="label">{asset}</span>
                        <span className="num">
                          Profit: +{fmtAbs(v.pos)} • Loss: −{fmtAbs(v.neg)}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              ) : (
                <p className="muted">No Realized PnL found.</p>
              )}
            </div>

            <div className="grid three">
              <RpnCard title="Trading Fees / Commission" map={sumByAsset(commission)} />
              <RpnCard title="Referral Kickback" map={sumByAsset(referralKick)} />
              <RpnCard title="Funding Fees" map={sumByAsset(funding)} />
              <RpnCard title="Insurance / Liquidation" map={sumByAsset(insurance)} />
              <RpnCard title="Transfers (General)" map={sumByAsset(transfers)} />
            </div>

            {/* By Symbol section with Copy / PNG export */}
            <div className="subcard" ref={symbolExportRef}>
              <div className="card-head" style={{ marginBottom: 0 }}>
                <h3>By Symbol (Futures, not Events)</h3>
                {symbolBlocks.length > 0 && (
                  <div className="btn-row">
                    <button
                      className="btn"
                      onClick={() => {
                        const L: string[] = [];
                        L.push("By Symbol (Futures, not Events)");
                        L.push("");
                        symbolBlocks.forEach((b) => {
                          L.push(
                            [
                              b.symbol,
                              fmtAssetPairs(b.realizedByAsset),
                              fmtAssetPairs(b.fundingByAsset),
                              fmtAssetPairs(b.commByAsset),
                              fmtAssetPairs(b.insByAsset),
                            ].join(" | ")
                          );
                        });
                        sectionCopy(L.join("\n"));
                      }}
                    >
                      Copy Symbols (text)
                    </button>
                    <button
                      className="btn"
                      onClick={async () => {
                        if (!symbolTableRef.current) return;
                        await nodeToPng(symbolTableRef.current.closest(".tablewrap") as HTMLElement, "symbols.png");
                      }}
                    >
                      Save Symbols PNG
                    </button>
                  </div>
                )}
              </div>

              {symbolBlocks.length ? (
                <div className="tablewrap">
                  <table className="table" ref={symbolTableRef}>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Realized PnL</th>
                        <th>Funding</th>
                        <th>Trading Fees</th>
                        <th>Insurance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {symbolBlocks.map((b) => (
                        <tr key={b.symbol}>
                          <td className="label">{b.symbol}</td>
                          <td className="num">{fmtAssetPairs(b.realizedByAsset)}</td>
                          <td className="num">{fmtAssetPairs(b.fundingByAsset)}</td>
                          <td className="num">{fmtAssetPairs(b.commByAsset)}</td>
                          <td className="num">{fmtAssetPairs(b.insByAsset)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No symbol activity.</p>
              )}
            </div>

            <div className="subcard">
              <h3>Other Types (non-event)</h3>
              {otherTypesNonEvent.length ? (
                <OtherTypesBlock rows={otherTypesNonEvent} />
              ) : (
                <p className="muted">None</p>
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
              <button className="btn" onClick={copySwaps}>
                Copy Coin Swaps
              </button>
            </div>
            {swaps.length ? (
              <ul className="list">
                {swaps.map((s, i) => (
                  <li key={i} className="num">
                    {s.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">None</p>
            )}
            <p className="hint">Each line groups all legs that happened at the same second.</p>
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
                  Copy Table (TSV)
                </button>
                <button className="btn" onClick={() => downloadCsv("balance_log.csv", rows)}>
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
                <td className="num">+{fmtAbs(p.pos)}</td>
                <td className="num">−{fmtAbs(o.neg)}</td>
                <td className="num">{fmtSigned(net)}</td>
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
          <div key={t} className="card tone">
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
                      <span className="num">Received: +{fmtAbs(v.pos)}</span>
                      <span className="num">Paid: −{fmtAbs(v.neg)}</span>
                      <span className="num">Net: {fmtSigned(v.net)}</span>
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
  --bg:#f4f6f8; --txt:#0f1720; --muted:#6b7785; --card:#ffffff; --line:#e6e9ee;
  --primary:#0f62fe; --dark:#111827; --success:#22c55e; --pill:#f7f8fa;
}
*{box-sizing:border-box} body{margin:0}
.wrap{min-height:100vh;background:var(--bg);color:var(--txt);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial}
.header{max-width:1080px;margin:24px auto 12px;padding:0 16px;display:flex;gap:12px;align-items:flex-end;justify-content:space-between}
.header h1{margin:0 0 2px;font-size:26px}
.muted{color:var(--muted)}
.btn-row{display:flex;gap:8px;flex-wrap:wrap}
.btn{border:1px solid var(--line);background:#fff;border-radius:10px;padding:8px 12px;cursor:pointer}
.btn:hover{background:#f9fafb}
.btn-primary{background:var(--primary);border-color:var(--primary);color:#fff}
.btn-dark{background:var(--dark);border-color:var(--dark);color:#fff}
.btn-success{background:var(--success);border-color:var(--success);color:#fff}
.space{max-width:1080px;margin:0 auto;padding:0 16px 24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,.04);padding:16px;margin:12px auto;max-width:1080px}
.card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.subcard{border-top:1px dashed var(--line);padding-top:12px;margin-top:12px}
.grid{display:grid;gap:12px}
.grid.two{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.grid.three{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.pill{background:var(--pill);border:1px solid var(--line);border-radius:12px;padding:10px}
.kv{display:grid;gap:8px}
.kv-row{display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:center;background:var(--pill);border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.label{font-weight:600}
.num{font-variant-numeric:tabular-nums}
.paste{width:100%;height:120px;border:1px solid var(--line);border-radius:12px;padding:10px;font-family:ui-monospace,Menlo,Consolas,monospace;background:#fff}
.error{color:#b91c1c;margin:8px 0 0}
.diags summary{cursor:pointer;font-weight:600}
.diagbox{width:100%;height:120px;background:#fbfcfe;border:1px solid var(--line);border-radius:8px;padding:8px;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace}
.tabs{max-width:1080px;margin:6px auto 0;padding:0 16px;display:flex;gap:8px;flex-wrap:wrap}
.tab{border:1px solid var(--line);background:#fff;padding:8px 12px;border-radius:999px;cursor:pointer}
.tab.active{background:var(--dark);border-color:var(--dark);color:#fff}
.tablewrap{overflow:auto;border:1px solid var(--line);border-radius:12px;background:#fff}
.table{width:100%;border-collapse:separate;border-spacing:0}
.table th,.table td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.table thead th{background:#fbfcfe;font-weight:700}
.table .label{font-weight:600}
.table.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.table.small td,.table.small th{padding:8px 10px}
.list{margin:0;padding:0 0 0 18px}
.hint{margin-top:8px;font-size:12px;color:var(--muted)}
.tone{background:#fcfdfd}

/* New: Excel-like paste box */
.dropzone{
  width:100%;min-height:64px;border:2px dashed var(--line);border-radius:12px;background:#fff;
  padding:14px;display:flex;align-items:center;justify-content:center;color:var(--muted);
  text-align:center; user-select:none; outline:none;
}
.dropzone:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(15,98,254,0.15)}
`;
