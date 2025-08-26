// src/App.tsx
import React, { useMemo, useState, useEffect } from "react";
import GridPasteBox from "@/components/GridPasteBox";
import FilterBar, { Filters } from "@/components/FilterBar";
import StoryDrawer from "@/components/StoryDrawer";
import SwapsEvents from "@/components/SwapsEvents";
import SymbolTable from "@/components/SymbolTable";
import RpnTable from "@/components/RpnTable";
import Tabs, { TabKey } from "@/components/Tabs";
import KpiStat from "@/components/KpiStat";

type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;
type TotalsByType = Record<string, TotalsMap>;

function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial; }
    catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue] as const;
}

function splitCols(line: string) { return line.includes("\t") ? line.split(/\t+/) : line.trim().split(/\s{2,}|\s\|\s|\s+/); }
const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/;
function normalizeTime(s: string){ const m=s.match(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}:\d{2}:\d{2})$/); if(!m) return s; const [ , d, h]=m; const hh=h.split(":")[0].padStart(2,"0"); return `${d} ${hh}:${h.split(":")[1]}:${h.split(":")[2]}`; }
function parseUTC(s: string){ const m=s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/); if(!m) return NaN; const [,Y,Mo,D,H,Mi,S]=m; return Date.UTC(+Y,+Mo-1,+D,+H,+Mi,+S); }

function parseBalanceLog(text: string){
  const rows: Row[] = [];
  const lines = text.replace(/[\u00A0\u2000-\u200B]/g," ").split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  for(const line of lines){
    const cols = splitCols(line);
    if(cols.length < 6) continue;
    const [id, uid, asset, type, amountRaw] = cols;
    const timeCol = cols.find(c => DATE_RE.test(c)) || "";
    const time = normalizeTime((timeCol.match(DATE_RE)?.[1]) || "");
    const ts = parseUTC(time);
    const symbol = cols[6] || "";
    const amount = Number(amountRaw);
    if(Number.isNaN(amount)) continue;
    rows.push({ id:id||"", uid:uid||"", asset:asset||"", type:type||"", amount, time, ts, symbol, extra: cols.slice(7).join(" "), raw: line });
  }
  return rows;
}

function sumByAsset(rows: Row[]): TotalsMap{
  const acc: TotalsMap = {};
  for(const r of rows){
    const a = (acc[r.asset] ||= { pos:0, neg:0, net:0 });
    if(r.amount >= 0) a.pos += r.amount; else a.neg += Math.abs(r.amount);
    a.net += r.amount;
  }
  return acc;
}

/** Hangi TYPE gelirse gelsin, asset bazında toplar. */
function groupByTypeAndAsset(rows: Row[]): TotalsByType {
  const map = new Map<string, Row[]>();
  for(const r of rows){
    const key = r.type || "(unknown)";
    (map.get(key) || map.set(key, []).get(key)!)!.push(r);
  }
  const out: TotalsByType = {};
  for(const [t, list] of map.entries()) out[t] = sumByAsset(list);
  return out;
}

function applyFilters(rows: Row[], f: Filters){
  const t0 = f.t0 ? parseUTC(f.t0) : -Infinity;
  const t1 = f.t1 ? parseUTC(f.t1) :  Infinity;
  const sym = f.symbol.trim().toUpperCase();
  // Eski checkbox’ların davranışını “içeriyorsa göster” olarak yorumluyoruz.
  const enabled: string[] = [];
  if (f.show.realized)    enabled.push("REALIZED_PNL");
  if (f.show.funding)     enabled.push("FUNDING_FEE");
  if (f.show.commission)  enabled.push("COMMISSION");
  if (f.show.insurance)   enabled.push("INSURANCE_CLEAR", "LIQUIDATION_FEE");
  if (f.show.transfers)   enabled.push("TRANSFER");
  if (f.show.coinSwaps)   enabled.push("COIN_SWAP_DEPOSIT","COIN_SWAP_WITHDRAW");
  if (f.show.autoExchange)enabled.push("AUTO_EXCHANGE");
  if (f.show.events)      enabled.push("EVENT_CONTRACTS_"); // prefix

  return rows.filter(r => {
    if(!(r.ts>=t0 && r.ts<=t1)) return false;
    if(sym && !(r.symbol||"").toUpperCase().includes(sym)) return false;
    // Eğer listedeki tiplerden hiçbiriyle eşleşmiyorsa ama kullanıcı başka tiplere de bakmak istiyorsa?
    // Eski davranışı korumak için listedeki ana tiplerden en az birine match ederse geçer; events prefix kontrolü:
    const ok = enabled.length === 0
      ? true
      : enabled.some(k => k.endsWith("_") ? r.type.startsWith(k) : r.type === k);
    return ok;
  });
}

