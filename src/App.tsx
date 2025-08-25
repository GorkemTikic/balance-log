import React, { useMemo, useState, useRef, useEffect } from "react";
import { Row } from "./types";
import { TYPE, EVENT_PREFIX, EVENT_KNOWN_CORE, KNOWN_TYPES, SPLIT_W } from "./constants";
import { fmtAbs, fmtSigned, gt, toCsv } from "./utils/format";
import { tsToUtcString } from "./utils/time";
import { parseBalanceLog } from "./utils/parsing";
import { sumByAsset, bySymbolSummary, groupSwaps } from "./utils/aggregation";

import GridPasteBox from "./components/GridPasteBox";
import RpnCard from "./components/RpnCard";
import EventSummary from "./components/EventSummary";
import OtherTypesBlock from "./components/OtherTypesBlock";
import { drawSymbolsCanvas, drawSingleRowCanvas } from "./components/SymbolCanvas";

export default function App() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [diags, setDiags] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "swaps" | "events" | "raw">("summary");
  const [error, setError] = useState("");
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [fullPreviewText, setFullPreviewText] = useState("");
  const [symbolFilter, setSymbolFilter] = useState<string>("ALL");

  // Pane sizing (wider default so numbers fit)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rightPct, setRightPct] = useState<number>(() => {
    const v = localStorage.getItem("paneRightPct");
    const n = v ? Number(v) : 55;
    return isFinite(n) ? Math.min(70, Math.max(36, n)) : 55;
  });
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const cw = rect.width;
      const newRightPct = ((cw - x) / cw) * 100;
      const minPct = (420 / cw) * 100;
      const clamped = Math.min(70, Math.max(minPct, newRightPct));
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
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, rightPct]);

  /* ---------- derived sets ---------- */
  const parsed = rows;
  const nonEvent = useMemo(() => parsed.filter((r) => !r.type.startsWith(EVENT_PREFIX)), [parsed]);
  const events = useMemo(() => parsed.filter((r) => r.type.startsWith(EVENT_PREFIX)), [parsed]);

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
  const symbolBlocks = useMemo(
    () => (symbolFilter === "ALL" ? allSymbolBlocks : allSymbolBlocks.filter((b) => b.symbol === symbolFilter)),
    [allSymbolBlocks, symbolFilter]
  );

  // Bounds
  const minTs = useMemo(() => (rows.length ? Math.min(...rows.map((r) => r.ts)) : NaN), [rows]);
  const maxTs = useMemo(() => (rows.length ? Math.max(...rows.map((r) => r.ts)) : NaN), [rows]);
  const minTime = Number.isFinite(minTs) ? tsToUtcString(minTs) : "";
  const maxTime = Number.isFinite(maxTs) ? tsToUtcString(maxTs) : "";

  /* ---------- actions ---------- */
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
  function onParse() { runParse(input); }
  function onPasteAndParseText() {
    if ((navigator as any).clipboard?.readText) {
      (navigator as any).clipboard.readText().then((t: string) => {
        setInput(t);
        setTimeout(() => runParse(t), 0);
      });
    }
  }
  function copyText(text: string) {
    if (!navigator.clipboard) return alert("Clipboard API not available");
    navigator.clipboard.writeText(text).catch(() => alert("Copy failed"));
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

  function saveSymbolsPng() {
    const blocks = (symbolBlocks.length ? symbolBlocks : allSymbolBlocks);
    if (!blocks.length) return;
    drawSymbolsCanvas(blocks as any, "symbols_table.png");
  }

  function copyRaw() {
    if (!rows.length) return;
    const csv = toCsv(rows.map(r => ({
      time: r.time, type: r.type, asset: r.asset, amount: r.amount, symbol: r.symbol, id: r.id, uid: r.uid, extra: r.extra
    })));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "balance_log.csv"; a.click();
    URL.revokeObjectURL(url);
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

  const focusSymbolRow = (symbol?: string) => {
    if (!symbol) return;
    setTimeout(() => {
      const el = document.getElementById(`row-${symbol}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as any).animate?.([{ backgroundColor: "#fff2" }, { backgroundColor: "transparent" }], { duration: 1200 });
    }, 60);
  };

  /* ---------- full response builder ---------- */
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
    realizedByAsset, commissionByAsset, referralByAsset, fundingByAsset, insuranceByAsset,
    coinSwapAggByAsset, autoExAggByAsset, eventsOrderByAsset, eventsPayoutByAsset, transfersByAsset, gridbotByAsset,
  ]);

  function buildFullResponse(): string {
    if (!rows.length) return "No data.";
    const otherByType: Record<string, { [asset: string]: { pos: number; neg: number; net: number } }> = {};
    otherTypesNonEvent.forEach((r) => {
      const bucket = (otherByType[r.type] = otherByType[r.type] || {});
      const cur = (bucket[r.asset] = bucket[r.asset] || { pos: 0, neg: 0, net: 0 });
      if (r.amount >= 0) cur.pos += r.amount; else cur.neg += Math.abs(r.amount);
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
      if (tr && (gt(tr.pos) || gt(tr.neg))) L.push(`  Transfers (General) — Received ${asset}: +${fmtAbs(tr.pos)} / Paid ${gt(tr.neg) ? "−"+fmtAbs(tr.neg) : "0"}`);
      if (gb && (gt(gb.pos) || gt(gb.neg))) L.push(`  Total Transfer To/From the Futures GridBot Wallet — ${asset}: −${fmtAbs(gb.neg)} / +${fmtAbs(gb.pos)}`);

      const net = totalByAsset[asset] ?? 0;
      if (gt(net)) L.push(`  The Total Amount in ${asset} for all the transaction history is: ${fmtSigned(net)} ${asset}`);
      L.push("");
    });

    return L.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function copyFullResponse() { copyText(buildFullResponse()); }
  function openFullPreview() { setFullPreviewText(buildFullResponse()); setShowFullPreview(true); }

  /* ---------- UI ---------- */
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

      {activeTab === "summary" && rows.length > 0 && (
        <section className="space">
          <div className="kpi sticky card">
            <div className="kpi-row asset-tiles">
              {["USDT", "USDC", "BNFCR"].map((a) => {
                const v = realizedByAsset[a] || { pos: 0, neg: 0, net: 0 };
                const hasPos = gt(v.pos); const hasNeg = gt(v.neg); const net = v.net || 0;
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

            <div className="kpi-row topbar">
              <div className="kpigrid">
                <div className="kpi-block"><div className="kpi-title">Trades parsed</div><div className="kpi-num">{rows.length}</div></div>
                <div className="kpi-block"><div className="kpi-title">Active symbols</div><div className="kpi-num">{allSymbolBlocks.length}</div></div>
                <button className="kpi-block as-btn" onClick={() => { if (!topWinner) return; setSymbolFilter(topWinner.symbol); focusSymbolRow(topWinner.symbol); }} disabled={!topWinner}>
                  <div className="kpi-title">Top winner</div><div className="kpi-num">{topWinner ? `${topWinner.symbol} ${fmtSigned(topWinner.net)}` : "—"}</div>
                </button>
                <button className="kpi-block as-btn" onClick={() => { if (!topLoser) return; setSymbolFilter(topLoser.symbol); focusSymbolRow(topLoser.symbol); }} disabled={!topLoser}>
                  <div className="kpi-title">Top loser</div><div className="kpi-num">{topLoser ? `${topLoser.symbol} ${fmtSigned(topLoser.net)}` : "—"}</div>
                </button>
              </div>

              <div className="kpi-actions btn-row">
                <button className="btn btn-success" onClick={() => copyText(buildFullResponse())}>Copy Summary (Full)</button>
                <button className="btn" onClick={() => { setFullPreviewText(buildFullResponse()); setShowFullPreview(true); }}>Preview/Edit Full Response</button>
                <button className="btn" onClick={() => setActiveTab("events")}>Event Contracts</button>
              </div>
            </div>
          </div>

          <div className="dual" ref={containerRef} style={{ gridTemplateColumns: `minmax(0,1fr) ${SPLIT_W}px ${Math.round(rightPct)}%` }}>
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

            <div className={`splitter ${dragging ? "drag" : ""}`} onMouseDown={() => setDragging(true)} title="Drag to resize" />

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
                    if (!allSymbolBlocks.length) return;
                    const L: string[] = ["By Symbol (Futures, not Events)", ""];
                    allSymbolBlocks.forEach((b) => {
                      const lines: string[] = [];
                      const add = (name: string, m: Record<string, { pos: number; neg: number }>) => {
                        const txt = Object.entries(m).filter(([, v]) => gt(v.pos) || gt(v.neg))
                          .map(([a, v]) => (gt(v.pos)&&gt(v.neg) ? `+${fmtAbs(v.pos)} / −${fmtAbs(v.neg)} ${a}` : gt(v.pos) ? `+${fmtAbs(v.pos)} ${a}` : `−${fmtAbs(v.neg)} ${a}`)).join("; ");
                        if (txt && txt !== "–") lines.push(`  ${name}: ${txt}`);
                      };
                      add("Realized PnL", b.realizedByAsset);
                      add("Funding", b.fundingByAsset);
                      add("Trading Fees", b.commByAsset);
                      add("Insurance", b.insByAsset);
                      if (lines.length) { L.push(b.symbol); L.push(...lines); L.push(""); }
                    });
                    copyText(L.join("\n").trim());
                  }}>Copy Symbols (text)</button>
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
                              <button className="btn btn-ico" aria-label="Save PNG" title="Save PNG" onClick={() => drawSingleRowCanvas(b as any)}>🖼️</button>
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

      {activeTab === "swaps" && (
        <section className="space">
          <div className="card">
            <div className="card-head" style={{ justifyContent: "space-between" }}>
              <h2>Swaps (UTC+0)</h2>
              <div className="btn-row">
                <button className="btn" onClick={() => {
                  const L: string[] = ["Coin Swaps (UTC+0)", ""];
                  if (!coinSwapLines.length) L.push("None"); else coinSwapLines.forEach((s) => L.push(`- ${s.text}`));
                  copyText(L.join("\n"));
                }}>Copy Coin Swaps</button>
                <button className="btn" onClick={() => {
                  const L: string[] = ["Auto-Exchange (UTC+0)", ""];
                  if (!autoExLines.length) L.push("None"); else autoExLines.forEach((s) => L.push(`- ${s.text}`));
                  copyText(L.join("\n"));
                }}>Copy Auto-Exchange</button>
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

      {activeTab === "events" && (
        <section className="space">
          <div className="card">
            <div className="card-head" style={{ justifyContent: "space-between" }}>
              <h2>Event Contracts (separate product)</h2>
              <button className="btn" onClick={() => {
                const byOrder = eventsOrderByAsset, byPayout = eventsPayoutByAsset;
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
                copyText(L.join("\n"));
              }}>Copy Events</button>
            </div>
            <EventSummary rows={events} />
            <div className="subcard">
              <h3>Event – Other Activity</h3>
              {eventOther.length ? <OtherTypesBlock rows={eventOther} /> : <p className="muted">None</p>}
            </div>
          </div>
        </section>
      )}

      {activeTab === "raw" && rows.length > 0 && (
        <section className="space">
          <div className="card">
            <div className="card-head" style={{ justifyContent: "space-between" }}>
              <h2>Raw Parsed Table (Excel-like)</h2>
              <div className="btn-row">
                <button className="btn" onClick={() => {
                  if (!rows.length) return;
                  const csv = toCsv(rows.map(r => ({ time: r.time, type: r.type, asset: r.asset, amount: r.amount, symbol: r.symbol, id: r.id, uid: r.uid, extra: r.extra })));
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
                <thead><tr>{["time","type","asset","amount","symbol","id","uid","extra"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
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

      {showFullPreview && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Full response preview">
          <div className="modal">
            <div className="modal-head">
              <h3>Copy Response (Full) — Preview &amp; Edit</h3>
              <button className="btn" onClick={() => setShowFullPreview(false)}>Close</button>
            </div>
            <textarea className="modal-text" value={fullPreviewText} onChange={(e) => setFullPreviewText(e.target.value)} />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn-success" onClick={() => { copyText(fullPreviewText); }}>Copy Edited Text</button>
              <button className="btn" onClick={() => setFullPreviewText(buildFullResponse())}>Reset to Auto Text</button>
            </div>
            <p className="hint">All times are UTC+0. Zero-suppression (EPS = 1e-12) applies in the auto text.</p>
          </div>
        </div>
      )}
    </div>
  );
}
