// src/App.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";

import {
  Row,
  TYPE,
  EVENT_PREFIX,
  EVENT_KNOWN_CORE,
  KNOWN_TYPES,
  ALL_ASSETS,
  AssetCode,
} from "./lib/types";
import { parseBalanceLog } from "./lib/parsing";
import {
  bySymbolSummary,
  onlyEvents,
  onlyNonEvents,
  sumByAsset,
  groupSwaps,
  sumByTypeAndAsset,
  addMaps,
  addNestedMaps,
} from "./lib/aggregation";
import { fmtAbs, fmtSigned, gt } from "./lib/number";
import { normalizeTimeString, parseUtcMs, tsToUtcString } from "./lib/time";
import { friendlyTypeName } from "./lib/utils";
import { drawSymbolsCanvas } from "./lib/draw";

import GridPasteBox from "./components/GridPasteBox";
import RpnCard from "./components/RpnCard";
import OtherTypesBlock from "./components/OtherTypesBlock";
import EventSummary from "./components/EventSummary";
import BalancesEditor, { BalanceRow } from "./components/BalancesEditor";

/* ───────────────────────────────
   Small helpers (local-only)
   ─────────────────────────────── */
const SPLIT_W = 12;

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

/* ───────────────────────────────
   Component
   ─────────────────────────────── */
