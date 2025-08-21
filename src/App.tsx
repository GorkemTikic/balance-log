import React, { useMemo, useRef, useState } from "react";

/**
 * FD Assistant – Balance Log (Robust Parser, Copy-Friendly, UTC+0)
 * - Pasting full page text now works even if columns shift.
 * - We detect TYPE token dynamically; amount is the token right after TYPE; asset is the token right before TYPE.
 * - Tabs OR multi-spaces both supported. Weird spaces are cleaned.
 * - Amounts with commas are handled.
 * - Main summary copy EXCLUDES swaps/auto-exchange; they have their own copy button.
 * - Raw parsed table is collapsed by default.
 * - Hidden Diagnostics toggle helps if something still doesn’t parse.
 */

// ---------- Utilities ----------
const DATE_RE =
  /(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{1,2}:\d{2}:\d{2})/; // supports 2025-02-04 8:09:12 or 2025/02/04 08:09:12
const SYMBOL_RE = /^[A-Z0-9]{3,}(USDT|USDC|USD|BTC|ETH|BNB|PERP)$/;

const KNOWN_TYPES = new Set([
  "REALIZED_PNL",
  "FUNDING_FEE",
  "COMMISSION",
  "INSURANCE_CLEAR",
  "LIQUIDATION_FEE",
  "TRANSFER",
  "COIN_SWAP",
  "COIN_SWAP_DEPOSIT",
  "COIN_SWAP_WITHDRAW",
  "AUTO_EXCHANGE",
  "EVENT_CONTRACTS_ORDER",
  "EVENT_CONTRACTS_PAYOUT",
]);

const SWAP_TYPES = new Set([
  "COIN_SWAP",
  "COIN_SWAP_DEPOSIT",
  "COIN_SWAP_WITHDRAW",
  "AUTO_EXCHANGE",
]);

const EVENT_PREFIX = "EVENT_CONTRACTS_";

