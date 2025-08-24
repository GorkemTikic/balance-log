// src/App.tsx — Block 1/4
import React, { useMemo, useState, useRef, useEffect } from "react";

/**
 * Balance Log Analyzer (single-file App.tsx)
 * - Dual story output (User View / Agent View) with tabbed preview
 * - Dust suppression (≤ 0.00000004) for final balances in stories
 * - Plain, friendly story tone (your phrasing)
 * - BFUSD Reward shown by name (not "Other")
 * - Dot decimals (1230.06 — no thousands commas)
 *
 * No changes needed to index.html, main.tsx, styles.css, etc.
 * You can paste this file in full and it will work as-is.
 */

// ---------- Types ----------
type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string; // "YYYY-MM-DD HH:MM:SS" (UTC+0, hour zero-padded)
  ts: number;   // UTC epoch ms
  symbol: string;
  extra: string;
  raw: string;
};

const ALL_ASSETS = [
  "BTC","LDUSDT","BFUSD","FDUSD","BNB","ETH","USDT","USDC","BNFCR"
] as const;
type AssetCode = typeof ALL_ASSETS[number];

// ---------- Constants ----------
const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/;
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
  BFUSD_REWARD: "BFUSD_REWARD",
} as const;

const EVENT_PREFIX = "EVENT_CONTRACTS_";

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
  TYPE.BFUSD_REWARD,
]);

const EPS = 1e-12;
const DUST = 4e-8; // story-only visibility threshold
const SPLIT_W = 12; // px splitter