export default function App() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [diags, setDiags] = useState<string[]>([]);
  const [activeTab, setActiveTab] =
    useState<"summary" | "swaps" | "events" | "raw">("summary");
  const [error, setError] = useState("");

  // Full response modal
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [fullPreviewText, setFullPreviewText] = useState("");

  // Symbol filter (right pane)
  const [symbolFilter, setSymbolFilter] = useState<string>("ALL");

  // Story drawer + preview
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyPreviewOpen, setStoryPreviewOpen] = useState(false);
  const [storyText, setStoryText] = useState("");

  // Story controls
  const [storyMode, setStoryMode] = useState<"A" | "B" | "C">(
    () => (localStorage.getItem("storyMode") as any) || "A"
  );
  const [storyT0, setStoryT0] = useState<string>(
    () => localStorage.getItem("storyT0") || ""
  );
  const [storyT1, setStoryT1] = useState<string>(
    () => localStorage.getItem("storyT1") || ""
  );
  const [transferAsset, setTransferAsset] = useState<AssetCode>("USDT");
  const [transferAmount, setTransferAmount] = useState<string>("");

  const [beforeRows, setBeforeRows] = useState<BalanceRow[]>([
    { asset: "USDT", amount: "" },
  ]);
  const [afterRows, setAfterRows] = useState<BalanceRow[]>([
    { asset: "USDT", amount: "" },
  ]);
  const [fromRows, setFromRows] = useState<BalanceRow[]>([
    { asset: "USDT", amount: "" },
  ]);

  const [includeEvents, setIncludeEvents] = useState<boolean>(
    () => localStorage.getItem("storyIncEvents") === "1"
  );
  const [includeGridbot, setIncludeGridbot] = useState<boolean>(
    () => localStorage.getItem("storyIncGridbot") !== "0"
  );

  // Resizable right pane
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
      const minPct = (420 / cw) * 100; // 420px min for right pane
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

  /* ───────────────────────────────
     Derived datasets
     ─────────────────────────────── */
  const nonEvent = useMemo(() => onlyNonEvents(rows), [rows]);
  const events = useMemo(() => onlyEvents(rows), [rows]);

  const realized = useMemo(
    () => nonEvent.filter((r) => r.type === TYPE.REALIZED_PNL),
    [nonEvent]
  );
  const commission = useMemo(
    () => rows.filter((r) => r.type === TYPE.COMMISSION),
    [rows]
  );
  const referralKick = useMemo(
    () => rows.filter((r) => r.type === TYPE.REFERRAL_KICKBACK),
    [rows]
  );
  const funding = useMemo(
    () => rows.filter((r) => r.type === TYPE.FUNDING_FEE),
    [rows]
  );
  const insurance = useMemo(
    () =>
      rows.filter(
        (r) => r.type === TYPE.INSURANCE_CLEAR || r.type === TYPE.LIQUIDATION_FEE
      ),
    [rows]
  );
  const transfers = useMemo(
    () => rows.filter((r) => r.type === TYPE.TRANSFER),
    [rows]
  );
  const gridbotTransfers = useMemo(
    () => rows.filter((r) => r.type === TYPE.GRIDBOT_TRANSFER),
    [rows]
  );

  const coinSwapLines = useMemo(() => groupSwaps(rows, "COIN_SWAP"), [rows]);
  const autoExLines = useMemo(() => groupSwaps(rows, "AUTO_EXCHANGE"), [rows]);

  const otherTypesNonEvent = useMemo(
    () => rows.filter((r) => !KNOWN_TYPES.has(r.type) && !r.type.startsWith(EVENT_PREFIX)),
    [rows]
  );
  const eventOther = useMemo(
    () => events.filter((r) => !EVENT_KNOWN_CORE.has(r.type)),
    [events]
  );

  const realizedByAsset = useMemo(() => sumByAsset(realized), [realized]);
  const commissionByAsset = useMemo(() => sumByAsset(commission), [commission]);
  const referralByAsset = useMemo(() => sumByAsset(referralKick), [referralKick]);
  const fundingByAsset = useMemo(() => sumByAsset(funding), [funding]);
  const insuranceByAsset = useMemo(() => sumByAsset(insurance), [insurance]);
  const transfersByAsset = useMemo(() => sumByAsset(transfers), [transfers]);
  const gridbotByAsset = useMemo(
    () => sumByAsset(gridbotTransfers),
    [gridbotTransfers]
  );

  const coinSwapAggByAsset = useMemo(
    () =>
      sumByAsset(
        rows.filter(
          (r) => r.type === TYPE.COIN_SWAP_DEPOSIT || r.type === TYPE.COIN_SWAP_WITHDRAW
        )
      ),
    [rows]
  );
  const autoExAggByAsset = useMemo(
    () => sumByAsset(rows.filter((r) => r.type === TYPE.AUTO_EXCHANGE)),
    [rows]
  );

  const allSymbolBlocks = useMemo(() => bySymbolSummary(nonEvent), [nonEvent]);
  const symbolBlocks = useMemo(
    () =>
      symbolFilter === "ALL"
        ? allSymbolBlocks
        : allSymbolBlocks.filter((b) => b.symbol === symbolFilter),
    [allSymbolBlocks, symbolFilter]
  );

  const minTs = useMemo(
    () => (rows.length ? Math.min(...rows.map((r) => r.ts)) : NaN),
    [rows]
  );
  const maxTs = useMemo(
    () => (rows.length ? Math.max(...rows.map((r) => r.ts)) : NaN),
    [rows]
  );
  const minTime = Number.isFinite(minTs) ? tsToUtcString(minTs) : "";
  const maxTime = Number.isFinite(maxTs) ? tsToUtcString(maxTs) : "";

  /* ───────────────────────────────
     Parse handlers
     ─────────────────────────────── */
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
  const onParse = () => runParse(input);
  const onPasteAndParseText = () =>
    navigator.clipboard
      ?.readText?.()
      .then((t) => {
        setInput(t);
        setTimeout(() => runParse(t), 0);
      })
      .catch(() => {});

  /* ───────────────────────────────
     Full response builder
     ─────────────────────────────── */
  const totalByAsset = useMemo(() => {
    const totals: Record<string, number> = {};
    const bump = (map: Record<string, { net: number }>) =>
      Object.entries(map).forEach(
        ([a, v]) => (totals[a] = (totals[a] ?? 0) + (v?.net ?? 0))
      );
    [
      realizedByAsset,
      commissionByAsset,
      referralByAsset,
      fundingByAsset,
      insuranceByAsset,
      coinSwapAggByAsset,
      autoExAggByAsset,
      transfersByAsset,
      gridbotByAsset,
    ].forEach(bump);
    const eo = sumByAsset(events.filter((r) => r.type === TYPE.EVENT_ORDER));
    const ep = sumByAsset(events.filter((r) => r.type === TYPE.EVENT_PAYOUT));
    bump(eo as any);
    bump(ep as any);
    return totals;
  }, [
    realizedByAsset,
    commissionByAsset,
    referralByAsset,
    fundingByAsset,
    insuranceByAsset,
    coinSwapAggByAsset,
    autoExAggByAsset,
    transfersByAsset,
    gridbotByAsset,
    events,
  ]);

  function buildFullResponse(): string {
    if (!rows.length) return "No data.";
    const byOrder = sumByAsset(events.filter((r) => r.type === TYPE.EVENT_ORDER));
    const byPayout = sumByAsset(events.filter((r) => r.type === TYPE.EVENT_PAYOUT));

    const otherByType: Record<
      string,
      Record<string, { pos: number; neg: number; net: number }>
    > = {};
    otherTypesNonEvent.forEach((r) => {
      const bucket = (otherByType[r.type] ||= {});
      const cur = (bucket[r.asset] ||= { pos: 0, neg: 0, net: 0 });
      if (r.amount >= 0) cur.pos += r.amount;
      else cur.neg += Math.abs(r.amount);
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
      ...Object.keys(byOrder),
      ...Object.keys(byPayout),
      ...Object.keys(transfersByAsset),
      ...Object.keys(gridbotByAsset),
      ...Object.values(otherByType).flatMap((m) => Object.keys(m)),
    ]);

    const L: string[] = ["Summary of your balance log (UTC+0):", ""];
    const pushIf = (cond: boolean, line: string) => {
      if (cond) L.push(line);
    };

    Array.from(assets)
      .sort()
      .forEach((asset) => {
        const r = realizedByAsset[asset];
        const c = commissionByAsset[asset];
        const rk = referralByAsset[asset];
        const f = fundingByAsset[asset];
        const i = insuranceByAsset[asset];
        const cs = coinSwapAggByAsset[asset];
        const ae = autoExAggByAsset[asset];
        const eo = sumByAsset(
          events.filter((x) => x.type === TYPE.EVENT_ORDER && x.asset === asset)
        )[asset];
        const ep = sumByAsset(
          events.filter((x) => x.type === TYPE.EVENT_PAYOUT && x.asset === asset)
        )[asset];
        const tr = transfersByAsset[asset];
        const gb = gridbotByAsset[asset];

        L.push(`Asset: ${asset}`);
        if (r) {
          pushIf(gt(r.pos), `  Profit in ${asset}: +${fmtAbs(r.pos)}`);
          pushIf(gt(r.neg), `  Loss in ${asset}: −${fmtAbs(r.neg)}`);
        }
        if (c) {
          pushIf(gt(c.neg), `  Trading Fee in ${asset}: −${fmtAbs(c.neg)}`);
          pushIf(gt(c.pos), `  Trading Fee refunds in ${asset}: +${fmtAbs(c.pos)}`);
        }
        if (rk) {
          pushIf(
            gt(rk.pos),
            `  Fee Rebate in ${asset}: +${fmtAbs(rk.pos)}`
          );
          pushIf(
            gt(rk.neg),
            `  Fee Rebate adjustments in ${asset}: −${fmtAbs(rk.neg)}`
          );
        }
        if (f) {
          pushIf(
            gt(f.pos),
            `  Funding Fee Received in ${asset}: +${fmtAbs(f.pos)}`
          );
          pushIf(
            gt(f.neg),
            `  Funding Fee Paid in ${asset}: −${fmtAbs(f.neg)}`
          );
        }
        if (i) {
          pushIf(
            gt(i.pos),
            `  Liquidation Clearance Fee Received in ${asset}: +${fmtAbs(i.pos)}`
          );
          pushIf(
            gt(i.neg),
            `  Liquidation Clearance Fee Paid in ${asset}: −${fmtAbs(i.neg)}`
          );
        }
        if (cs) {
          pushIf(
            gt(cs.pos),
            `  Coin Swaps Received ${asset}: +${fmtAbs(cs.pos)}`
          );
          pushIf(
            gt(cs.neg),
            `  Coin Swaps Used ${asset}: −${fmtAbs(cs.neg)}`
          );
        }
        if (ae) {
          pushIf(
            gt(ae.pos),
            `  Auto-Exchange Received ${asset}: +${fmtAbs(ae.pos)}`
          );
          pushIf(
            gt(ae.neg),
            `  Auto-Exchange Used ${asset}: −${fmtAbs(ae.neg)}`
          );
        }
        if (ep) pushIf(gt(ep.pos), `  Event Contracts Payout ${asset}: +${fmtAbs(ep.pos)}`);
        if (eo) pushIf(gt(eo.neg), `  Event Contracts Order ${asset}: −${fmtAbs(eo.neg)}`);

        if (tr && (gt(tr.pos) || gt(tr.neg))) {
          L.push(
            `  Transfers (General) — Received ${asset}: +${fmtAbs(
              tr.pos
            )} / Paid ${asset}: −${fmtAbs(tr.neg)}`
          );
        }
        if (gb && (gt(gb.pos) || gt(gb.neg))) {
          L.push(
            `  Total Transfer To/From the Futures GridBot Wallet — ${asset}: −${fmtAbs(
              gb.neg
            )} / +${fmtAbs(gb.pos)}`
          );
        }

        const net = totalByAsset[asset] ?? 0;
        if (gt(net))
          L.push(
            `  The Total Amount in ${asset} for all the transaction history is: ${fmtSigned(
              net
            )} ${asset}`
          );
        L.push("");
      });

    return L.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function openFullPreview() {
    setFullPreviewText(buildFullResponse());
    setShowFullPreview(true);
  }
  const copyText = (s: string) => navigator.clipboard?.writeText(s);

  /* ───────────────────────────────
     Copy helpers
     ─────────────────────────────── */
  function copySwaps(list: { text: string }[], title: string) {
    const L: string[] = [`${title} (UTC+0)`, ""];
    if (!list.length) L.push("None");
    else list.forEach((s) => L.push(`- ${s.text}`));
    copyText(L.join("\n"));
  }

  function copyEvents() {
    const byOrder = sumByAsset(events.filter((r) => r.type === TYPE.EVENT_ORDER));
    const byPayout = sumByAsset(events.filter((r) => r.type === TYPE.EVENT_PAYOUT));
    const assets = Array.from(
      new Set([...Object.keys(byOrder), ...Object.keys(byPayout)])
    ).sort();

    const L: string[] = ["Event Contracts (UTC+0)", ""];
    if (!assets.length) L.push("None");
    else {
      assets.forEach((asset) => {
        const p = byPayout[asset] || { pos: 0, neg: 0, net: 0 };
        const o = byOrder[asset] || { pos: 0, neg: 0, net: 0 };
        const net = (p.net || 0) + (o.net || 0);
        L.push(
          `${asset}: Payouts +${fmtAbs(p.pos)}, Orders −${fmtAbs(o.neg)}, Net ${fmtSigned(
            net
          )}`
        );
      });
    }
    const eo = eventOther;
    if (eo.length) {
      L.push("", "Event – Other Activity:");
      const byType: Record<string, Row[]> = {};
      eo.forEach((r) => (byType[r.type] ||= []).push(r));
      Object.keys(byType)
        .sort()
        .forEach((t) => {
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

  function copyOneSymbol(b: ReturnType<typeof bySymbolSummary>[number]) {
    const L: string[] = [`${b.symbol} (UTC+0)`];
    const push = (
      name: string,
      m: Record<string, { pos: number; neg: number }>
    ) => {
      const entries = Object.entries(m).filter(
        ([, v]) => gt(v.pos) || gt(v.neg)
      );
      if (!entries.length) return;
      const txt = entries
        .map(([a, v]) => {
          if (gt(v.pos) && gt(v.neg))
            return `+${fmtAbs(v.pos)} / −${fmtAbs(v.neg)} ${a}`;
          if (gt(v.pos)) return `+${fmtAbs(v.pos)} ${a}`;
          return `−${fmtAbs(v.neg)} ${a}`;
        })
        .join("; ");
      L.push(`  ${name}: ${txt}`);
    };
    push("Realized PnL", b.realizedByAsset);
    push("Funding", b.fundingByAsset);
    push("Trading Fees", b.commByAsset);
    push("Insurance", b.insByAsset);
    copyText(L.join("\n"));
  }

  function copyAllSymbolsText() {
    const blocks = allSymbolBlocks;
    if (!blocks.length) return copyText("No symbol activity.");
    const L: string[] = ["By Symbol (Futures, not Events)", ""];
    blocks.forEach((b) => {
      const lines: string[] = [];
      const add = (
        name: string,
        m: Record<string, { pos: number; neg: number }>
      ) => {
        const entries = Object.entries(m).filter(
          ([, v]) => gt(v.pos) || gt(v.neg)
        );
        if (!entries.length) return;
        const txt = entries
        .map(([a, v]) => {
          if (gt(v.pos) && gt(v.neg))
            return `+${fmtAbs(v.pos)} / −${fmtAbs(v.neg)} ${a}`;
          if (gt(v.pos)) return `+${fmtAbs(v.pos)} ${a}`;
          return `−${fmtAbs(v.neg)} ${a}`;
        })
        .join("; ");
        lines.push(`  ${name}: ${txt}`);
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
  const saveSymbolsPng = () => {
    const blocks = symbolBlocks.length ? symbolBlocks : allSymbolBlocks;
    if (!blocks.length) return;
    drawSymbolsCanvas(blocks, "symbols_table.png");
  };

  /* ───────────────────────────────
     Persist story toggles
     ─────────────────────────────── */
  useEffect(() => {
    localStorage.setItem("storyMode", storyMode);
  }, [storyMode]);
  useEffect(() => {
    localStorage.setItem("storyT0", storyT0);
  }, [storyT0]);
  useEffect(() => {
    localStorage.setItem("storyT1", storyT1);
  }, [storyT1]);
  useEffect(() => {
    localStorage.setItem("storyIncEvents", includeEvents ? "1" : "0");
  }, [includeEvents]);
  useEffect(() => {
    localStorage.setItem("storyIncGridbot", includeGridbot ? "1" : "0");
  }, [includeGridbot]);

  // Auto-compute AFTER in Mode A based on BEFORE + transfer
  useEffect(() => {
    if (storyMode !== "A") return;
    const before = Object.fromEntries(
      beforeRows
        .map((r) => [r.asset, Number(r.amount)] as const)
        .filter(([, n]) => Number.isFinite(n))
    ) as Record<string, number>;
    const aft = { ...before };
    const amt = Number(transferAmount);
    if (Number.isFinite(amt))
      aft[transferAsset] = (aft[transferAsset] || 0) + amt;
    const aset = [...ALL_ASSETS] as AssetCode[];
    const list = aset
      .filter((a) => a in aft)
      .map((a) => ({ asset: a, amount: String(aft[a]) }));
    setAfterRows(list.length ? list : [{ asset: "USDT", amount: "" }]);
  }, [storyMode, beforeRows, transferAsset, transferAmount]);

  /* ───────────────────────────────
     Story builder
     ─────────────────────────────── */
  function filterRowsInRangeUTC(
    start?: string,
    end?: string,
    exclusiveStart = false
  ) {
    const s = start ? parseUtcMs(normalizeTimeString(start)) : Number.NEGATIVE_INFINITY;
    const e = end ? parseUtcMs(normalizeTimeString(end)) : Number.POSITIVE_INFINITY;
    return rows.filter((r) => (exclusiveStart ? r.ts > s : r.ts >= s) && r.ts <= e);
  }

  function buildBalanceStory(): string {
    if (!rows.length) return "No parsed rows yet. Paste & Parse first.";

    let T0 = storyT0 || minTime || "";
    let T1 = storyT1 || maxTime || "";
    if (!T0) return "Please provide a start time (UTC+0).";
    T0 = normalizeTimeString(T0);
    if (T1) T1 = normalizeTimeString(T1);

    const exclusiveStart = storyMode === "A" || storyMode === "B";

    let anchorAfter: Record<string, number> | undefined;
    let anchorBefore: Record<string, number> | undefined;

    if (storyMode === "A") {
      anchorBefore = Object.fromEntries(
        beforeRows
          .map((r) => [r.asset, Number(r.amount)] as const)
          .filter(([, n]) => Number.isFinite(n))
      ) as Record<string, number>;
      const amt = Number(transferAmount) || 0;
      anchorAfter = { ...anchorBefore };
      anchorAfter[transferAsset] = (anchorAfter[transferAsset] || 0) + amt;
    } else if (storyMode === "B") {
      anchorAfter = Object.fromEntries(
        afterRows
          .map((r) => [r.asset, Number(r.amount)] as const)
          .filter(([, n]) => Number.isFinite(n))
      ) as Record<string, number>;
      if (transferAmount.trim()) {
        const amt = Number(transferAmount) || 0;
        anchorBefore = { ...anchorAfter };
        anchorBefore[transferAsset] =
          (anchorBefore[transferAsset] || 0) - amt;
      }
    } else {
      anchorAfter = undefined;
      anchorBefore = Object.fromEntries(
        fromRows
          .map((r) => [r.asset, Number(r.amount)] as const)
          .filter(([, n]) => Number.isFinite(n))
      ) as Record<string, number>;
      if (!storyT1) T1 = maxTime;
      if (!storyT0) T0 = minTime;
    }

    const windowRows = filterRowsInRangeUTC(T0, T1, exclusiveStart);
    const rowsForMath = windowRows.filter(
      (r) =>
        (includeGridbot || r.type !== TYPE.GRIDBOT_TRANSFER) &&
        (includeEvents || !r.type.startsWith(EVENT_PREFIX))
    );

    const catsDisplay = sumByTypeAndAsset(windowRows);
    const catsMath = sumByTypeAndAsset(rowsForMath);

    const deltaByAsset: Record<string, number> = {};
    [
      catsMath.realized,
      catsMath.funding,
      catsMath.commission,
      catsMath.insurance,
      catsMath.referral,
      catsMath.transferGen,
      catsMath.gridbot,
      catsMath.coinSwap,
      catsMath.autoEx,
    ].forEach((m) => addMaps(deltaByAsset, m as any));
    if (includeEvents) {
      addMaps(deltaByAsset, catsMath.eventPayouts as any);
      addMaps(deltaByAsset, catsMath.eventOrders as any);
    }
    addNestedMaps(deltaByAsset, catsMath.otherNonEvent as any);

    let expectedAtEnd: Record<string, number> | undefined;
    if (storyMode === "A" || storyMode === "B") {
      if (!anchorAfter) return "Please provide AFTER balances at the anchor time.";
      expectedAtEnd = { ...anchorAfter };
      Object.entries(deltaByAsset).forEach(
        ([a, v]) => (expectedAtEnd![a] = (expectedAtEnd![a] || 0) + v)
      );
    } else if (Object.keys(anchorBefore || {}).length) {
      expectedAtEnd = { ...(anchorBefore as Record<string, number>) };
      Object.entries(deltaByAsset).forEach(
        ([a, v]) => (expectedAtEnd![a] = (expectedAtEnd![a] || 0) + v)
      );
    }

    const pretty = (m: Record<string, number>) =>
      Object.keys(m)
        .filter((k) => gt(m[k]))
        .sort()
        .map((a) => `${fmtAbs(m[a])} ${a}`)
        .join(", ") || "—";

    const L: string[] = [];

    if (storyMode === "A") {
      const amt = Number(transferAmount) || 0;
      L.push(
        `${T0} (UTC+0) — You made a TRANSFER of ${fmtSigned(
          amt
        )} ${transferAsset} to your Futures USDⓂ Wallet.`
      );
      if (anchorBefore && anchorAfter) {
        L.push("With this transfer your wallet moved from:");
        L.push("  BEFORE at T0:");
        L.push(`    ${pretty(anchorBefore)}`);
        L.push("  AFTER at T0:");
        L.push(`    ${pretty(anchorAfter)}`);
      }
      L.push("");
    } else if (storyMode === "B") {
      L.push(`Snapshot at ${T0} (UTC+0) — Wallet AFTER snapshot:`);
      if (anchorAfter) L.push(`  ${pretty(anchorAfter)}`);
      if (anchorBefore) {
        L.push("Inferred BEFORE (from provided transfer):");
        L.push(`  ${pretty(anchorBefore)}`);
      }
      L.push("");
    } else {
      L.push(`Between ${T0} and ${T1} (UTC+0):`);
      if (anchorBefore && Object.keys(anchorBefore).length) {
        L.push("  Balances at start (agent-provided):");
        L.push(`    ${pretty(anchorBefore)}`);
      }
      L.push("");
    }

    const section = (
      title: string,
      m: Record<string, { pos: number; neg: number; net: number }>,
      showNet = false
    ) => {
      const assets = Object.keys(m).filter(
        (a) => gt(m[a].pos) || gt(m[a].neg) || gt(m[a].net)
      );
      if (!assets.length) return;
      L.push(`- ${title}:`);
      assets.sort().forEach((a) => {
        const v = m[a];
        const parts: string[] = [];
        if (gt(v.pos)) parts.push(`+${fmtAbs(v.pos)}`);
        if (gt(v.neg)) parts.push(`−${fmtAbs(v.neg)}`);
        if (showNet && gt(v.net)) parts.push(fmtSigned(v.net));
        L.push(`    ${a}: ${parts.join(" / ") || "0"}`);
      });
    };

    section("Realized PnL", catsDisplay.realized);
    section("Trading Fees / Commission", catsDisplay.commission);
    section("Referral Kickback", catsDisplay.referral);
    section("Funding Fees", catsDisplay.funding);
    section("Insurance / Liquidation", catsDisplay.insurance);
    section("Transfers (General)", catsDisplay.transferGen, true);
    if (includeGridbot)
      section("Futures GridBot Wallet transfers", catsDisplay.gridbot, true);
    section("Coin Swaps", catsDisplay.coinSwap, true);
    section("Auto-Exchange", catsDisplay.autoEx, true);

    const eventNote = includeEvents
      ? " (included in balance math)"
      : " (not included in balance math)";
    section(`Event Contracts — Payouts${eventNote}`, catsDisplay.eventPayouts);
    section(`Event Contracts — Orders${eventNote}`, catsDisplay.eventOrders);

    Object.keys(catsDisplay.otherNonEvent)
      .sort()
      .forEach((t) =>
        section(
          `Other — ${friendlyTypeName(t)}`,
          (catsDisplay.otherNonEvent as any)[t],
          true
        )
      );

    L.push("");

    if (expectedAtEnd) {
      const endLabel = T1 || maxTime;
      const ks = Object.keys(expectedAtEnd).filter((k) => gt(expectedAtEnd![k]));
      L.push(
        `${endLabel} (UTC+0) — Expected wallet balances based on this activity:`
      );
      L.push(
        "  " +
          (ks.length
            ? ks.sort().map((a) => `${fmtAbs(expectedAtEnd![a])} ${a}`).join(", ")
            : "—")
      );

      const anchor =
        storyMode === "A" || storyMode === "B" ? anchorAfter || {} : anchorBefore || {};
      const assets = Array.from(
        new Set([...Object.keys(anchor), ...Object.keys(deltaByAsset)])
      ).sort();
      if (assets.length) {
        L.push("", "Reconciliation (per asset):");
        assets.forEach((a) => {
          const start = (anchor as any)[a] || 0;
          const d = deltaByAsset[a] || 0;
          const exp = (expectedAtEnd![a] || 0) as number;
          L.push(`  ${a}: T0 ${fmtAbs(start)} + Net ${fmtSigned(d)} = ${fmtAbs(exp)}`);
        });
      }
    } else if (storyMode === "C") {
      L.push(
        "Note: No starting balances were provided; listing activity only."
      );
    }
    return L.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  const openStoryPreview = () => {
    setStoryText(buildBalanceStory());
    setStoryPreviewOpen(true);
  };

  /* ───────────────────────────────
     JSX
     ─────────────────────────────── */
  return (
    <div className="wrap">
      {/* Header */}
      <header className="header">
        <div>
          <h1>Balance Log Analyzer</h1>
          <div className="muted">All times are UTC+0</div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onPasteAndParseText}>
            Paste plain text &amp; Parse
          </button>
          <button
            className="btn"
            onClick={() =>
              alert("To parse, paste a table below or raw text, then click Parse.")
            }
          >
            Help
          </button>
        </div>
      </header>

      {/* Paste box */}
      <section className="space">
        <GridPasteBox
          onUseTSV={(tsv) => {
            setInput(tsv);
            runParse(tsv);
          }}
          onError={(m) => setError(m)}
        />
        <details className="card" style={{ marginTop: 8 }}>
          <summary className="card-head" style={{ cursor: "pointer" }}>
            <h3>Manual Paste (fallback)</h3>
          </summary>
          <textarea
            className="paste"
            placeholder="Paste raw text or TSV here"
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
          {/* KPI HEADER */}
          <div className="kpi sticky card">
            {/* Asset tiles row (USDT/USDC/BNFCR Realized PnL only) */}
            <div className="kpi-row asset-tiles">
              {["USDT", "USDC", "BNFCR"].map((a) => {
                const v = realizedByAsset[a] || { pos: 0, neg: 0, net: 0 };
                const net = v.net || 0;
                const netClass = net > 0 ? "good" : net < 0 ? "bad" : "muted";
                const aria = `${a} — Net ${
                  gt(net) ? fmtSigned(net) : "0"
                }; Received ${gt(v.pos) ? `+${fmtAbs(v.pos)}` : "0"}; Paid ${
                  gt(v.neg) ? `−${fmtAbs(v.neg)}` : "0"
                } (UTC+0)`;
                return (
                  <div
                    key={a}
                    className="asset-tile"
                    aria-label={aria}
                    title={`Realized PnL in ${a}`}
                  >
                    <div className="asset-title">{a}</div>
                    <div className={`asset-net ${netClass}`}>
                      {gt(net) ? fmtSigned(net) : "0"}
                    </div>
                    <div className="asset-chips">
                      <span className={`chip ${gt(v.pos) ? "good" : "muted"}`}>
                        {gt(v.pos) ? `+${fmtAbs(v.pos)}` : "—"}
                      </span>
                      <span className={`chip ${gt(v.neg) ? "bad" : "muted"}`}>
                        {gt(v.neg) ? `−${fmtAbs(v.neg)}` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* KPIs & actions row */}
            <div className="kpi-row topbar">
              <div className="kpigrid">
                <div className="kpi-block">
                  <div className="kpi-title">Trades parsed</div>
                  <div className="kpi-num">{rows.length}</div>
                </div>
                <div className="kpi-block">
                  <div className="kpi-title">Active symbols</div>
                  <div className="kpi-num">{allSymbolBlocks.length}</div>
                </div>
              </div>

              <div className="kpi-actions btn-row">
                <button
                  className="btn"
                  onClick={() => {
                    const blocks = allSymbolBlocks;
                    if (!blocks.length) return;
                    const top = blocks
                      .map((b) => {
                        let n = 0;
                        const add = (m: Record<string, { pos: number; neg: number }>) =>
                          Object.values(m).forEach((v) => (n += v.pos - v.neg));
                        add(b.realizedByAsset);
                        add(b.fundingByAsset);
                        add(b.commByAsset);
                        add(b.insByAsset);
                        return { s: b.symbol, n };
                      })
                      .sort((a, b) => b.n - a.n)[0];
                    if (top) setSymbolFilter(top.s);
                  }}
                >
                  Focus Top symbol
                </button>
                <button className="btn" onClick={openFullPreview}>
                  Preview/Edit Full Response
                </button>
                <button className="btn btn-dark" onClick={() => setStoryOpen(true)}>
                  Balance Story
                </button>
              </div>
            </div>
          </div>

          {/* Dual-pane: LEFT | SPLITTER | RIGHT */}
          <div
            className="dual"
            ref={containerRef}
            style={{
              gridTemplateColumns: `minmax(0,1fr) ${SPLIT_W}px ${Math.round(rightPct)}%`,
            }}
          >
            {/* LEFT */}
            <div className="left">
              <div className="grid three">
                <RpnCard title="Trading Fees / Commission" map={commissionByAsset} />
                <RpnCard title="Referral Kickback" map={referralByAsset} />
                <RpnCard title="Funding Fees" map={fundingByAsset} />
                <RpnCard title="Insurance / Liquidation" map={insuranceByAsset} />

                <div className="card">
                  <div className="card-head">
                    <h3>Transfers</h3>
                  </div>
                  <div className="stack">
                    <div className="typecard">
                      <div className="card-head">
                        <h4>General</h4>
                      </div>
                      <ul className="kv">
                        {Object.keys(transfersByAsset).length ? (
                          Object.entries(transfersByAsset).map(([asset, v]) => (
                            <li key={asset} className="kv-row">
                              <span className="label">{asset}</span>
                              {gt(v.pos) ? (
                                <span className="num good">+{fmtAbs(v.pos)}</span>
                              ) : (
                                <span className="num muted">–</span>
                              )}
                              {gt(v.neg) ? (
                                <span className="num bad">−{fmtAbs(v.neg)}</span>
                              ) : (
                                <span className="num muted">–</span>
                              )}
                              {gt(v.net) ? (
                                <span className={`num ${v.net >= 0 ? "good" : "bad"}`}>
                                  {fmtSigned(v.net)}
                                </span>
                              ) : (
                                <span className="num muted">–</span>
                              )}
                            </li>
                          ))
                        ) : (
                          <li className="kv-row">
                            <span className="muted">None</span>
                          </li>
                        )}
                      </ul>
                    </div>

                    <div className="typecard">
                      <div className="card-head">
                        <h4>Futures GridBot Wallet</h4>
                      </div>
                      <ul className="kv">
                        {Object.keys(gridbotByAsset).length ? (
                          Object.entries(gridbotByAsset).map(([asset, v]) => (
                            <li key={asset} className="kv-row">
                              <span className="label">{asset}</span>
                              {gt(v.pos) ? (
                                <span className="num good">+{fmtAbs(v.pos)}</span>
                              ) : (
                                <span className="num muted">–</span>
                              )}
                              {gt(v.neg) ? (
                                <span className="num bad">−{fmtAbs(v.neg)}</span>
                              ) : (
                                <span className="num muted">–</span>
                              )}
                              {gt(v.net) ? (
                                <span className={`num ${v.net >= 0 ? "good" : "bad"}`}>
                                  {fmtSigned(v.net)}
                                </span>
                              ) : (
                                <span className="num muted">–</span>
                              )}
                            </li>
                          ))
                        ) : (
                          <li className="kv-row">
                            <span className="muted">None</span>
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                {!!otherTypesNonEvent.length && (
                  <div className="card">
                    <div className="card-head">
                      <h3>Other Types (non-event)</h3>
                    </div>
                    <OtherTypesBlock rows={otherTypesNonEvent} />
                  </div>
                )}
              </div>
            </div>

            {/* SPLITTER */}
            <div
              className={`splitter ${dragging ? "drag" : ""}`}
              onMouseDown={() => setDragging(true)}
              title="Drag to resize"
            />

            {/* RIGHT */}
            <div className="right card">
              <div className="card-head" style={{ gap: 12 }}>
                <h3>By Symbol (Futures, not Events)</h3>
                <div className="btn-row">
                  <label
                    className="muted"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span>Filter:</span>
                    <select
                      className="select"
                      value={symbolFilter}
                      onChange={(e) => setSymbolFilter(e.target.value)}
                    >
                      <option value="ALL">All symbols</option>
                      {allSymbolBlocks.map((b) => (
                        <option key={b.symbol} value={b.symbol}>
                          {b.symbol}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button className="btn" onClick={copyAllSymbolsText}>
                    Copy Symbols (text)
                  </button>
                  <button className="btn" onClick={saveSymbolsPng}>
                    Save Symbols PNG
                  </button>
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

                          {/* Realized */}
                          <td className="num">
                            {Object.entries(b.realizedByAsset).filter(
                              ([, v]) => v.pos || v.neg
                            ).length
                              ? Object.entries(b.realizedByAsset).map(
                                  ([asset, v], i, arr) => (
                                    <span key={asset}>
                                      {v.pos ? (
                                        <span className="good">+{fmtAbs(v.pos)}</span>
                                      ) : null}
                                      {v.pos && v.neg ? " / " : null}
                                      {v.neg ? (
                                        <span className="bad">−{fmtAbs(v.neg)}</span>
                                      ) : null}{" "}
                                      {asset}
                                      {i < arr.length - 1 ? ", " : ""}
                                    </span>
                                  )
                                )
                              : "–"}
                          </td>

                          {/* Funding */}
                          <td className="num">
                            {Object.entries(b.fundingByAsset).filter(
                              ([, v]) => v.pos || v.neg
                            ).length
                              ? Object.entries(b.fundingByAsset).map(
                                  ([asset, v], i, arr) => (
                                    <span key={asset}>
                                      {v.pos ? (
                                        <span className="good">+{fmtAbs(v.pos)}</span>
                                      ) : null}
                                      {v.pos && v.neg ? " / " : null}
                                      {v.neg ? (
                                        <span className="bad">−{fmtAbs(v.neg)}</span>
                                      ) : null}{" "}
                                      {asset}
                                      {i < arr.length - 1 ? ", " : ""}
                                    </span>
                                  )
                                )
                              : "–"}
                          </td>

                          {/* Commission */}
                          <td className="num">
                            {Object.entries(b.commByAsset).filter(
                              ([, v]) => v.pos || v.neg
                            ).length
                              ? Object.entries(b.commByAsset).map(
                                  ([asset, v], i, arr) => (
                                    <span key={asset}>
                                      {v.pos ? (
                                        <span className="good">+{fmtAbs(v.pos)}</span>
                                      ) : null}
                                      {v.pos && v.neg ? " / " : null}
                                      {v.neg ? (
                                        <span className="bad">−{fmtAbs(v.neg)}</span>
                                      ) : null}{" "}
                                      {asset}
                                      {i < arr.length - 1 ? ", " : ""}
                                    </span>
                                  )
                                )
                              : "–"}
                          </td>

                          {/* Insurance */}
                          <td className="num">
                            {Object.entries(b.insByAsset).filter(
                              ([, v]) => v.pos || v.neg
                            ).length
                              ? Object.entries(b.insByAsset).map(
                                  ([asset, v], i, arr) => (
                                    <span key={asset}>
                                      {v.pos ? (
                                        <span className="good">+{fmtAbs(v.pos)}</span>
                                      ) : null}
                                      {v.pos && v.neg ? " / " : null}
                                      {v.neg ? (
                                        <span className="bad">−{fmtAbs(v.neg)}</span>
                                      ) : null}{" "}
                                      {asset}
                                      {i < arr.length - 1 ? ", " : ""}
                                    </span>
                                  )
                                )
                              : "–"}
                          </td>

                          {/* Actions */}
                          <td className="actcol">
                            <div className="btn-row">
                              <button
                                className="btn btn-ico"
                                aria-label="Copy details"
                                title="Copy details"
                                onClick={() => copyOneSymbol(b)}
                              >
                                📝
                              </button>
                              <button
                                className="btn btn-ico"
                                aria-label="Save PNG"
                                title="Save PNG"
                                onClick={() => drawSymbolsCanvas([b], `${b.symbol}.png`)}
                              >
                                🖼️
                              </button>
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
              <h2>Swaps (UTC+0)</h2>
              <div className="btn-row">
                <button className="btn" onClick={() => copySwaps(coinSwapLines, "Coin Swaps")}>
                  Copy Coin Swaps
                </button>
                <button className="btn" onClick={() => copySwaps(autoExLines, "Auto-Exchange")}>
                  Copy Auto-Exchange
                </button>
              </div>
            </div>

            <div
              className="grid two"
              style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}
            >
              <div>
                <h4 className="muted">Coin Swaps</h4>
                {coinSwapLines.length ? (
                  <ul className="list">
                    {coinSwapLines.map((s, i) => (
                      <li key={i} className="num">
                        {s.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None</p>
                )}
              </div>

              <div>
                <h4 className="muted">Auto-Exchange</h4>
                {autoExLines.length ? (
                  <ul className="list">
                    {autoExLines.map((s, i) => (
                      <li key={i} className="num">
                        {s.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">None</p>
                )}
              </div>
            </div>

            <p className="hint">
              Each line groups all legs that happened at the same second (UTC+0). Types are
              kept separate.
            </p>
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
              {eventOther.length ? (
                <OtherTypesBlock rows={eventOther} />
              ) : (
                <p className="muted">None</p>
              )}
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
                <button
                  className="btn"
                  onClick={() => {
                    const headers = [
                      "time",
                      "type",
                      "asset",
                      "amount",
                      "symbol",
                      "id",
                      "uid",
                      "extra",
                    ] as const;
                    const L = [headers.join("\t")];
                    rows.forEach((r) =>
                      L.push(
                        [
                          r.time,
                          r.type,
                          r.asset,
                          r.amount,
                          r.symbol,
                          r.id,
                          r.uid,
                          r.extra,
                        ].join("\t")
                      )
                    );
                    copyText(L.join("\n"));
                  }}
                >
                  Copy TSV
                </button>

                <button
                  className="btn"
                  onClick={() => {
                    const csv = toCsv(
                      rows.map((r) => ({
                        time: r.time,
                        type: r.type,
                        asset: r.asset,
                        amount: r.amount,
                        symbol: r.symbol,
                        id: r.id,
                        uid: r.uid,
                        extra: r.extra,
                      }))
                    );
                    const blob = new Blob([csv], {
                      type: "text/csv;charset=utf-8;",
                    });
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
            </div>

            <div className="tablewrap">
              <table className="table mono small">
                <thead>
                  <tr>
                    {[
                      "time",
                      "type",
                      "asset",
                      "amount",
                      "symbol",
                      "id",
                      "uid",
                      "extra",
                    ].map((h) => (
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

      {/* Full response preview modal */}
      {showFullPreview && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Full response preview"
        >
          <div className="modal">
            <div className="modal-head">
              <h3>Copy Response (Full) — Preview &amp; Edit</h3>
              <button className="btn" onClick={() => setShowFullPreview(false)}>
                Close
              </button>
            </div>
            <textarea
              className="modal-text"
              value={fullPreviewText}
              onChange={(e) => setFullPreviewText(e.target.value)}
            />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button
                className="btn btn-success"
                onClick={() => copyText(fullPreviewText)}
              >
                Copy Edited Text
              </button>
              <button
                className="btn"
                onClick={() => setFullPreviewText(buildFullResponse())}
              >
                Reset to Auto Text
              </button>
            </div>
            <p className="hint">
              All times are UTC+0. Zero-suppression (EPS = 1e-12) applies in the
              auto text.
            </p>
          </div>
        </div>
      )}

      {/* Balance Story Drawer */}
      {storyOpen && (
        <div className="drawer-overlay" onClick={() => setStoryOpen(false)}>
          <aside
            className="drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Balance Story"
          >
            <div className="drawer-head">
              <h3>Balance Story</h3>
              <button className="btn" onClick={() => setStoryOpen(false)}>
                Close
              </button>
            </div>

            <div className="form-row">
              <label>Mode</label>
              <div className="btn-row">
                <button
                  className={`btn ${storyMode === "A" ? "btn-dark" : ""}`}
                  onClick={() => setStoryMode("A")}
                >
                  A) Transfer Snapshot
                </button>
                <button
                  className={`btn ${storyMode === "B" ? "btn-dark" : ""}`}
                  onClick={() => setStoryMode("B")}
                >
                  B) Known After Only
                </button>
                <button
                  className={`btn ${storyMode === "C" ? "btn-dark" : ""}`}
                  onClick={() => setStoryMode("C")}
                >
                  C) Between Dates
                </button>
              </div>
            </div>

            <div className="form-grid">
              {(storyMode === "A" || storyMode === "B") && (
                <>
                  <label>Anchor time (UTC+0)</label>
                  <input
                    className="input"
                    placeholder="YYYY-MM-DD HH:MM:SS"
                    value={storyT0}
                    onChange={(e) => setStoryT0(e.target.value)}
                  />
                </>
              )}
              <label>{storyMode === "C" ? "To time (UTC+0)" : "End time (UTC+0)"} (optional)</label>
              <input
                className="input"
                placeholder={maxTime || "YYYY-MM-DD HH:MM:SS"}
                value={storyT1}
                onChange={(e) => setStoryT1(e.target.value)}
              />
            </div>

            {(storyMode === "A" || storyMode === "B") && (
              <details className="subcard" open={storyMode === "A"}>
                <summary className="bold">Transfer (optional in Mode B)</summary>
                <div className="form-grid">
                  <label>Asset</label>
                  <select
                    className="select"
                    value={transferAsset}
                    onChange={(e) => setTransferAsset(e.target.value as AssetCode)}
                  >
                    {ALL_ASSETS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <label>Amount (can be negative)</label>
                  <input
                    className="input"
                    placeholder="e.g. 300 or -25.5"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                  />
                </div>
              </details>
            )}

            {storyMode === "A" && (
              <>
                <h4>Wallet BEFORE at anchor time</h4>
                <BalancesEditor rows={beforeRows} setRows={setBeforeRows} />
                <div className="hint">
                  AFTER is auto-calculated from BEFORE + Transfer.
                </div>
                <h4 style={{ marginTop: 10 }}>Wallet AFTER at anchor time (computed)</h4>
                <BalancesEditor rows={afterRows} setRows={setAfterRows} readonly />
              </>
            )}

            {storyMode === "B" && (
              <>
                <h4>Wallet AFTER at anchor time</h4>
                <BalancesEditor rows={afterRows} setRows={setAfterRows} />
                <div className="hint">
                  If you also enter a Transfer above, BEFORE will be inferred and
                  shown in the story.
                </div>
              </>
            )}

            {storyMode === "C" && (
              <>
                <div className="form-grid">
                  <label>From time (UTC+0)</label>
                  <input
                    className="input"
                    placeholder={minTime || "YYYY-MM-DD HH:MM:SS"}
                    value={storyT0}
                    onChange={(e) => setStoryT0(e.target.value)}
                  />
                </div>
                <h4>Balances at From (optional)</h4>
                <BalancesEditor rows={fromRows} setRows={setFromRows} />
              </>
            )}

            <div className="subcard">
              <h4>Options</h4>
              <label className="check">
                <input
                  type="checkbox"
                  checked={includeEvents}
                  onChange={(e) => setIncludeEvents(e.target.checked)}
                />{" "}
                Include Event Contracts in balance math
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={includeGridbot}
                  onChange={(e) => setIncludeGridbot(e.target.checked)}
                />{" "}
                Include Futures GridBot transfers
              </label>
            </div>

            <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
              <button className="btn btn-success" onClick={openStoryPreview}>
                Build &amp; Preview Story
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Balance Story preview modal */}
      {storyPreviewOpen && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Balance Story preview"
        >
          <div className="modal">
            <div className="modal-head">
              <h3>Balance Story — Preview &amp; Edit</h3>
              <button className="btn" onClick={() => setStoryPreviewOpen(false)}>
                Close
              </button>
            </div>
            <textarea
              className="modal-text"
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
            />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn-success" onClick={() => copyText(storyText)}>
                Copy Balance Story
              </button>
              <button className="btn" onClick={() => setStoryText(buildBalanceStory())}>
                Rebuild
              </button>
            </div>
            <p className="hint">
              All times are UTC+0. Zero-suppression (EPS = 1e-12) applies to the
              text only.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
