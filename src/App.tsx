import React, { useMemo, useRef, useState } from "react";

/** --------------------------
 * Robust parsing utilities
 * -------------------------- */
const DATE_RE = /(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{1,2}:\d{2}:\d{2})/;
const SYMBOL_RE = /^[A-Z0-9]{3,}(USDT|USDC|USD|BTC|ETH|BNB|PERP)$/;

const KNOWN_TYPES = new Set([
  "REALIZED_PNL",
  "FUNDING_FEE",
  "COMMISSION",
  "INSURANCE_CLEAR",
  "LIQUIDATION_FEE",
  "TRANSFER",
  "COIN_SWAP",
  "COIN_SWAP_DEPOSIT",
  "COIN_SWAP_WITHDRAW",
  "AUTO_EXCHANGE",
  "EVENT_CONTRACTS_ORDER",
  "EVENT_CONTRACTS_PAYOUT",
]);
const SWAP_TYPES = new Set([
  "COIN_SWAP",
  "COIN_SWAP_DEPOSIT",
  "COIN_SWAP_WITHDRAW",
  "AUTO_EXCHANGE",
]);
const EVENT_PREFIX = "EVENT_CONTRACTS_";

type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string;
  symbol: string;
  extra: string;
  raw: string;
};
type ParseDiag = { line: string; reason: string };

