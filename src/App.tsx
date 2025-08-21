import React, { useMemo, useRef, useState } from "react";

/**
 * Balance Log Analyzer – Simple (UTC+0)
 *
 * - Summary excludes Coin Swaps & Auto-Exchange from the main Copy.
 * - Coin Swaps & Auto-Exchange: one line per swap/time, grouped (Out → In).
 * - Referral Kickback shown under Fees (its own card).
 * - Transfers appear in General (incoming +, outgoing −).
 * - Event Contracts (Orders/Payouts) in a separate section.
 * - Unknown types go to "Other Types" so nothing is dropped.
 * - Raw Parsed Table is collapsed by default; copy/download available.
 */

// ---------- Types ----------
type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string; // keep as "YYYY-MM-DD HH:mm:ss"
  symbol: string;
  extra: string;
  raw: string;
};

// ---------- Utilities ----------
const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/; // UTC+0 text
const SYMBOL_RE = /^[A-Z0-9]{2,}(USDT|USDC|USD|BTC|ETH|BNB)$/;

const SWAP_TYPES = new Set(["COIN_SWAP_DEPOSIT", "COIN_SWAP_WITHDRAW", "AUTO_EXCHANGE"]);
const EVENT_PREFIX = "EVENT_CONTRACTS_";
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

// ---------- Parsing ----------
function splitColumns(line: string) {
  if (line.includes("\t")) return line.split(/\t+/);
  // fallback: collapse multiple spaces or " | "
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

    // Generic Binance Futures order of columns (best-effort):
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

// Group swaps by second (+ optional id before "@")
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

  const lines = [];
  for (const [key, group] of map.entries()) {
    const t = group[0].time;
    const kind = group.some((g) => g.type === "AUTO_EXCHANGE") ? "AUTO_EXCHANGE" : "COIN_SWAP";
    // net by asset
    const byAsset = new Map<string, number>();
    for (const g of group) {
      byAsset.set(g.asset, (byAsset.get(g.asset) || 0) + g.amount);
    }
    const out: string[] = [];
    const inn: string[] = [];
    for (const [asset, amt] of byAsset.entries()) {
      if (amt < 0) out.push(`${fmtSigned(amt)} ${asset}`);
      else if (amt > 0) inn.push(`${fmtSigned(amt)} ${asset}`);
    }
    const text = `${t} (UTC+0) — Out: ${out.length ? out.join(", ") : "0"} → In: ${
      inn.length ? inn.join(", ") : "0"
    }`;
    lines.push({ time: t, kind, text });
  }

  lines.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  return lines;
}