/** Metin içinde ipucu ile Coin Swap ve Auto-Exchange satırlarını grupla (eski görünüm için) */
function groupSwaps(lines: Row[], kind: "COIN_SWAP"|"AUTO_EXCHANGE"){
  const matcher = kind === "COIN_SWAP"
    ? (t:string)=> t.includes("COIN_SWAP")
    : (t:string)=> t === "AUTO_EXCHANGE";
  const filtered = lines.filter(r => matcher(r.type));
  const map = new Map<string, Row[]>();
  for(const r of filtered){ const key = `${r.time}|${r.extra.split("@")[0]||""}`; (map.get(key) || map.set(key, []).get(key)!)!.push(r); }
  const out: { time:string; ts:number; text:string }[] = [];
  for(const [,group] of map.entries()){
    const t = group[0].time, ts = group[0].ts;
    const byAsset = new Map<string, number>();
    for(const g of group) byAsset.set(g.asset, (byAsset.get(g.asset)||0)+g.amount);
    const outs:string[] = [], ins:string[] = [];
    for(const [asset, amt] of byAsset.entries()){ if(amt<0) outs.push(`−${Math.abs(amt)} ${asset}`); if(amt>0) ins.push(`+${amt} ${asset}`); }
    out.push({ time:t, ts, text: `${t} — Out: ${outs.length?outs.join(", "):"0"} → In: ${ins.length?ins.join(", "):"0"}` });
  }
  out.sort((a,b)=>a.ts-b.ts);
  return out;
}

