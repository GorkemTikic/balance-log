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
import TypeFilter from "@/components/TypeFilter";

type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;
type TotalsByType = Record<string, TotalsMap>;

/** Kullanıcının verdiği açıklama sözlüğü (UI tooltips ve Story için) */
const TYPE_DESCRIPTIONS: Record<string, string> = {
  TRANSFER: "Transfer into/out of Futures USDs-M wallet",
  REALIZED_PNL: "Realized Profit or Loss",
  FUNDING_FEE: "The paid or received funding fees",
  COMMISSION: "The trading fee charged for each executed order.",
  INSURANCE_CLEAR: "Insurance fund (liquidation clearance fee).",
  WELCOME_BONUS: "Gifted amount when opening a futures account.",
  REFERRAL_KICKBACK: "Referral income from friends’ trading fees.",
  COMISSION_REBATE: "Trading fee kickback (e.g., 10% rebate).",
  CASH_COUPON: "Gift money from vouchers used.",
  COIN_SWAP_DEPOSIT: "Asset deposited to be swapped.",
  COIN_SWAP_WITHDRAW: "Asset received after the swap.",
  POSITION_LIMIT_INCREASE_FEE: "Monthly fee for increased position limit.",
  POSITION_CLAIM_TRANSFER: "Amount for received free position.",
  AUTO_EXCHANGE: "Auto-exchange to clear negative balances (multi-asset).",
  DELIVERED_SETTELMENT: "PnL from delivered delivery contracts.",
  STRATEGY_UMFUTURES_TRANSFER: "Transfer between Futures USDs-M and Grid Bot wallet.",
  FUTURES_PRESENT: "Presents sent/received from Futures USDs-M wallet.",
  EVENT_CONTRACTS_ORDER: "Asset sent to event contract.",
  EVENT_CONTRACTS_PAYOUT: "Asset received from event contract.",
  INTERNAL_COMMISSION: "Unclassified (log separately).",
  INTERNAL_TRANSFER: "Unclassified (log separately).",
  BFUSD_REWARD: "Unclassified (log separately).",
  INTERNAL_AGENT_REWARD: "Unclassified (log separately).",
  API_REBATE: "Unclassified (log separately).",
  CONTEST_REWARD: "Unclassified (log separately).",
  INTERNAL_CONTEST_REWARD: "Unclassified (log separately).",
  CROSS_COLLATERAL_TRANSFER: "Unclassified (log separately).",
  OPTIONS_PREMIUM_FEE: "Unclassified (log separately).",
  OPTIONS_SETTLE_PROFIT: "Unclassified (log separately).",
  LIEN_CLAIM: "Unclassified (log separately).",
  INTERNAL_COMMISSION_REBATE: "Unclassified (log separately).",
  FEE_RETURN: "Unclassified (log separately).",
  FUTURES_PRESENT_SPONSOR_REFUND: "Unclassified (log separately).",
};

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

/** TYPE -> asset toplamları */
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

function humanize(t: string) {
  return t.replace(/_/g, " ").replace(/\b([a-z])/g, s => s.toUpperCase());
}

