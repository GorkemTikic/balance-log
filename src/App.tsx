// src/App.tsx
import React, { useMemo, useState, useEffect } from "react";
import GridPasteBox from "@/components/GridPasteBox";
import FilterBar, { Filters } from "@/components/FilterBar";
import StoryDrawer from "@/components/StoryDrawer";
import SwapsEvents from "@/components/SwapsEvents";
import SymbolTable from "@/components/SymbolTable"; // <-- yeni dosya
import RpnTable from "@/components/RpnTable";
import Tabs, { TabKey } from "@/components/Tabs";
import KpiStat from "@/components/KpiStat";

type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

const TYPE = {
  REALIZED_PNL: "REALIZED_PNL",
  COMMISSION: "COMMISSION",
  FUNDING_FEE: "FUNDING_FEE",
  INSURANCE_CLEAR: "INSURANCE_CLEAR",
  LIQUIDATION_FEE: "LIQUIDATION_FEE",
  TRANSFER: "TRANSFER",
  COIN_SWAP_DEPOSIT: "COIN_SWAP_DEPOSIT",
  COIN_SWAP_WITHDRAW: "COIN_SWAP_WITHDRAW",
  AUTO_EXCHANGE: "AUTO_EXCHANGE",
  EVENT_ORDER: "EVENT_CONTRACTS_ORDER",
  EVENT_PAYOUT: "EVENT_CONTRACTS_PAYOUT",
} as const;

const EVENT_PREFIX = "EVENT_CONTRACTS_";

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

function sumByAsset(rows: Row[]){
  const acc: Record<string,{pos:number;neg:number;net:number}> = {};
  for(const r of rows){
    const a = (acc[r.asset] ||= { pos:0, neg:0, net:0 });
    if(r.amount >= 0) a.pos += r.amount; else a.neg += Math.abs(r.amount);
    a.net += r.amount;
  }
  return acc;
}

function applyFilters(rows: Row[], f: Filters){
  const t0 = f.t0 ? parseUTC(f.t0) : -Infinity;
  const t1 = f.t1 ? parseUTC(f.t1) :  Infinity;
  const sym = f.symbol.trim().toUpperCase();
  const keepType = (t: string) => {
    switch(t){
      case TYPE.REALIZED_PNL: return f.show.realized;
      case TYPE.FUNDING_FEE: return f.show.funding;
      case TYPE.COMMISSION: return f.show.commission;
      case TYPE.INSURANCE_CLEAR:
      case TYPE.LIQUIDATION_FEE: return f.show.insurance;
      case TYPE.TRANSFER: return f.show.transfers;
      case TYPE.COIN_SWAP_DEPOSIT:
      case TYPE.COIN_SWAP_WITHDRAW: return f.show.coinSwaps;
      case TYPE.AUTO_EXCHANGE: return f.show.autoExchange;
      default: return t.startsWith(EVENT_PREFIX) ? f.show.events : true;
    }
  };
  return rows.filter(r => (r.ts>=t0 && r.ts<=t1) && (!sym || (r.symbol||"").toUpperCase().includes(sym)) && keepType(r.type));
}

function groupSwaps(rows: Row[], kind: "COIN_SWAP"|"AUTO_EXCHANGE"){
  const isCoin = (t:string)=> t===TYPE.COIN_SWAP_DEPOSIT || t===TYPE.COIN_SWAP_WITHDRAW;
  const filtered = rows.filter(r => kind==="COIN_SWAP" ? isCoin(r.type) : r.type===TYPE.AUTO_EXCHANGE);
  const map = new Map<string, Row[]>();
  for(const r of filtered){ const key = `${r.time}|${r.extra.split("@")[0]||""}`; (map.get(key) || map.set(key, []).get(key)!)!.push(r); }
  const lines: { time:string; ts:number; text:string }[] = [];
  for(const [,group] of map.entries()){
    const t = group[0].time, ts = group[0].ts;
    const byAsset = new Map<string, number>();
    for(const g of group) byAsset.set(g.asset, (byAsset.get(g.asset)||0)+g.amount);
    const outs:string[] = [], ins:string[] = [];
    for(const [asset, amt] of byAsset.entries()){ if(amt<0) outs.push(`−${Math.abs(amt)} ${asset}`); if(amt>0) ins.push(`+${amt} ${asset}`); }
    lines.push({ time:t, ts, text: `${t} — Out: ${outs.length?outs.join(", "):"0"} → In: ${ins.length?ins.join(", "):"0"}` });
  }
  lines.sort((a,b)=>a.ts-b.ts);
  return lines;
}

