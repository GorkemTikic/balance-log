import React, { useMemo, useRef, useState } from "react";

/**
 * Balance Log Analyzer (UTC+0)
 * - Paste from Binance “Balance Log” page or Excel; supports HTML tables & TSV/CSV/plain.
 * - Cards & tabs for Summary / Coin Swaps / Event Contracts / Raw Log.
 * - Copy Summary (excludes swaps), Copy Coin Swaps, and Copy Response (Full).
 *
 * IMPORTANT: This file is self-contained. Drop it into src/App.tsx.
 */

/* ----------------------------- Utilities ----------------------------- */

const EPS = 1e-12; // treat tiny floats as 0

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
  const esc = (v: any) => {
    const s = String(v ?? "");
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(","));
  return [headers.join(","), ...body].join("\n");
}
function sectionCopy(text: string) {
  if (!navigator.clipboard) {
    alert("Clipboard API not available in this browser");
    return;
  }
  navigator.clipboard.writeText(text).catch(() => alert("Copy failed"));
}

/* ----------------------------- Parsing ------------------------------ */

const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/; // UTC+0
const SYMBOL_RE = /^[A-Z0-9]+(?:USDT|USDC|USD|BTC|ETH|BNB|PERP|BUSD|FDUSD|BNFCR)$/;

const SWAP_TYPES = new Set([
  "COIN_SWAP_DEPOSIT",
  "COIN_SWAP_WITHDRAW",
  "AUTO_EXCHANGE",
]);
const EVENT_PREFIX = "EVENT_CONTRACTS_";
const KNOWN_TYPES = new Set([
  "REALIZED_PNL",
  "FUNDING_FEE",
  "COMMISSION",
  "REFERRAL_KICKBACK",
  "INSURANCE_CLEAR",
  "LIQUIDATION_FEE",
  "TRANSFER",
  ...SWAP_TYPES,
]);

type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string; // UTC+0
  symbol: string;
  extra: string;
  raw: string;
};

// parse HTML table from clipboard (Excel / Binance page copy)
function parseHtmlTable(html: string): Row[] {
  const rows: Row[] = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const trs = Array.from(doc.querySelectorAll("table tr"));
  for (const tr of trs) {
    const cells = Array.from(tr.querySelectorAll("th,td")).map((td) =>
      td.textContent?.trim() ?? ""
    );
    // Expect at least: id, uid, asset, type, delta, time, symbol...
    if (cells.length < 6) continue;
    const [id, uid, asset, type, delta, time] = cells;
    const symbol = cells[6] || "";
    const extra = cells.slice(7).join(" ").trim();
    const when = time || (cells.find((c) => DATE_RE.test(c)) ?? "");
    const amt = Number(delta);
    if (!when || Number.isNaN(amt)) continue;

    let sym = "";
    if (symbol && SYMBOL_RE.test(symbol)) sym = symbol;

    rows.push({
      id,
      uid,
      asset,
      type: type || "",
      amount: amt,
      time: when,
      symbol: sym,
      extra,
      raw: cells.join("\t"),
    });
  }
  return rows;
}

function splitColumns(line: string) {
  if (line.includes("\t")) return line.split(/\t+/);
  return line.trim().split(/\s{2,}|,|;|\s{1,}/);
}
function firstDateIn(line: string) {
  const m = line.match(DATE_RE);
  return m ? m[1] : "";
}
function parsePlain(text: string): Row[] {
  const out: Row[] = [];
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
    const symbolCand = cols[6] || "";

    const amt = Number(amountRaw);
    if (Number.isNaN(amt)) continue;

    let sym = "";
    if (symbolCand && SYMBOL_RE.test(symbolCand)) sym = symbolCand;

    const extra = cols.slice(7).join(" ").trim();
    out.push({
      id,
      uid,
      asset,
      type,
      amount: amt,
      time: when,
      symbol: sym,
      extra,
      raw: line,
    });
  }
  return out;
}

