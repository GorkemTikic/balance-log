// src/App.tsx
import React, { useMemo, useState, useEffect } from "react";
import GridPasteBox from "@/components/GridPasteBox";
import FilterBar from "@/components/FilterBar";
import StoryDrawer from "@/components/StoryDrawer";
import SwapsEvents from "@/components/SwapsEvents";
import SymbolTable from "@/components/SymbolTable";
import RpnTable from "@/components/RpnTable";
import Tabs, { TabKey } from "@/components/Tabs";
import KpiStat from "@/components/KpiStat";
import TypeFilter from "@/components/TypeFilter";
import { Row as StoryRow } from "@/components/StoryDrawer";

type Row = StoryRow;
type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;
type TotalsByType = Record<string, TotalsMap>;

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

function splitCols(line: string) {
  return line.includes("\t")
    ? line.split(/\t+/)
    : line.trim().split(/\s{2,}|\s\|\s|\s+/);
}
const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/;
function normalizeTime(s: string) {
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}:\d{2}:\d{2})$/);
  if (!m) return s;
  const [, d, h] = m;
  const hh = h.split(":")[0].padStart(2, "0");
  return `${d} ${hh}:${h.split(":")[1]}:${h.split(":")[2]}`;
}
function parseUTC(s: string) {
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
  );
  if (!m) return NaN;
  const [, Y, Mo, D, H, Mi, S] = m;
  return Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
}

function parseBalanceLog(text: string) {
  const rows: Row[] = [];
  const lines = text
    .replace(/[\u00A0\u2000-\u200B]/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const cols = splitCols(line);
    if (cols.length < 6) continue;
    const [id, uid, asset, type, amountRaw] = cols;
    const timeCol = cols.find((c) => DATE_RE.test(c)) || "";
    const time = normalizeTime((timeCol.match(DATE_RE)?.[1]) || "");
    const ts = parseUTC(time);
    const symbol = cols[6] || "";
    const amount = Number(amountRaw);
    if (Number.isNaN(amount)) continue;
    rows.push({
      id: id || "",
      uid: uid || "",
      asset: asset || "",
      type: type || "",
      amount,
      time,
      ts,
      symbol,
      extra: cols.slice(7).join(" "),
      raw: line,
    });
  }
  return rows;
}