// ---------- Small UI helpers ----------
function RpnCard({ title, map }: { title: string; map: Record<string, { pos: number; neg: number; net: number }> }) {
  const keys = Object.keys(map);
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{title}</h3>
      </div>
      {keys.length ? (
        <ul className="space-y-2 text-sm">
          {keys.map((asset) => {
            const v = map[asset];
            return (
              <li key={asset} className="grid grid-cols-2 md:grid-cols-4 gap-2 items-center">
                <span className="font-medium">{asset}</span>
                <span className="tabular-nums text-right">Received (+): +{fmtAbs(v.pos)}</span>
                <span className="tabular-nums text-right">Paid (−): -{fmtAbs(v.neg)}</span>
                <span className="tabular-nums text-right">Net: {fmtSigned(v.net)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-600">None</p>
      )}
    </div>
  );
}

function fmtAssetPairs(map: Record<string, { pos: number; neg: number; net: number }>) {
  const parts: string[] = [];
  Object.entries(map).forEach(([asset, v]) => {
    parts.push(`+${fmtAbs(v.pos)} / -${fmtAbs(v.neg)} ${asset}`);
  });
  return parts.length ? parts.join(", ") : "–";
}

// ---------- Main App ----------
export default function App() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [diags, setDiags] = useState<string[]>([]);
  const [showDiag, setShowDiag] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "swaps" | "events" | "raw">("summary");
  const [error, setError] = useState("");
  const pasteRef = useRef<HTMLTextAreaElement | null>(null);

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

  const otherTypes = useMemo(() => {
    const out = parsed.filter((r) => !KNOWN_TYPES.has(r.type) && !r.type.startsWith(EVENT_PREFIX));
    return out;
  }, [parsed]);

  const realizedByAsset = useMemo(() => sumByAsset(realizedNonEvent), [realizedNonEvent]);
  const commissionByAsset = useMemo(() => sumByAsset(commission), [commission]);
  const referralByAsset = useMemo(() => sumByAsset(referralKick), [referralKick]);
  const fundingByAsset = useMemo(() => sumByAsset(funding), [funding]);
  const insuranceByAsset = useMemo(() => sumByAsset(insurance), [insurance]);
  const transfersByAsset = useMemo(() => sumByAsset(transfers), [transfers]);

  const symbolBlocks = useMemo(() => bySymbolSummary(nonEvent), [nonEvent]);

  function onParse() {
    setError("");
    try {
      const { rows: rs, diags } = parseBalanceLog(input);
      if (!rs.length) throw new Error("No valid rows detected. Paste the full Balance Log (Ctrl/⌘+A → Ctrl/⌘+C).");
      setRows(rs);
      setDiags(diags);
    } catch (e: any) {
      setError(e?.message || String(e));
      setRows([]);
    }
  }
  async function onPasteAndParse() {
    try {
      if (navigator.clipboard?.readText) {
        const t = await navigator.clipboard.readText();
        setInput(t);
        setTimeout(onParse, 0);
      } else {
        pasteRef.current?.focus();
        alert("Press Ctrl/⌘+V to paste, then click Parse.");
      }
    } catch {
      alert("Clipboard access denied. Paste manually, then click Parse.");
      pasteRef.current?.focus();
    }
  }
  function sectionCopy(text: string) {
    if (!navigator.clipboard) return alert("Clipboard API not available");
    navigator.clipboard.writeText(text).catch(() => alert("Copy failed"));
  }

  // Copy builders
  function copySummary() {
    const L: string[] = [];
    L.push("FD Summary (UTC+0)");
    L.push("");

    const pushProfitLoss = (title: string, map: Record<string, { pos: number; neg: number }>) => {
      const keys = Object.keys(map);
      if (!keys.length) return;
      L.push(title + ":");
      keys.forEach((asset) => {
        const v = map[asset];
        L.push(`  Total Profit ${asset}: +${fmtAbs(v.pos)}`);
        L.push(`  Total Loss ${asset}: -${fmtAbs(v.neg)}`);
      });
      L.push("");
    };

    pushProfitLoss("Realized PnL (Futures, not Events)", realizedByAsset);

    const pushRpn = (title: string, map: Record<string, { pos: number; neg: number; net: number }>) => {
      const keys = Object.keys(map);
      if (!keys.length) return;
      L.push(title + ":");
      keys.forEach((asset) => {
        const v = map[asset];
        L.push(`  Received ${asset}: +${fmtAbs(v.pos)}`);
        L.push(`  Paid ${asset}: -${fmtAbs(v.neg)}`);
        L.push(`  Net ${asset}: ${fmtSigned(v.net)}`);
      });
      L.push("");
    };

    pushRpn("Trading Fees / Commission", commissionByAsset);
    pushRpn("Referral Kickback", referralByAsset);
    pushRpn("Funding Fees", fundingByAsset);
    pushRpn("Insurance / Liquidation", insuranceByAsset);
    pushRpn("Transfers (General)", transfersByAsset);

    // Other Types
    if (otherTypes.length) {
      const byType: Record<string, Row[]> = {};
      otherTypes.forEach((r) => {
        (byType[r.type] = byType[r.type] || []).push(r);
      });
      L.push("Other Types:");
      Object.keys(byType)
        .sort()
        .forEach((t) => {
          const m = sumByAsset(byType[t]);
          L.push(`  ${t}:`);
          Object.entries(m).forEach(([asset, v]) => {
            L.push(`    Received ${asset}: +${fmtAbs(v.pos)}`);
            L.push(`    Paid ${asset}: -${fmtAbs(v.neg)}`);
            L.push(`    Net ${asset}: ${fmtSigned(v.net)}`);
          });
        });
    }

    sectionCopy(L.join("\n"));
  }
  function copySwaps() {
    const L: string[] = [];
    L.push("Coin Swaps & Auto-Exchange (UTC+0)");
    L.push("");
    if (!swaps.length) L.push("None");
    else swaps.forEach((s) => L.push(`- ${s.text}`));
    sectionCopy(L.join("\n"));
  }
  function copyEvents() {
    const orders = events.filter((r) => r.type === "EVENT_CONTRACTS_ORDER");
    const payouts = events.filter((r) => r.type === "EVENT_CONTRACTS_PAYOUT");
    const byOrder = sumByAsset(orders);
    const byPayout = sumByAsset(payouts);
    const assets = Array.from(new Set([...Object.keys(byOrder), ...Object.keys(byPayout)])).sort();

    const L: string[] = [];
    L.push("Event Contracts (UTC+0)");
    L.push("");
    if (!assets.length) L.push("None");
    else {
      assets.forEach((asset) => {
        const p = byPayout[asset] || { pos: 0, neg: 0, net: 0 };
        const o = byOrder[asset] || { pos: 0, neg: 0, net: 0 };
        const net = (p.net || 0) + (o.net || 0);
        L.push(`${asset}: Payouts +${fmtAbs(p.pos)}, Orders -${fmtAbs(o.neg)}, Net ${fmtSigned(net)}`);
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

  // ---------- Self Test ----------
  function runSelfTest() {
    const fixture = [
      // swap pair (USDT -> BNB)
      "900000000001\t1059874281\tUSDT\tCOIN_SWAP_WITHDRAW\t-10\t2025-07-03 12:37:46\t\t\tSWAPID123@1.00\t2025-07-03 12:37:46",
      "900000000002\t1059874281\tBNB\tCOIN_SWAP_DEPOSIT\t0.01511633\t2025-07-03 12:37:46\t\t\tSWAPID123@1.00\t2025-07-03 12:37:46",
      // auto-exchange pair (USDT -> USDC)
      "900000000003\t1059874281\tUSDT\tAUTO_EXCHANGE\t-9\t2025-07-03 12:47:32\t\t\tXID@1\t2025-07-03 12:47:32",
      "900000000004\t1059874281\tUSDC\tAUTO_EXCHANGE\t8.97164406\t2025-07-03 12:47:32\t\t\tXID@1\t2025-07-03 12:47:32",
      // pnl / fees / referral / transfer / events
      "93131295767309\t1059874281\tUSDT\tREALIZED_PNL\t-1.03766\t2025-08-19 08:06:10\tAPI3USDT\t295767309\t295767309\t2025-08-19 08:06:10",
      "900605603173683\t1059874281\tUSDT\tCOMMISSION\t-0.01181965\t2025-05-09 07:57:50\tETHUSDT\t5603173683\t5603173683\t2025-05-09 07:57:50",
      "777777777777\t1059874281\tUSDT\tREFERRAL_KICKBACK\t0.005\t2025-05-09 07:58:00\t\t\t\t2025-05-09 07:58:00",
      "731322166832789270\t1059874281\tUSDT\tFUNDING_FEE\t0.0033099\t2025-05-09 08:00:00\tETHUSDT\t\tFUNDING_FEE\t2025-05-09 08:00:00",
      "266369696644\t1059874281\tUSDT\tTRANSFER\t300.0074505\t2025-06-01 18:38:21\t\t\tTRANSFER\t2025-06-01 18:38:21",
      "888888888888\t1059874281\tUSDT\tEVENT_CONTRACTS_ORDER\t-50\t2025-07-01 10:00:00\t\t\t\t2025-07-01 10:00:00",
      "888888888889\t1059874281\tUSDT\tEVENT_CONTRACTS_PAYOUT\t70\t2025-07-02 10:00:00\t\t\t\t2025-07-02 10:00:00",
    ].join("\n");

    const { rows: rs } = parseBalanceLog(fixture);
    const swapLines = coinSwapGroups(rs);
    if (swapLines.length !== 2) throw new Error("Swap grouping failed");
    const hasReferral = rs.some((r) => r.type === "REFERRAL_KICKBACK");
    if (!hasReferral) throw new Error("Referral Kickback missing");
    alert("Self-test passed ✅");
  }

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Balance Log Analyzer</h1>
            <p className="text-sm text-gray-600">
              UTC+0 • Paste your full Balance Log and click Parse. The main “Copy Summary” excludes coin swaps & auto-exchange.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-lg bg-black text-white" onClick={onPasteAndParse}>
              Paste & Parse
            </button>
            <button className="px-3 py-2 rounded-lg bg-gray-900 text-white" onClick={onParse}>
              Parse
            </button>
            <button
              className="px-3 py-2 rounded-lg border"
              onClick={() => {
                setInput("");
                setRows([]);
                setDiags([]);
                setError("");
              }}
            >
              Clear
            </button>
            <button className="px-3 py-2 rounded-lg border" onClick={runSelfTest}>
              Self-Test
            </button>
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
            className="w-full h-40 p-3 border rounded-lg font-mono text-sm bg-white"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </section>

        {/* Diagnostics */}
        {!!diags.length && (
          <section className="rounded-2xl border bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-semibold">Diagnostics</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{diags.length} messages</span>
                <button className="px-3 py-1 text-sm rounded-lg border" onClick={() => setShowDiag((s) => !s)}>
                  {showDiag ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {showDiag && (
              <div className="p-3">
                <textarea className="w-full h-32 font-mono text-xs bg-gray-50 p-2 rounded-lg border" value={diags.join("\n")} readOnly />
              </div>
            )}
          </section>
        )}

        {/* Tabs */}
        <nav className="flex gap-2">
          {[
            { key: "summary", label: "Summary" },
            { key: "swaps", label: "Coin Swaps" },
            { key: "events", label: "Event Contracts" },
            { key: "raw", label: "Raw Log" },
          ].map((t) => (
            <button
              key={t.key}
              className={`px-3 py-2 rounded-lg border ${
                activeTab === (t.key as any) ? "bg-white shadow-sm" : "bg-gray-100"
              }`}
              onClick={() => setActiveTab(t.key as any)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Summary */}
        {activeTab === "summary" && rows.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Summary</h2>
              <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white" onClick={copySummary}>
                Copy Summary (no Swaps)
              </button>
            </div>

            {/* Realized PnL */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h3 className="font-semibold mb-3">Realized PnL (Futures, not Events)</h3>
              {Object.keys(realizedByAsset).length ? (
                <ul className="grid sm:grid-cols-2 gap-3 text-sm">
                  {Object.entries(realizedByAsset).map(([asset, v]) => (
                    <li key={asset} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className="font-medium">{asset}</span>
                      <span className="tabular-nums text-right">
                        Total Profit: +{fmtAbs(v.pos)} • Total Loss: -{fmtAbs(v.neg)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600">No Realized PnL found.</p>
              )}
            </div>

            {/* Fees / Transfers */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <RpnCard title="Trading Fees / Commission" map={commissionByAsset} />
              <RpnCard title="Referral Kickback" map={referralByAsset} />
              <RpnCard title="Funding Fees" map={fundingByAsset} />
              <RpnCard title="Insurance / Liquidation" map={insuranceByAsset} />
              <RpnCard title="Transfers (General)" map={transfersByAsset} />
            </div>

            {/* By Symbol (compact) */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
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
                      {symbolBlocks.map((b) => (
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

            {/* Other Types */}
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h3 className="font-semibold mb-2">Other Types</h3>
              {otherTypes.length ? (
                <OtherTypesBlock rows={otherTypes} />
              ) : (
                <p className="text-sm text-gray-600">None</p>
              )}
            </div>
          </section>
        )}

        {/* Coin Swaps */}
        {activeTab === "swaps" && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Coin Swaps & Auto-Exchange (UTC+0)</h2>
              <button className="px-3 py-2 rounded-lg border" onClick={copySwaps}>
                Copy Coin Swaps
              </button>
            </div>
            {swaps.length ? (
              <ul className="list-disc pl-5 text-sm space-y-1">
                {swaps.map((s, i) => (
                  <li key={i} className="tabular-nums">
                    {s.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600">None</p>
            )}
            <p className="text-xs text-gray-500 pt-2">Each line groups all legs that happened at the same second.</p>
          </section>
        )}

        {/* Events */}
        {activeTab === "events" && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Event Contracts (separate product)</h2>
              <button className="px-3 py-2 rounded-lg border" onClick={copyEvents}>
                Copy Events
              </button>
            </div>
            <EventSummary rows={events} />
          </section>
        )}

        {/* Raw Parsed Table */}
        {activeTab === "raw" && rows.length > 0 && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded-lg border" onClick={copyRaw}>
                Copy Table (TSV)
              </button>
              <button className="px-3 py-2 rounded-lg border" onClick={() => downloadCsv("balance_log.csv", rows)}>
                Download CSV
              </button>
            </div>
            <div className="overflow-auto border rounded-lg">
              <table className="min-w-[900px] w-full text-xs font-mono">
                <thead className="bg-gray-50">
                  <tr className="text-left border-b">
                    {["time", "type", "asset", "amount", "symbol", "id", "uid", "extra"].map((h) => (
                      <th key={h} className="py-2 px-2">
                        {h}
                      </th>
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
          </section>
        )}
      </div>
    </div>
  );
}

// ---------- Extra components ----------
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
  rows.forEach((r) => {
    const g = byType.get(r.type) || [];
    g.push(r);
    byType.set(r.type, g);
  });
  const keys = Array.from(byType.keys()).sort();

  return (
    <div className="space-y-3">
      {keys.map((t) => {
        const byAsset = sumByAsset(byType.get(t) || []);
        const ks = Object.keys(byAsset);
        return (
          <div key={t} className="rounded-xl border p-3">
            <div className="font-semibold mb-1 text-sm">{t}</div>
            {ks.length ? (
              <ul className="grid sm:grid-cols-2 gap-2 text-sm">
                {ks.map((asset) => {
                  const v = byAsset[asset];
                  return (
                    <li key={asset} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <span className="font-medium">{asset}</span>
                      <span className="tabular-nums">
                        Received: +{fmtAbs(v.pos)} • Paid: -{fmtAbs(v.neg)} • Net: {fmtSigned(v.net)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-600">None</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