// ---------- Time utils (true UTC) ----------
function normalizeTimeString(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return s;
  const [, y, mo, d, h, mi, se] = m;
  const hh = h.padStart(2, "0");
  return `${y}-${mo}-${d} ${hh}:${mi}:${se}`;
}
function parseUtcMs(s: string): number {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const [, Y, Mo, D, H, Mi, S] = m;
  return Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
}
function tsToUtcString(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ---------- General utils ----------
const abs = (x: number) => Math.abs(Number(x) || 0);
const gt = (x: number, tol = EPS) => abs(x) > tol;

function fmtAbs(x: number) {
  // dot decimals only, natural precision (no thousand separators)
  const v = abs(x);
  const s = v.toString().includes("e") ? v.toFixed(12) : v.toString();
  return s;
}
function fmtSigned(x: number) {
  const n = Number(x) || 0;
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${fmtAbs(n)}`;
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

// ---------- Parsing ----------
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

// ---------- Aggregation ----------
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

// ---------- Swap grouping ----------
type SwapKind = "COIN_SWAP" | "AUTO_EXCHANGE";
function groupSwaps(rows: Row[], kind: SwapKind) {
  const isCoin = (t: string) => t === TYPE.COIN_SWAP_DEPOSIT || t === TYPE.COIN_SWAP_WITHDRAW;
  const filtered = rows.filter((r) =>
    kind === "COIN_SWAP" ? isCoin(r.type) : r.type === TYPE.AUTO_EXCHANGE
  );

  const map = new Map<string, Row[]>();
  for (const r of filtered) {
    const idHint = (r.extra && r.extra.split("@")[0]) || "";
    const key = `${r.time}|${idHint}`;
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
// src/App.tsx — Block 2/4 (continues)

export default function App() {
  // Inputs & parsing
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [diags, setDiags] = useState<string[]>([]);
  const [error, setError] = useState("");

  // UI tabs
  const [activeTab, setActiveTab] = useState<"summary" | "swaps" | "events" | "raw">("summary");

  // Right pane resizer
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rightPct, setRightPct] = useState<number>(() => {
    const v = localStorage.getItem("paneRightPct");
    const n = v ? Number(v) : 45;
    return isFinite(n) ? Math.min(60, Math.max(36, n)) : 45;
  });

  // Story modal (drawer) + preview modal (tabbed)
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyPreviewOpen, setStoryPreviewOpen] = useState(false);
  const [storyTab, setStoryTab] = useState<"user" | "agent">("user");
  const [storyUserText, setStoryUserText] = useState("");
  const [storyAgentText, setStoryAgentText] = useState("");

  // Story settings
  const [storyMode, setStoryMode] = useState<"A" | "B" | "C">(
    () => (localStorage.getItem("storyMode") as any) || "A"
  );
  const [storyT0, setStoryT0] = useState<string>(() => localStorage.getItem("storyT0") || "");
  const [storyT1, setStoryT1] = useState<string>(() => localStorage.getItem("storyT1") || "");
  const [includeEvents, setIncludeEvents] = useState<boolean>(() => localStorage.getItem("storyIncEvents") === "1");
  const [includeGridbot, setIncludeGridbot] = useState<boolean>(() => localStorage.getItem("storyIncGridbot") !== "0");

  // Transfer & balances for modes A/B/C
  const [transferAsset, setTransferAsset] = useState<AssetCode>("USDT");
  const [transferAmount, setTransferAmount] = useState<string>("");

  type KV = { asset: AssetCode; amount: string };
  const makeKV = (): KV => ({ asset: "USDT", amount: "" });
  const [beforeRows, setBeforeRows] = useState<KV[]>([makeKV()]);
  const [afterRows, setAfterRows] = useState<KV[]>([makeKV()]);
  const [fromRows, setFromRows] = useState<KV[]>([makeKV()]);

  // Symbol filter
  const [symbolFilter, setSymbolFilter] = useState<string>("ALL");

  // Drag handling
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

  // Helpers (balances editors)
  function pasteToRows(pasted: string): KV[] {
    const out: KV[] = [];
    pasted.split(/\r?\n/).forEach((line) => {
      const [a, val] = line.split(/\t|,|\s{2,}/);
      if (!a || !val) return;
      if (!ALL_ASSETS.includes(a as AssetCode)) return;
      out.push({ asset: a as AssetCode, amount: val.trim() });
    });
    return out.length ? out : [makeKV()];
  }
  function parseBalanceRowsToMap(rows: KV[]) {
    const m: Record<string, number> = {};
    rows.forEach((r) => {
      const n = Number(r.amount);
      if (!Number.isFinite(n)) return;
      m[r.asset] = (m[r.asset] || 0) + n;
    });
    return m;
  }
  function mapToPrettyList(m: Record<string, number>) {
    const ks = Object.keys(m).filter((k) => gt(m[k]));
    if (!ks.length) return "—";
    return ks
      .sort()
      .map((a) => `${fmtAbs(m[a])} ${a}`)
      .join(", ");
  }

  // Parse actions
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

  // Derived sets
  const nonEvent = useMemo(() => onlyNonEvents(rows), [rows]);
  const events = useMemo(() => onlyEvents(rows), [rows]);

  const realized = useMemo(() => nonEvent.filter((r) => r.type === TYPE.REALIZED_PNL), [nonEvent]);
  const commission = useMemo(() => rows.filter((r) => r.type === TYPE.COMMISSION), [rows]);
  const referralKick = useMemo(() => rows.filter((r) => r.type === TYPE.REFERRAL_KICKBACK), [rows]);
  const funding = useMemo(() => rows.filter((r) => r.type === TYPE.FUNDING_FEE), [rows]);
  const insurance = useMemo(() => rows.filter((r) => r.type === TYPE.INSURANCE_CLEAR || r.type === TYPE.LIQUIDATION_FEE), [rows]);
  const transfers = useMemo(() => rows.filter((r) => r.type === TYPE.TRANSFER), [rows]);
  const gridbotTransfers = useMemo(() => rows.filter((r) => r.type === TYPE.GRIDBOT_TRANSFER), [rows]);

  const coinSwapLines = useMemo(() => groupSwaps(rows, "COIN_SWAP"), [rows]);
  const autoExLines = useMemo(() => groupSwaps(rows, "AUTO_EXCHANGE"), [rows]);

  const otherTypesNonEvent = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!KNOWN_TYPES.has(r.type) && !r.type.startsWith(EVENT_PREFIX)) ||
          r.type === TYPE.BFUSD_REWARD
      ),
    [rows]
  );

  const realizedByAsset = useMemo(() => sumByAsset(realized), [realized]);
  const commissionByAsset = useMemo(() => sumByAsset(commission), [commission]);
  const referralByAsset = useMemo(() => sumByAsset(referralKick), [referralKick]);
  const fundingByAsset = useMemo(() => sumByAsset(funding), [funding]);
  const insuranceByAsset = useMemo(() => sumByAsset(insurance), [insurance]);
  const transfersByAsset = useMemo(() => sumByAsset(transfers), [transfers]);
  const gridbotByAsset = useMemo(() => sumByAsset(gridbotTransfers), [gridbotTransfers]);

  const eventsOrderByAsset = useMemo(() => sumByAsset(events.filter((r) => r.type === TYPE.EVENT_ORDER)), [events]);
  const eventsPayoutByAsset = useMemo(() => sumByAsset(events.filter((r) => r.type === TYPE.EVENT_PAYOUT)), [events]);

  const coinSwapAggByAsset = useMemo(
    () => sumByAsset(rows.filter((r) => r.type === TYPE.COIN_SWAP_DEPOSIT || r.type === TYPE.COIN_SWAP_WITHDRAW)),
    [rows]
  );
  const autoExAggByAsset = useMemo(
    () => sumByAsset(rows.filter((r) => r.type === TYPE.AUTO_EXCHANGE)),
    [rows]
  );

  const allSymbolBlocks = useMemo(() => bySymbolSummary(nonEvent), [nonEvent]);
  const symbolStats = useMemo(() => {
    const sym = new Map<string, { pnl: number; fee: number; core: number }>();
    nonEvent.forEach((r) => {
      const s = r.symbol || "";
      const o = sym.get(s) || { pnl: 0, fee: 0, core: 0 };
      if (r.type === TYPE.REALIZED_PNL) o.pnl += r.amount;
      if (r.type === TYPE.COMMISSION) o.fee += r.amount;
      sym.set(s, o);
    });
    const out = Array.from(sym.entries())
      .filter(([s]) => !!s)
      .map(([symbol, o]) => ({
        symbol,
        pnl: o.pnl,
        fee: o.fee,
        core: abs(o.pnl) + abs(o.fee),
      }));
    out.sort((a, b) => b.core - a.core || a.symbol.localeCompare(b.symbol));
    return out;
  }, [nonEvent]);

  const topWinner = useMemo(() => {
    const by: Record<string, number> = {};
    realized.forEach((r) => {
      by[r.symbol || ""] = (by[r.symbol || ""] || 0) + r.amount;
    });
    const arr = Object.entries(by)
      .map(([symbol, v]) => ({ symbol, v }))
      .filter((o) => o.symbol);
    arr.sort((a, b) => b.v - a.v);
    return arr[0]?.symbol;
  }, [realized]);

  const topLoser = useMemo(() => {
    const by: Record<string, number> = {};
    realized.forEach((r) => {
      by[r.symbol || ""] = (by[r.symbol || ""] || 0) + r.amount;
    });
    const arr = Object.entries(by)
      .map(([symbol, v]) => ({ symbol, v }))
      .filter((o) => o.symbol);
    arr.sort((a, b) => a.v - b.v);
    return arr[0]?.symbol;
  }, [realized]);

  const kpis = useMemo(
    () => ({
      tradesParsed: rows.length,
      activeSymbols: allSymbolBlocks.length,
      topWinner,
      topLoser,
    }),
    [rows.length, allSymbolBlocks.length, topWinner, topLoser]
  );

  // Totals by asset (math perspective)
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

    const byType: Record<string, Row[]> = {};
    otherTypesNonEvent.forEach((r) => {
      (byType[r.type] = byType[r.type] || []).push(r);
    });
    Object.values(byType).forEach((rs) => {
      const m = sumByAsset(rs);
      Object.entries(m).forEach(([asset, v]) => {
        totals[asset] = (totals[asset] || 0) + v.net;
      });
    });

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
    otherTypesNonEvent,
  ]);

  // Time window bounds
  const minTs = useMemo(() => (rows.length ? Math.min(...rows.map((r) => r.ts)) : NaN), [rows]);
  const maxTs = useMemo(() => (rows.length ? Math.max(...rows.map((r) => r.ts)) : NaN), [rows]);
  const minTime = Number.isFinite(minTs) ? tsToUtcString(minTs) : "";
  const maxTime = Number.isFinite(maxTs) ? tsToUtcString(maxTs) : "";

  // Symbol filter view
  const symbolBlocks = useMemo(() => {
    if (symbolFilter === "ALL") return allSymbolBlocks;
    return allSymbolBlocks.filter((b) => b.symbol === symbolFilter);
  }, [allSymbolBlocks, symbolFilter]);

  // CSS (minor local styling; does not alter your global files)
  const leftPct = Math.max(34, Math.min(64, 100 - rightPct));
  const rightPctClamped = Math.max(36, Math.min(60, rightPct));
  const leftWidth = `calc(${leftPct}% - ${SPLIT_W / 2}px)`;
  const rightWidth = `calc(${rightPctClamped}% - ${SPLIT_W / 2}px)`;

  const css = `
:root{
  --bg:#0d1116;--fg:#e6edf3;--muted:#9da9b7;--line:#1f2630;--accent:#2f81f7;--good:#28a745;--bad:#d73a49;
}
*{box-sizing:border-box}
html,body,#root{height:100%}
body{margin:0;background:#0d1116;color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial}
.wrap{max-width:1440px;margin:0 auto;padding:18px}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.header h1{margin:0;font-size:20px}
.muted{color:var(--muted);font-size:12px}
.btn-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{background:#1a2330;border:1px solid #263343;color:#dfe7f1;border-radius:8px;padding:6px 10px;cursor:pointer}
.btn:hover{background:#213046}
.btn:active{transform:translateY(1px)}
.btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn-success{background:var(--good);border-color:var(--good);color:#fff}
.card{background:#0f141b;border:1px solid var(--line);border-radius:12px;padding:12px}
.space{margin:10px 0}
.row-title{display:flex;align-items:center;gap:8px}
.pill{background:#0e1520;border:1px solid #162236;color:#dbe7ff;border-radius:999px;padding:2px 8px;font-size:11px}
.table{width:100%;border-collapse:collapse}
.table th,.table td{border-bottom:1px dashed #1f2a36;padding:6px 8px;text-align:left;vertical-align:top}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.dual{display:grid;grid-template-columns:${leftWidth} ${SPLIT_W}px ${rightWidth};gap:0;align-items:start}
.left{width:${leftWidth}}
.right{width:${rightWidth};position:sticky;top:12px;max-height:calc(100vh - 100px)}
.splitter{width:${SPLIT_W}px;background:#0f141b;border:1px solid var(--line);border-radius:8px;cursor:col-resize}
.kpi{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.kpi .chip{background:#0e1520;border:1px solid #162236;color:#cfe1ff;border-radius:999px;padding:4px 8px;font-size:12px}
.asset-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tile{background:#0f141b;border:1px solid #1a2330;border-radius:12px;padding:10px}
.tile h4{margin:0 0 4px 0}
.right-scroll{max-height:calc(100vh - 180px);overflow:auto}
.overlay{position:fixed;inset:0;background:#0009;display:flex;align-items:center;justify-content:center;z-index:40}
.modal{width:min(920px,94vw);max-height:86vh;overflow:hidden;background:#0f141b;border:1px solid var(--line);border-radius:12px;padding:0 0 10px 0;display:flex;flex-direction:column}
.modal-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--line)}
.modal-text{border:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#0a0f15;color:var(--fg);padding:12px 14px;min-height:46vh;resize:vertical}
.hint{color:var(--muted);font-size:12px;margin:8px 12px 0 12px}
.diagbox{width:100%;height:180px;background:#0b1016;border:1px solid var(--line);border-radius:8px;color:var(--fg);padding:8px}
.tabs{display:flex;gap:10px;margin:12px 0}
.tabs button{padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:#0f141b;color:#dfe7f1;cursor:pointer}
.tabs .active{background:var(--accent);border-color:var(--accent)}
.symbol-filter{display:flex;gap:8px;align-items:center}
.symbol-filter select{background:#0e1520;border:1px solid #162236;color:#dfe7f1;border-radius:8px;padding:6px}
@media (max-width:980px){
  .dual{grid-template-columns:1fr}
  .splitter{display:none}
  .right{position:relative;top:auto;max-height:none}
  .right-scroll{max-height:none}
}
`;

  // Components (small)
  function RowTile({ title, value, muted }: { title: string; value?: string | number; muted?: string }) {
    return (
      <div className="tile">
        <h4>{title}</h4>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{value ?? "—"}</div>
        {muted && <div className="muted">{muted}</div>}
      </div>
    );
  }
// src/App.tsx — Block 3/4 (continues)

// ---------- Story helpers ----------
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
      case TYPE.BFUSD_REWARD: {
        const m = (out.otherNonEvent[TYPE.BFUSD_REWARD] = out.otherNonEvent[TYPE.BFUSD_REWARD] || {});
        push(m, r);
        break;
      }
      default:
        if (!r.type.startsWith(EVENT_PREFIX)) {
          const m = (out.otherNonEvent[r.type] = out.otherNonEvent[r.type] || {});
          push(m, r);
        }
    }
  });

  return out;
}
function pruneDustMap(m?: Record<string, number>) {
  if (!m) return {};
  const out: Record<string, number> = {};
  Object.entries(m).forEach(([a, v]) => { if (Math.abs(v) > DUST) out[a] = v; });
  return out;
}
function friendlyLines(
  asset: string,
  map: Record<string, { pos: number; neg: number; net: number }>,
  label: string,
  kind: string
) {
  const v = map[asset];
  if (!v || (!(Math.abs(v.pos) > EPS || Math.abs(v.neg) > EPS || Math.abs(v.net) > EPS))) return [];
  const L: string[] = [];
  if (kind === "trading")
    L.push(`Trading (Realized PnL) — profits and losses from closed positions: earned ${Math.abs(v.pos) > EPS ? `+${fmtAbs(v.pos)}` : "0"}, lost ${Math.abs(v.neg) > EPS ? `−${fmtAbs(v.neg)}` : "0"} → net ${fmtSigned(v.net)} ${asset}.`);
  if (kind === "fees")
    L.push(`Trading fees — charged when orders are executed: ${fmtSigned(v.net)} ${asset}.`);
  if (kind === "funding")
    L.push(`Funding fees — periodic payments between long and short positions: received ${Math.abs(v.pos) > EPS ? `+${fmtAbs(v.pos)}` : "0"}, paid ${Math.abs(v.neg) > EPS ? `−${fmtAbs(v.neg)}` : "0"} → net ${fmtSigned(v.net)} ${asset}.`);
  if (kind === "insurance")
    L.push(`Insurance / Liquidation Clearance Fee — liquidation-related adjustments: received ${Math.abs(v.pos) > EPS ? `+${fmtAbs(v.pos)}` : "0"}, paid ${Math.abs(v.neg) > EPS ? `−${fmtAbs(v.neg)}` : "0"} → net ${fmtSigned(v.net)} ${asset}.`);
  if (kind === "transfers")
    L.push(`Transfers — money moved into and out of your Futures Wallet: in ${Math.abs(v.pos) > EPS ? `+${fmtAbs(v.pos)}` : "0"}, out ${Math.abs(v.neg) > EPS ? `−${fmtAbs(v.neg)}` : "0"} → net ${fmtSigned(v.net)} ${asset}.`);
  if (kind === "gridbot")
    L.push(`GridBot transfers — transfers with your GridBot Wallet: in ${Math.abs(v.pos) > EPS ? `+${fmtAbs(v.pos)}` : "0"}, out ${Math.abs(v.neg) > EPS ? `−${fmtAbs(v.neg)}` : "0"} → net ${fmtSigned(v.net)} ${asset}.`);
  if (kind === "swaps")
    L.push(`Coin Swaps — conversions between assets: net ${fmtSigned(v.net)} ${asset}.`);
  if (kind === "auto")
    L.push(`Auto-Exchange — automatic conversions to clear negative balances: net ${fmtSigned(v.net)} ${asset}.`);
  if (kind === "eventsP")
    L.push(`Event Contracts — payouts: ${Math.abs(v.pos) > EPS ? `+${fmtAbs(v.pos)} ${asset}` : "0"}.`);
  if (kind === "eventsO")
    L.push(`Event Contracts — orders to participate: ${Math.abs(v.neg) > EPS ? `−${fmtAbs(v.neg)} ${asset}` : "0"}.`);
  if (kind === "other")
    L.push(`${label}: net ${fmtSigned(v.net)} ${asset}.`);
  return L;
}

// ---------- Compute deltas & expected balances ----------
function useStoryComputer(
  rows: Row[],
  includeEvents: boolean,
  includeGridbot: boolean,
  storyMode: "A" | "B" | "C",
  storyT0: string,
  storyT1: string,
  transferAsset: AssetCode,
  transferAmount: string,
  beforeRows: { asset: AssetCode; amount: string }[],
  afterRows: { asset: AssetCode; amount: string }[],
  fromRows: { asset: AssetCode; amount: string }[],
  minTime: string,
  maxTime: string
) {
  const parseBalanceRowsToMap = (rowsKV: { asset: AssetCode; amount: string }[]) => {
    const m: Record<string, number> = {};
    rowsKV.forEach((r) => {
      const n = Number(r.amount);
      if (!Number.isFinite(n)) return;
      m[r.asset] = (m[r.asset] || 0) + n;
    });
    return m;
  };

  return useMemo(() => {
    if (!rows.length) return null;

    let T0 = storyT0 || minTime || "";
    let T1 = storyT1 || maxTime || "";
    if (!T0) return null;
    T0 = normalizeTimeString(T0);
    if (T1) T1 = normalizeTimeString(T1);

    const exclusiveStart = storyMode === "A" || storyMode === "B";
    const windowRows = filterRowsInRangeUTC(rows, T0, T1, exclusiveStart);

    const rowsForMath = windowRows.filter((r) => {
      if (!includeGridbot && r.type === TYPE.GRIDBOT_TRANSFER) return false;
      if (!includeEvents && r.type.startsWith(EVENT_PREFIX)) return false;
      return true;
    });

    const catsDisplay = sumByTypeAndAsset(windowRows);
    const catsMath = sumByTypeAndAsset(rowsForMath);

    const deltaByAsset: Record<string, number> = {};
    const addMap = (m: Record<string, { net: number }>) => {
      Object.entries(m).forEach(([a, v]) => (deltaByAsset[a] = (deltaByAsset[a] || 0) + (v?.net || 0)));
    };
    addMap(catsMath.realized);
    addMap(catsMath.funding);
    addMap(catsMath.commission);
    addMap(catsMath.insurance);
    addMap(catsMath.referral);
    addMap(catsMath.transferGen);
    addMap(catsMath.gridbot);
    addMap(catsMath.coinSwap);
    addMap(catsMath.autoEx);
    Object.values(catsMath.otherNonEvent).forEach(addMap);
    if (includeEvents) {
      addMap(catsMath.eventPayouts);
      addMap(catsMath.eventOrders);
    }

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
      anchorBefore = parseBalanceRowsToMap(fromRows);
      if (!T1) T1 = maxTime;
      if (!T0) T0 = minTime;
    }

    let expectedAtEnd: Record<string, number> | undefined;
    if (storyMode === "A" || storyMode === "B") {
      if (!anchorAfter) return null;
      expectedAtEnd = { ...anchorAfter };
      Object.entries(deltaByAsset).forEach(([a, v]) => (expectedAtEnd![a] = (expectedAtEnd![a] || 0) + v));
    } else {
      if (Object.keys(anchorBefore || {}).length) {
        expectedAtEnd = { ...(anchorBefore as Record<string, number>) };
        Object.entries(deltaByAsset).forEach(([a, v]) => (expectedAtEnd![a] = (expectedAtEnd![a] || 0) + v));
      }
    }

    return { T0, T1: T1 || maxTime, windowRows, catsDisplay, deltaByAsset, anchorAfter, anchorBefore, expectedAtEnd };
  }, [
    rows,
    includeEvents,
    includeGridbot,
    storyMode,
    storyT0,
    storyT1,
    transferAsset,
    transferAmount,
    beforeRows,
    afterRows,
    fromRows,
    minTime,
    maxTime,
  ]);
}

// ---------- Build story strings ----------
function buildUserViewText(ctx: NonNullable<ReturnType<typeof useStoryComputer>>) {
  const { T0, T1, catsDisplay, anchorAfter, anchorBefore, expectedAtEnd } = ctx;
  const out: string[] = [];
  if (anchorAfter && anchorBefore) {
    out.push(`On ${T0} (UTC+0), you transferred ${Object.keys(anchorAfter).find(a => (anchorAfter[a]||0) !== (anchorBefore[a]||0)) ? "" : ""}`); // intro will be clarified below
  }

  // Opening (mode-agnostic, readable)
  if (anchorBefore && anchorAfter) {
    // Mode A
    const diffs: string[] = [];
    Object.keys(anchorAfter).forEach((a) => {
      const before = anchorBefore[a] || 0;
      const after = anchorAfter[a] || 0;
      if (Math.abs(after - before) > EPS) {
        diffs.push(`${fmtAbs(after - before)} ${a}`);
      }
    });
    const transferPhrase = diffs.length ? diffs.join(", ") : "a transfer";
    out.push(`On ${T0} (UTC+0), you made ${transferPhrase}. At that time, your balance moved from ${Object.keys(anchorBefore).length ? Object.keys(anchorBefore).sort().map(a => `${fmtAbs(anchorBefore[a])} ${a}`).join(", ") : "—"} to ${Object.keys(anchorAfter).length ? Object.keys(anchorAfter).sort().map(a => `${fmtAbs(anchorAfter[a])} ${a}`).join(", ") : "—"}.`);
  } else if (anchorAfter && !anchorBefore) {
    // Mode B
    out.push(`At ${T0} (UTC+0), this was your Futures Wallet snapshot: ${Object.keys(anchorAfter).length ? Object.keys(anchorAfter).sort().map(a => `${fmtAbs(anchorAfter[a])} ${a}`).join(", ") : "—"}.`);
  } else {
    // Mode C
    out.push(`Between ${T0} and ${T1} (UTC+0), here is what changed in your Futures Wallet.`);
  }

  // Per-asset, plain explanations
  const assets = new Set<string>([
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
  ]);
  const ordered = Array.from(assets).sort();
  if (ordered.length) out.push("", "What happened next:");

  ordered.forEach((asset) => {
    const L: string[] = [];
    L.push(...friendlyLines(asset, catsDisplay.realized, "", "trading"));
    L.push(...friendlyLines(asset, catsDisplay.commission, "", "fees"));
    L.push(...friendlyLines(asset, catsDisplay.funding, "", "funding"));
    L.push(...friendlyLines(asset, catsDisplay.insurance, "", "insurance"));
    L.push(...friendlyLines(asset, catsDisplay.transferGen, "", "transfers"));
    L.push(...friendlyLines(asset, catsDisplay.gridbot, "", "gridbot"));
    L.push(...friendlyLines(asset, catsDisplay.coinSwap, "", "swaps"));
    L.push(...friendlyLines(asset, catsDisplay.autoEx, "", "auto"));
    L.push(...friendlyLines(asset, catsDisplay.eventPayouts, "", "eventsP"));
    L.push(...friendlyLines(asset, catsDisplay.eventOrders, "", "eventsO"));
    Object.entries(catsDisplay.otherNonEvent).forEach(([t, byA]) => {
      if (byA[asset]) L.push(...friendlyLines(asset, byA as any, friendlyTypeName(t), "other"));
    });
    if (L.length) {
      out.push(`\n🔹 ${asset}`);
      L.forEach((s) => out.push(`• ${s}`));
    }
  });

  if (expectedAtEnd) {
    const pruned = pruneDustMap(expectedAtEnd);
    const ks = Object.keys(pruned).sort();
    const list = ks.length ? ks.map((a) => `${fmtAbs(pruned[a])} ${a}`).join(", ") : "—";
    out.push("", `Based on this activity, your Futures wallet balance is: ${list}`);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
function buildAgentViewText(ctx: NonNullable<ReturnType<typeof useStoryComputer>>) {
  const { T0, T1, catsDisplay, deltaByAsset, anchorAfter, anchorBefore, expectedAtEnd } = ctx;
  const out: string[] = [];

  if (anchorBefore && anchorAfter) {
    out.push(`At ${T0} (UTC+0) a transfer was made. Balance moved from ${Object.keys(anchorBefore).length ? Object.keys(anchorBefore).sort().map(a => `${fmtAbs(anchorBefore[a])} ${a}`).join(", ") : "—"} to ${Object.keys(anchorAfter).length ? Object.keys(anchorAfter).sort().map(a => `${fmtAbs(anchorAfter[a])} ${a}`).join(", ") : "—"}.`);
  } else if (anchorAfter && !anchorBefore) {
    out.push(`Snapshot at ${T0} (UTC+0): ${Object.keys(anchorAfter).length ? Object.keys(anchorAfter).sort().map(a => `${fmtAbs(anchorAfter[a])} ${a}`).join(", ") : "—"}.`);
  } else {
    out.push(`Window: ${T0} → ${T1} (UTC+0).`);
    if (anchorBefore && Object.keys(anchorBefore).length) out.push(`Starting balances: ${Object.keys(anchorBefore).sort().map(a => `${fmtAbs(anchorBefore[a])} ${a}`).join(", ")}.`);
  }

  const dump = (title: string, m: Record<string, { pos: number; neg: number; net: number }>, explain: string) => {
    const ks = Object.keys(m)
      .filter((a) => Math.abs(m[a].pos) > EPS || Math.abs(m[a].neg) > EPS || Math.abs(m[a].net) > EPS)
      .sort();
    if (!ks.length) return;
    out.push(`\n${title} — ${explain}`);
    ks.forEach((a) => {
      const v = m[a];
      const parts: string[] = [];
      if (Math.abs(v.pos) > EPS) parts.push(`+${fmtAbs(v.pos)}`);
      if (Math.abs(v.neg) > EPS) parts.push(`−${fmtAbs(v.neg)}`);
      if (Math.abs(v.net) > EPS) parts.push(`net ${fmtSigned(v.net)}`);
      out.push(`• ${a}: ${parts.join(" / ")}`);
    });
  };

  dump("Trading (Realized PnL)", catsDisplay.realized, "profits and losses from closed positions");
  dump("Trading fees", catsDisplay.commission, "fees charged when orders execute");
  dump("Funding fees", catsDisplay.funding, "periodic payments between long and short positions");
  dump("Insurance / Liquidation Clearance Fee", catsDisplay.insurance, "liquidation-related adjustments");
  dump("Transfers", catsDisplay.transferGen, "manual moves into/out of Futures");
  dump("GridBot transfers", catsDisplay.gridbot, "transfers with the GridBot Wallet");
  dump("Coin Swaps", catsDisplay.coinSwap, "asset-to-asset conversions");
  dump("Auto-Exchange", catsDisplay.autoEx, "automatic conversions to clear negative balances");

  const eventExplain = "counted in totals (toggle controls this)";
  dump(`Event Contracts — Payouts (${eventExplain})`, catsDisplay.eventPayouts, "credited payouts");
  dump(`Event Contracts — Orders (${eventExplain})`, catsDisplay.eventOrders, "amounts used to enter contracts");

  Object.keys(catsDisplay.otherNonEvent)
    .sort()
    .forEach((t) => dump(friendlyTypeName(t), catsDisplay.otherNonEvent[t], "credited/charged outside core categories"));

  if (expectedAtEnd) {
    out.push("\nHow this adds up (per asset):");
    const anchor = anchorAfter || anchorBefore || {};
    const pruned = pruneDustMap(expectedAtEnd);
    const assets = Array.from(new Set([...Object.keys(anchor), ...Object.keys(deltaByAsset)])).sort();
    assets.forEach((a) => {
      const end = expectedAtEnd![a] || 0;
      if (!(Math.abs(end) > DUST)) return;
      const start = anchor[a] || 0;
      const change = deltaByAsset[a] || 0;
      out.push(`• ${a}: start ${fmtAbs(start)} → change ${fmtSigned(change)} → expected ${fmtAbs(end)} ${a}`);
    });
    const finalList = Object.keys(pruned)
      .sort()
      .map((a) => `${fmtAbs(pruned[a])} ${a}`)
      .join(", ");
    out.push(`\nFinal balance expected based on activity: ${finalList || "—"}`);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

// Build & open preview
function useOpenStoryPreview(
  ctx: ReturnType<typeof useStoryComputer> | null,
  setStoryUserText: (s: string) => void,
  setStoryAgentText: (s: string) => void,
  setStoryTab: (t: "user" | "agent") => void,
  setStoryPreviewOpen: (v: boolean) => void
) {
  return () => {
    if (!ctx) return;
    setStoryUserText(buildUserViewText(ctx));
    setStoryAgentText(buildAgentViewText(ctx));
    setStoryTab("user");
    setStoryPreviewOpen(true);
  };
}
// src/App.tsx — Block 4/4 (final)

// ---------- Render ----------
  const storyCtx = useStoryComputer(
    rows,
    includeEvents,
    includeGridbot,
    storyMode,
    storyT0,
    storyT1,
    transferAsset,
    transferAmount,
    beforeRows,
    afterRows,
    fromRows,
    minTime,
    maxTime
  );
  const openStoryPreview = useOpenStoryPreview(
    storyCtx,
    setStoryUserText,
    setStoryAgentText,
    setStoryTab,
    setStoryPreviewOpen
  );

  return (
    <div className="wrap" ref={containerRef}>
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
        </div>
      </header>

      {/* Paste & parsed */}
      <section className="space">
        <details className="card" open>
          <summary className="row-title">
            <strong>Parsed rows</strong>
            <span className="pill">{rows.length}</span>
          </summary>
          <div className="btn-row">
            <button className="btn" onClick={() => setActiveTab("summary")}>
              Summary
            </button>
            <button className="btn" onClick={() => setActiveTab("swaps")}>
              Coin Swaps
            </button>
            <button className="btn" onClick={() => setActiveTab("events")}>
              Event Contracts
            </button>
            <button className="btn" onClick={() => setActiveTab("raw")}>
              Raw
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={() => setStoryOpen(true)}>
              Balance Story
            </button>
          </div>

          {activeTab === "raw" && (
            <textarea
              className="diagbox"
              readOnly
              value={rows
                .map((r) => `${r.time}\t${r.asset}\t${r.type}\t${r.amount}\t${r.symbol}`)
                .join("\n")}
            />
          )}

          {activeTab === "summary" && (
            <div className="dual">
              <div className="left">
                <div className="kpi">
                  <span className="chip">
                    rows <strong>{kpis.tradesParsed}</strong>
                  </span>
                  <span className="chip">
                    symbols <strong>{kpis.activeSymbols}</strong>
                  </span>
                  {kpis.topWinner && (
                    <span className="chip">
                      top winner <strong>{kpis.topWinner}</strong>
                    </span>
                  )}
                  {kpis.topLoser && (
                    <span className="chip">
                      top loser <strong>{kpis.topLoser}</strong>
                    </span>
                  )}
                </div>

                <div className="asset-tiles">
                  <RowTile
                    title="Realized PnL (USDT)"
                    value={fmtSigned(realized.filter((r) => r.asset === "USDT").reduce((a, r) => a + r.amount, 0))}
                    muted="Closed positions"
                  />
                  <RowTile
                    title="Realized PnL (USDC)"
                    value={fmtSigned(realized.filter((r) => r.asset === "USDC").reduce((a, r) => a + r.amount, 0))}
                    muted="Closed positions"
                  />
                  <RowTile
                    title="Funding (USDT)"
                    value={fmtSigned(funding.filter((r) => r.asset === "USDT").reduce((a, r) => a + r.amount, 0))}
                    muted="Long/short periodic payments"
                  />
                  <RowTile
                    title="Trading Fees (USDT)"
                    value={fmtSigned(commission.filter((r) => r.asset === "USDT").reduce((a, r) => a + r.amount, 0))}
                    muted="Execution fees"
                  />
                </div>

                <div className="card" style={{ marginTop: 10 }}>
                  <div className="row-title">
                    <strong>Totals by Asset</strong>
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th className="mono">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(totalByAsset)
                        .filter(([, v]) => gt(v))
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([asset, v]) => (
                          <tr key={asset}>
                            <td>{asset}</td>
                            <td className="mono">{fmtSigned(v)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div
                className="splitter"
                onMouseDown={() => setDragging(true)}
                title="Drag to resize"
              />

              <div className="right">
                <div className="card">
                  <div className="row-title" style={{ justifyContent: "space-between" }}>
                    <strong>By Symbol</strong>
                    <div className="symbol-filter">
                      <label className="muted">Filter</label>
                      <select
                        value={symbolFilter}
                        onChange={(e) => setSymbolFilter(e.target.value)}
                      >
                        <option value="ALL">ALL</option>
                        {allSymbolBlocks.map((b) => (
                          <option key={b.symbol} value={b.symbol}>
                            {b.symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="right-scroll" style={{ paddingBottom: 40 }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>PnL</th>
                          <th>Fees</th>
                          <th>Core size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {symbolStats
                          .filter((s) => symbolFilter === "ALL" || symbolFilter === s.symbol)
                          .map(({ symbol, pnl, fee, core }) => (
                            <tr key={symbol}>
                              <td>{symbol}</td>
                              <td className="mono">{fmtSigned(pnl)}</td>
                              <td className="mono">{fmtSigned(fee)}</td>
                              <td className="mono">{fmtAbs(abs(pnl) + abs(fee))}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 10 }}>
                  <div className="row-title">
                    <strong>Coin Swaps</strong>
                  </div>
                  <div className="right-scroll" style={{ paddingBottom: 40 }}>
                    <ul>
                      {coinSwapLines.map((l, i) => (
                        <li key={i} className="mono">
                          {l.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="card" style={{ marginTop: 10 }}>
                  <div className="row-title">
                    <strong>Auto-Exchange</strong>
                  </div>
                  <div className="right-scroll" style={{ paddingBottom: 40 }}>
                    <ul>
                      {autoExLines.map((l, i) => (
                        <li key={i} className="mono">
                          {l.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "swaps" && (
            <div className="card">
              <div className="row-title">
                <strong>Coin Swaps — grouped</strong>
                <span className="muted" style={{ marginLeft: 8 }}>
                  Out → In (per moment)
                </span>
              </div>
              <ul>
                {coinSwapLines.map((l, i) => (
                  <li key={i} className="mono">
                    {l.text}
                  </li>
                ))}
              </ul>
              <table className="table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th className="mono">+</th>
                    <th className="mono">−</th>
                    <th className="mono">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(coinSwapAggByAsset)
                    .filter(([, v]) => gt(v.pos) || gt(v.neg) || gt(v.net))
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([a, v]) => (
                      <tr key={a}>
                        <td>{a}</td>
                        <td className="mono">{gt(v.pos) ? `+${fmtAbs(v.pos)}` : ""}</td>
                        <td className="mono">{gt(v.neg) ? `−${fmtAbs(v.neg)}` : ""}</td>
                        <td className="mono">{gt(v.net) ? fmtSigned(v.net) : ""}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "events" && (
            <div className="card">
              <div className="row-title">
                <strong>Event Contracts</strong>
                <span className="muted" style={{ marginLeft: 8 }}>
                  Payouts and Orders
                </span>
              </div>
              <div className="asset-tiles">
                <RowTile
                  title="Payouts (USDT)"
                  value={fmtSigned(
                    events
                      .filter((r) => r.type === "EVENT_CONTRACTS_PAYOUT" && r.asset === "USDT")
                      .reduce((a, r) => a + r.amount, 0)
                  )}
                />
                <RowTile
                  title="Orders (USDT)"
                  value={fmtSigned(
                    events
                      .filter((r) => r.type === "EVENT_CONTRACTS_ORDER" && r.asset === "USDT")
                      .reduce((a, r) => a + r.amount, 0)
                  )}
                />
              </div>
            </div>
          )}

          {error && <p style={{ color: "#ffb4b4" }}>{error}</p>}
          {!!diags.length && (
            <details>
              <summary>Diagnostics ({diags.length})</summary>
              <textarea className="diagbox" value={diags.join("\n")} readOnly />
            </details>
          )}
        </details>
      </section>

      {/* Tabs (quick) */}
      <nav className="tabs">
        {[
          { key: "summary", label: "Summary" },
          { key: "swaps", label: "Coin Swaps" },
          { key: "events", label: "Event Contracts" },
          { key: "raw", label: "Raw" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={activeTab === t.key ? "active" : ""}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Story drawer (settings) */}
      {storyOpen && (
        <div className="overlay" onClick={() => setStoryOpen(false)}>
          <aside
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Balance Story"
          >
            <div className="modal-head">
              <h3>Balance Story</h3>
              <button className="btn" onClick={() => setStoryOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ padding: "10px 12px" }}>
              <div className="btn-row" style={{ marginBottom: 8 }}>
                <label className="muted">Mode</label>
                <select
                  className="btn"
                  value={storyMode}
                  onChange={(e) => {
                    setStoryMode(e.target.value as any);
                    localStorage.setItem("storyMode", e.target.value);
                  }}
                >
                  <option value="A">A — Transfer snapshot</option>
                  <option value="B">B — Known After</option>
                  <option value="C">C — Between dates</option>
                </select>
              </div>

              <div className="btn-row" style={{ marginBottom: 8 }}>
                <input
                  className="btn"
                  placeholder="Start YYYY-MM-DD HH:MM:SS (UTC+0)"
                  value={storyT0}
                  onChange={(e) => {
                    setStoryT0(e.target.value);
                    localStorage.setItem("storyT0", e.target.value);
                  }}
                />
                <input
                  className="btn"
                  placeholder="End YYYY-MM-DD HH:MM:SS (UTC+0)"
                  value={storyT1}
                  onChange={(e) => {
                    setStoryT1(e.target.value);
                    localStorage.setItem("storyT1", e.target.value);
                  }}
                />
              </div>

              {storyMode !== "C" && (
                <>
                  <div className="btn-row" style={{ marginBottom: 8 }}>
                    <label className="muted">Transfer</label>
                    <select
                      className="btn"
                      value={transferAsset}
                      onChange={(e) => setTransferAsset(e.target.value as AssetCode)}
                    >
                      {ALL_ASSETS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    <input
                      className="btn"
                      placeholder="Amount (e.g., 60.70806999)"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                    />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div className="muted" style={{ marginBottom: 4 }}>
                      BEFORE balances (ASSET<TAB>amount)
                    </div>
                    <textarea
                      className="modal-text"
                      style={{ minHeight: 60 }}
                      value={beforeRows.map((r) => `${r.asset}\t${r.amount}`).join("\n")}
                      onChange={(e) => setBeforeRows(pasteToRows(e.target.value))}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div className="muted" style={{ marginBottom: 4 }}>
                      AFTER balances (ASSET<TAB>amount)
                    </div>
                    <textarea
                      className="modal-text"
                      style={{ minHeight: 60 }}
                      value={afterRows.map((r) => `${r.asset}\t${r.amount}`).join("\n")}
                      onChange={(e) => setAfterRows(pasteToRows(e.target.value))}
                    />
                  </div>
                </>
              )}

              {storyMode === "C" && (
                <div style={{ marginBottom: 8 }}>
                  <div className="muted" style={{ marginBottom: 4 }}>
                    Starting balances at window start (optional) — ASSET<TAB>amount
                  </div>
                  <textarea
                    className="modal-text"
                    style={{ minHeight: 60 }}
                    value={fromRows.map((r) => `${r.asset}\t${r.amount}`).join("\n")}
                    onChange={(e) => setFromRows(pasteToRows(e.target.value))}
                  />
                </div>
              )}

              <div className="btn-row" style={{ marginBottom: 8 }}>
                <label className="muted">
                  <input
                    type="checkbox"
                    checked={includeEvents}
                    onChange={(e) => setIncludeEvents(e.target.checked)}
                    style={{ marginRight: 6 }}
                  />
                  Include Event Contracts in math
                </label>
                <label className="muted">
                  <input
                    type="checkbox"
                    checked={includeGridbot}
                    onChange={(e) => setIncludeGridbot(e.target.checked)}
                    style={{ marginRight: 6 }}
                  />
                  Include GridBot transfers
                </label>
              </div>

              <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-success" onClick={openStoryPreview}>
                  Build & Preview Story
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Balance Story preview modal (tabbed) */}
      {storyPreviewOpen && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Balance Story preview">
          <div className="modal">
            <div className="modal-head">
              <h3>Balance Story — Preview &amp; Edit</h3>
              <button className="btn" onClick={() => setStoryPreviewOpen(false)}>
                Close
              </button>
            </div>

            <div className="btn-row" style={{ gap: 6, margin: "6px 0" }}>
              <button
                className={`btn ${storyTab === "user" ? "btn-primary" : ""}`}
                onClick={() => setStoryTab("user")}
              >
                User View
              </button>
              <button
                className={`btn ${storyTab === "agent" ? "btn-primary" : ""}`}
                onClick={() => setStoryTab("agent")}
              >
                Agent View
              </button>
              <div style={{ flex: 1 }} />
              <button
                className="btn btn-success"
                onClick={() => copyText(storyTab === "user" ? storyUserText : storyAgentText)}
              >
                Copy
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (!storyCtx) return;
                  setStoryUserText(buildUserViewText(storyCtx));
                  setStoryAgentText(buildAgentViewText(storyCtx));
                }}
              >
                Rebuild
              </button>
            </div>

            <textarea
              className="modal-text"
              value={storyTab === "user" ? storyUserText : storyAgentText}
              onChange={(e) =>
                storyTab === "user"
                  ? setStoryUserText(e.target.value)
                  : setStoryAgentText(e.target.value)
              }
            />
            <p className="hint">
              Numbers use dot decimals. Residual balances ≤ 0.00000004 are hidden in the story.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