function sumByAsset(rows: Row[]): TotalsMap {
  const acc: TotalsMap = {};
  for (const r of rows) {
    const a = (acc[r.asset] ||= { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount;
    else a.neg += Math.abs(r.amount);
    a.net += r.amount;
  }
  return acc;
}

function groupByTypeAndAsset(rows: Row[]): TotalsByType {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.type || "(unknown)";
    (map.get(key) || map.set(key, []).get(key)!)!.push(r);
  }
  const out: TotalsByType = {};
  for (const [t, list] of map.entries()) out[t] = sumByAsset(list);
  return out;
}

function humanize(t: string) {
  return t.replace(/_/g, " ").replace(/\b([a-z])/g, (s) =>
    s.toUpperCase()
  );
}

/* --- Improved number formatter to expand scientific notation --- */
function fmtTrim(value: number) {
  if (!Number.isFinite(value)) return "0";
  let s = value.toString();

  // Expand scientific notation
  if (/e/i.test(s)) {
    s = value.toFixed(20);
  }

  // Trim trailing zeros
  if (s.includes(".")) {
    s = s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  }

  // Keep leading zero for decimals
  if (s.startsWith(".")) {
    s = "0" + s;
  }
  if (s.startsWith("-.") ) {
    s = "-0" + s.slice(1);
  }

  return s === "-0" ? "0" : s;
}

export default function App() {
  const [rawRows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  const [filters, setFilters] = useLocalStorage("bl.filters.v4", {
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
  });

  const [selectedTypes, setSelectedTypes] =
    useLocalStorage<readonly string[]>("bl.types.selected", []);
  const selectedTypeSet = useMemo(
    () => new Set(selectedTypes),
    [selectedTypes]
  );

  const [tab, setTab] = useState<TabKey>("summary");
  const [drawerOpen, setDrawerOpen] = useLocalStorage<boolean>(
    "bl.story.open",
    false
  );

  function runParse(tsv: string) {
    try {
      const rs = parseBalanceLog(tsv);
      setRows(rs);
      setError(rs.length ? "" : "No valid rows detected.");
    } catch (e: any) {
      setError(e?.message || String(e));
      setRows([]);
    }
  }

  const rowsByDateSymbol = useMemo(() => {
    const t0 = filters.t0 ? parseUTC(filters.t0) : -Infinity;
    const t1 = filters.t1 ? parseUTC(filters.t1) : Infinity;
    const sym = filters.symbol.trim().toUpperCase();
    return rawRows.filter((r) => {
      if (!(r.ts >= t0 && r.ts <= t1)) return false;
      if (sym && !(r.symbol || "").toUpperCase().includes(sym))
        return false;
      return true;
    });
  }, [rawRows, filters]);

  const detectedTypes = useMemo(() => {
    const s = new Set<string>();
    for (const r of rowsByDateSymbol) s.add(r.type || "(unknown)");
    return Array.from(s).sort();
  }, [rowsByDateSymbol]);

  const rows = useMemo(() => {
    if (selectedTypeSet.size === 0) return rowsByDateSymbol; // all on
    return rowsByDateSymbol.filter((r) =>
      selectedTypeSet.has(r.type || "(unknown)")
    );
  }, [rowsByDateSymbol, selectedTypeSet]);

  const totalsByType = useMemo(() => groupByTypeAndAsset(rows), [rows]);

  // Swaps/events (mevcut ekranlar için)
  const coinSwapLines = useMemo(
    () => groupSwaps(rows, "COIN_SWAP"),
    [rows]
  );
  const autoExLines = useMemo(
    () => groupSwaps(rows, "AUTO_EXCHANGE"),
    [rows]
  );
  const eventsOrdersByAsset = useMemo(
    () => sumByAsset(rows.filter((r) => r.type === "EVENT_CONTRACTS_ORDER")),
    [rows]
  );
  const eventsPayoutsByAsset = useMemo(
    () => sumByAsset(rows.filter((r) => r.type === "EVENT_CONTRACTS_PAYOUT")),
    [rows]
  );

  // KPI’lar
  const kpiTotal = rawRows.length;
  const kpiFiltered = rows.length;
  const kpiSymbols = new Set(
    rows.map((r) => r.symbol).filter(Boolean)
  ).size;

  // Sıralama: büyüklüğe göre
  const typeOrder = useMemo(() => {
    const entries = Object.entries(totalsByType);
    const magnitude = (m: TotalsMap) =>
      Object.values(m).reduce(
        (a, v) => a + Math.abs(v.net) + v.pos + v.neg,
        0
      );
    return entries.sort((a, b) => magnitude(b[1]) - magnitude(a[1]));
  }, [totalsByType]);

  function groupSwaps(lines: Row[], kind: "COIN_SWAP" | "AUTO_EXCHANGE") {
    const matcher =
      kind === "COIN_SWAP"
        ? (t: string) => t.includes("COIN_SWAP")
        : (t: string) => t === "AUTO_EXCHANGE";
    const filtered = lines.filter((r) => matcher(r.type));
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      const key = `${r.time}|${r.extra.split("@")[0] || ""}`;
      (map.get(key) || map.set(key, []).get(key)!)!.push(r);
    }
    const out: { time: string; ts: number; text: string }[] = [];
    for (const [, group] of map.entries()) {
      const t = group[0].time,
        ts = group[0].ts;
      const byAsset = new Map<string, number>();
      for (const g of group)
        byAsset.set(g.asset, (byAsset.get(g.asset) || 0) + g.amount);
      const outs: string[] = [],
        ins: string[] = [];
      for (const [asset, amt] of byAsset.entries()) {
        if (amt < 0) outs.push(`−${fmtTrim(Math.abs(amt))} ${asset}`);
        if (amt > 0) ins.push(`+${fmtTrim(amt)} ${asset}`);
      }
      if (outs.length === 0 && ins.length === 0) continue;
      const parts: string[] = [];
      if (outs.length) parts.push(`Out: ${outs.join(", ")}`);
      if (ins.length) parts.push(`In: ${ins.join(", ")}`);
      out.push({ time: t, ts, text: `${t} — ${parts.join("  →  ")}` });
    }
    out.sort((a, b) => a.ts - b.ts);
    return out;
  }

  const selectAllTypes = () => setSelectedTypes([]); // empty = all on

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="title">Balance Log Analyzer</h1>
          <div className="subtitle">
            Narrative & Audit • All dynamic TYPEs • Full precision
          </div>
        </div>
        <div className="toolbar">
          <button
            className="btn btn-dark"
            onClick={() => setDrawerOpen(true)}
          >
            Open Balance Story
          </button>
        </div>
      </header>

      <FilterBar rows={rows} />

      <TypeFilter
        types={detectedTypes}
        selected={new Set(selectedTypes)}
        onChange={(next) => setSelectedTypes(Array.from(next))}
        onSelectAll={selectAllTypes}
        onClear={() => setSelectedTypes(detectedTypes)}
        counts={rowsByDateSymbol.reduce(
          (acc: Record<string, number>, r) => {
            const k = r.type || "(unknown)";
            acc[k] = (acc[k] || 0) + 1;
            return acc;
          },
          {}
        )}
      />

      <section className="space">
        <GridPasteBox onUseTSV={runParse} onError={setError} />
        {error && (
          <div className="error" style={{ marginTop: 8 }}>{error}</div>
        )}
      </section>

      <section className="kpi-row">
        <KpiStat label="Rows (total)" value={kpiTotal} />
        <KpiStat label="Rows (filtered)" value={kpiFiltered} />
        <KpiStat label="Symbols (filtered)" value={kpiSymbols} />
      </section>

      <Tabs active={tab} onChange={setTab} />

      {tab === "summary" && (
        <section className="grid-2">
          {typeOrder.map(([typeKey, totals]) => (
            <RpnTable key={typeKey} title={humanize(typeKey)} map={totals} />
          ))}
        </section>
      )}

      {tab === "symbol" && (
        <section style={{ marginTop: 12 }}>
          <SymbolTable
            rows={rows.map((r) => ({
              symbol: r.symbol,
              asset: r.asset,
              type: r.type,
              amount: r.amount,
            }))}
          />
        </section>
      )}

      {tab === "swaps" && (
        <section style={{ marginTop: 12 }}>
          <SwapsEvents
            coinSwapLines={coinSwapLines}
            autoExLines={autoExLines}
            eventsOrdersByAsset={eventsOrdersByAsset}
            eventsPayoutsByAsset={eventsPayoutsByAsset}
          />
        </section>
      )}

      {tab === "diag" && (
        <section className="card" style={{ marginTop: 12 }}>
          <h3 className="section-title" style={{ marginBottom: 8 }}>
            Diagnostics
          </h3>
          <ul
            className="mono small"
            style={{ lineHeight: "20px", marginTop: 8 }}
          >
            <li>Rows parsed: {rawRows.length}</li>
            <li>Rows after filters: {rows.length}</li>
            <li>Unique symbols (filtered): {kpiSymbols}</li>
            <li>Types found: {Object.keys(totalsByType).length}</li>
          </ul>
        </section>
      )}

      <StoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        rows={rows}
        t0={filters.t0}
        t1={filters.t1}
      />
    </div>
  );
}