function parseBalanceLog(input: { html?: string; plain?: string }): Row[] {
  const rows: Row[] = [];
  if (input.html && /<table/i.test(input.html)) {
    rows.push(...parseHtmlTable(input.html));
  }
  if (rows.length === 0 && input.plain) {
    rows.push(...parsePlain(input.plain));
  }
  return rows;
}

/* --------------------------- Aggregation ---------------------------- */

type PosNeg = { pos: number; neg: number; net: number };
function sumByAsset(rows: Row[]) {
  const acc: Record<string, PosNeg> = {};
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

function coinSwapGroups(rows: Row[]) {
  const swaps = rows.filter(
    (r) =>
      r.type === "COIN_SWAP_DEPOSIT" ||
      r.type === "COIN_SWAP_WITHDRAW" ||
      r.type === "AUTO_EXCHANGE"
  );
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
    const kind = group.some((g) => g.type === "AUTO_EXCHANGE")
      ? "AUTO_EXCHANGE"
      : "COIN_SWAP";
    const byAsset = new Map<string, number>();
    for (const g of group) {
      byAsset.set(g.asset, (byAsset.get(g.asset) || 0) + g.amount);
    }
    const negatives: string[] = [];
    const positives: string[] = [];
    for (const [asset, amt] of byAsset.entries()) {
      if (amt < -EPS) negatives.push(`${fmtSigned(amt)} ${asset}`);
      if (amt > EPS) positives.push(`${fmtSigned(amt)} ${asset}`);
    }
    const text = `${t} (UTC+0) – Out: ${negatives.join(", ") || "0"} → In: ${
      positives.join(", ") || "0"
    } (${kind})`;
    lines.push(text);
  }
  lines.sort();
  return lines;
}

/* ---------------------------- React UI ------------------------------ */

