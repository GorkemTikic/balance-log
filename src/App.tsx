import React, { useMemo, useRef, useState } from "react";

/**
 * Balance Log Analyzer (UTC+0)
 * - Clear, copy-friendly summary.
 * - Overall Copy EXCLUDES Coin Swaps & Auto-Exchange (they have their own Copy).
 * - Transfers are in General (incoming +, outgoing −). Coin Swaps & Events are separate.
 * - Realized PnL shows "Total Profit <ASSET>" and "Total Loss <ASSET>".
 * - Funding vs Trading Fees (Commission) vs Insurance/Liquidation separated.
 * - Coin swap line: "YYYY-MM-DD hh:mm:ss (UTC+0) → -A ASSET → +B ASSET (COIN_SWAP|AUTO_EXCHANGE)".
 * - Raw table hidden behind a toggle; TSV copy & CSV download provided.
 */

// ---------- Utilities ----------
const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/;
const SYMBOL_RE = /^[A-Z0-9]+(?:USDT|USDC|USD|BTC|ETH|BNB|PERP)$/;

function fmtAbs(x: number | string, maxDp = 8) {
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
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const body = rows.map((r) => headers.map((h) => escape((r as any)[h])).join(","));
  return [headers.join(","), ...body].join("\n");
}

// ---------- Parsing ----------
const SWAP_TYPES = new Set(["COIN_SWAP_DEPOSIT", "COIN_SWAP_WITHDRAW", "AUTO_EXCHANGE"]);
const EVENT_PREFIX = "EVENT_CONTRACTS_";
const KNOWN_TYPES = new Set([
  "REALIZED_PNL",
  "FUNDING_FEE",
  "COMMISSION",
  "INSURANCE_CLEAR",
  "LIQUIDATION_FEE",
  "TRANSFER",
  ...SWAP_TYPES,
]);

function splitColumns(line: string) {
  if (line.includes("\t")) return line.split(/\t+/);
  return line.trim().split(/\s{2,}|\s\|\s|\s{1,}/);
}

function firstDateIn(line: string) {
  const m = line.match(DATE_RE);
  return m ? m[1] : "";
}

type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string;   // keep as UTC+0 text
  symbol: string; // may be ""
  extra: string;  // remaining cols joined
  raw: string;
};

function parseBalanceLog(text: string): Row[] {
  const rows: Row[] = [];
  const lines = text
    .replace(/[\u00A0\u2000-\u200B]/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const when = firstDateIn(line);
    if (!when) continue;

    const cols = splitColumns(line);
    if (cols.length < 6) continue;

    const id = cols[0];
    const uid = cols[1];
    const asset = cols[2];
    const type = cols[3];
    const amountRaw = cols[4];
    const symbolCandidate = cols[6] || "";

    const amount = Number(amountRaw);
    if (Number.isNaN(amount)) continue;

    let symbol = "";
    if (symbolCandidate && SYMBOL_RE.test(symbolCandidate)) symbol = symbolCandidate;

    const extra = cols.slice(7).join(" ").trim();

    rows.push({ id, uid, asset, type, amount, time: when, symbol, extra, raw: line });
  }
  return rows;
}

// ---------- Aggregation ----------
type Totals = { pos: number; neg: number; net: number };