export default function App(){
  const [rawRows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  // Tarih/simge filtreleri korunuyor (FilterBar)
  const [filters, setFilters] = useLocalStorage<Filters>("bl.filters.v4", {
    t0:"", t1:"", symbol:"",
    show: { realized:true, funding:true, commission:true, insurance:true, transfers:true, coinSwaps:true, autoExchange:true, events:true }
  });

  // Dinamik TYPE seçimi (boş Set = hepsi seçili kabul)
  const [selectedTypes, setSelectedTypes] = useLocalStorage<readonly string[]>("bl.types.selected", []);
  const selectedTypeSet = useMemo(() => new Set(selectedTypes), [selectedTypes]);

  const [tab, setTab] = useState<TabKey>("summary");
  const [drawerOpen, setDrawerOpen] = useLocalStorage<boolean>("bl.story.open", false);
  const [storyT0, setStoryT0] = useLocalStorage<string>("bl.story.t0", "");
  const [storyT1, setStoryT1] = useLocalStorage<string>("bl.story.t1", "");

  // Parsleme
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

  // Tarih ve sembol filtresi
  const rowsByDateSymbol = useMemo(()=>{
    const t0 = filters.t0 ? parseUTC(filters.t0) : -Infinity;
    const t1 = filters.t1 ? parseUTC(filters.t1) :  Infinity;
    const sym = filters.symbol.trim().toUpperCase();
    return rawRows.filter(r => {
      if(!(r.ts>=t0 && r.ts<=t1)) return false;
      if(sym && !(r.symbol||"").toUpperCase().includes(sym)) return false;
      return true;
    });
  }, [rawRows, filters]);

  // Mevcut veri setinde görülen TYPE’lar
  const detectedTypes = useMemo(() => {
    const s = new Set<string>();
    for(const r of rowsByDateSymbol) s.add(r.type || "(unknown)");
    return Array.from(s).sort();
  }, [rowsByDateSymbol]);

  // Yeni TYPE’lar gelirse, kullanıcı seçimi boşsa (yani varsayılan "hepsi açık"sa) dokunma.
  // Kullanıcı özel seçim yaptıysa (selectedTypes.length>0), sonradan gelen TYPE’ları otomatik eklemiyoruz.
  useEffect(() => {
    if (selectedTypes.length === 0) return; // hepsi açık modu
    // Seçili olmayan ama mevcutta olan yeni tipler için dokunmayız (kullanıcı tercihidir).
    // İstersen "auto-add" davranışı için burayı değiştiririz.
  }, [detectedTypes, selectedTypes]);

  // Type seçimine göre filtrele
  const rows = useMemo(() => {
    if (selectedTypeSet.size === 0) return rowsByDateSymbol; // hepsi açık
    return rowsByDateSymbol.filter(r => selectedTypeSet.has(r.type || "(unknown)"));
  }, [rowsByDateSymbol, selectedTypeSet]);

  // TYPE -> asset toplamları
  const totalsByType = useMemo(()=> groupByTypeAndAsset(rows), [rows]);

  // Sıralama: büyüklüğe göre
  const typeOrder = useMemo(() => {
    const entries = Object.entries(totalsByType);
    const magnitude = (m: TotalsMap) =>
      Object.values(m).reduce((a, v) => a + Math.abs(v.net) + v.pos + v.neg, 0);
    return entries.sort((a,b)=> magnitude(b[1]) - magnitude(a[1]));
  }, [totalsByType]);

  // Swaps & Events görünümü için yardımcılar (isteğe bağlı görünümler)
  const coinSwapLines = useMemo(()=> groupSwaps(rows, "COIN_SWAP"), [rows]);
  const autoExLines   = useMemo(()=> groupSwaps(rows, "AUTO_EXCHANGE"), [rows]);
  const eventsOrdersByAsset  = useMemo(()=> sumByAsset(rows.filter(r=> r.type === "EVENT_CONTRACTS_ORDER")),  [rows]);
  const eventsPayoutsByAsset = useMemo(()=> sumByAsset(rows.filter(r=> r.type === "EVENT_CONTRACTS_PAYOUT")), [rows]);

  // KPI’lar
  const kpiTotal = rawRows.length;
  const kpiFiltered = rows.length;
  const kpiSymbols = new Set(rows.map(r=>r.symbol).filter(Boolean)).size;

  // TYPE sayacı (chip’lerde göstermek için)
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rowsByDateSymbol) c[r.type || "(unknown)"] = (c[r.type || "(unknown)"] || 0) + 1;
    return c;
  }, [rowsByDateSymbol]);

  // Yardımcılar
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

  // Seçim yardımcıları
  const selectAllTypes = () => setSelectedTypes([]);          // boş = hepsi açık
  const clearTypes = () => setSelectedTypes(Array.from(detectedTypes)); // “hiçbiri” için küçük hack: hepsini seç → sonra toggle mantığı: seçili olanlar gösterilir; ancak biz yukarıda "selected boşsa hepsi açık" dediğimiz için "none" senaryosu istiyorsan burada farklı davranış gerekebilir.

  // Story’ye açıklamaları tooltip gibi dahil etmek istersen StoryDrawer içinde de kullanabiliriz.
  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="title">Balance Log Analyzer</h1>
          <div className="subtitle">All dynamic TYPEs included • Full-precision amounts</div>
        </div>
        <div className="toolbar">
          <button className="btn btn-dark" onClick={()=>setDrawerOpen(true)}>Open Balance Story</button>
        </div>
      </header>

      {/* Tarih / Sembol filtreleri */}
      <FilterBar value={filters} onChange={setFilters} onReset={() => setFilters({
        t0:"", t1:"", symbol:"",
        show: { realized:true, funding:true, commission:true, insurance:true, transfers:true, coinSwaps:true, autoExchange:true, events:true }
      })} />

      {/* Dinamik TYPE filtresi */}
      <TypeFilter
        types={detectedTypes}
        counts={typeCounts}
        selected={selectedTypeSet}
        onChange={(next) => setSelectedTypes(Array.from(next))}
        onSelectAll={selectAllTypes}
        onClear={() => setSelectedTypes(detectedTypes)}  // “None” yerine “Hiçbiri” istersen ayrıca buton ekleyebiliriz
      />

      {/* Paste box */}
      <section className="space">
        <GridPasteBox onUseTSV={runParse} onError={setError} />
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </section>

      {/* KPI Row */}
      <section className="kpi-row">
        <KpiStat label="Rows (total)" value={kpiTotal} />
        <KpiStat label="Rows (filtered)" value={kpiFiltered} />
        <KpiStat label="Symbols (filtered)" value={kpiSymbols} />
      </section>

      <Tabs active={tab} onChange={setTab} />

      {/* SUMMARY: tüm TYPE’lar kendi kartında */}
      {tab === "summary" && (
        <section className="grid-2">
          {typeOrder.map(([typeKey, totals]) => (
            <div key={typeKey} className="card" title={TYPE_DESCRIPTIONS[typeKey] || "Unclassified type"}>
              <RpnTable title={humanize(typeKey)} map={totals} />
              {TYPE_DESCRIPTIONS[typeKey] && (
                <div className="muted small" style={{ marginTop: 6 }}>
                  {TYPE_DESCRIPTIONS[typeKey]}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* BY SYMBOL */}
      {tab === "symbol" && (
        <section style={{ marginTop: 12 }}>
          <SymbolTable
            rows={rows.map(r => ({ symbol: r.symbol, asset: r.asset, type: r.type, amount: r.amount }))}
          />
        </section>
      )}

      {/* SWAPS & EVENTS (özel görünüm korunuyor) */}
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

      {/* DIAGNOSTICS */}
      {tab === "diag" && (
        <section className="card" style={{ marginTop: 12 }}>
          <h3 className="section-title" style={{marginBottom:8}}>Diagnostics</h3>
          <ul className="mono small" style={{ lineHeight: "20px", marginTop: 8 }}>
            <li>Rows parsed: {rawRows.length}</li>
            <li>Rows after filters: {rows.length}</li>
            <li>Unique symbols (filtered): {kpiSymbols}</li>
            <li>Types found: {Object.keys(totalsByType).length}</li>
            <li>Types (detected): {detectedTypes.join(", ") || "—"}</li>
          </ul>
        </section>
      )}

      {/* STORY (tüm TYPE’lar) */}
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