export default function App() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"summary" | "swaps" | "events" | "raw">("summary");
  const [showDiag, setShowDiag] = useState(false);
  const pasteRef = useRef<HTMLTextAreaElement | null>(null);

  const parsed = useMemo(() => rows, [rows]);
  const nonEvent = useMemo(() => onlyNonEvents(parsed), [parsed]);
  const events = useMemo(() => onlyEvents(parsed), [parsed]);

  const realizedNonEvent = useMemo(
    () => nonEvent.filter((r) => r.type === "REALIZED_PNL"),
    [nonEvent]
  );
  const commission = useMemo(
    () => parsed.filter((r) => r.type === "COMMISSION"),
    [parsed]
  );
  const refKickback = useMemo(
    () => parsed.filter((r) => r.type === "REFERRAL_KICKBACK"),
    [parsed]
  );
  const funding = useMemo(
    () => parsed.filter((r) => r.type === "FUNDING_FEE"),
    [parsed]
  );
  const insurance = useMemo(
    () => parsed.filter((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE"),
    [parsed]
  );
  const transfers = useMemo(
    () => parsed.filter((r) => r.type === "TRANSFER"),
    [parsed]
  );

  const swaps = useMemo(() => coinSwapGroups(parsed), [parsed]);

  const realizedByAsset = useMemo(() => sumByAsset(realizedNonEvent), [realizedNonEvent]);
  const commissionByAsset = useMemo(() => sumByAsset(commission), [commission]);
  const refKickbackByAsset = useMemo(() => sumByAsset(refKickback), [refKickback]);
  const fundingByAsset = useMemo(() => sumByAsset(funding), [funding]);
  const insuranceByAsset = useMemo(() => sumByAsset(insurance), [insurance]);
  const transfersByAsset = useMemo(() => sumByAsset(transfers), [transfers]);

  function onParse() {
    setError("");
    try {
      const rs = parseBalanceLog({ html: input, plain: input });
      if (!rs.length) throw new Error("No valid rows detected. Paste the Balance Log page or Excel selection.");
      setRows(rs);
    } catch (e: any) {
      setError(e?.message || String(e));
      setRows([]);
    }
  }

  async function onPasteAndParse() {
    try {
      const html = await navigator.clipboard.readText().then((t) => t); // some browsers give plain text only
      // try richer clipboard
      let htmlData = "";
      if ("clipboard" in navigator && (navigator as any).clipboard.read) {
        try {
          const items = await (navigator as any).clipboard.read();
          for (const item of items) {
            if (item.types.includes("text/html")) {
              const blob = await item.getType("text/html");
              htmlData = await blob.text();
              break;
            }
          }
        } catch {}
      }
      const all = parseBalanceLog({ html: htmlData || html, plain: html });
      if (!all.length) throw new Error("No valid rows detected from clipboard.");
      setInput(htmlData || html);
      setRows(all);
    } catch {
      pasteRef.current?.focus();
      alert("Clipboard access denied. Paste manually, then click Parse.");
    }
  }

  function clearAll() {
    setInput("");
    setRows([]);
    setError("");
    setActiveTab("summary");
  }

  /* ---------------- Copy buttons ---------------- */

  function copySummaryNoSwaps() {
    const lines: string[] = [];
    lines.push("FD Summary (UTC+0)");
    lines.push("");

    const pushPnL = (map: Record<string, PosNeg>) => {
      if (!Object.keys(map).length) return;
      lines.push("Realized PnL (Futures, not Events):");
      for (const [asset, v] of Object.entries(map)) {
        if (v.pos > EPS) lines.push(`  Total Profit ${asset}: +${fmtAbs(v.pos)}`);
        if (v.neg > EPS) lines.push(`  Total Loss ${asset}: -${fmtAbs(v.neg)}`);
      }
      lines.push("");
    };

    const pushRPN = (title: string, map: Record<string, PosNeg>) => {
      if (!Object.keys(map).length) return;
      lines.push(`${title}:`);
      for (const [asset, v] of Object.entries(map)) {
        if (v.pos > EPS) lines.push(`  Received ${asset}: +${fmtAbs(v.pos)}`);
        if (v.neg > EPS) lines.push(`  Paid ${asset}: -${fmtAbs(v.neg)}`);
        if (Math.abs(v.net) > EPS) lines.push(`  Net ${asset}: ${fmtSigned(v.net)}`);
      }
      lines.push("");
    };

    pushPnL(realizedByAsset);
    pushRPN("Trading Fees / Commission", commissionByAsset);
    pushRPN("Referral Kickback", refKickbackByAsset);
    pushRPN("Funding Fees", fundingByAsset);
    pushRPN("Insurance / Liquidation", insuranceByAsset);
    pushRPN("Transfers (General)", transfersByAsset);

    sectionCopy(lines.join("\n").replace(/\n{3,}/g, "\n\n"));
  }

  function copyCoinSwaps() {
    const lines = ["Coin Swaps & Auto-Exchange (UTC+0)", ""];
    if (!swaps.length) lines.push("None");
    else lines.push(...swaps.map((t) => `- ${t}`));
    sectionCopy(lines.join("\n"));
  }

  // NEW: full per-asset response (includes swaps + events) and hides any 0 lines
  function copyFullResponse() {
    if (!rows.length) return sectionCopy("No data.");

    const isEventOrder = (r: Row) => r.type === "EVENT_CONTRACTS_ORDER";
    const isEventPayout = (r: Row) => r.type === "EVENT_CONTRACTS_PAYOUT";
    const isRealized = (r: Row) => r.type === "REALIZED_PNL" && !r.type.startsWith(EVENT_PREFIX);
    const isCommission = (r: Row) => r.type === "COMMISSION";
    const isRefKick = (r: Row) => r.type === "REFERRAL_KICKBACK";
    const isFunding = (r: Row) => r.type === "FUNDING_FEE";
    const isInsurance = (r: Row) =>
      r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE";
    const isSwap = (r: Row) =>
      SWAP_TYPES.has(r.type);

    const coll = (pred: (r: Row) => boolean) => sumByAsset(rows.filter(pred));
    const realized = coll(isRealized);
    const commission = coll(isCommission);
    const refKick = coll(isRefKick);
    const funding = coll(isFunding);
    const insurance = coll(isInsurance);
    const swapsAgg = coll(isSwap);
    const evOrders = coll(isEventOrder);
    const evPayouts = coll(isEventPayout);

    const finalTotals: Record<string, number> = {};
    const bump = (asset: string, v: number) => (finalTotals[asset] = (finalTotals[asset] ?? 0) + v);

    for (const [a, v] of Object.entries(realized)) bump(a, v.net);
    for (const [a, v] of Object.entries(commission)) bump(a, v.net);
    for (const [a, v] of Object.entries(refKick)) bump(a, v.net);
    for (const [a, v] of Object.entries(funding)) bump(a, v.net);
    for (const [a, v] of Object.entries(insurance)) bump(a, v.net);
    for (const [a, v] of Object.entries(swapsAgg)) bump(a, v.net);
    for (const [a, v] of Object.entries(evOrders)) bump(a, v.net);
    for (const [a, v] of Object.entries(evPayouts)) bump(a, v.net);

    const assets = new Set<string>([
      ...Object.keys(realized),
      ...Object.keys(commission),
      ...Object.keys(refKick),
      ...Object.keys(funding),
      ...Object.keys(insurance),
      ...Object.keys(swapsAgg),
      ...Object.keys(evOrders),
      ...Object.keys(evPayouts),
    ]);

    const out: string[] = [];
    out.push("Summary of your balance log (UTC+0):");
    out.push("");

    const pushIf = (cond: boolean, line: string) => { if (cond) out.push(line); };

    for (const asset of Array.from(assets).sort()) {
      const r  = realized[asset];
      const c  = commission[asset];
      const rk = refKick[asset];
      const f  = funding[asset];
      const ins= insurance[asset];
      const sw = swapsAgg[asset];
      const eo = evOrders[asset];
      const ep = evPayouts[asset];

      out.push(`Asset: ${asset}`);

      if (r) {
        pushIf(r.pos > EPS, `  Profit in ${asset}: +${fmtAbs(r.pos)}`);
        pushIf(r.neg > EPS, `  Loss in ${asset}: -${fmtAbs(r.neg)}`);
      }
      if (c) {
        pushIf(c.neg > EPS, `  Trading Fee in ${asset}: -${fmtAbs(c.neg)}`);
        pushIf(c.pos > EPS, `  Trading Fee refunds in ${asset}: +${fmtAbs(c.pos)}`);
      }
      if (rk) {
        pushIf(rk.pos > EPS, `  Fee Rebate in ${asset}: +${fmtAbs(rk.pos)}`);
        pushIf(rk.neg > EPS, `  Fee Rebate adjustments in ${asset}: -${fmtAbs(rk.neg)}`);
      }
      if (f) {
        pushIf(f.pos > EPS, `  Funding Fee Received in ${asset}: +${fmtAbs(f.pos)}`);
        pushIf(f.neg > EPS, `  Funding Fee Paid in ${asset}: -${fmtAbs(f.neg)}`);
      }
      if (ins) {
        pushIf(ins.pos > EPS, `  Liquidation Clerarance Fee Received in ${asset}: +${fmtAbs(ins.pos)}`);
        pushIf(ins.neg > EPS, `  Liquidation Clerarance Fee Paid in ${asset}: -${fmtAbs(ins.neg)}`);
      }
      if (sw) {
        pushIf(sw.pos > EPS, `  The Coin-Swap Received ${asset}: +${fmtAbs(sw.pos)}`);
        pushIf(sw.neg > EPS, `  The Coin-Swap Used ${asset}: -${fmtAbs(sw.neg)}`);
      }
      if (ep) pushIf(ep.pos > EPS, `  The Event Contacts Payout ${asset}: +${fmtAbs(ep.pos)}`);
      if (eo) pushIf(eo.neg > EPS, `  The Event Contacts Order ${asset}: -${fmtAbs(eo.neg)}`);

      const net = finalTotals[asset] ?? 0;
      pushIf(Math.abs(net) > EPS, `  The Total Amount in ${asset} for all the transaction history is: ${fmtSigned(net)} ${asset}`);
      out.push("");
    }

    sectionCopy(out.join("\n").replace(/\n{3,}/g, "\n\n"));
  }

  /* ------------------------ Small self test ------------------------- */
  function runSelfTest() {
    const fixture = [
      // swap pair
      "1010097331800010608\t1059874281\tUSDT\tAUTO_EXCHANGE\t-2.39067476\t2025-08-19 8:06:10\t\t\t1010097331810500608@1.00048296@1.00028288\t2025-08-19 8:06:10",
      "1010097331803180608\t1059874281\tUSDC\tAUTO_EXCHANGE\t2.39125163\t2025-08-19 8:06:10\t\t\t1010097331810500608@1.00004157@0.99984158\t2025-08-19 8:06:10",
      // pnl / fee / referral / funding
      "93131295767309\t1059874281\tBNFCR\tREALIZED_PNL\t108.928\t2025-08-21 17:12:13\tBTCUSDC\t\t\t2025-08-21 17:12:13",
      "96111232230297\t1059874281\tBNFCR\tREALIZED_PNL\t29.6\t2025-08-21 17:12:13\tBTCUSDC\t\t\t2025-08-21 17:12:13",
      "109413495450173580\t1059874281\tBNFCR\tFUNDING_FEE\t1.31932242\t2025-08-21 16:00:00\tBTCUSDC\t\t\t2025-08-21 16:00:00",
      "96110232116710\t1059874281\tBNB\tREFERRAL_KICKBACK\t0.00106582\t2025-08-21 14:09:02\tBTCUSDC\t\t\t2025-08-21 14:09:02",
    ].join("\n");

    const rs = parseBalanceLog({ plain: fixture });
    if (rs.length !== 6) throw new Error("Self-test parse count mismatch");
    const swapsText = coinSwapGroups(rs);
    if (!swapsText.length) throw new Error("Self-test swaps missing");
    alert("Self-test passed ✅");
  }

  /* ------------------------------- UI ------------------------------- */

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#0f172a", background: "#f6f7fb", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 20px 56px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Balance Log Analyzer</h1>
            <p style={{ margin: "4px 0 0 0", color: "#475569", fontSize: 13 }}>
              UTC+0 • Paste your full Balance Log and click Parse. The main “Copy Summary” excludes coin swaps & auto-exchange.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onPasteAndParse} style={btn("black")}>Paste & Parse</button>
            <button onClick={onParse} style={btn("#334155")}>Parse</button>
            <button onClick={clearAll} style={btnOutline()}>Clear</button>
            <button onClick={() => setShowDiag((s) => !s)} style={btnOutline()}>{showDiag ? "Hide Diagnostics" : "Show Diagnostics"}</button>
            <button onClick={runSelfTest} style={btnOutline()}>Self-Test</button>
          </div>
        </header>

        {/* Paste area */}
        <section style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>Paste Balance Log Here</label>
          <textarea
            ref={pasteRef}
            placeholder="Paste the entire Balance Log page (Ctrl/⌘+A then Ctrl/⌘+C)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={5}
            style={{ width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12 }}
          />
          {error && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 6 }}>{error}</p>}
        </section>

        {/* Tabs */}
        {!!rows.length && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[
              ["summary", "Summary"],
              ["swaps", "Coin Swaps"],
              ["events", "Event Contracts"],
              ["raw", "Raw Log"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid #e2e8f0",
                  background: activeTab === key ? "#0ea5e9" : "white",
                  color: activeTab === key ? "white" : "#0f172a",
                  fontWeight: 600,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Diagnostics */}
        {showDiag && !!rows.length && (
          <section style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, whiteSpace: "pre-wrap", background: "white", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, maxHeight: 200, overflow: "auto" }}>
              {rows
                .filter((r) => !KNOWN_TYPES.has(r.type) && !r.type.startsWith(EVENT_PREFIX))
                .map((r) => `• No recognized TYPE token\n${r.raw}`)
                .join("\n")}
            </div>
          </section>
        )}

        {/* Active tab views */}
        {activeTab === "summary" && !!rows.length && (
          <SummaryView
            realizedByAsset={realizedByAsset}
            commissionByAsset={commissionByAsset}
            refKickbackByAsset={refKickbackByAsset}
            fundingByAsset={fundingByAsset}
            insuranceByAsset={insuranceByAsset}
            transfersByAsset={transfersByAsset}
            onCopySummary={copySummaryNoSwaps}
            onCopyFull={copyFullResponse}
          />
        )}

        {activeTab === "swaps" && !!rows.length && (
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Coin Swaps & Auto-Exchange (UTC+0)</h3>
              <button onClick={copyCoinSwaps} style={btnOutline()}>Copy Coin Swaps</button>
            </div>
            {!swaps.length ? (
              <p style={{ color: "#475569" }}>None</p>
            ) : (
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {swaps.map((s, i) => (
                  <li key={i} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 13, marginBottom: 6 }}>
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "events" && !!rows.length && (
          <EventSummary rows={events} />
        )}

        {activeTab === "raw" && !!rows.length && (
          <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                style={btnOutline()}
                onClick={() => {
                  const headers = ["time", "type", "asset", "amount", "symbol", "id", "uid", "extra"];
                  const tsv = [headers.join("\t"), ...rows.map((r) => [r.time, r.type, r.asset, r.amount, r.symbol, r.id, r.uid, r.extra].join("\t"))].join("\n");
                  sectionCopy(tsv);
                }}
              >
                Copy Table (TSV)
              </button>
              <button
                style={btnOutline()}
                onClick={() => {
                  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "balance_log.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download CSV
              </button>
            </div>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["time", "type", "asset", "amount", "symbol", "id", "uid", "extra"].map((h) => (
                      <th key={h} style={th()}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={td()}>{r.time}</td>
                      <td style={td()}>{r.type}</td>
                      <td style={td()}>{r.asset}</td>
                      <td style={{ ...td(), fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{fmtSigned(r.amount)}</td>
                      <td style={td()}>{r.symbol}</td>
                      <td style={td()}>{r.id}</td>
                      <td style={td()}>{r.uid}</td>
                      <td style={td()}>{r.extra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------- Summary Components ----------------------- */

function SummaryView(props: {
  realizedByAsset: Record<string, PosNeg>;
  commissionByAsset: Record<string, PosNeg>;
  refKickbackByAsset: Record<string, PosNeg>;
  fundingByAsset: Record<string, PosNeg>;
  insuranceByAsset: Record<string, PosNeg>;
  transfersByAsset: Record<string, PosNeg>;
  onCopySummary: () => void;
  onCopyFull: () => void;
}) {
  const {
    realizedByAsset,
    commissionByAsset,
    refKickbackByAsset,
    fundingByAsset,
    insuranceByAsset,
    transfersByAsset,
    onCopySummary,
    onCopyFull,
  } = props;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Summary (UTC+0)</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCopySummary} style={btn("#10b981")}>Copy Summary (no Swaps)</button>
          <button onClick={onCopyFull} style={btn("#059669")}>Copy Response (Full)</button>
        </div>
      </div>

      <Card title="Realized PnL (Futures, not Events)">
        <TwoLineList map={realizedByAsset} left="Total Profit" right="Total Loss" />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
        <Card title="Trading Fees / Commission">
          <RpnLine map={commissionByAsset} />
        </Card>
        <Card title="Referral Kickback">
          <RpnLine map={refKickbackByAsset} />
        </Card>
        <Card title="Funding Fees">
          <RpnLine map={fundingByAsset} />
        </Card>
        <Card title="Insurance / Liquidation">
          <RpnLine map={insuranceByAsset} />
        </Card>
        <Card title="Transfers (General)">
          <RpnLine map={transfersByAsset} />
        </Card>
      </div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

function TwoLineList({ map, left, right }: { map: Record<string, PosNeg>; left: string; right: string }) {
  const keys = Object.keys(map);
  if (!keys.length) return <p style={{ color: "#64748b" }}>None</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
      {keys.map((asset) => {
        const v = map[asset];
        const hasLeft = v.pos > EPS;
        const hasRight = v.neg > EPS;
        if (!hasLeft && !hasRight) return null;
        return (
          <li key={asset} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
            <strong>{asset}</strong>
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>
              {hasLeft ? `${left}: +${fmtAbs(v.pos)}` : null}
              {hasLeft && hasRight ? " • " : ""}
              {hasRight ? `${right}: -${fmtAbs(v.neg)}` : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RpnLine({ map }: { map: Record<string, PosNeg> }) {
  const keys = Object.keys(map);
  if (!keys.length) return <p style={{ color: "#64748b" }}>None</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
      {keys.map((asset) => {
        const v = map[asset];
        const pieces: string[] = [];
        if (v.pos > EPS) pieces.push(`Received: +${fmtAbs(v.pos)}`);
        if (v.neg > EPS) pieces.push(`Paid: -${fmtAbs(v.neg)}`);
        if (Math.abs(v.net) > EPS) pieces.push(`Net: ${fmtSigned(v.net)}`);
        if (!pieces.length) return null;
        return (
          <li key={asset} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>
            <strong>{asset}</strong>
            <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>
              {pieces.join(" · ")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------- Event Contracts table ---------------------- */

function EventSummary({ rows }: { rows: Row[] }) {
  // Orders (negative), Payouts (positive)
  const orders = rows.filter((r) => r.type === "EVENT_CONTRACTS_ORDER");
  const payouts = rows.filter((r) => r.type === "EVENT_CONTRACTS_PAYOUT");
  const byOrder = sumByAsset(orders);
  const byPayout = sumByAsset(payouts);
  const assets = Array.from(new Set([...Object.keys(byOrder), ...Object.keys(byPayout)])).sort();

  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Event Contracts (Separate Product)</h3>
      {!assets.length ? (
        <p style={{ color: "#64748b" }}>None</p>
      ) : (
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th()}>Asset</th>
                <th style={th()}>Payout (Received)</th>
                <th style={th()}>Orders (Paid)</th>
                <th style={th()}>Net</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const p = byPayout[asset] || { pos: 0, neg: 0, net: 0 };
                const o = byOrder[asset] || { pos: 0, neg: 0, net: 0 };
                const net = (p.net || 0) + (o.net || 0);
                return (
                  <tr key={asset}>
                    <td style={td()}>{asset}</td>
                    <td style={td()}>{p.pos > EPS ? `+${fmtAbs(p.pos)}` : "—"}</td>
                    <td style={td()}>{o.neg > EPS ? `-${fmtAbs(o.neg)}` : "—"}</td>
                    <td style={td()}>{Math.abs(net) > EPS ? fmtSigned(net) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Styles ------------------------------ */

function btn(bg: string) {
  return {
    background: bg,
    color: "white",
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties;
}
function btnOutline() {
  return {
    background: "white",
    color: "#0f172a",
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties;
}
function th() {
  return {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
  } as React.CSSProperties;
}
function td() {
  return {
    padding: "8px 10px",
    borderBottom: "1px solid #f1f5f9",
    whiteSpace: "nowrap",
  } as React.CSSProperties;
}
