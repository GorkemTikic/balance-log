// App.tsx (refactored into components, no behavior change)
import React, { useMemo, useState, useRef, useEffect } from "react";

import { Row, TYPE, EVENT_PREFIX, EVENT_KNOWN_CORE, KNOWN_TYPES, EPS, SPLIT_W, ALL_ASSETS, AssetCode } from "./lib/types";
import { tsToUtcString, normalizeTimeString } from "./lib/time";
import {
  abs, gt, fmtAbs, fmtSigned, toCsv, parseBalanceLog, sumByAsset,
  onlyEvents, onlyNonEvents, bySymbolSummary, groupSwaps, pairsToText,
} from "./lib/utils";
import {
  filterRowsInRangeUTC, sumByTypeAndAsset, addMaps, addNestedMaps
} from "./lib/story";
import {
  BalanceRow, emptyRow, parseBalanceRowsToMap, mapToPrettyList
} from "./lib/balance";

import GridPasteBox from "./components/GridPasteBox";
import RpnCard from "./components/RpnCard";
import EventSummary from "./components/EventSummary";
import OtherTypesBlock from "./components/OtherTypesBlock";
import BalancesEditor from "./components/BalancesEditor";
import { drawSymbolsCanvas, drawSingleRowCanvas } from "./components/SymbolsCanvas";

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
      const minPct = (420 / cw) * 100;
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
  function onParse() { runParse(input); }
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
      Object.keys(byType).sort().forEach((t) => {
        const m = sumByAsset(byType[t]);
        L.push(`  ${t.replace(/_/g," ")}:`);
        Object.entries(m).forEach(([asset, v]) => {
          if (gt(v.pos)) L.push(`    Received ${asset}: +${fmtAbs(v.pos)}`);
          if (gt(v.neg)) L.push(`    Paid ${asset}: −${fmtAbs(v.neg)}`);
          if (gt(v.net)) L.push(`    Net ${fmtSigned(v.net)}`);
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
    realizedByAsset, commissionByAsset, referralByAsset, fundingByAsset, insuranceByAsset,
    coinSwapAggByAsset, autoExAggByAsset, eventsOrderByAsset, eventsPayoutByAsset,
    transfersByAsset, gridbotByAsset,
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
      ...Object.keys(realizedByAsset), ...Object.keys(commissionByAsset),
      ...Object.keys(referralByAsset), ...Object.keys(fundingByAsset),
      ...Object.keys(insuranceByAsset), ...Object.keys(coinSwapAggByAsset),
      ...Object.keys(autoExAggByAsset), ...Object.keys(eventsOrderByAsset),
      ...Object.keys(eventsPayoutByAsset), ...Object.keys(transfersByAsset),
      ...Object.keys(gridbotByAsset), ...Object.values(otherByType).flatMap((m) => Object.keys(m)),
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
      if (tr && (gt(tr.pos) || gt(tr.neg))) L.push(`  Transfers (General) — Received ${asset}: +${fmtAbs(tr.pos)} / Paid ${asset}: −${fmtAbs(tr.neg)}`);
      if (gb && (gt(gb.pos) || gt(gb.neg))) L.push(`  Total Transfer To/From the Futures GridBot Wallet — ${asset}: −${fmtAbs(gb.neg)} / +${fmtAbs(gb.pos)}`);

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
        L.push(`  ${t.replace(/_/g," ")}:`);
        Object.entries(m).forEach(([asset, v]) => {
          L.push(`    Received ${asset}: +${fmtAbs(v.pos)}`);
          L.push(`    Paid ${asset}: −${fmtAbs(v.neg)}`);
          L.push(`    Net ${fmtSigned(v.net)}`);
        });
      });
    }
    copyText(L.join("\n"));
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
    drawSymbolsCanvas(blocks as any, "symbols_table.png");
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
    if (Number.isFinite(amt)) (aft as any)[transferAsset] = ((aft as any)[transferAsset] || 0) + amt;
    const list: BalanceRow[] = [];
    const aset: AssetCode[] = [...ALL_ASSETS];
    aset.forEach((a) => {
      if (a in aft) list.push({ asset: a, amount: String((aft as any)[a]) });
    });
    if (!list.length) list.push(emptyRow());
    setAfterRows(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyMode, beforeRows, transferAsset, transferAmount]);

  /* ---------- Balance Story generator ---------- */
  function buildBalanceStory(): string {
    if (!rows.length) return "No parsed rows yet. Paste & Parse first.";

    let T0 = storyT0 || (rows.length ? tsToUtcString(Math.min(...rows.map(r=>r.ts))) : "");
    let T1 = storyT1 || (rows.length ? tsToUtcString(Math.max(...rows.map(r=>r.ts))) : "");
    if (!T0) return "Please provide a start time (UTC+0).";
    T0 = normalizeTimeString(T0);
    if (T1) T1 = normalizeTimeString(T1);

    const exclusiveStart = storyMode === "A" || (storyMode === "B");

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

    const windowRows = filterRowsInRangeUTC(rows, T0, T1, exclusiveStart);

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

    const eventNote = includeEvents ? " (included in balance math)" : " (not included in balance math)";
    section(`Event Contracts — Payouts${eventNote}`, catsDisplay.eventPayouts);
    section(`Event Contracts — Orders${eventNote}`, catsDisplay.eventOrders);

    const otherKeys = Object.keys(catsDisplay.otherNonEvent).sort();
    otherKeys.forEach((t) => {
      section(`Other — ${t.replace(/_/g," ")}`, catsDisplay.otherNonEvent[t], { showNet: true });
    });

    L.push("");

    if (expectedAtEnd) {
      const endLabel = T1 || maxTime;
      L.push(`${endLabel} (UTC+0) — Expected wallet balances based on this activity:`);
      const ks = Object.keys(expectedAtEnd).filter((k) => Math.abs(expectedAtEnd![k]) > EPS);
      if (ks.length) L.push("  " + ks.sort().map((a) => `${fmtAbs(expectedAtEnd![a])} ${a}`).join(", "));
      else L.push("  —");

      const anchor = (storyMode === "A" || storyMode === "B") ? (anchorAfter || {}) : (anchorBefore || {});
      const assets = Array.from(new Set([...Object.keys(anchor), ...Object.keys(deltaByAsset)])).sort();
      if (assets.length) {
        L.push("");
        L.push("Reconciliation (per asset):");
        assets.forEach((a) => {
          const start = (anchor as any)[a] || 0;
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
            {/* Asset tiles row */}
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
                <button className="btn btn-success" onClick={copySummary}>Copy Summary (no Swaps)</button>
                <button className="btn" onClick={copyFullResponse}>Copy Response (Full)</button>
                <button className="btn" onClick={openFullPreview}>Preview/Edit Full Response</button>
                <button className="btn btn-dark" onClick={() => setStoryOpen(true)}>Balance Story</button>
              </div>
            </div>
          </div>

          {/* Dual-pane */}
          <div className="dual" ref={containerRef} style={{ gridTemplateColumns: `minmax(0,1fr) ${SPLIT_W}px ${Math.round(rightPct)}%` }}>
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
              <button className="btn btn-success" onClick={() => navigator.clipboard.writeText(fullPreviewText)}>Copy Edited Text</button>
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
              <button className="btn btn-success" onClick={() => navigator.clipboard.writeText(storyText)}>Copy Balance Story</button>
              <button className="btn" onClick={() => setStoryText(buildBalanceStory())}>Rebuild</button>
            </div>
            <p className="hint">All times are UTC+0. Zero-suppression (EPS = 1e-12) applies to the text only.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- small JSX helper ---------- */
function renderAssetPairs(map: Record<string, { pos: number; neg: number }>) {
  const entries = Object.entries(map).filter(([, v]) => Math.abs(v.pos) > EPS || Math.abs(v.neg) > EPS);
  if (!entries.length) return <span>–</span>;
  return (
    <>
      {entries.map(([asset, v], i) => (
        <span key={asset} className="pair">
          {v.pos > EPS && <span className="good">+{fmtAbs(v.pos)}</span>}
          {v.pos > EPS && v.neg > EPS && " / "}
          {v.neg > EPS && <span className="bad">−{fmtAbs(v.neg)}</span>}{" "}
          {asset}
          {i < entries.length - 1 ? ", " : ""}
        </span>
      ))}
    </>
  );
}

/* ---------- CSS (kept inline, unchanged) ---------- */
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