export default function App(){
  const [rawRows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useLocalStorage<Filters>("bl.filters.v3", {
    t0:"", t1:"", symbol:"",
    show: { realized:true, funding:true, commission:true, insurance:true, transfers:true, coinSwaps:true, autoExchange:true, events:true }
  });
  const [tab, setTab] = useState<TabKey>("summary");
  const [drawerOpen, setDrawerOpen] = useLocalStorage<boolean>("bl.story.open", false);
  const [storyT0, setStoryT0] = useLocalStorage<string>("bl.story.t0", "");
  const [storyT1, setStoryT1] = useLocalStorage<string>("bl.story.t1", "");

  function runParse(tsv: string){
    try {
      const rs = parseBalanceLog(tsv);
      setRows(rs);
      setError(rs.length? "" : "No valid rows detected.");
    } catch (e:any) {
      setError(e?.message || String(e));
      setRows([]);
    }
  }

  const rows = useMemo(()=>applyFilters(rawRows, filters), [rawRows, filters]);

  // Dinamik: TYPE -> asset totals
  const totalsByType = useMemo(()=> groupByTypeAndAsset(rows), [rows]);

  // Ekrandaki eski bloklar için (ayrı görünümler)
  const coinSwapLines = useMemo(()=> groupSwaps(rows, "COIN_SWAP"), [rows]);
  const autoExLines   = useMemo(()=> groupSwaps(rows, "AUTO_EXCHANGE"), [rows]);

  // Event Orders/Payouts tablosu için; ama story/summary zaten dinamik toplamda olacak
  const eventsOrdersByAsset  = useMemo(()=> sumByAsset(rows.filter(r=> r.type === "EVENT_CONTRACTS_ORDER")),  [rows]);
  const eventsPayoutsByAsset = useMemo(()=> sumByAsset(rows.filter(r=> r.type === "EVENT_CONTRACTS_PAYOUT")), [rows]);

  // KPIs
  const kpiTotal = rawRows.length;
  const kpiFiltered = rows.length;
  const kpiSymbols = new Set(rows.map(r=>r.symbol).filter(Boolean)).size;

  // Başlıkları insanlaştır
  const human = (t: string) => t.replace(/_/g, " ").replace(/\b([a-z])/g, s => s.toUpperCase());

  // Summary kartlarını sırala: en çok mutlak net’e sahip TYPE önce
  const typeOrder = useMemo(() => {
    const entries = Object.entries(totalsByType);
    const magnitude = (m: TotalsMap) =>
      Object.values(m).reduce((a, v) => a + Math.abs(v.net) + v.pos + v.neg, 0);
    return entries.sort((a,b)=> magnitude(b[1]) - magnitude(a[1]));
  }, [totalsByType]);

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="title">Balance Log Analyzer</h1>
          <div className="subtitle">All types are included dynamically (agent-facing)</div>
        </div>
        <div className="toolbar">
          <button className="btn btn-dark" onClick={()=>setDrawerOpen(true)}>Open Balance Story</button>
        </div>
      </header>

      <FilterBar value={filters} onChange={setFilters} onReset={() => setFilters({
        t0:"", t1:"", symbol:"",
        show: { realized:true, funding:true, commission:true, insurance:true, transfers:true, coinSwaps:true, autoExchange:true, events:true }
      })} />

      <section className="space">
        <GridPasteBox onUseTSV={runParse} onError={setError} />
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </section>

      <section className="kpi-row">
        <KpiStat label="Rows (total)" value={kpiTotal} />
        <KpiStat label="Rows (filtered)" value={kpiFiltered} />
        <KpiStat label="Symbols (filtered)" value={kpiSymbols} />
      </section>

      <Tabs active={tab} onChange={setTab} />

      {/* TAB: Summary — TÜM TYPE’lar */}
      {tab === "summary" && (
        <section className="grid-2">
          {typeOrder.map(([typeKey, totals]) => (
            <RpnTable key={typeKey} title={human(typeKey)} map={totals} />
          ))}
        </section>
      )}

      {/* TAB: By Symbol — dilersen events’i de ekleyebilirim; şu an futures odaklı bırakıyorum */}
      {tab === "symbol" && (
        <section style={{ marginTop: 12 }}>
          <SymbolTable
            rows={rows
              .filter(r => !r.type.startsWith("EVENT_CONTRACTS_"))
              .map(r => ({ symbol: r.symbol, asset: r.asset, type: r.type, amount: r.amount }))}
          />
        </section>
      )}

      {/* TAB: Swaps & Events (eski özel görünümler korunuyor) */}
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

      {/* TAB: Diagnostics */}
      {tab === "diag" && (
        <section className="card" style={{ marginTop: 12 }}>
          <h3 className="section-title" style={{marginBottom:8}}>Diagnostics</h3>
          <ul className="mono small" style={{ lineHeight: "20px", marginTop: 8 }}>
            <li>Rows parsed: {rawRows.length}</li>
            <li>Rows after filters: {rows.length}</li>
            <li>Unique symbols (filtered): {kpiSymbols}</li>
            <li>Types found: {Object.keys(totalsByType).length}</li>
          </ul>
        </section>
      )}

      {/* StoryDrawer: TÜM TYPE’lar gönderiliyor */}
      <StoryDrawer
        open={drawerOpen}
        onClose={()=>setDrawerOpen(false)}
        t0={storyT0}
        t1={storyT1}
        setT0={setStoryT0}
        setT1={setStoryT1}
        totalsByType={totalsByType}
      />
    </div>
  );
}
