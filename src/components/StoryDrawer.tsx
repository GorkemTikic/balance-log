// src/components/StoryDrawer.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import { buildAudit, buildSummaryRows, type SummaryRow } from "@/lib/story";

export type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

type LocalLang = "en" | "tr" | "es" | "pt" | "vi" | "ru" | "uk" | "ar" | "zh" | "ko";

/* -------- Number formatting -------- */
function fmtTrim(value: number) {
  let s = String(value);
  // Bilimsel gösterim -> yüksek hassasiyetle ondalığa çevir
  if (/e/i.test(s)) s = value.toFixed(20);
  if (s.includes(".")) {
    s = s.replace(/(\.\d*?[1-9])0+$/,"$1").replace(/\.0+$/,"");
  }
  return s === "-0" ? "0" : s;
}
/* Near-zero display just for FINAL balances in Narrative */
function fmtFinal(amount: number) {
  return Math.abs(amount) < 1e-6 ? "0.0000" : fmtTrim(amount);
}

/* Template: "Hello {NAME}" */
function tFormat(s: string, map: Record<string, string>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => (map[k] ?? ""));
}

/* -------- Friendly labels by language -------- */
function friendlyLabel(label: string, lang: LocalLang): string {
  const L = label.toUpperCase();
  const T = TEXTS[lang];
  if (L.includes("EVENT_CONTRACTS_ORDER"))   return `${T.eventContracts} — ${T.orders}`;
  if (L.includes("EVENT_CONTRACTS_PAYOUT"))  return `${T.eventContracts} — ${T.payouts}`;
  if (L.startsWith("COIN_SWAP"))             return T.coinSwaps;
  if (L.startsWith("AUTO_EXCHANGE"))         return T.autoExchange;
  if (L.includes("REALIZED"))                return T.realizedPnl;
  if (L.includes("COMMISSION") || L.includes("TRADING_FEE")) return T.tradingFees;
  if (L.includes("FUNDING_FEE"))             return T.fundingFees;
  if (L.includes("INSURANCE"))               return T.insurance;
  if (L.includes("REFERRAL"))                return T.referralIncome;
  if (L.includes("GIFT"))                    return T.giftBonus;
  if (L.startsWith("TRANSFER") || L.includes("STRATEGY_"))   return T.transfers;
  return label;
}

/* -------- Parse final balances from Agent Audit (keeps math intact) -------- */
function parseFinalBalancesFromAudit(audit: string): { asset: string; amount: number }[] {
  const lines = audit.split(/\r?\n/);
  const startIdx = lines.findIndex(l => l.trim().toLowerCase().startsWith("final expected balances"));
  if (startIdx === -1) return [];
  const out: { asset: string; amount: number }[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/•\s*([A-Z0-9_]+)\s+(-?\d+(?:\.\d+)?(?:e[+\-]?\d+)?)/i);
    if (!m) continue;
    out.push({ asset: m[1].toUpperCase(), amount: Number(m[2]) });
  }
  return out;
}