function sumByAsset(rows: Row[]) {
  const acc: Record<string, Totals> = {};
  for (const r of rows) {
    const a = (acc[r.asset] = acc[r.asset] || { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount;
    else a.neg += Math.abs(r.amount);
    a.net += r.amount;
  }
  return acc;
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
  const out: {
    symbol: string;
    realizedByAsset: Record<string, Totals>;
    fundingByAsset: Record<string, Totals>;
    commByAsset: Record<string, Totals>;
    insByAsset: Record<string, Totals>;
  }[] = [];

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

function onlyEvents(rows: Row[]) {
  return rows.filter((r) => r.type.startsWith(EVENT_PREFIX));
}
function onlyNonEvents(rows: Row[]) {
  return rows.filter((r) => !r.type.startsWith(EVENT_PREFIX));
}

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

  const lines: { time: string; kind: string; text: string }[] = [];
  for (const [, group] of map.entries()) {
    const t = group[0].time;
    const kind = group.some((g) => g.type === "AUTO_EXCHANGE") ? "AUTO_EXCHANGE" : "COIN_SWAP";

    const byAsset = new Map<string, number>();
    for (const g of group) {
      byAsset.set(g.asset, (byAsset.get(g.asset) || 0) + g.amount);
    }
    const negatives: string[] = [];
    const positives: string[] = [];
    for (const [asset, amt] of byAsset.entries()) {
      if (amt < 0) negatives.push(`${fmtSigned(amt)} ${asset}`);
      if (amt > 0) positives.push(`${fmtSigned(amt)} ${asset}`);
    }
    const left = negatives.join(", ") || "0";
    const right = positives.join(", ") || "0";
    const text = `${t} (UTC+0) → ${left} → ${right} (${kind})`;
    lines.push({ time: t, kind, text });
  }
  lines.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return lines;
}

function sectionCopy(text: string) {
  if (!navigator.clipboard) return alert("Clipboard API not available");
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
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState("");
  const pasteRef = useRef<HTMLTextAreaElement | null>(null);

  const parsed = useMemo(() => rows, [rows]);
  const nonEvent = useMemo(() => onlyNonEvents(parsed), [parsed]);
  const events = useMemo(() => onlyEvents(parsed), [parsed]);

  const realizedNonEvent = useMemo(() => nonEvent.filter((r) => r.type === "REALIZED_PNL"), [nonEvent]);
  const funding = useMemo(() => parsed.filter((r) => r.type === "FUNDING_FEE"), [parsed]);
  const commission = useMemo(() => parsed.filter((r) => r.type === "COMMISSION"), [parsed]);
  const insurance = useMemo(
    () => parsed.filter((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE"),
    [parsed]
  );
  const transfers = useMemo(() => parsed.filter((r) => r.type === "TRANSFER"), [parsed]);
  const swaps = useMemo(() => coinSwapGroups(parsed), [parsed]);

  const otherTypes = useMemo(() => {
    const set = new Set([...KNOWN_TYPES]);
    return parsed.filter((r) => !set.has(r.type) && !r.type.startsWith(EVENT_PREFIX));
  }, [parsed]);

  const realizedByAsset = useMemo(() => sumByAsset(realizedNonEvent), [realizedNonEvent]);
  const fundingByAsset = useMemo(() => sumByAsset(funding), [funding]);
  const commissionByAsset = useMemo(() => sumByAsset(commission), [commission]);
  const insuranceByAsset = useMemo(() => sumByAsset(insurance), [insurance]);
  const transfersByAsset = useMemo(() => sumByAsset(transfers), [transfers]);

  const symbolBlocks = useMemo(() => bySymbolSummary(nonEvent), [nonEvent]);

  const onParse = () => {
    setError("");
    try {
      const rs = parseBalanceLog(input);
      if (!rs.length) throw new Error("No valid rows detected. Paste the Balance Log with dates.");
      setRows(rs);
    } catch (e: any) {
      setError(e.message || String(e));
      setRows([]);
    }
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
    lines.push("FD Summary (UTC+0)", "");

    if (Object.keys(realizedByAsset).length) {
      lines.push("Realized PnL (Futures, not Events):");
      for (const [asset, v] of Object.entries(realizedByAsset)) {
        lines.push(`  Total Profit ${asset}: +${fmtAbs(v.pos)}`);
        lines.push(`  Total Loss ${asset}: -${fmtAbs(v.neg)}`);
      }
      lines.push("");
    }
    const pushRPN = (title: string, map: Record<string, Totals>) => {
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
      const byTypeThenAsset: Record<string, Record<string, Totals>> = {};
      for (const r of otherTypes) {
        byTypeThenAsset[r.type] ??= {};
        const a = (byTypeThenAsset[r.type][r.asset] ??= { pos: 0, neg: 0, net: 0 });
        if (r.amount >= 0) a.pos += r.amount; else a.neg += Math.abs(r.amount);
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
    const lines: string[] = [];
    const headers = ["time", "type", "asset", "amount", "symbol", "id", "uid", "extra"];
    lines.push(headers.join("\t"));
    for (const r of rows) lines.push([r.time, r.type, r.asset, r.amount, r.symbol, r.id, r.uid, r.extra].join("\t"));
    sectionCopy(lines.join("\n"));
  };

  return (
    <div className="container">
      <h1>Balance Log Analyzer</h1>
      <p className="muted">UTC+0 • Paste your full Balance Log and click Parse. “Copy Summary” excludes Coin Swaps/Auto-Exchange.</p>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onPasteAndParse}>Paste & Parse</button>
        <button className="btn" onClick={onParse}>Parse</button>
        <button className="btn secondary" onClick={() => { setInput(""); setRows([]); setError(""); }}>Clear</button>
      </div>

      <div className="card">
        <div className="muted" style={{ marginBottom: 6 }}>Paste Balance Log Here</div>
        <textarea
          ref={pasteRef}
          rows={8}
          placeholder="Paste the entire Balance Log page (Ctrl/⌘+A then Ctrl/⌘+C)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {error && <div style={{ color: "crimson", marginTop: 6 }}>{error}</div>}
      </div>

      {!!rows.length && (
        <>
          <div className="card">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <h2 style={{ margin:0 }}>Summary</h2>
              <button className="btn secondary" onClick={copyOverall}>Copy Summary (no Swaps)</button>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop:0 }}>Realized PnL (Futures, not Events)</h3>
              {Object.keys(realizedByAsset).length ? (
                <ul>
                  {Object.entries(realizedByAsset).map(([asset, v]) => (
                    <li key={asset} className="nums">
                      <strong>{asset}</strong> — Total Profit: +{fmtAbs(v.pos)} • Total Loss: -{fmtAbs(v.neg)}
                    </li>
                  ))}
                </ul>
              ) : <div className="muted">No Realized PnL found.</div>}
            </div>

            <div className="grid two">
              <RpnCard title="Trading Fees / Commission" map={commissionByAsset} />
              <RpnCard title="Funding Fees" map={fundingByAsset} />
              <RpnCard title="Insurance / Liquidation" map={insuranceByAsset} />
              <RpnCard title="Transfers (General)" map={transfersByAsset} />
            </div>

            <div className="card">
              <h3 style={{ marginTop:0 }}>Other Types</h3>
              {otherTypes.length ? <OtherTypesBlock rows={otherTypes} /> : <div className="muted">None</div>}
            </div>

            <div className="card">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <h3 style={{ marginTop:0 }}>Coin Swaps & Auto-Exchange (separate copy)</h3>
                <button className="btn secondary" onClick={copySwaps}>Copy Coin Swaps</button>
              </div>
              {swaps.length ? (
                <ul>
                  {swaps.map((s, i) => <li key={i} className="nums">{s.text}</li>)}
                </ul>
              ) : <div className="muted">None</div>}
            </div>

            <div className="card">
              <h3 style={{ marginTop:0 }}>By Symbol (Futures, not Events)</h3>
              {symbolBlocks.length ? (
                <div style={{ overflowX:"auto" }}>
                  <table>
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
                          <td><strong>{b.symbol}</strong></td>
                          <td className="nums">{fmtAssetPairs(b.realizedByAsset)}</td>
                          <td className="nums">{fmtAssetPairs(b.fundingByAsset)}</td>
                          <td className="nums">{fmtAssetPairs(b.commByAsset)}</td>
                          <td className="nums">{fmtAssetPairs(b.insByAsset)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="muted">No symbol activity.</div>}
            </div>

            <div className="card">
              <h3 style={{ marginTop:0 }}>Event Contracts (Separate Product)</h3>
              <EventSummary rows={events} />
            </div>
          </div>

          <div className="card">
            <details open={false}>
              <summary>Show Raw Parsed Table (Excel-like)</summary>
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn secondary" onClick={() => copyRaw()}>Copy Table (TSV)</button>
                <button className="btn secondary" onClick={() => downloadCsv("balance_log.csv", rows as any)}>Download CSV</button>
              </div>
              <div style={{ overflowX:"auto", marginTop: 8 }}>
                <table>
                  <thead>
                    <tr>
                      {["time","type","asset","amount","symbol","id","uid","extra"].map((h) => (
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
                        <td className="nums">{fmtSigned(r.amount)}</td>
                        <td>{r.symbol}</td>
                        <td>{r.id}</td>
                        <td>{r.uid}</td>
                        <td>{r.extra}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Small UI helpers
function RpnCard({ title, map }: { title: string; map: Record<string, Totals> }) {
  const has = Object.keys(map).length > 0;
  return (
    <div className="card">
      <h3 style={{ marginTop:0 }}>{title}</h3>
      {has ? (
        <ul>
          {Object.entries(map).map(([asset, v]) => (
            <li key={asset} className="nums">
              <strong>{asset}</strong> — Received: +{fmtAbs(v.pos)} • Paid: -{fmtAbs(v.neg)} • Net: {fmtSigned(v.net)}
            </li>
          ))}
        </ul>
      ) : <div className="muted">None</div>}
    </div>
  );
}
function fmtAssetPairs(map: Record<string, Totals>) {
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
  if (!assets.length) return <div className="muted">None</div>;
  return (
    <div style={{ overflowX:"auto" }}>
      <table>
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
                <td><strong>{asset}</strong></td>
                <td className="nums">+{fmtAbs(p.pos)}</td>
                <td className="nums">-{fmtAbs(o.neg)}</td>
                <td className="nums">{fmtSigned(net)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
