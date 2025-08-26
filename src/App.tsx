import React, { useMemo, useRef, useState, useEffect } from "react";
import PastePanel from "./components/PastePanel";
import SummaryCards from "./components/SummaryCards";
import SymbolTable from "./components/SymbolTable";
import EventsPanel from "./components/EventsPanel";
import BalanceStoryDrawer from "./components/BalanceStoryDrawer";

import { Row } from "./types";
import { TYPE } from "./constants";
import { fmtSigned } from "./utils/format";
import { parseBalanceLog } from "./utils/parsing";
import { sumByAsset, bySymbolSummary, eventsByAsset, select } from "./utils/aggregation";

type TabKey = "summary" | "symbols" | "events" | "raw";

export default function App(){
  const [active, setActive] = useState<TabKey>("summary");
  const [input, setInput] = useState("");
  const [rows, setRows]   = useState<Row[]>([]);
  const [diags, setDiags] = useState<string[]>([]);
  const [error, setError] = useState("");

  const [storyOpen, setStoryOpen] = useState(false);

  /** Parse actions */
  function runParse(text: string){
    setError("");
    try{
      const { rows: rs, diags } = parseBalanceLog(text);
      setRows(rs);
      setDiags(diags);
      setActive(rs.length ? "summary" : "raw");
    }catch(e:any){
      setRows([]); setDiags([]); setError(e?.message || String(e));
      setActive("raw");
    }
  }
  function onParse(){ runParse(input); }
  function onPasteFromClipboard(){
    // some browsers don’t allow readText without user gesture; we still try gracefully
    (navigator as any).clipboard?.readText?.()
      .then((t:string)=>{ setInput(t); setTimeout(()=>runParse(t), 0); })
      .catch(()=> alert("Clipboard read failed. Paste manually into the box, then click ‘Use & Parse’."));
  }

  // slices
  const nonEvent = useMemo(()=> rows.filter(r=> !r.type.startsWith("EVENT_")), [rows]);
  const realized = useMemo(()=> nonEvent.filter(r=> r.type===TYPE.REALIZED_PNL), [nonEvent]);
  const commission = useMemo(()=> rows.filter(r=> r.type===TYPE.COMMISSION), [rows]);
  const referral   = useMemo(()=> rows.filter(r=> r.type===TYPE.REFERRAL_KICKBACK), [rows]);
  const funding    = useMemo(()=> rows.filter(r=> r.type===TYPE.FUNDING_FEE), [rows]);
  const insurance  = useMemo(()=> rows.filter(r=> r.type===TYPE.INSURANCE_CLEAR || r.type===TYPE.LIQUIDATION_FEE), [rows]);

  const realizedByAsset   = useMemo(()=> sumByAsset(realized), [realized]);
  const commissionByAsset = useMemo(()=> sumByAsset(commission), [commission]);
  const referralByAsset   = useMemo(()=> sumByAsset(referral), [referral]);
  const fundingByAsset    = useMemo(()=> sumByAsset(funding), [funding]);
  const insuranceByAsset  = useMemo(()=> sumByAsset(insurance), [insurance]);

  const symbolBlocks = useMemo(()=> bySymbolSummary(rows), [rows]);
  const { orders: eventOrders, payouts: eventPayouts } = useMemo(()=> eventsByAsset(rows), [rows]);

  // layout: resizable split for Symbols view
  const ref = useRef<HTMLDivElement|null>(null);
  const [rightPct, setRightPct] = useState(46);
  const [drag, setDrag] = useState(false);
  useEffect(()=>{
    const onMove = (e: MouseEvent)=>{
      if(!drag || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const x = e.clientX - r.left; const cw = r.width;
      let pct = Math.round(((cw - x) / cw) * 100);
      pct = Math.min(68, Math.max(36, pct));
      setRightPct(pct);
    };
    const onUp = ()=> setDrag(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return ()=>{ window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [drag]);

  /** Empty-state banner if nothing parsed */
  const EmptyBanner = rows.length ? null : (
    <div className="panel" style={{borderColor:"#3b425c"}}>
      <div className="panel-head"><h3 style={{margin:0}}>No rows parsed yet</h3></div>
      <ol style={{marginTop:6, color:"#9db0d4"}}>
        <li>Export CSV (or copy as table) from your exchange’s balance log.</li>
        <li>Paste into the box above (TSV/CSV accepted; headers optional).</li>
        <li>Click <b>Use & Parse</b> or <b>Paste & Parse</b>.</li>
      </ol>
      {!!diags.length && (
        <>
          <div className="panel-head" style={{marginTop:8}}><strong>Diagnostics:</strong></div>
          <pre className="modal-text" style={{height:140}}>{diags.join("\n")}</pre>
        </>
      )}
    </div>
  );

  return (
    <div className="wrap">
      <header className="container header">
        <div className="brand">
          <div className="logo"></div>
          <div>
            <h1 className="h1">Balance Log Analyzer</h1>
            <div className="sub">Paste your exchange balance log • All times UTC+0</div>
          </div>
        </div>
        <div className="toolbar">
          <button className="btn success" onClick={()=>setStoryOpen(true)}>Balance Story</button>
          <a className="btn ghost" href="https://github.com/GorkemTikic/balance-log" target="_blank" rel="noreferrer">Repo</a>
        </div>
      </header>

      <main className="container">
        {/* Paste area */}
        <PastePanel
          value={input}
          onChange={setInput}
          onParse={onParse}
          onPasteFromClipboard={onPasteFromClipboard}
          error={error}
          diags={diags}
        />

        {/* KPIs */}
        <section className="panel kpi">
          <div className="panel-head"><h3 style={{margin:0}}>Overview</h3></div>
          <div className="kpi-row">
            <div className="kpi-card"><div className="kpi-title">Rows parsed</div><div className="kpi-value">{rows.length}</div></div>
            <div className="kpi-card"><div className="kpi-title">Symbols</div><div className="kpi-value">{symbolBlocks.length}</div></div>
            <div className="kpi-card"><div className="kpi-title">Events (Orders)</div><div className="kpi-value">{Object.keys(eventOrders).length}</div></div>
            <div className="kpi-card"><div className="kpi-title">Events (Payouts)</div><div className="kpi-value">{Object.keys(eventPayouts).length}</div></div>
          </div>
        </section>

        {/* Tabs */}
        <nav className="tabs">
          {(["summary","symbols","events","raw"] as TabKey[]).map(t => (
            <button key={t} className={`tab ${active===t?"active":""}`} onClick={()=>setActive(t)}>
              {t==="summary"?"Summary":t==="symbols"?"By Symbol":t==="events"?"Event Contracts":"Raw Log"}
            </button>
          ))}
        </nav>

        {/* If nothing parsed, show helpful banner */}
        {!rows.length && EmptyBanner}

        {/* SUMMARY TAB */}
        {rows.length > 0 && active==="summary" && (
          <section className="grid two">
            <SummaryCards title="Trading Fees / Commission" map={commissionByAsset}/>
            <SummaryCards title="Referral Kickback" map={referralByAsset}/>
            <SummaryCards title="Funding Fees" map={fundingByAsset}/>
            <SummaryCards title="Insurance / Liquidation" map={insuranceByAsset}/>
          </section>
        )}

        {/* SYMBOLS TAB */}
        {rows.length > 0 && active==="symbols" && (
          <section className="split" ref={ref} style={{gridTemplateColumns:`minmax(0,1fr) 12px ${rightPct}%`}}>
            <div>
              <div className="panel">
                <div className="panel-head"><h3 style={{margin:0}}>Realized PnL (by asset)</h3></div>
                <div className="kpi-row">
                  {Object.entries(sumByAsset(select(rows, TYPE.REALIZED_PNL))).map(([a,v])=>(
                    <div key={a} className="kpi-card">
                      <div className="kpi-title">{a}</div>
                      <div className={`kpi-value ${v.net>0?"good":v.net<0?"bad":"muted"}`}>{v.net===0?"0":fmtSigned(v.net)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="splitter" onMouseDown={()=>setDrag(true)} />
            <div className="rightcol">
              <SymbolTable blocks={symbolBlocks}/>
            </div>
          </section>
        )}

        {/* EVENTS TAB */}
        {rows.length > 0 && active==="events" && (
          <section>
            <EventsPanel orders={eventOrders} payouts={eventPayouts}/>
          </section>
        )}

        {/* RAW TAB */}
        {active==="raw" && (
          <section className="panel">
            <div className="panel-head">
              <h3 style={{margin:0}}>Raw Table</h3>
            </div>
            {rows.length ? (
              <div className="tablewrap">
                <table className="table mono">
                  <thead><tr>{["time","type","asset","amount","symbol","id","uid","extra"].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((r,i)=>(
                      <tr key={i}>
                        <td>{r.time}</td><td>{r.type}</td><td>{r.asset}</td>
                        <td className="num">{fmtSigned(r.amount)}</td>
                        <td>{r.symbol}</td><td>{r.id}</td><td>{r.uid}</td><td>{r.extra}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No rows. Paste your log above and click <b>Use & Parse</b>.</p>
            )}
          </section>
        )}
      </main>

      <footer>© {new Date().getFullYear()} Balance Log • UI theme “Nebula”</footer>

      <BalanceStoryDrawer
        open={storyOpen}
        onClose={()=>setStoryOpen(false)}
        realized={sumByAsset(select(rows, TYPE.REALIZED_PNL))}
        commission={sumByAsset(select(rows, TYPE.COMMISSION))}
        referral={sumByAsset(select(rows, TYPE.REFERRAL_KICKBACK))}
        funding={sumByAsset(select(rows, TYPE.FUNDING_FEE))}
        insurance={sumByAsset(select(rows, TYPE.INSURANCE_CLEAR).concat(select(rows, TYPE.LIQUIDATION_FEE)))}
      />
    </div>
  );
}