function sanitizeLine(s: string) {
  return s.replace(/[\u00A0\u2000-\u200B]/g, " ").replace(/\s+/g, " ").trim();
}
function splitColumns(line: string) {
  if (line.includes("\t")) return line.split(/\t+/).map((t) => t.trim());
  return line.trim().split(/\s{2,}|\s\|\s/).flatMap((chunk) => chunk.split(/\s{2,}/)).filter(Boolean);
}
function firstDateIn(line: string) {
  const m = line.match(DATE_RE);
  return m ? m[1].replace(/\//g, "-") : "";
}
function toNumberLoose(token: string) {
  const cleaned = token.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
function parseBalanceLog(text: string): { rows: Row[]; diags: ParseDiag[] } {
  const rows: Row[] = [];
  const diags: ParseDiag[] = [];

  const lines = text.split(/\r?\n/).map(sanitizeLine).filter(Boolean);
  for (const line of lines) {
    const time = firstDateIn(line);
    if (!time) { diags.push({ line, reason: "No date found" }); continue; }

    let cols = splitColumns(line);
    if (cols.length < 4) cols = line.split(" ");

    let typeIdx = -1;
    for (let i = 0; i < cols.length; i++) {
      const t = cols[i].toUpperCase();
      if (KNOWN_TYPES.has(t) || t.startsWith(EVENT_PREFIX)) { typeIdx = i; break; }
    }
    if (typeIdx === -1) { diags.push({ line, reason: "No recognized TYPE token" }); continue; }
    if (typeIdx === 0 || typeIdx >= cols.length - 1) { diags.push({ line, reason: "TYPE at start/end" }); continue; }

    const type = cols[typeIdx].toUpperCase();
    const asset = (cols[typeIdx - 1] || "").toUpperCase();
    const amountToken = cols[typeIdx + 1];
    const amount = toNumberLoose(amountToken);
    if (!Number.isFinite(amount)) { diags.push({ line, reason: `Amount not numeric: "${amountToken}"` }); continue; }

    const id = cols[0] || "";
    const uid = cols[1] || "";
    let symbol = "";
    for (let i = typeIdx + 2; i < cols.length; i++) {
      const tok = cols[i].toUpperCase();
      if (SYMBOL_RE.test(tok)) { symbol = tok; break; }
    }
    const extra = cols.slice(typeIdx + 2).join(" ");
    rows.push({ id, uid, asset, type, amount, time, symbol, extra, raw: line });
  }
  return { rows, diags };
}

/** --------------------------
 * Aggregation helpers
 * -------------------------- */
function sumByAsset(rows: Row[]) {
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
  const m = new Map<string, Row[]>(); for (const r of rows) { if (!r.symbol) continue; const g = m.get(r.symbol) || []; g.push(r); m.set(r.symbol, g); }
  return m;
}
function bySymbolSummary(nonEventRows: Row[]) {
  const sym = groupBySymbol(nonEventRows); const out: any[] = [];
  for (const [symbol, rs] of sym.entries()) {
    out.push({
      symbol,
      realizedByAsset: sumByAsset(rs.filter((r) => r.type === "REALIZED_PNL")),
      fundingByAsset:  sumByAsset(rs.filter((r) => r.type === "FUNDING_FEE")),
      commByAsset:     sumByAsset(rs.filter((r) => r.type === "COMMISSION")),
      insByAsset:      sumByAsset(rs.filter((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE")),
    });
  }
  out.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return out;
}
function coinSwapGroups(rows: Row[]) {
  const swaps = rows.filter((r) => SWAP_TYPES.has(r.type));
  const map = new Map<string, Row[]>();
  for (const r of swaps) {
    const extraId = (r.extra && r.extra.split("@")[0]) || "";
    const key = `${r.time}|${extraId}`;
    const g = map.get(key) || [];
    g.push(r); map.set(key, g);
  }
  const lines: { time:string; kind:string; text:string }[] = [];
  for (const [, group] of map.entries()) {
    const t = group[0].time;
    const kind = group.some((g) => g.type === "AUTO_EXCHANGE") ? "AUTO_EXCHANGE" : "COIN_SWAP";
    const byAsset = new Map<string, number>();
    for (const g of group) byAsset.set(g.asset, (byAsset.get(g.asset) || 0) + g.amount);
    const neg = Array.from(byAsset.entries()).filter(([,a]) => a < 0).map(([as,amt]) => `${fmtSigned(amt)} ${as}`).join(", ") || "0";
    const pos = Array.from(byAsset.entries()).filter(([,a]) => a > 0).map(([as,amt]) => `${fmtSigned(amt)} ${as}`).join(", ") || "0";
    lines.push({ time: t, kind, text: `${t} (UTC+0) → ${neg} → ${pos} (${kind})` });
  }
  lines.sort((a,b)=>a.time<b.time?-1:a.time>b.time?1:0);
  return lines;
}

/** --------------------------
 * UI helpers
 * -------------------------- */
function fmtAbs(x: number, maxDp=8){ const v=Math.abs(Number(x)||0); const s=v.toFixed(maxDp); return s.replace(/\.0+$/,"").replace(/(\.[0-9]*?)0+$/,"$1"); }
function fmtSigned(x:number,maxDp=8){ const n=Number(x)||0; return `${n>=0?"+":"-"}${fmtAbs(n,maxDp)}`; }

function RpnList({map}:{map:Record<string,{pos:number;neg:number;net:number}>}) {
  const keys = Object.keys(map);
  if (!keys.length) return <p className="help">None</p>;
  return (
    <ul className="grid-2">
      {keys.map((asset)=>(
        <li key={asset} className="kv mono">
          <b>{asset}</b>
          <span>Received: +{fmtAbs(map[asset].pos)} · Paid: -{fmtAbs(map[asset].neg)} · Net: {fmtSigned(map[asset].net)}</span>
        </li>
      ))}
    </ul>
  );
}
function fmtAssetPairs(map:Record<string,{pos:number;neg:number}>) {
  const parts:string[]=[]; for (const [asset,v] of Object.entries(map)) parts.push(`+${fmtAbs(v.pos)} / -${fmtAbs(v.neg)} ${asset}`);
  return parts.length?parts.join(", "):"–";
}
function EventSummary({ rows }: { rows: Row[] }) {
  const orders = rows.filter((r)=>r.type==="EVENT_CONTRACTS_ORDER");
  const payouts= rows.filter((r)=>r.type==="EVENT_CONTRACTS_PAYOUT");
  const byOrder = sumByAsset(orders);
  const byPayout= sumByAsset(payouts);
  const assets = Array.from(new Set([...Object.keys(byOrder),...Object.keys(byPayout)])).sort();
  if (!assets.length) return <p className="help">None</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Asset</th><th>Payout (Received)</th><th>Orders (Paid)</th><th>Net</th></tr></thead>
        <tbody>
          {assets.map((a)=>{
            const p=byPayout[a]||{pos:0,neg:0,net:0};
            const o=byOrder[a]||{pos:0,neg:0,net:0};
            const net=(p.net||0)+(o.net||0);
            return <tr key={a}><td><b>{a}</b></td><td className="mono">+{fmtAbs(p.pos)}</td><td className="mono">-{fmtAbs(o.neg)}</td><td className="mono">{fmtSigned(net)}</td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}
function OtherTypesBlock({ rows }:{rows:Row[]}) {
  const byType = new Map<string, Row[]>(); rows.forEach(r=>{ const g=byType.get(r.type)||[]; g.push(r); byType.set(r.type,g); });
  const keys = Array.from(byType.keys()).sort();
  if (!keys.length) return <p className="help">None</p>;
  return (
    <div className="grid-2">
      {keys.map((t)=>{
        const map = sumByAsset(byType.get(t)!);
        return (
          <div key={t} className="card" style={{padding:'12px'}}>
            <div className="section-title" style={{marginBottom:6}}>{t}</div>
            <RpnList map={map}/>
          </div>
        );
      })}
    </div>
  );
}

/** --------------------------
 * Main React component
 * -------------------------- */
export default function App() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [diags, setDiags] = useState<ParseDiag[]>([]);
  const pasteRef = useRef<HTMLTextAreaElement|null>(null);

  const nonEvent   = useMemo(()=> onlyNonEvents(rows), [rows]);
  const events     = useMemo(()=> onlyEvents(rows), [rows]);
  const realizedNE = useMemo(()=> nonEvent.filter(r=>r.type==="REALIZED_PNL"), [nonEvent]);
  const funding    = useMemo(()=> rows.filter(r=>r.type==="FUNDING_FEE"), [rows]);
  const commission = useMemo(()=> rows.filter(r=>r.type==="COMMISSION"), [rows]);
  const insurance  = useMemo(()=> rows.filter(r=>r.type==="INSURANCE_CLEAR" || r.type==="LIQUIDATION_FEE"), [rows]);
  const transfers  = useMemo(()=> rows.filter(r=>r.type==="TRANSFER"), [rows]);
  const swaps      = useMemo(()=> coinSwapGroups(rows), [rows]);
  const otherTypes = useMemo(()=> rows.filter(r=>!KNOWN_TYPES.has(r.type) && !r.type.startsWith(EVENT_PREFIX)), [rows]);

  const realizedByAsset   = useMemo(()=> sumByAsset(realizedNE), [realizedNE]);
  const fundingByAsset    = useMemo(()=> sumByAsset(funding), [funding]);
  const commissionByAsset = useMemo(()=> sumByAsset(commission), [commission]);
  const insuranceByAsset  = useMemo(()=> sumByAsset(insurance), [insurance]);
  const transfersByAsset  = useMemo(()=> sumByAsset(transfers), [transfers]);
  const symbolBlocks      = useMemo(()=> bySymbolSummary(nonEvent), [nonEvent]);

  const onParse = () => {
    setError("");
    const { rows: rs, diags } = parseBalanceLog(input || "");
    setDiags(diags);
    if (!rs.length) { setRows([]); setError("No valid rows detected. Check Diagnostics."); return; }
    setRows(rs);
  };
  const onPasteAndParse = async () => {
    try {
      if (navigator.clipboard?.readText) { setInput(await navigator.clipboard.readText()); setTimeout(onParse,0); }
      else { pasteRef.current?.focus(); alert("Press Ctrl/⌘+V to paste, then click Parse"); }
    } catch { alert("Clipboard access denied. Paste manually, then click Parse."); pasteRef.current?.focus(); }
  };

  const sectionCopy = (text:string) => navigator.clipboard?.writeText(text).catch(()=>alert("Copy failed"));
  const copyOverall = () => {
    const lines:string[] = [];
    lines.push("FD Summary (UTC+0)", "");
    if (Object.keys(realizedByAsset).length) {
      lines.push("Realized PnL (Futures, not Events):");
      for (const [asset,v] of Object.entries(realizedByAsset)) {
        lines.push(`  Total Profit ${asset}: +${fmtAbs(v.pos)}`);
        lines.push(`  Total Loss ${asset}: -${fmtAbs(v.neg)}`);
      }
      lines.push("");
    }
    const push = (title:string, map:Record<string,{pos:number;neg:number;net:number}>)=>{
      if (!Object.keys(map).length) return;
      lines.push(title + ":");
      for (const [asset,v] of Object.entries(map)) {
        lines.push(`  Received ${asset}: +${fmtAbs(v.pos)}`);
        lines.push(`  Paid ${asset}: -${fmtAbs(v.neg)}`);
        lines.push(`  Net ${asset}: ${fmtSigned(v.net)}`);
      }
      lines.push("");
    };
    push("Trading Fees / Commission", commissionByAsset);
    push("Funding Fees", fundingByAsset);
    push("Insurance / Liquidation", insuranceByAsset);
    push("Transfers (General)", transfersByAsset);

    if (otherTypes.length) {
      const byType: Record<string, Record<string,{pos:number;neg:number;net:number}>> = {};
      for (const r of otherTypes) {
        byType[r.type] ??= {};
        const a = (byType[r.type][r.asset] ??= {pos:0,neg:0,net:0});
        if (r.amount >= 0) a.pos += r.amount; else a.neg += Math.abs(r.amount); a.net += r.amount;
      }
      lines.push("Other Types:");
      for (const t of Object.keys(byType).sort()) {
        lines.push(`  ${t}:`);
        for (const [asset,v] of Object.entries(byType[t])) {
          lines.push(`    Received ${asset}: +${fmtAbs(v.pos)}`);
          lines.push(`    Paid ${asset}: -${fmtAbs(v.neg)}`);
          lines.push(`    Net ${asset}: ${fmtSigned(v.net)}`);
        }
      }
    }
    sectionCopy(lines.join("\n"));
  };
  const copySwaps = () => {
    if (!swaps.length) return sectionCopy("Coin Swaps & Auto-Exchange: none");
    const lines=["Coin Swaps & Auto-Exchange (UTC+0)","", ...swaps.map(s=>`- ${s.text}`)];
    sectionCopy(lines.join("\n"));
  };
  const copyRaw = () => {
    if (!rows.length) return;
    const headers=["time","type","asset","amount","symbol","id","uid","extra"];
    const tsv=[headers.join("\t"), ...rows.map(r=>[r.time,r.type,r.asset,r.amount,r.symbol,r.id,r.uid,r.extra].join("\t"))].join("\n");
    sectionCopy(tsv);
  };

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <div>
          <h1 className="title">Balance Log Analyzer</h1>
          <p className="subtitle">UTC+0 · Paste your full Balance Log and click Parse. The main “Copy Summary” excludes coin swaps & auto-exchange.</p>
        </div>
        <div className="toolbar">
          <button className="btn btn-dark"   onClick={onPasteAndParse}>Paste &amp; Parse</button>
          <button className="btn btn-primary" onClick={onParse}>Parse</button>
          <button className="btn btn-ghost" onClick={()=>{ setInput(""); setRows([]); setError(""); setDiags([]); }}>Clear</button>
          <button className="btn btn-ghost" onClick={()=>setShowDiag(s=>!s)}>{showDiag? "Hide Diagnostics":"Show Diagnostics"}</button>
        </div>
      </div>

      {/* Paste box */}
      <div className="card" style={{marginBottom:14}}>
        <label className="section-title" style={{display:'block', marginBottom:8}}>Paste Balance Log Here</label>
        <textarea
          ref={pasteRef}
          placeholder="Paste the entire Balance Log page (Ctrl/⌘+A then Ctrl/⌘+C)"
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          style={{width:'100%', height:140, fontFamily:'var(--mono)', fontSize:13, padding:12, border:'1px solid var(--border)', borderRadius:10}}
        />
        {error && <p className="error" style={{marginTop:8}}>{error}</p>}
      </div>

      {/* Diagnostics */}
      {showDiag && (
        <div className="card" style={{marginBottom:14}}>
          <div className="section-head">
            <h3 className="section-title">Diagnostics</h3>
            <span className="badge">{diags.length} messages</span>
          </div>
          {diags.length ? (
            <div style={{maxHeight:220, overflow:'auto', fontFamily:'var(--mono)', fontSize:12}}>
              {diags.slice(0,200).map((d,i)=>(
                <div key={i} style={{borderBottom:'1px solid var(--border)', padding:'6px 0'}}>
                  <div style={{color:'#b91c1c'}}>• {d.reason}</div>
                  <div style={{color:'#374151'}}>{d.line}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="help">No diagnostics yet.</p>
          )}
        </div>
      )}

      {/* Summary */}
      {!!rows.length && (
        <div className="card" style={{marginBottom:16}}>
          <div className="section-head">
            <h2 className="section-title">Summary</h2>
            <div className="copy-row">
              <button className="btn btn-primary btn-small" onClick={copyOverall}>Copy Summary (no Swaps)</button>
            </div>
          </div>

          {/* Realized PnL */}
          <div className="card" style={{marginBottom:12}}>
            <div className="section-head">
              <h3 className="section-title">Realized PnL (Futures, not Events)</h3>
            </div>
            {Object.keys(realizedByAsset).length ? (
              <ul className="grid-2">
                {Object.entries(realizedByAsset).map(([asset,v])=>(
                  <li key={asset} className="kv mono">
                    <b>{asset}</b>
                    <span> Total Profit: +{fmtAbs(v.pos)} · Total Loss: -{fmtAbs(v.neg)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="help">No Realized PnL found.</p>}
          </div>

          {/* Fees & Transfers */}
          <div className="grid-2">
            <div className="card">
              <div className="section-title" style={{marginBottom:8}}>Trading Fees / Commission</div>
              <RpnList map={commissionByAsset}/>
            </div>
            <div className="card">
              <div className="section-title" style={{marginBottom:8}}>Funding Fees</div>
              <RpnList map={fundingByAsset}/>
            </div>
            <div className="card">
              <div className="section-title" style={{marginBottom:8}}>Insurance / Liquidation</div>
              <RpnList map={insuranceByAsset}/>
            </div>
            <div className="card">
              <div className="section-title" style={{marginBottom:8}}>Transfers (General)</div>
              <RpnList map={transfersByAsset}/>
            </div>
          </div>

          {/* Other Types */}
          <div className="card" style={{marginTop:12}}>
            <div className="section-title" style={{marginBottom:8}}>Other Types</div>
            <OtherTypesBlock rows={otherTypes}/>
          </div>

          {/* Coin Swaps & Auto-Exchange */}
          <div className="card" style={{marginTop:12}}>
            <div className="section-head">
              <h3 className="section-title">Coin Swaps &amp; Auto-Exchange (separate copy)</h3>
              <button className="btn btn-ghost btn-small" onClick={copySwaps}>Copy Coin Swaps</button>
            </div>
            {swaps.length ? (
              <ul style={{paddingLeft:18, margin:0}}>
                {swaps.map((s,i)=>(<li key={i} className="mono" style={{margin:'4px 0'}}>{s.text}</li>))}
              </ul>
            ) : <p className="help">None</p>}
          </div>

          {/* By Symbol */}
          <div className="card" style={{marginTop:12}}>
            <div className="section-title" style={{marginBottom:8}}>By Symbol (Futures, not Events)</div>
            {symbolBlocks.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Symbol</th><th>Realized PnL</th><th>Funding</th><th>Trading Fees</th><th>Insurance</th></tr></thead>
                  <tbody>
                    {symbolBlocks.map((b:any)=>(
                      <tr key={b.symbol}>
                        <td><b>{b.symbol}</b></td>
                        <td className="mono">{fmtAssetPairs(b.realizedByAsset)}</td>
                        <td className="mono">{fmtAssetPairs(b.fundingByAsset)}</td>
                        <td className="mono">{fmtAssetPairs(b.commByAsset)}</td>
                        <td className="mono">{fmtAssetPairs(b.insByAsset)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="help">No symbol activity.</p>}
          </div>
        </div>
      )}

      {/* Raw table (collapsed) */}
      {!!rows.length && (
        <div className="card">
          <button className="accordion-btn" onClick={()=>setShowRaw(s=>!s)}>
            {showRaw ? "▾ Hide Raw Parsed Table (Excel-like)" : "▸ Show Raw Parsed Table (Excel-like)"}
          </button>
          {showRaw && (
            <div className="accordion-body">
              <div className="toolbar" style={{marginBottom:10}}>
                <button className="btn btn-ghost btn-small" onClick={copyRaw}>Copy Table (TSV)</button>
                <a className="btn btn-ghost btn-small" href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                  ["time,type,asset,amount,symbol,id,uid,extra", ...rows.map(r=>[r.time,r.type,r.asset,r.amount,r.symbol,r.id,r.uid,r.extra].join(","))].join("\n")
                )}`} download="balance_log.csv">Download CSV</a>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>{["time","type","asset","amount","symbol","id","uid","extra"].map(h=><th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((r,i)=>(
                      <tr key={i}>
                        <td>{r.time}</td>
                        <td>{r.type}</td>
                        <td>{r.asset}</td>
                        <td className="mono">{fmtSigned(r.amount)}</td>
                        <td>{r.symbol}</td>
                        <td>{r.id}</td>
                        <td>{r.uid}</td>
                        <td>{r.extra}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="footer-note">Tip: copy/paste this table directly into Excel / Google Sheets.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