/* -------- Narrative composer (display only; no math changes) -------- */
function composeNarrative(opts: {
  lang: LocalLang;
  startStr?: string;
  baselineMap?: Record<string, number> | undefined;
  transferAtStart?: { asset: string; amount: number } | undefined;
  groups: Record<string, Record<string, { in: number; out: number }>>;
  finalFromAudit: { asset: string; amount: number }[];
}) {
  const { lang, startStr, baselineMap, transferAtStart, groups, finalFromAudit } = opts;
  const T = TEXTS[lang];
  const lines: string[] = [];

  // Header
  lines.push(T.timesNote);
  lines.push("");

  // Initial balances line (varsa tüm varlıkları listele)
  if (baselineMap && Object.keys(baselineMap).length) {
    const items = Object.keys(baselineMap).sort().map(a => `${a} ${fmtTrim(baselineMap[a])}`);
    lines.push(`${T.initialBalancesIntro} ${items.join("  •  ")}`);
  }

  // Start line
  if (startStr && transferAtStart) {
    const pretty = `${startStr} UTC+0`;
    const amtStr = fmtTrim(transferAtStart.amount);
    const before = baselineMap?.[transferAtStart.asset];
    const after  = typeof before === "number" ? before + transferAtStart.amount : undefined;
    const transferLine = transferAtStart.amount >= 0
      ? tFormat(T.transferSentenceTo, { AMOUNT: amtStr, ASSET: transferAtStart.asset })
      : tFormat(T.transferSentenceFrom, { AMOUNT: amtStr, ASSET: transferAtStart.asset });
    let line = `${pretty} - ${transferLine}`;
    if (typeof before === "number" && typeof after === "number") {
      line += " " + tFormat(T.changedFromTo, {
        BEFORE: fmtTrim(before), AFTER: fmtTrim(after), ASSET: transferAtStart.asset,
      });
    } else {
      line += " " + T.balanceChanged;
    }
    lines.push("");
    lines.push(line);
  } else if (startStr) {
    lines.push("");
    lines.push(`${startStr} UTC+0 - ${T.startLineNoTransfer}`);
  }
  lines.push("");

  // Group order — Commissions directly after Realized PnL
  const orderHint = [
    T.realizedPnl, T.tradingFees, T.fundingFees, T.insurance, T.referralIncome, T.giftBonus,
    `${T.eventContracts} — ${T.orders}`, `${T.eventContracts} — ${T.payouts}`,
    T.transfers, T.coinSwaps, T.autoExchange
  ];
  const groupNames = Object.keys(groups).sort((a,b)=>{
    const ia = orderHint.indexOf(a), ib = orderHint.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  lines.push(T.afterStart);
  lines.push("");

  // Groups
  for (const g of groupNames) {
    const byAsset = groups[g];
    const isSwap = (g === T.coinSwaps || g === T.autoExchange);
    const isFunding = (g === T.fundingFees);

    lines.push(g);

    const assets = Object.keys(byAsset).sort();

    if (isSwap) {
      // Only swaps/auto-exchange show explicit In/Out buckets
      const outs: string[] = [];
      const ins : string[] = [];
      for (const a of assets) {
        const e = byAsset[a];
        if (e.out > 0) outs.push(`${a} -${fmtTrim(e.out)}`);
        if (e.in  > 0) ins .push(`${a} +${fmtTrim(e.in)}`);
      }
      if (outs.length) lines.push(`  • ${T.out}:  ${outs.join(", ")}`);
      if (ins.length)  lines.push(`  • ${T["in"]}:   ${ins.join(", ")}`);
    } else if (isFunding) {
      // Funding Fees: split into Received (+) and Paid (-)
      const received: string[] = [];
      const paid: string[] = [];
      for (const a of assets) {
        const e = byAsset[a];
        if (e.in  > 0) received.push(`${a} +${fmtTrim(e.in)}`);
        if (e.out > 0) paid.push(`${a} -${fmtTrim(e.out)}`);
      }
      if (received.length) lines.push(`  • ${T.fundingFeesReceived}: ${received.join(", ")}`);
      if (paid.length)     lines.push(`  • ${T.fundingFeesPaid}: ${paid.join(", ")}`);
    } else {
      // Others: no "In/Out" words — just signed amounts per asset
      for (const a of assets) {
        const e = byAsset[a];
        const parts: string[] = [];
        if (e.in  !== 0) parts.push(`+${fmtTrim(e.in)}`);
        if (e.out !== 0) parts.push(`-${fmtTrim(e.out)}`);
        if (parts.length) lines.push(`  • ${a}: ${parts.join(", ")}`);
      }
    }
    lines.push("");
  }

  // Final balances — mirror Agent Audit; show near-zero as 0.0000
  lines.push("—");
  if (finalFromAudit.length > 0) {
    lines.push(T.finalIntro);
    for (const f of finalFromAudit) {
      lines.push(`  • ${f.asset} ${fmtFinal(f.amount)}`);
    }
  }

  return lines.join("\n");
}

export default function StoryDrawer({
  open, onClose, rows,
}: { open: boolean; onClose: () => void; rows: Row[]; }) {
  const [tab, setTab] = useState<"narrative" | "audit" | "charts" | "raw">("narrative");

  // Inputs
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [baselineText, setBaselineText] = useState<string>("");
  const [trAmount, setTrAmount] = useState<string>("");
  const [trAsset, setTrAsset] = useState<string>("");
  const [lang, setLang] = useState<LocalLang>("en");

  /* ---- Parsers ---- */
  function parseUTC(s: string): number | undefined {
    const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return undefined;
    const [, Y, Mo, D, H, Mi, S] = m;
    return Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
  }
  function parseBaseline(s: string): { map?: Record<string, number>; error?: string } {
    const out: Record<string, number> = {};
    const lines = s.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    if (!lines.length) return { map: undefined };

    // Accept "ASSET amount" or "amount ASSET"; amount may be decimal or scientific (e.g., 5.4e-7)
    const AMT = "(-?\\d+(?:\\.\\d+)?(?:e[+\\-]?\\d+)?)";
    const PAT1 = new RegExp(`^([A-Z0-9_]+)\\s+${AMT}$`, "i");
    const PAT2 = new RegExp(`^${AMT}\\s+([A-Z0-9_]+)$`, "i");

    for (const line of lines) {
      let m = line.match(PAT1);
      if (m) { out[m[1].toUpperCase()] = (out[m[1].toUpperCase()] || 0) + Number(m[2]); continue; }
      m = line.match(PAT2);
      if (m) { out[m[2].toUpperCase()] = (out[m[2].toUpperCase()] || 0) + Number(m[1]); continue; }
      return { error: `Could not parse: "${line}"` };
    }
    return { map: out };
  }
  function parseTransfer(amountStr: string, assetStr: string) {
    const amount = Number((amountStr || "").trim());
    const asset  = (assetStr  || "").trim().toUpperCase();
    if (!asset || !Number.isFinite(amount)) return undefined;
    return { asset, amount };
  }

  const baselineParsed = useMemo(()=>parseBaseline(baselineText),[baselineText]);
  const transferParsed = useMemo(()=>parseTransfer(trAmount, trAsset),[trAmount,trAsset]);

  const startISO = useMemo(()=>{
    const ts = start ? parseUTC(start) : undefined;
    if (!ts) return undefined;
    return new Date(ts).toISOString().replace("T"," ").replace("Z","");
  },[start]);

  /* ---- Summary table ---- */
  const summaryRows: SummaryRow[] = useMemo(()=>buildSummaryRows(rows),[rows]);

  /* ---- Agent Audit (math unchanged) ---- */
  const auditText = useMemo(()=>{
    const anchorTs = start ? parseUTC(start) : undefined;
    if (!anchorTs) return "Set a Start time (UTC+0) to run the audit.";
    const endTs = end ? parseUTC(end) : undefined;
    try {
      return buildAudit(rows, { anchorTs, endTs, baseline: baselineParsed.map, anchorTransfer: transferParsed });
    } catch (e: any) {
      return "Audit failed: " + (e?.message || String(e));
    }
  },[start, end, rows, baselineParsed.map, transferParsed]);

  /* ---- Groups for Narrative ---- */
  const groups = useMemo(()=>{
    const G: Record<string, Record<string, {in:number; out:number}>> = {};
    for (const r of summaryRows) {
      const label = friendlyLabel(r.label, lang);
      const asset = r.asset.toUpperCase();
      const g = (G[label] = G[label] || {});
      const e = (g[asset] = g[asset] || { in: 0, out: 0 });
      e.in  += r.in  || 0;
      e.out += r.out || 0;
    }
    // Not rounding here; display-time trimming handles it.
    return G;
  },[summaryRows, lang]);

  /* ---- Final balances from Agent Audit (exact mirror) ---- */
  const finalFromAudit = useMemo(()=>parseFinalBalancesFromAudit(auditText),[auditText]);

  /* ---- Narrative text ---- */
  const friendlyText = useMemo(()=>composeNarrative({
    lang,
    startStr: startISO,
    baselineMap: baselineParsed.map,
    transferAtStart: transferParsed,
    groups,
    finalFromAudit,
  }),[lang, startISO, baselineParsed.map, transferParsed, groups, finalFromAudit]);

  /* ---- Copy & Export ---- */
  async function copyStory() {
    try { await navigator.clipboard.writeText(friendlyText); alert("Copied to clipboard."); }
    catch { alert("Copy failed (clipboard is blocked)."); }
  }
  async function exportSummaryPng() {
    try {
      const el = document.getElementById("story-summary-table");
      if (!el) throw new Error("Summary table not found");
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(el as HTMLElement, { backgroundColor: "#ffffff", scale: 2 });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url; a.download = "balance-story-summary.png"; a.click();
    } catch (err: any) {
      alert("Export failed: " + (err?.message || String(err)));
    }
  }

  /* ---- Tiny charts (unchanged) ---- */
  const dailySeries = useMemo(()=>buildDailyNet(rows),[rows]);
  const assetNets  = useMemo(()=>buildAssetNet(rows),[rows]);

  if (!open) return null;
  const T = TEXTS[lang];

  return (
    <div aria-modal role="dialog" onClick={onClose}
      style={{ position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,0.25)", display:"flex", justifyContent:"flex-end" }}>
      <div onClick={(e)=>e.stopPropagation()} className="card"
        style={{ width:"min(980px, 100%)", height:"100%", margin:0, borderRadius:0, overflow:"auto", background:"#fff", boxShadow:"0 10px 30px rgba(0,0,0,.25)" }}>

        {/* Header */}
        <div className="section-head" style={{ position:"sticky", top:0, background:"#fff", zIndex:1, alignItems:"center", flexWrap:"wrap", gap:8 }}>
          <h3 className="section-title">{T.title}</h3>
          <div className="btn-row" style={{ gap:8, flexWrap:"wrap" }}>
            {tab === "narrative" && <button className="btn" onClick={copyStory}>{T.copyStory}</button>}
            {tab === "audit" && <button className="btn" onClick={async()=>{
              try { await navigator.clipboard.writeText(auditText); alert("Copied to clipboard."); }
              catch { alert("Copy failed (clipboard is blocked)."); }
            }}>{T.copyAudit}</button>}
            <select className="btn" value={lang} onChange={(e)=>setLang(e.target.value as LocalLang)} title={T.lang}>
              <option value="en">English</option><option value="tr">Türkçe</option>
              <option value="es">Español</option><option value="pt">Português</option>
              <option value="vi">Tiếng Việt</option><option value="ru">Русский</option>
              <option value="uk">Українська</option><option value="ar">العربية</option>
              <option value="zh">中文</option><option value="ko">한국어</option>
            </select>
            <button className="btn" onClick={onClose}>{T.close}</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="card" style={{ marginTop:8 }}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button className="btn" onClick={()=>setTab("narrative")}
              style={{ background: tab==="narrative" ? "#111827" : "#fff", color: tab==="narrative" ? "#fff" : undefined }}>{T.tabNarrative}</button>
            <button className="btn" onClick={()=>setTab("audit")}
              style={{ background: tab==="audit" ? "#111827" : "#fff", color: tab==="audit" ? "#fff" : undefined }}>{T.tabAudit}</button>
            <button className="btn" onClick={()=>setTab("charts")}
              style={{ background: tab==="charts" ? "#111827" : "#fff", color: tab==="charts" ? "#fff" : undefined }}>{T.tabCharts}</button>
            <button className="btn" onClick={()=>setTab("raw")}
              style={{ background: tab==="raw" ? "#111827" : "#fff", color: tab==="raw" ? "#fff" : undefined }}>{T.tabRaw}</button>
          </div>
        </div>

        {/* Narrative */}
        {tab === "narrative" && (
          <div className="card" style={{ marginTop:8 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:10, alignItems:"start" }}>
              <label className="muted" style={{ minWidth:0 }}>
                {T.startTime}
                <input className="btn" style={inputStyle} value={start} onChange={(e)=>setStart(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" />
              </label>
              <label className="muted" style={{ minWidth:0 }}>
                {T.baseline}
                <textarea className="btn" style={{ ...inputStyle, minHeight:64, fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize:12 }}
                  placeholder={`One per line:\nUSDT 3450.12345678\n0.015 BTC`} value={baselineText} onChange={(e)=>setBaselineText(e.target.value)} />
              </label>
              <div style={{ minWidth:0 }}>
                <div className="muted">{T.transferAtStart}</div>
                <div style={{ display:"grid", gridTemplateColumns:"minmax(140px,1fr) minmax(110px,1fr)", gap:8, marginTop:6 }}>
                  <input className="btn" style={inputStyle} placeholder={T.amount} value={trAmount} onChange={(e)=>setTrAmount(e.target.value)} />
                  <input className="btn" style={inputStyle} placeholder={T.asset} value={trAsset} onChange={(e)=>setTrAsset(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop:10 }}>
              <h4 className="section-title" style={{ marginBottom:8 }}>{T.narrative}</h4>
              <pre className="mono" style={{ whiteSpace:"pre-wrap", fontSize:13, lineHeight:"20px", background:"#f7f7f9", padding:12, borderRadius:8 }}>
                {friendlyText}
              </pre>
            </div>

            {/* Summary table */}
            <div className="card" style={{ marginTop:10 }}>
              <div className="section-head" style={{ alignItems:"center", flexWrap:"wrap", gap:8 }}>
                <h4 className="section-title">{T.summaryByTypeAsset}</h4>
                <div className="btn-row"><button className="btn" onClick={exportSummaryPng}>{T.exportPng}</button></div>
              </div>
              <div id="story-summary-table" style={{ overflow:"auto", border:"1px solid #e5e7eb", borderRadius:8 }}>
                <table style={{ borderCollapse:"separate", borderSpacing:0, width:"100%", minWidth:760 }}>
                  <thead style={{ background:"#f3f4f6" }}>
                    <tr>
                      <th style={thStyleLeft}>Type</th>
                      <th style={thStyle}>Asset</th>
                      <th style={thStyle}>{TEXTS[lang]["in"]}</th>
                      <th style={thStyle}>{TEXTS[lang].out}</th>
                      <th style={thStyleRight}>{TEXTS[lang].net}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.length === 0 && (
                      <tr><td colSpan={5} style={{ padding:"12px 14px", textAlign:"center", color:"#6b7280" }}>{T.noData}</td></tr>
                    )}
                    {summaryRows.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 ? "#fff" : "#fbfbfd" }}>
                        <td style={tdStyleLeft}>{friendlyLabel(r.label, lang)}</td>
                        <td style={tdStyleMono}><span style={{ marginRight:6 }}>{assetIcon(r.asset)}</span>{r.asset}</td>
                        <td style={{ ...tdStyleMono, color: r.in !== 0 ? "#047857" : "#6b7280" }}>{r.in !== 0 ? `+${fmtTrim(r.in)}` : "—"}</td>
                        <td style={{ ...tdStyleMono, color: r.out !== 0 ? "#b91c1c" : "#6b7280" }}>{r.out !== 0 ? `-${fmtTrim(r.out)}` : "—"}</td>
                        <td style={{ ...tdStyleMonoBold, color: r.net === 0 ? "#6b7280" : (r.net > 0 ? "#047857" : "#b91c1c") }}>
                          {r.net === 0 ? "0" : `${r.net > 0 ? "+" : ""}${fmtTrim(r.net)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Agent Audit */}
        {tab === "audit" && (
          <div className="card" style={{ marginTop:8 }}>
            <h4 className="section-title" style={{ marginBottom:8 }}>{T.agentAudit}</h4>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px,1fr))", gap:10, alignItems:"start" }}>
              <label className="muted" style={{ minWidth:0 }}>
                {T.startTime}
                <input className="btn" style={inputStyle} value={start} onChange={(e)=>setStart(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" />
              </label>
              <label className="muted" style={{ minWidth:0 }}>
                {T.endTime}
                <input className="btn" style={inputStyle} value={end} onChange={(e)=>setEnd(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" />
              </label>
            </div>

            <div style={{ marginTop:10, display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <label className="muted" style={{ minWidth:0 }}>
                {T.baseline}
                <textarea className="btn" style={{ ...inputStyle, minHeight:120, fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize:12 }}
                  placeholder={`One per line:\nUSDT 3450.12345678\n0.015 BTC`} value={baselineText} onChange={(e)=>setBaselineText(e.target.value)} />
              </label>
              <div style={{ minWidth:0 }}>
                <div className="muted">{T.transferAtStart}</div>
                <div style={{ display:"grid", gridTemplateColumns:"minmax(140px,1fr) minmax(110px,1fr)", gap:8, marginTop:6 }}>
                  <input className="btn" style={inputStyle} placeholder={T.amount} value={trAmount} onChange={(e)=>setTrAmount(e.target.value)} />
                  <input className="btn" style={inputStyle} placeholder={T.asset} value={trAsset} onChange={(e)=>setTrAsset(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop:10 }}>
              <h4 className="section-title" style={{ marginBottom:8 }}>{T.preview}</h4>
              <pre className="mono" style={{ whiteSpace:"pre-wrap", fontSize:13, lineHeight:"20px", background:"#f7f7f9", padding:12, borderRadius:8, maxHeight:480, overflow:"auto" }}>
                {auditText}
              </pre>
            </div>
          </div>
        )}

        {/* Charts */}
        {tab === "charts" && (
          <div className="card" style={{ marginTop:8 }}>
            <h4 className="section-title" style={{ marginBottom:8 }}>{T.charts}</h4>
            <div className="card" style={{ marginTop:8 }}>
              <div className="section-head" style={{ alignItems:"center" }}>
                <h4 className="section-title">{T.dailyNetAll}</h4>
              </div>
              <ChartLine data={dailySeries} height={240} />
            </div>
            <div className="card" style={{ marginTop:8 }}>
              <div className="section-head" style={{ alignItems:"center" }}>
                <h4 className="section-title">{T.netByAsset}</h4>
              </div>
              <ChartBars data={assetNets} height={280} />
            </div>
          </div>
        )}

        {/* Raw */}
        {tab === "raw" && (
          <div className="card" style={{ marginTop:8 }}>
            <h4 className="section-title" style={{ marginBottom:8 }}>Raw</h4>
            <pre className="mono" style={{ whiteSpace:"pre-wrap", fontSize:12, lineHeight:"18px", background:"#f7f7f9", padding:12, borderRadius:8, maxHeight:560, overflow:"auto" }}>
              {rawPreview}
            </pre>
          </div>
        )}

      </div>
    </div>
  );
}

/* ---------------- Raw tab note ---------------- */
const rawPreview = "Diagnostics tab shows internal totals. Use Agent Audit for balance math and Narrative for user-facing text.";

/* ---------------- Styles ---------------- */
const cellBase: React.CSSProperties = { padding:"10px 12px", borderTop:"1px solid #e5e7eb", verticalAlign:"top", fontSize:13 };
const thBase:  React.CSSProperties = { ...cellBase, fontWeight:600, color:"#111827", borderTop:"none", textAlign:"left" };
const tdBase:  React.CSSProperties = { ...cellBase, color:"#111827" };
const thStyleLeft:  React.CSSProperties = { ...thBase, borderTopLeftRadius:8 };
const thStyle:      React.CSSProperties = { ...thBase };
const thStyleRight: React.CSSProperties = { ...thBase, borderTopRightRadius:8 };
const tdStyleLeft:  React.CSSProperties = { ...tdBase, fontWeight:500 };
const tdStyleMono:  React.CSSProperties = { ...tdBase, fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };
const tdStyleMonoBold: React.CSSProperties = { ...tdStyleMono, fontWeight:700 };
const inputStyle: React.CSSProperties = { width:"100%", boxSizing:"border-box", textAlign:"left", marginTop:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" };

/* ---------------- Tiny charts (unchanged) ---------------- */
type LinePoint = { label: string; value: number };
type BarDatum  = { asset: string; net: number };

function buildDailyNet(rows: Row[]): LinePoint[] {
  if (!rows?.length) return [];
  const map = new Map<string, number>();
  for (const r of rows) { const d = r.time.split(" ")[0]; map.set(d, (map.get(d) || 0) + r.amount); }
  const arr = Array.from(map.entries()).sort(([a],[b]) => (a < b ? -1 : 1));
  let cum = 0;
  return arr.map(([d, v]) => { cum += v; return { label: d, value: cum }; });
}
function buildAssetNet(rows: Row[]): BarDatum[] {
  if (!rows?.length) return [];
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.asset, (map.get(r.asset) || 0) + r.amount);
  const arr = Array.from(map.entries()).map(([asset, net]) => ({ asset, net }));
  arr.sort((a,b)=>Math.abs(b.net) - Math.abs(a.net));
  return arr.slice(0, 12);
}
function ChartLine({ data, height = 240 }: { data: LinePoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    const obs = new ResizeObserver(()=>{ if (ref.current) setW(Math.max(560, ref.current.clientWidth - 24)); });
    if (ref.current) obs.observe(ref.current); return () => obs.disconnect();
  }, []);
  const pad = { t: 12, r: 12, b: 28, l: 44 };
  const width = w, h = height;
  const innerW = width - pad.l - pad.r, innerH = h - pad.t - pad.b;

  if (!data.length) return <div ref={ref} style={{ padding:12, color:"#6b7280" }}>No data</div>;

  const minY = Math.min(0, Math.min(...data.map(d=>d.value)));
  const maxY = Math.max(0, Math.max(...data.map(d=>d.value)));
  const yScale = (v:number)=> pad.t + (maxY===minY ? innerH/2 : innerH - ((v - minY)/(maxY - minY))*innerH);
  const xScale = (i:number)=> pad.l + (data.length===1 ? innerW/2 : (i/(data.length-1))*innerW);

  const path = data.map((d,i)=>`${i===0?"M":"L"} ${xScale(i)} ${yScale(d.value)}`).join(" ");
  const zeroY = yScale(0);

  return (
    <div ref={ref} style={{ overflow:"hidden" }}>
      <svg width={width} height={h}>
        <line x1={pad.l} y1={zeroY} x2={width - pad.r} y2={zeroY} stroke="#e5e7eb" />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={h - pad.b} stroke="#e5e7eb" />
        <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} />
        {data.map((d,i)=>(<circle key={i} cx={xScale(i)} cy={yScale(d.value)} r={2.5} fill="#2563eb" />))}
        {data.map((d,i)=>(i % Math.ceil(data.length/6) === 0) && (
          <text key={"x"+i} x={xScale(i)} y={h - 8} textAnchor="middle" fontSize="11" fill="#6b7280">{d.label.slice(5)}</text>
        ))}
        {[minY, (minY+maxY)/2, maxY].map((val,i)=>(
          <g key={"y"+i}>
            <text x={8} y={yScale(val)+4} fontSize="11" fill="#6b7280">{fmtTrim(val)}</text>
            <line x1={pad.l-4} y1={yScale(val)} x2={pad.l} y2={yScale(val)} stroke="#9ca3af" />
          </g>
        ))}
      </svg>
    </div>
  );
}
function ChartBars({ data, height = 280 }: { data: { asset: string; net: number }[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    const obs = new ResizeObserver(()=>{ if (ref.current) setW(Math.max(560, ref.current.clientWidth - 24)); });
    if (ref.current) obs.observe(ref.current); return () => obs.disconnect();
  }, []);
  if (!data.length) return <div ref={ref} style={{ padding:12, color:"#6b7280" }}>No data</div>;

  const width = w, pad = { t:12, r:12, b:28, l:56 };
  const innerW = width - pad.l - pad.r, innerH = height - pad.t - pad.b;
  const maxAbs = Math.max(...data.map(d=>Math.abs(d.net))) || 1;
  const barW = innerW / data.length - 8;

  return (
    <div ref={ref} style={{ overflow:"hidden" }}>
      <svg width={width} height={height}>
        <line x1={pad.l} y1={pad.t + innerH/2} x2={width - pad.r} y2={pad.t + innerH/2} stroke="#e5e7eb" />
        {data.map((d,i)=>{
          const x = pad.l + i*(innerW/data.length) + 4;
          const h = Math.max(1, Math.abs(d.net)/maxAbs*(innerH/2));
          const y = d.net >= 0 ? pad.t + innerH/2 - h : pad.t + innerH/2;
          const fill = d.net >= 0 ? "#047857" : "#b91c1c";
          return (
            <g key={d.asset}>
              <rect x={x} y={y} width={barW} height={h} fill={fill} rx={3} />
              <text x={x + barW/2} y={pad.t + innerH + 14} textAnchor="middle" fontSize="11" fill="#374151">{d.asset}</text>
            </g>
          );
        })}
        {[maxAbs, 0, -maxAbs].map((v, idx)=>(
          <text key={idx} x={8} y={pad.t + innerH/2 - (v/maxAbs)*(innerH/2) + 4} fontSize="11" fill="#6b7280">
            {fmtTrim(v)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ---------------- Icons ---------------- */
function assetIcon(asset: string) {
  const a = asset.toUpperCase();
  if (a === "BTC") return "🟧";
  if (a === "ETH") return "⚪";
  if (a === "BNB") return "🟡";
  if (a === "USDT") return "🟩";
  if (a === "USDC") return "🔵";
  if (a === "BFUSD") return "🟦";
  if (a === "FDUSD") return "🟪";
  if (a === "LDUSDT") return "🟩";
  if (a === "BNFCR") return "🟠";
  return "◼️";
}

/* ---------------- UI texts (10 languages) ---------------- */
const TEXTS_EN = {
  title: "Balance Story (UTC+0)",
  lang: "Language",
  copyStory: "Copy Story",
  copyAudit: "Copy Audit",
  close: "Close",
  tabNarrative: "Narrative",
  tabAudit: "Agent Audit",
  tabCharts: "Charts",
  tabRaw: "Raw",
  startTime: "Start time (UTC+0)",
  endTime: "End time (UTC+0, optional)",
  baseline: "Initial balances (optional)",
  transferAtStart: "Transfer amount at start (optional)",
  amount: "Amount",
  asset: "Asset",
  narrative: "Narrative",
  summaryByTypeAsset: "Summary (by Type & Asset)",
  exportPng: "Export Summary PNG",
  agentAudit: "Agent Audit",
  preview: "Preview",
  charts: "Charts",
  dailyNetAll: "Daily Net Change (All assets)",
  netByAsset: "Net by Asset (Top 12)",
  noData: "No data",

  timesNote: "All dates and times are UTC+0. Please adjust for your time zone.",
  startLineNoTransfer: "At this date and time, your analysis starts.",
  transferSentenceTo:   "At this date and time, you transferred {AMOUNT} {ASSET} to your Futures USDⓈ-M wallet.",
  transferSentenceFrom: "At this date and time, you transferred {AMOUNT} {ASSET} from your Futures USDⓈ-M wallet.",
  changedFromTo: "After this transfer your balance changed from {BEFORE} {ASSET} to {AFTER} {ASSET}.",
  balanceChanged: "After this transfer your balance changed.",
  afterStart: "After the start, here is what changed:",
  finalIntro: "Based on all the changes in your transaction history, the leftover balance in your Futures USDⓈ-M wallet will be:",
  initialBalancesIntro: "Initial balances before the transfer:",

  eventContracts: "Event Contracts",
  orders: "Orders",
  payouts: "Payouts",
  coinSwaps: "Coin Swaps (totals)",
  autoExchange: "Auto-Exchange (totals)",
  realizedPnl: "Realized PnL",
  tradingFees: "Commissions",
  fundingFees: "Funding Fees",
  fundingFeesReceived: "Funding Fees Received",
  fundingFeesPaid: "Funding Fees Paid",
  insurance: "Insurance / Liquidation",
  referralIncome: "Referral Income",
  giftBonus: "Gift / Bonus",
  transfers: "Transfers",
  in: "In",
  out: "Out",
  net: "Net",
};

const TEXTS_TR = {
  title: "Balance Story (UTC+0)",
  lang: "Dil",
  copyStory: "Hikâyeyi Kopyala",
  copyAudit: "Audit'i Kopyala",
  close: "Kapat",
  tabNarrative: "Narrative",
  tabAudit: "Agent Audit",
  tabCharts: "Grafikler",
  tabRaw: "Ham",
  startTime: "Başlangıç zamanı (UTC+0)",
  endTime: "Bitiş zamanı (UTC+0, opsiyonel)",
  baseline: "Başlangıç bakiyeleri (opsiyonel)",
  transferAtStart: "Başlangıçtaki transfer tutarı (opsiyonel)",
  amount: "Miktar",
  asset: "Varlık",
  narrative: "Narrative",
  summaryByTypeAsset: "Özet (Tür & Varlık)",
  exportPng: "Özeti PNG Olarak İndir",
  agentAudit: "Agent Audit",
  preview: "Önizleme",
  charts: "Grafikler",
  dailyNetAll: "Günlük Net Değişim (Tüm varlıklar)",
  netByAsset: "Varlığa Göre Net (En İyi 12)",
  noData: "Veri yok",

  timesNote: "Tüm tarih ve saatler UTC+0’dır. Lütfen kendi saat diliminize göre değerlendiriniz.",
  startLineNoTransfer: "Bu tarih ve saatte analiziniz başlar.",
  transferSentenceTo:   "Bu tarih ve saatte, Futures USDⓈ-M cüzdanınıza {AMOUNT} {ASSET} transfer ettiniz.",
  transferSentenceFrom: "Bu tarih ve saatte, Futures USDⓈ-M cüzdanınızdan {AMOUNT} {ASSET} çıkardınız.",
  changedFromTo: "Bu transferin ardından bakiyeniz {BEFORE} {ASSET} seviyesinden {AFTER} {ASSET} seviyesine değişti.",
  balanceChanged: "Bu transferin ardından bakiyeniz değişti.",
  afterStart: "Başlangıçtan sonra gerçekleşen değişiklikler:",
  finalIntro: "İşlem geçmişinizdeki tüm değişikliklere göre, Futures USDⓈ-M cüzdanınızdaki kalan bakiye:",
  initialBalancesIntro: "Transferden önceki başlangıç bakiyeleri:",

  eventContracts: "Etkinlik Kontratları",
  orders: "Emirler",
  payouts: "Ödemeler",
  coinSwaps: "Coin Swaps (toplam)",
  autoExchange: "Otomatik Dönüşüm (toplam)",
  realizedPnl: "Gerçekleşmiş PnL",
  tradingFees: "Komisyonlar",
  fundingFees: "Funding Ücretleri",
  fundingFeesReceived: "Alınan Funding Ücretleri",
  fundingFeesPaid: "Ödenen Funding Ücretleri",
  insurance: "Sigorta / Likidasyon",
  referralIncome: "Referans Geliri",
  giftBonus: "Hediye / Bonus",
  transfers: "Transferler",
  in: "Giren",
  out: "Çıkan",
  net: "Net",
};

const TEXTS_ES = {
  ...TEXTS_EN,
  lang: "Idioma",
  copyStory: "Copiar historia",
  copyAudit: "Copiar auditoría",
  close: "Cerrar",
  tabCharts: "Gráficas",
  startTime: "Hora de inicio (UTC+0)",
  endTime: "Hora de fin (UTC+0, opcional)",
  baseline: "Saldos iniciales (opcional)",
  transferAtStart: "Importe transferido al inicio (opcional)",
  amount: "Importe",
  asset: "Activo",
  summaryByTypeAsset: "Resumen (por Tipo y Activo)",
  exportPng: "Exportar resumen a PNG",
  agentAudit: "Auditoría del Agente",
  preview: "Vista previa",
  dailyNetAll: "Cambio neto diario (todos los activos)",
  netByAsset: "Neto por activo (Top 12)",
  noData: "Sin datos",

  timesNote: "Todas las fechas y horas están en UTC+0. Ajústalas a tu zona horaria.",
  startLineNoTransfer: "En esta fecha y hora comienza tu análisis.",
  transferSentenceTo:   "En esta fecha y hora transferiste {AMOUNT} {ASSET} a tu billetera Futures USDⓈ-M.",
  transferSentenceFrom: "En esta fecha y hora transferiste {AMOUNT} {ASSET} desde tu billetera Futures USDⓈ-M.",
  changedFromTo: "Tras esta transferencia, tu saldo cambió de {BEFORE} {ASSET} a {AFTER} {ASSET}.",
  balanceChanged: "Tras esta transferencia, tu saldo cambió.",
  afterStart: "Después del inicio, esto es lo que cambió:",
  finalIntro: "Con base en todos los cambios de tu historial de transacciones, el saldo restante en tu billetera Futures USDⓈ-M será:",
  initialBalancesIntro: "Saldos iniciales antes de la transferencia:",
};

const TEXTS_PT = {
  ...TEXTS_EN,
  lang: "Idioma",
  copyStory: "Copiar história",
  copyAudit: "Copiar auditoria",
  close: "Fechar",
  tabCharts: "Gráficos",
  startTime: "Hora de início (UTC+0)",
  endTime: "Hora de término (UTC+0, opcional)",
  baseline: "Saldos iniciais (opcional)",
  transferAtStart: "Valor transferido no início (opcional)",
  amount: "Valor",
  asset: "Ativo",
  summaryByTypeAsset: "Resumo (por Tipo e Ativo)",
  exportPng: "Exportar resumo em PNG",
  agentAudit: "Auditoria do Agente",
  preview: "Pré-visualização",
  dailyNetAll: "Variação líquida diária (todos os ativos)",
  netByAsset: "Líquido por ativo (Top 12)",
  noData: "Sem dados",

  timesNote: "Todas as datas e horas estão em UTC+0. Ajuste ao seu fuso horário.",
  startLineNoTransfer: "Nesta data e hora começa a sua análise.",
  transferSentenceTo:   "Nesta data e hora você transferiu {AMOUNT} {ASSET} para sua carteira Futures USDⓈ-M.",
  transferSentenceFrom: "Nesta data e hora você transferiu {AMOUNT} {ASSET} da sua carteira Futures USDⓈ-M.",
  changedFromTo: "Após esta transferência, seu saldo mudou de {BEFORE} {ASSET} para {AFTER} {ASSET}.",
  balanceChanged: "Após esta transferência, seu saldo mudou.",
  afterStart: "Após o início, isto foi o que mudou:",
  finalIntro: "Com base em todas as mudanças no seu histórico de transações, o saldo restante na sua carteira Futures USDⓈ-M será:",
  initialBalancesIntro: "Saldos iniciais antes da transferência:",
};

const TEXTS_VI = {
  ...TEXTS_EN,
  lang: "Ngôn ngữ",
  copyStory: "Sao chép câu chuyện",
  copyAudit: "Sao chép kiểm toán",
  close: "Đóng",
  tabCharts: "Biểu đồ",
  startTime: "Thời điểm bắt đầu (UTC+0)",
  endTime: "Thời điểm kết thúc (UTC+0, tùy chọn)",
  baseline: "Số dư ban đầu (tùy chọn)",
  transferAtStart: "Số tiền chuyển lúc bắt đầu (tùy chọn)",
  amount: "Số tiền",
  asset: "Tài sản",
  summaryByTypeAsset: "Tóm tắt (theo Loại & Tài sản)",
  exportPng: "Xuất PNG bảng tóm tắt",
  agentAudit: "Kiểm toán Agent",
  preview: "Xem trước",
  dailyNetAll: "Thay đổi ròng theo ngày (tất cả tài sản)",
  netByAsset: "Ròng theo tài sản (Top 12)",
  noData: "Không có dữ liệu",

  timesNote: "Tất cả ngày giờ đều theo UTC+0. Vui lòng điều chỉnh theo múi giờ của bạn.",
  startLineNoTransfer: "Tại thời điểm này, phiên phân tích bắt đầu.",
  transferSentenceTo:   "Tại thời điểm này, bạn đã chuyển {AMOUNT} {ASSET} vào ví Futures USDⓈ-M của mình.",
  transferSentenceFrom: "Tại thời điểm này, bạn đã rút {AMOUNT} {ASSET} từ ví Futures USDⓈ-M của mình.",
  changedFromTo: "Sau giao dịch này, số dư của bạn đổi từ {BEFORE} {ASSET} thành {AFTER} {ASSET}.",
  balanceChanged: "Sau giao dịch này, số dư của bạn thay đổi.",
  afterStart: "Sau thời điểm bắt đầu, các thay đổi như sau:",
  finalIntro: "Dựa trên mọi thay đổi trong lịch sử giao dịch của bạn, số dư còn lại trong ví Futures USDⓈ-M sẽ là:",
  initialBalancesIntro: "Số dư ban đầu trước giao dịch chuyển:",
};

const TEXTS_RU = {
  ...TEXTS_EN,
  lang: "Язык",
  copyStory: "Копировать историю",
  copyAudit: "Копировать аудит",
  close: "Закрыть",
  tabCharts: "Графики",
  startTime: "Время начала (UTC+0)",
  endTime: "Время окончания (UTC+0, опционально)",
  baseline: "Начальные балансы (опционально)",
  transferAtStart: "Сумма перевода в начале (опционально)",
  amount: "Сумма",
  asset: "Актив",
  summaryByTypeAsset: "Сводка (по типу и активу)",
  exportPng: "Экспорт сводки в PNG",
  agentAudit: "Аудит агента",
  preview: "Предпросмотр",
  dailyNetAll: "Дневное изменение чистой позиции (все активы)",
  netByAsset: "Чистая позиция по активам (Top 12)",
  noData: "Нет данных",

  timesNote: "Все даты и время указаны в UTC+0. Отрегулируйте под ваш часовой пояс.",
  startLineNoTransfer: "В это время начинается ваш анализ.",
  transferSentenceTo:   "В это время вы перевели {AMOUNT} {ASSET} на свой кошелёк Futures USDⓈ-M.",
  transferSentenceFrom: "В это время вы перевели {AMOUNT} {ASSET} со своего кошелька Futures USDⓈ-M.",
  changedFromTo: "После этого перевода ваш баланс изменился с {BEFORE} {ASSET} до {AFTER} {ASSET}.",
  balanceChanged: "После этого перевода ваш баланс изменился.",
  afterStart: "После начала произошло следующее:",
  finalIntro: "С учётом всех изменений в истории операций остаток на вашем кошельке Futures USDⓈ-M составит:",
  initialBalancesIntro: "Начальные балансы до перевода:",
};

const TEXTS_UK = {
  ...TEXTS_EN,
  lang: "Мова",
  copyStory: "Копіювати історію",
  copyAudit: "Копіювати аудит",
  close: "Закрити",
  tabCharts: "Графіки",
  startTime: "Час початку (UTC+0)",
  endTime: "Час завершення (UTC+0, опційно)",
  baseline: "Початкові баланси (опційно)",
  transferAtStart: "Сума переказу на початку (опційно)",
  amount: "Сума",
  asset: "Актив",
  summaryByTypeAsset: "Зведення (за типом та активом)",
  exportPng: "Експорт зведення у PNG",
  agentAudit: "Аудит агента",
  preview: "Попередній перегляд",
  dailyNetAll: "Щоденна чиста зміна (усі активи)",
  netByAsset: "Чисте за активами (Топ 12)",
  noData: "Немає даних",

  timesNote: "Всі дати і час вказані в UTC+0. Врахуйте свій часовий пояс.",
  startLineNoTransfer: "У цей час починається ваш аналіз.",
  transferSentenceTo:   "У цей час ви переказали {AMOUNT} {ASSET} на гаманець Futures USDⓈ-M.",
  transferSentenceFrom: "У цей час ви переказали {AMOUNT} {ASSET} з гаманця Futures USDⓈ-M.",
  changedFromTo: "Після цього переказу ваш баланс змінився з {BEFORE} {ASSET} на {AFTER} {ASSET}.",
  balanceChanged: "Після цього переказу ваш баланс змінився.",
  afterStart: "Після початку відбулися такі зміни:",
  finalIntro: "З огляду на всі зміни в історії транзакцій, залишок у вашому гаманці Futures USDⓈ-M становитиме:",
  initialBalancesIntro: "Початкові баланси до переказу:",
};

const TEXTS_AR = {
  ...TEXTS_EN,
  lang: "اللغة",
  copyStory: "نسخ القصة",
  copyAudit: "نسخ التدقيق",
  close: "إغلاق",
  tabCharts: "الرسوم البيانية",
  startTime: "وقت البدء (UTC+0)",
  endTime: "وقت الانتهاء (UTC+0، اختياري)",
  baseline: "الأرصدة الأولية (اختياري)",
  transferAtStart: "مبلغ التحويل عند البدء (اختياري)",
  amount: "المبلغ",
  asset: "الأصل",
  summaryByTypeAsset: "الملخص (حسب النوع والأصل)",
  exportPng: "تصدير الملخص PNG",
  agentAudit: "تدقيق الوكيل",
  preview: "معاينة",
  dailyNetAll: "التغير الصافي اليومي (كل الأصول)",
  netByAsset: "الصافي حسب الأصل (أفضل 12)",
  noData: "لا توجد بيانات",

  timesNote: "جميع التواريخ والأوقات بتوقيت UTC+0. يرجى ضبطها حسب منطقتك الزمنية.",
  startLineNoTransfer: "في هذا الوقت يبدأ التحليل.",
  transferSentenceTo:   "في هذا الوقت قمتَ بتحويل {AMOUNT} {ASSET} إلى محفظة Futures USDⓈ-M الخاصة بك.",
  transferSentenceFrom: "في هذا الوقت قمتَ بتحويل {AMOUNT} {ASSET} من محفظة Futures USDⓈ-M الخاصة بك.",
  changedFromTo: "بعد هذا التحويل تغيّر رصيدك من {BEFORE} {ASSET} إلى {AFTER} {ASSET}.",
  balanceChanged: "بعد هذا التحويل تغيّر رصيدك.",
  afterStart: "بعد البداية، هذه هي التغييرات:",
  finalIntro: "استنادًا إلى جميع التغييرات في سجل معاملاتك، سيكون الرصيد المتبقي في محفظة Futures USDⓈ-M لديك:",
  initialBalancesIntro: "الأرصدة الأولية قبل التحويل:",
};

const TEXTS_ZH = {
  ...TEXTS_EN,
  lang: "语言",
  copyStory: "复制说明",
  copyAudit: "复制审计",
  close: "关闭",
  tabCharts: "图表",
  startTime: "开始时间 (UTC+0)",
  endTime: "结束时间 (UTC+0，可选)",
  baseline: "初始余额（可选）",
  transferAtStart: "起始时的转账金额（可选）",
  amount: "金额",
  asset: "资产",
  summaryByTypeAsset: "摘要（按类型与资产）",
  exportPng: "导出摘要 PNG",
  agentAudit: "代理审计",
  preview: "预览",
  dailyNetAll: "每日净变动（所有资产）",
  netByAsset: "各资产净额（前 12）",
  noData: "暂无数据",

  timesNote: "所有日期和时间均为 UTC+0。请根据您的时区进行调整。",
  startLineNoTransfer: "从此时间点开始进行分析。",
  transferSentenceTo:   "在该时间点，你向 Futures USDⓈ-M 钱包转入了 {AMOUNT} {ASSET}。",
  transferSentenceFrom: "在该时间点，你从 Futures USDⓈ-M 钱包转出了 {AMOUNT} {ASSET}。",
  changedFromTo: "此笔转账后，你的余额由 {BEFORE} {ASSET} 变为 {AFTER} {ASSET}。",
  balanceChanged: "此笔转账后，你的余额发生了变化。",
  afterStart: "开始之后，发生了以下变动：",
  finalIntro: "根据交易历史中的所有变动，你在 Futures USDⓈ-M 钱包中的剩余余额为：",
  initialBalancesIntro: "转账前的初始余额：",
};

const TEXTS_KO = {
  ...TEXTS_EN,
  lang: "언어",
  copyStory: "내러티브 복사",
  copyAudit: "감사 복사",
  close: "닫기",
  tabCharts: "차트",
  startTime: "시작 시간 (UTC+0)",
  endTime: "종료 시간 (UTC+0, 선택)",
  baseline: "초기 잔액 (선택)",
  transferAtStart: "시작 시 이체 금액 (선택)",
  amount: "금액",
  asset: "자산",
  summaryByTypeAsset: "요약(유형 & 자산별)",
  exportPng: "요약 PNG 내보내기",
  agentAudit: "에이전트 감사",
  preview: "미리보기",
  dailyNetAll: "일일 순변화(전체 자산)",
  netByAsset: "자산별 순변화(상위 12)",
  noData: "데이터 없음",

  timesNote: "모든 날짜와 시간은 UTC+0 기준입니다. 거주 지역 시간대에 맞춰 해석하세요.",
  startLineNoTransfer: "이 시점에서 분석이 시작됩니다.",
  transferSentenceTo:   "이 시점에 Futures USDⓈ-M 지갑으로 {AMOUNT} {ASSET}를 이체했습니다.",
  transferSentenceFrom: "이 시점에 Futures USDⓈ-M 지갑에서 {AMOUNT} {ASSET}를 출금했습니다.",
  changedFromTo: "이번 이체 후 잔액이 {BEFORE} {ASSET}에서 {AFTER} {ASSET}(으)로 변경되었습니다.",
  balanceChanged: "이번 이체 후 잔액이 변경되었습니다.",
  afterStart: "시작 이후 변경 사항은 다음과 같습니다:",
  finalIntro: "거래 내역의 모든 변동을 반영한 결과, Futures USDⓈ-M 지갑에 남는 잔액은 다음과 같습니다:",
  initialBalancesIntro: "이체 전 초기 잔액:",
};

const TEXTS: Record<LocalLang, any> = {
  en: TEXTS_EN,
  tr: TEXTS_TR,
  es: TEXTS_ES,
  pt: TEXTS_PT,
  vi: TEXTS_VI,
  ru: TEXTS_RU,
  uk: TEXTS_UK,
  ar: TEXTS_AR,
  zh: TEXTS_ZH,
  ko: TEXTS_KO,
};