function fmtAbs(x: number, maxDp = 8) {
  const v = Math.abs(Number(x) || 0);
  const s = v.toFixed(maxDp);
  return s.replace(/\.0+$/, "").replace(/(\.[0-9]*?)0+$/, "$1");
}
function fmtSigned(x: number, maxDp = 8) {
  const n = Number(x) || 0;
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${fmtAbs(n, maxDp)}`;
}
function toCsv(rows: any[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = String(v ?? "");
    if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const body = rows.map((r) => headers.map((h) => escape(r[h])).join(","));
  return [headers.join(","), ...body].join("\n");
}

// ---------- Parsing ----------
function sanitizeLine(s: string) {
  // remove non-breaking and zero-width spaces, normalize inner whitespace
  return s.replace(/[\u00A0\u2000-\u200B]/g, " ").replace(/\s+/g, " ").trim();
}
function splitColumns(line: string) {
  if (line.includes("\t")) return line.split(/\t+/).map((t) => t.trim());
  // fallback: split on 2+ spaces but allow single spaces inside ids/extra
  return line.trim().split(/\s{2,}|\s\|\s/).flatMap((chunk) => chunk.split(/\s{2,}/)).filter(Boolean);
}
function firstDateIn(line: string) {
  const m = line.match(DATE_RE);
  return m ? m[1].replace(/\//g, "-") : "";
}
function toNumberLoose(token: string) {
  // accept "-1,234.567" or "1234.5"
  const cleaned = token.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string; // UTC+0 string
  symbol: string;
  extra: string;
  raw: string;
};

type ParseDiag = {
  line: string;
  reason: string;
};

function parseBalanceLog(text: string): { rows: Row[]; diags: ParseDiag[] } {
  const rows: Row[] = [];
  const diags: ParseDiag[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => sanitizeLine(l))
    .filter(Boolean);

  for (const line of lines) {
    const time = firstDateIn(line);
    if (!time) {
      diags.push({ line, reason: "No date found" });
      continue;
    }

    // Try strong split first (tabs or multi-spaces). If that fails to find TYPE,
    // fallback to a token scan across single-space splits.
    let cols = splitColumns(line);
    if (cols.length < 4) cols = line.split(" ");

    // Find type token index: must be KNOWN_TYPES or startsWith EVENT_CONTRACTS_
    let typeIdx = -1;
    for (let i = 0; i < cols.length; i++) {
      const t = cols[i].toUpperCase();
      if (KNOWN_TYPES.has(t) || t.startsWith(EVENT_PREFIX)) {
        typeIdx = i;
        break;
      }
    }
    if (typeIdx === -1) {
      diags.push({ line, reason: "No recognized TYPE token" });
      continue;
    }

    const type = cols[typeIdx].toUpperCase();

    // Heuristic: asset is token before type, amount is token after type
    if (typeIdx === 0 || typeIdx >= cols.length - 1) {
      diags.push({ line, reason: "TYPE at start or end – cannot infer asset/amount" });
      continue;
    }

    const asset = cols[typeIdx - 1].toUpperCase();
    const amountToken = cols[typeIdx + 1];
    const amount = toNumberLoose(amountToken);

    if (!Number.isFinite(amount)) {
      diags.push({ line, reason: `Amount not numeric: "${amountToken}"` });
      continue;
    }

    // id and uid are usually first two columns; if missing, leave blank
    const id = cols[0] || "";
    const uid = cols[1] || "";

    // symbol: search tokens after amount for first SYMBOL-like token
    let symbol = "";
    for (let i = typeIdx + 2; i < cols.length; i++) {
      const tok = cols[i].toUpperCase();
      if (SYMBOL_RE.test(tok)) {
        symbol = tok;
        break;
      }
    }

    // extra: whatever remains after symbol onward (join) OR last chunk(s)
    const extra = cols.slice(typeIdx + 2).join(" ");

    rows.push({
      id,
      uid,
      asset,
      type,
      amount,
      time,
      symbol,
      extra,
      raw: line,
    });
  }

  return { rows, diags };
}

// ---------- Aggregation ----------
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
function bySymbolSummary(nonEventRows: Row[]) {
  const sym = groupBySymbol(nonEventRows);
  const out: any[] = [];
  for (const [symbol, rs] of sym.entries()) {
    const realized = rs.filter((r) => r.type === "REALIZED_PNL");
    const funding = rs.filter((r) => r.type === "FUNDING_FEE");
    const comm = rs.filter((r) => r.type === "COMMISSION");
    const ins = rs.filter((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE");

    out.push({
      symbol,
      realizedByAsset: sumByAsset(realized),
      fundingByAsset: sumByAsset(funding),
      commByAsset: sumByAsset(comm),
      insByAsset: sumByAsset(ins),
    });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

// Group COIN_SWAP*, AUTO_EXCHANGE by exact second and optional id shard in extra
function coinSwapGroups(rows: Row[]) {
  const swaps = rows.filter((r) => SWAP_TYPES.has(r.type));
  const map = new Map<string, Row[]>();
  for (const r of swaps) {
    const extraId = (r.extra && r.extra.split("@")[0]) || "";
    const key = `${r.time}|${extraId}`;
    const g = map.get(key) || [];
    g.push(r);
    map.set(key, g);
  }

  const lines = [];
  for (const [, group] of map.entries()) {
    const t = group[0].time;
    const kind = group.some((g) => g.type === "AUTO_EXCHANGE") ? "AUTO_EXCHANGE" : "COIN_SWAP";
    const byAsset = new Map<string, number>();
    for (const g of group) {
      byAsset.set(g.asset, (byAsset.get(g.asset) || 0) + g.amount);
    }
    const negatives: { asset: string; amt: number }[] = [];
    const positives: { asset: string; amt: number }[] = [];
    for (const [asset, amt] of byAsset.entries()) {
      if (amt < 0) negatives.push({ asset, amt });
      if (amt > 0) positives.push({ asset, amt });
    }
    const left = negatives.map((x) => `${fmtSigned(x.amt)} ${x.asset}`).join(", ") || "0";
    const right = positives.map((x) => `${fmtSigned(x.amt)} ${x.asset}`).join(", ") || "0";
    const text = `${t} (UTC+0) → ${left} → ${right} (${kind})`;
    lines.push({ time: t, kind, text, negatives, positives });
  }
  lines.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return lines;
}

function sectionCopy(text: string) {
  if (!navigator.clipboard) return alert("Clipboard API not available in this browser");
  navigator.clipboard.writeText(text).catch(() => alert("Copy failed"));
}
function downloadCsv(filename: string, rows: any[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- UI ----------
export default function App() {
  const [input, setInput] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string>("");
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [showDiag, setShowDiag] = useState<boolean>(false);
  const [diags, setDiags] = useState<ParseDiag[]>([]);
  const pasteRef = useRef<HTMLTextAreaElement | null>(null);

  const nonEvent = useMemo(() => onlyNonEvents(rows), [rows]);
  const events = useMemo(() => onlyEvents(rows), [rows]);

  const realizedNonEvent = useMemo(
    () => nonEvent.filter((r) => r.type === "REALIZED_PNL"),
    [nonEvent]
  );
  const funding = useMemo(() => rows.filter((r) => r.type === "FUNDING_FEE"), [rows]);
  const commission = useMemo(
    () => rows.filter((r) => r.type === "COMMISSION"),
    [rows]
  );
  const insurance = useMemo(
    () => rows.filter((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE"),
    [rows]
  );
  const transfers = useMemo(() => rows.filter((r) => r.type === "TRANSFER"), [rows]);
  const swaps = useMemo(() => coinSwapGroups(rows), [rows]);

  const otherTypes = useMemo(() => {
    const set = new Set([...KNOWN_TYPES]);
    const out = rows.filter((r) => !set.has(r.type) && !r.type.startsWith(EVENT_PREFIX));
    return out;
  }, [rows]);

  const realizedByAsset = useMemo(() => sumByAsset(realizedNonEvent), [realizedNonEvent]);
  const fundingByAsset = useMemo(() => sumByAsset(funding), [funding]);
  const commissionByAsset = useMemo(() => sumByAsset(commission), [commission]);
  const insuranceByAsset = useMemo(() => sumByAsset(insurance), [insurance]);
  const transfersByAsset = useMemo(() => sumByAsset(transfers), [transfers]);

  const symbolBlocks = useMemo(() => bySymbolSummary(nonEvent), [nonEvent]);

  const onParse = () => {
    setError("");
    const { rows: rs, diags } = parseBalanceLog(input || "");
    setDiags(diags);
    if (!rs.length) {
      setRows([]);
      setError("No valid rows detected. Check Diagnostics for reasons.");
      return;
    }
    setRows(rs);
  };

  const onPasteAndParse = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const t = await navigator.clipboard.readText();
        setInput(t);
        setTimeout(onParse, 0);
      } else {
        pasteRef.current?.focus();
        alert("Press Ctrl/⌘+V to paste, then click Parse");
      }
    } catch {
      alert("Clipboard access denied. Paste manually, then click Parse.");
      pasteRef.current?.focus();
    }
  };

  const copyOverall = () => {
    const lines: string[] = [];
    lines.push("FD Summary (UTC+0)");
    lines.push("");

    // Realized PnL per asset (non-event)
    if (Object.keys(realizedByAsset).length) {
      lines.push("Realized PnL (Futures, not Events):");
      for (const [asset, v] of Object.entries(realizedByAsset)) {
        lines.push(`  Total Profit ${asset}: +${fmtAbs(v.pos)}`);
        lines.push(`  Total Loss ${asset}: -${fmtAbs(v.neg)}`);
      }
      lines.push("");
    }

    const pushRPN = (title: string, map: Record<string, { pos: number; neg: number; net: number }>) => {
      if (!Object.keys(map).length) return;
      lines.push(title + ":");
      for (const [asset, v] of Object.entries(map)) {
        lines.push(`  Received ${asset}: +${fmtAbs(v.pos)}`);
        lines.push(`  Paid ${asset}: -${fmtAbs(v.neg)}`);
        lines.push(`  Net ${asset}: ${fmtSigned(v.net)}`);
      }
      lines.push("");
    };
    pushRPN("Trading Fees / Commission", commissionByAsset);
    pushRPN("Funding Fees", fundingByAsset);
    pushRPN("Insurance / Liquidation", insuranceByAsset);
    pushRPN("Transfers (General)", transfersByAsset);

    if (otherTypes.length) {
      const byTypeThenAsset: Record<string, Record<string, { pos: number; neg: number; net: number }>> = {};
      for (const r of otherTypes) {
        byTypeThenAsset[r.type] ??= {};
        const a = (byTypeThenAsset[r.type][r.asset] ??= { pos: 0, neg: 0, net: 0 });
        if (r.amount >= 0) a.pos += r.amount;
        else a.neg += Math.abs(r.amount);
        a.net += r.amount;
      }
      lines.push("Other Types:");
      for (const t of Object.keys(byTypeThenAsset).sort()) {
        lines.push(`  ${t}:`);
        for (const [asset, v] of Object.entries(byTypeThenAsset[t])) {
          lines.push(`    Received ${asset}: +${fmtAbs(v.pos)}`);
          lines.push(`    Paid ${asset}: -${fmtAbs(v.neg)}`);
          lines.push(`    Net ${asset}: ${fmtSigned(v.net)}`);
        }
      }
    }

    sectionCopy(lines.join("\n"));
  };

  const copySwaps = () => {
    if (!swaps.length) return sectionCopy("Coin Swaps & Auto-Exchange: none");
    const lines = ["Coin Swaps & Auto-Exchange (UTC+0)", ""];
    for (const s of swaps) lines.push(`- ${s.text}`);
    sectionCopy(lines.join("\n"));
  };

  const copyRaw = () => {
    if (!rows.length) return;
    const headers = ["time", "type", "asset", "amount", "symbol", "id", "uid", "extra"];
    const tsv = [headers.join("\t"), ...rows.map((r) =>
      [r.time, r.type, r.asset, r.amount, r.symbol, r.id, r.uid, r.extra].join("\t")
    )].join("\n");
    sectionCopy(tsv);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Balance Log Analyzer</h1>
            <p className="text-sm text-gray-600">
              UTC+0 • Paste your full Balance Log and click Parse. The main Copy excludes coin swaps/auto-exchange.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-lg bg-black text-white" onClick={onPasteAndParse}>Paste &amp; Parse</button>
            <button className="px-3 py-2 rounded-lg bg-gray-900 text-white" onClick={onParse}>Parse</button>
            <button className="px-3 py-2 rounded-lg border" onClick={() => { setInput(""); setRows([]); setError(""); setDiags([]); }}>Clear</button>
            <button className="px-3 py-2 rounded-lg border" onClick={() => setShowDiag((s) => !s)}>{showDiag ? "Hide Diagnostics" : "Show Diagnostics"}</button>
          </div>
        </header>

        {/* Paste Area */}
        <section className="space-y-2">
          <label className="text-sm font-semibold">Paste Balance Log Here</label>
          <textarea
            ref={pasteRef}
            placeholder="Paste the entire Balance Log page (Ctrl/⌘+A then Ctrl/⌘+C)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full h-40 p-3 border rounded-lg font-mono text-sm"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </section>

        {/* Diagnostics */}
        {showDiag && (
          <section className="rounded-xl border p-4">
            <h3 className="font-semibold mb-2">Diagnostics</h3>
            <p className="text-xs text-gray-600 mb-2">
              If lines failed to parse, reasons will show here (kept private, not included in copies).
            </p>
            {diags.length ? (
              <div className="max-h-64 overflow-auto text-xs font-mono space-y-1">
                {diags.slice(0, 200).map((d, i) => (
                  <div key={i} className="border-b pb-1">
                    <div className="text-red-700">• {d.reason}</div>
                    <div className="text-gray-700 truncate">{d.line}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600">No diagnostics yet.</p>
            )}
          </section>
        )}

        {/* Summary & Actions */}
        {!!rows.length && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Summary</h2>
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white" onClick={copyOverall}>
                  Copy Summary (no Swaps)
                </button>
              </div>
            </div>

            {/* Realized PnL */}
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold mb-2">Realized PnL (Futures, not Events)</h3>
              {Object.keys(realizedByAsset).length ? (
                <ul className="grid sm:grid-cols-2 gap-2 text-sm">
                  {Object.entries(realizedByAsset).map(([asset, v]) => (
                    <li key={asset} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className="font-medium">{asset}</span>
                      <span className="tabular-nums">
                        Total Profit: +{fmtAbs(v.pos)} • Total Loss: -{fmtAbs(v.neg)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600">No Realized PnL found.</p>
              )}
            </div>

            {/* Fees */}
            <div className="grid md:grid-cols-2 gap-4">
              <RpnCard title="Trading Fees / Commission" map={commissionByAsset} />
              <RpnCard title="Funding Fees" map={fundingByAsset} />
              <RpnCard title="Insurance / Liquidation" map={insuranceByAsset} />
              <RpnCard title="Transfers (General)" map={transfersByAsset} />
            </div>

            {/* Other Types */}
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold mb-2">Other Types</h3>
              {otherTypes.length ? (
                <OtherTypesBlock rows={otherTypes} />
              ) : (
                <p className="text-sm text-gray-600">None</p>
              )}
            </div>

            {/* Coin Swaps & Auto-Exchange */}
            <div className="rounded-xl border p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Coin Swaps &amp; Auto-Exchange (separate copy)</h3>
                <button className="px-3 py-2 rounded-lg border" onClick={copySwaps}>Copy Coin Swaps</button>
              </div>
              {swaps.length ? (
                <ul className="list-disc pl-5 text-sm">
                  {swaps.map((s, i) => (
                    <li key={i} className="tabular-nums">{s.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600">None</p>
              )}
            </div>

            {/* By Symbol */}
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold mb-2">By Symbol (Futures, not Events)</h3>
              {symbolBlocks.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-4">Symbol</th>
                        <th className="py-2 pr-4">Realized PnL</th>
                        <th className="py-2 pr-4">Funding</th>
                        <th className="py-2 pr-4">Trading Fees</th>
                        <th className="py-2 pr-4">Insurance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {symbolBlocks.map((b: any) => (
                        <tr key={b.symbol} className="border-b last:border-b-0">
                          <td className="py-2 pr-4 font-medium">{b.symbol}</td>
                          <td className="py-2 pr-4 tabular-nums">{fmtAssetPairs(b.realizedByAsset)}</td>
                          <td className="py-2 pr-4 tabular-nums">{fmtAssetPairs(b.fundingByAsset)}</td>
                          <td className="py-2 pr-4 tabular-nums">{fmtAssetPairs(b.commByAsset)}</td>
                          <td className="py-2 pr-4 tabular-nums">{fmtAssetPairs(b.insByAsset)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-600">No symbol activity.</p>
              )}
            </div>

            {/* Events */}
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold mb-2">Event Contracts (Separate Product)</h3>
              <EventSummary rows={events} />
            </div>
          </section>
        )}

        {/* Raw Parsed Table (hidden by default) */}
        {!!rows.length && (
          <section className="rounded-xl border">
            <button
              className="w-full text-left px-4 py-3 font-semibold border-b bg-gray-50"
              onClick={() => setShowRaw((s) => !s)}
            >
              {showRaw ? "▾ Hide Raw Parsed Table (Excel-like)" : "▸ Show Raw Parsed Table (Excel-like)"}
            </button>
            {showRaw && (
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <button className="px-3 py-2 rounded-lg border" onClick={copyRaw}>Copy Table (TSV)</button>
                  <button className="px-3 py-2 rounded-lg border" onClick={() => downloadCsv("balance_log.csv", rows as any[])}>
                    Download CSV
                  </button>
                </div>
                <div className="overflow-auto border rounded-lg">
                  <table className="min-w-[900px] w-full text-xs font-mono">
                    <thead className="bg-gray-50">
                      <tr className="text-left border-b">
                        {["time","type","asset","amount","symbol","id","uid","extra"].map((h) => (
                          <th key={h} className="py-2 px-2">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="py-1 px-2 whitespace-nowrap">{r.time}</td>
                          <td className="py-1 px-2 whitespace-nowrap">{r.type}</td>
                          <td className="py-1 px-2 whitespace-nowrap">{r.asset}</td>
                          <td className="py-1 px-2 whitespace-nowrap tabular-nums">{fmtSigned(r.amount)}</td>
                          <td className="py-1 px-2 whitespace-nowrap">{r.symbol}</td>
                          <td className="py-1 px-2 whitespace-nowrap">{r.id}</td>
                          <td className="py-1 px-2 whitespace-nowrap">{r.uid}</td>
                          <td className="py-1 px-2">{r.extra}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ---------- Small UI helpers ----------
function RpnCard({ title, map }: { title: string; map: Record<string, { pos: number; neg: number; net: number }> }) {
  return (
    <div className="rounded-xl border p-4">
      <h3 className="font-semibold mb-2">{title}</h3>
      {Object.keys(map).length ? (
        <ul className="space-y-1 text-sm">
          {Object.entries(map).map(([asset, v]) => (
            <li key={asset} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <span className="font-medium">{asset}</span>
              <span className="tabular-nums">
                Received: +{fmtAbs(v.pos)} • Paid: -{fmtAbs(v.neg)} • Net: {fmtSigned(v.net)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">None</p>
      )}
    </div>
  );
}

function fmtAssetPairs(map: Record<string, { pos: number; neg: number }>) {
  const parts: string[] = [];
  for (const [asset, v] of Object.entries(map)) {
    parts.push(`+${fmtAbs(v.pos)} / -${fmtAbs(v.neg)} ${asset}`);
  }
  return parts.length ? parts.join(", ") : "–";
}

function EventSummary({ rows }: { rows: Row[] }) {
  const orders = rows.filter((r) => r.type === "EVENT_CONTRACTS_ORDER");
  const payouts = rows.filter((r) => r.type === "EVENT_CONTRACTS_PAYOUT");
  const byOrder = sumByAsset(orders);
  const byPayout = sumByAsset(payouts);
  const assets = Array.from(new Set([...Object.keys(byOrder), ...Object.keys(byPayout)])).sort();

  if (!assets.length) return <p className="text-sm text-gray-600">None</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Asset</th>
            <th className="py-2 pr-4">Payout (Received)</th>
            <th className="py-2 pr-4">Orders (Paid)</th>
            <th className="py-2 pr-4">Net</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const p = byPayout[asset] || { pos: 0, neg: 0, net: 0 };
            const o = byOrder[asset] || { pos: 0, neg: 0, net: 0 };
            const net = (p.net || 0) + (o.net || 0);
            return (
              <tr key={asset} className="border-b last:border-b-0">
                <td className="py-2 pr-4 font-medium">{asset}</td>
                <td className="py-2 pr-4 tabular-nums">+{fmtAbs(p.pos)}</td>
                <td className="py-2 pr-4 tabular-nums">-{fmtAbs(o.neg)}</td>
                <td className="py-2 pr-4 tabular-nums">{fmtSigned(net)}</td>
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
  for (const r of rows) {
    const g = byType.get(r.type) || [];
    g.push(r);
    byType.set(r.type, g);
  }
  const keys = Array.from(byType.keys()).sort();

  return (
    <div className="space-y-3">
      {keys.map((t) => {
        const byAsset = sumByAsset(byType.get(t) || []);
        return (
          <div key={t} className="rounded-lg border p-3">
            <div className="font-semibold mb-1 text-sm">{t}</div>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm">
              {Object.entries(byAsset).map(([asset, v]) => (
                <li key={asset} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <span className="font-medium">{asset}</span>
                  <span className="tabular-nums">
                    Received: +{fmtAbs(v.pos)} • Paid: -{fmtAbs(v.neg)} • Net: {fmtSigned(v.net)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
