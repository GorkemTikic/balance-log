// src/App.tsx
import React, { useMemo, useState, useEffect } from "react";

// Bileşenler (senin proje yapına uygun)
import GridPasteBox from "@/components/GridPasteBox";
import RpnCard from "@/components/RpnCard";
import SymbolTable, { SymbolBlock } from "@/components/SymbolTable";
import SwapsEvents from "@/components/SwapsEvents";
import StoryDrawer from "@/components/StoryDrawer";

// Not: sende dosya adı **FilterBar.tsx** (tekil). İçindeki `export type Filters`’ı da kullanıyoruz.
import type { Filters } from "@/components/FilterBar";
import FilterBar from "@/components/FilterBar";

// Küçük bir localStorage kancası (ayrı dosyan yoksa diye inline veriyorum)
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

// -------------------- Tipler & sabitler --------------------
type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string; // "YYYY-MM-DD HH:MM:SS" (UTC+0)
  ts: number;   // ms
  symbol: string;
  extra: string;
  raw: string;
};

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
} as const;

const EVENT_PREFIX = "EVENT_CONTRACTS_";

const DEFAULT_FILTERS: Filters = {
  t0: "",
  t1: "",
  symbol: "",
  show: {
    realized: true,
    funding: true,
    commission: true,
    insurance: true,
    transfers: true,
    coinSwaps: true,
    autoExchange: true,
    events: true,
  },
};

// -------------------- Yardımcılar --------------------
const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/;
const SYMBOL_RE = /^[A-Z0-9]{2,}(USDT|USDC|USD|BTC|ETH|BNB|BNFCR)$/;

function splitColumns(line: string) {
  if (line.includes("\t")) return line.split(/\t+/);
  return line.trim().split(/\s{2,}|\s\|\s|\s+/);
}
function firstDateIn(line: string) {
  const m = line.match(DATE_RE);
  return m ? m[1] : "";
}
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
    if (!when) { diags.push(`• Skipped (no time): ${line.slice(0, 160)}`); continue; }
    const cols = splitColumns(line);
    if (cols.length < 6) { diags.push(`• Skipped (too few columns): ${line.slice(0, 160)}`); continue; }

    const id = cols[0] ?? "";
    const uid = cols[1] ?? "";
    const asset = cols[2] ?? "";
    const type = cols[3] ?? "";
    const amountRaw = cols[4] ?? "";
    const timeCol = cols.find((c) => DATE_RE.test(c)) ?? when;
    const symbolCandidate = cols[6] ?? "";
    const extra = cols.slice(7).join(" ");

    const amount = Number(amountRaw);
    if (Number.isNaN(amount)) { diags.push(`• Skipped (amount not numeric): ${line.slice(0, 160)}`); continue; }

    let symbol = "";
    if (symbolCandidate && SYMBOL_RE.test(symbolCandidate)) symbol = symbolCandidate;

    const normalized = normalizeTimeString(timeCol.match(DATE_RE)?.[1] || when);
    const ts = parseUtcMs(normalized);

    rows.push({ id, uid, asset, type, amount, time: normalized, ts, symbol, extra, raw: line });
  }
  return { rows, diags };
}