export default function App(){
  const [rawRows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [filters, setFilters] = useLocalStorage<Filters>("bl.filters.v2", {
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

  const realized   = useMemo(()=> rows.filter(r => r.type===TYPE.REALIZED_PNL), [rows]);
  const commission = useMemo(()=> rows.filter(r => r.type===TYPE.COMMISSION), [rows]);
  const funding    = useMemo(()=> rows.filter(r => r.type===TYPE.FUNDING_FEE), [rows]);
  const insurance  = useMemo(()=> rows.filter(r => r.type===TYPE.INSURANCE_CLEAR || r.type===TYPE.LIQUIDATION_FEE), [rows]);
  const transfers  = useMemo(()=> rows.filter(r => r.type===TYPE.TRANSFER), [rows]);
  const events     = useMemo(()=> rows.filter(r => r.type.startsWith("EVENT_CONTRACTS_")), [rows]);

  const realizedByAsset   = useMemo(()=> sumByAsset(realized), [realized]);
  const commissionByAsset = useMemo(()=> sumByAsset(commission), [commission]);
  const fundingByAsset    = useMemo(()=> sumByAsset(funding), [funding]);
  const insuranceByAsset  = useMemo(()=> sumByAsset(insurance), [insurance]);
  const transfersByAsset  = useMemo(()=> sumByAsset(transfers), [transfers]);

  const coinSwapLines = useMemo(()=> groupSwaps(rows, "COIN_SWAP"), [rows]);
  const autoExLines   = useMemo(()=> groupSwaps(rows, "AUTO_EXCHANGE"), [rows]);

  const eventsOrdersByAsset  = useMemo(()=> sumByAsset(events.filter(r=>r.type===TYPE.EVENT_ORDER)),  [events]);
  const eventsPayoutsByAsset = useMemo(()=> sumByAsset(events.filter(r=>r.type===TYPE.EVENT_PAYOUT)), [events]);

  // KPIs
  const kpiTotal = rawRows.length;
  const kpiFiltered = rows.length;
  const kpiSymbols = new Set(rows.map(r=>r.symbol).filter(Boolean)).size;

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="title">Balance Log Analyzer</h1>
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

      {tab === "summary" && (
        <section className="grid-2">
          <RpnTable title="Realized PnL" map={realizedByAsset} />
          <RpnTable title="Trading Fees / Commission" map={commissionByAsset} />
          <RpnTable title="Funding Fees" map={fundingByAsset} />
          <RpnTable title="Insurance / Liquidation" map={insuranceByAsset} />
          <RpnTable title="Transfers (General)" map={transfersByAsset} />
        </section>
      )}

      {tab === "symbol" && (
        <section style={{ marginTop: 12 }}>
          {/* EVENT'SİZ satırlar SymbolTable'a gider */}
          <SymbolTable rows={rows.filter(r => !r.type.startsWith("EVENT_CONTRACTS_")).map(r => ({
            symbol: r.symbol, asset: r.asset, type: r.type, amount: r.amount
          }))} />
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
          <h3 className="section-title" style={{marginBottom:8}}>Diagnostics</h3>
          <ul className="mono small" style={{ lineHeight: "20px", marginTop: 8 }}>
            <li>Rows parsed: {rawRows.length}</li>
            <li>Rows after filters: {rows.length}</li>
            <li>Unique symbols (filtered): {kpiSymbols}</li>
          </ul>
        </section>
      )}

      <StoryDrawer
        open={drawerOpen}
        onClose={()=>setDrawerOpen(false)}
        t0={storyT0}
        t1={storyT1}
        setT0={setStoryT0}
        setT1={setStoryT1}
        totals={{
          realized: realizedByAsset,
          funding: fundingByAsset,
          commission: commissionByAsset,
          insurance: insuranceByAsset,
          transfers: transfersByAsset,
          eventsO: eventsOrdersByAsset,
          eventsP: eventsPayoutsByAsset,
        }}
      />
    </div>
  );
}