function sumByAsset<T extends Row>(rows: T[]) {
  const acc: Record<string, { pos: number; neg: number; net: number }> = {};
  for (const r of rows) {
    const a = (acc[r.asset] = acc[r.asset] || { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount; else a.neg += Math.abs(r.amount);
    a.net += r.amount;
  }
  return acc;
}
function onlyEvents(rows: Row[]) { return rows.filter((r) => r.type.startsWith(EVENT_PREFIX)); }
function onlyNonEvents(rows: Row[]) { return rows.filter((r) => !r.type.startsWith(EVENT_PREFIX)); }

function groupBySymbol(rows: Row[]) {
  const m = new Map<string, Row[]>();
  for (const r of rows) { if (!r.symbol) continue; const g = m.get(r.symbol) || []; g.push(r); m.set(r.symbol, g); }
  return m;
}
function bySymbolSummary(nonEventRows: Row[]): SymbolBlock[] {
  const sym = groupBySymbol(nonEventRows);
  const out: SymbolBlock[] = [];
  for (const [symbol, rs] of sym.entries()) {
    const realized = rs.filter((r) => r.type === TYPE.REALIZED_PNL);
    const funding = rs.filter((r) => r.type === TYPE.FUNDING_FEE);
    const comm = rs.filter((r) => r.type === TYPE.COMMISSION);
    const ins  = rs.filter((r) => r.type === TYPE.INSURANCE_CLEAR || r.type === TYPE.LIQUIDATION_FEE);
    const realizedByAsset = sumByAsset(realized);
    const fundingByAsset  = sumByAsset(funding);
    const commByAsset     = sumByAsset(comm);
    const insByAsset      = sumByAsset(ins);
    const coreMagnitude =
      Object.values(realizedByAsset).reduce((a, v) => a + Math.abs(v.pos) + Math.abs(v.neg), 0) +
      Object.values(fundingByAsset).reduce((a, v) => a + Math.abs(v.pos) + Math.abs(v.neg), 0) +
      Object.values(commByAsset).reduce((a, v) => a + Math.abs(v.pos) + Math.abs(v.neg), 0);
    if (coreMagnitude <= 1e-12) continue;
    out.push({ symbol, realizedByAsset, fundingByAsset, commByAsset, insByAsset });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}

function groupSwaps(rows: Row[], kind: "COIN_SWAP" | "AUTO_EXCHANGE") {
  const isCoin = (t: string) => t === TYPE.COIN_SWAP_DEPOSIT || t === TYPE.COIN_SWAP_WITHDRAW;
  const filtered = rows.filter((r) => (kind === "COIN_SWAP" ? isCoin(r.type) : r.type === TYPE.AUTO_EXCHANGE));
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
      if (amt < 0) outs.push(`−${Math.abs(amt)} ${asset}`);
      if (amt > 0) ins.push(`+${amt} ${asset}`);
    }
    lines.push({ time: t, ts, text: `${t} (UTC+0) — Out: ${outs.length ? outs.join(", ") : "0"} → In: ${ins.length ? ins.join(", ") : "0"}` });
  }
  lines.sort((a, b) => a.ts - b.ts);
  return lines;
}

function applyFilters(rows: Row[], f: Filters) {
  const start = f.t0 ? parseUtcMs(f.t0) : Number.NEGATIVE_INFINITY;
  const end   = f.t1 ? parseUtcMs(f.t1) : Number.POSITIVE_INFINITY;
  const sym   = f.symbol.trim().toUpperCase();
  const keepType = (t: string) => {
    switch (t) {
      case TYPE.REALIZED_PNL: return f.show.realized;
      case TYPE.FUNDING_FEE:  return f.show.funding;
      case TYPE.COMMISSION:   return f.show.commission;
      case TYPE.INSURANCE_CLEAR:
      case TYPE.LIQUIDATION_FEE: return f.show.insurance;
      case TYPE.TRANSFER:     return f.show.transfers;
      case TYPE.COIN_SWAP_DEPOSIT:
      case TYPE.COIN_SWAP_WITHDRAW: return f.show.coinSwaps;
      case TYPE.AUTO_EXCHANGE: return f.show.autoExchange;
      default: return t.startsWith(EVENT_PREFIX) ? f.show.events : true;
    }
  };
  return rows.filter((r) => {
    if (!(r.ts >= start && r.ts <= end)) return false;
    if (sym && !(r.symbol || "").toUpperCase().includes(sym)) return false;
    if (!keepType(r.type)) return false;
    return true;
  });
}

// -------------------- Uygulama --------------------
export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [diags, setDiags] = useState<string[]>([]);
  const [error, setError] = useState("");

  // FilterBar + kalıcılık
  const [filters, setFilters] = useLocalStorage<Filters>("bl.filters.v1", DEFAULT_FILTERS);

  // Story Drawer state + kalıcılık
  const [storyOpen, setStoryOpen] = useLocalStorage<boolean>("bl.story.open", false);
  const [storyT0, setStoryT0] = useLocalStorage<string>("bl.story.t0", "");
  const [storyT1, setStoryT1] = useLocalStorage<string>("bl.story.t1", "");

  // Parse
  function runParse(tsv: string) {
    setError("");
    try {
      const { rows: rs, diags } = parseBalanceLog(tsv);
      if (!rs.length) throw new Error("No valid rows detected.");
      setRows(rs);
      setDiags(diags);
    } catch (e: any) {
      setError(e?.message || String(e));
      setRows([]);
      setDiags([]);
    }
  }

  // Filtreleri uygula
  const filteredRows = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const nonEvent = useMemo(() => filteredRows.filter((r) => !r.type.startsWith(EVENT_PREFIX)), [filteredRows]);
  const events   = useMemo(() => filteredRows.filter((r) =>  r.type.startsWith(EVENT_PREFIX)), [filteredRows]);

  const realized   = useMemo(() => nonEvent.filter((r) => r.type === TYPE.REALIZED_PNL), [nonEvent]);
  const commission = useMemo(() => filteredRows.filter((r) => r.type === TYPE.COMMISSION), [filteredRows]);
  const funding    = useMemo(() => filteredRows.filter((r) => r.type === TYPE.FUNDING_FEE), [filteredRows]);
  const insurance  = useMemo(() => filteredRows.filter((r) => r.type === TYPE.INSURANCE_CLEAR || r.type === TYPE.LIQUIDATION_FEE), [filteredRows]);
  const transfers  = useMemo(() => filteredRows.filter((r) => r.type === TYPE.TRANSFER), [filteredRows]);

  const realizedByAsset   = useMemo(() => sumByAsset(realized), [realized]);
  const commissionByAsset = useMemo(() => sumByAsset(commission), [commission]);
  const fundingByAsset    = useMemo(() => sumByAsset(funding), [funding]);
  const insuranceByAsset  = useMemo(() => sumByAsset(insurance), [insurance]);
  const transfersByAsset  = useMemo(() => sumByAsset(transfers), [transfers]);

  const coinSwapLines = useMemo(() => groupSwaps(filteredRows, "COIN_SWAP"), [filteredRows]);
  const autoExLines   = useMemo(() => groupSwaps(filteredRows, "AUTO_EXCHANGE"), [filteredRows]);
  const allSymbolBlocks = useMemo(() => bySymbolSummary(nonEvent), [nonEvent]);

  const eventsOrderByAsset  = useMemo(() => sumByAsset(events.filter((r) => r.type === TYPE.EVENT_ORDER)),  [events]);
  const eventsPayoutByAsset = useMemo(() => sumByAsset(events.filter((r) => r.type === TYPE.EVENT_PAYOUT)), [events]);

  // Drawer toplamları
  const storyTotals = useMemo(() => ({
    realized:  realizedByAsset,
    funding:   fundingByAsset,
    commission: commissionByAsset,
    insurance:  insuranceByAsset,
    transfers:  transfersByAsset,
    eventsO:    eventsOrderByAsset,
    eventsP:    eventsPayoutByAsset,
  }), [realizedByAsset, fundingByAsset, commissionByAsset, insuranceByAsset, transfersByAsset, eventsOrderByAsset, eventsPayoutByAsset]);

  useEffect(() => { if (!rows.length) { setStoryT0(""); setStoryT1(""); } }, [rows.length]);

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="title">Balance Log Analyzer</h1>
          <div className="subtitle">All times are UTC+0</div>
        </div>
        <div className="toolbar">
          <button className="btn btn-dark" onClick={() => setStoryOpen(true)}>Open Balance Story</button>
        </div>
      </header>

      {/* SENDEKİ GELİŞMİŞ FilterBar */}
      <FilterBar
        value={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />

      {/* Paste alanı — sayfayı kaplamaması için dışarıda card; GridPasteBox içi zaten preview'i sınırlıyor */}
      <section className="space">
        <GridPasteBox
          onUseTSV={(tsv) => { runParse(tsv); }}
          onError={(m) => setError(m)}
        />
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </section>

      {!!filteredRows.length && (
        <section className="grid-2" style={{ marginTop: 16 }}>
          <RpnCard title="Realized PnL" map={realizedByAsset} />
          <RpnCard title="Trading Fees / Commission" map={commissionByAsset} />
          <RpnCard title="Funding Fees" map={fundingByAsset} />
          <RpnCard title="Insurance / Liquidation" map={insuranceByAsset} />
          <RpnCard title="Transfers (General)" map={transfersByAsset} />
        </section>
      )}

      {!!allSymbolBlocks.length && (
        <section style={{ marginTop: 16 }}>
          <SymbolTable
            blocks={allSymbolBlocks}
            onFocus={(s) => {
              const el = document.getElementById(`row-${s}`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </section>
      )}

      {(coinSwapLines.length || autoExLines.length || Object.keys(eventsOrderByAsset).length || Object.keys(eventsPayoutByAsset).length) && (
        <section>
          <SwapsEvents
            coinSwapLines={coinSwapLines}
            autoExLines={autoExLines}
            eventsOrdersByAsset={eventsOrderByAsset}
            eventsPayoutsByAsset={eventsPayoutByAsset}
          />
        </section>
      )}

      {!!diags.length && (
        <details className="card" style={{ marginTop: 16 }}>
          <summary>Parser diagnostics</summary>
          <ul style={{ marginTop: 8 }}>
            {diags.map((d, i) => (<li key={i} className="mono" style={{ fontSize: 12 }}>{d}</li>))}
          </ul>
        </details>
      )}

      {/* Sağdan kayan Balance Story paneli */}
      <StoryDrawer
        open={storyOpen}
        onClose={() => setStoryOpen(false)}
        t0={storyT0}
        t1={storyT1}
        setT0={setStoryT0}
        setT1={setStoryT1}
        totals={storyTotals}
      />
    </div>
  );
}
