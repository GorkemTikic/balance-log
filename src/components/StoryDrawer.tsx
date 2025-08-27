// src/components/StoryDrawer.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import { buildNarrativeParagraphs, buildAudit, totalsByType, buildSummaryRows } from "@/lib/story";
import type { SummaryRow } from "@/lib/story";

export type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

export default function StoryDrawer({
  open,
  onClose,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  rows: Row[];
}) {
  const [tab, setTab] = useState<"narrative" | "audit" | "charts" | "raw">("narrative");

  // ---- Shared inputs ----
  const [anchor, setAnchor] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [baselineText, setBaselineText] = useState<string>("");
  const [trAmount, setTrAmount] = useState<string>("");
  const [trAsset, setTrAsset] = useState<string>("");
  const [lang, setLang] = useState<"en"|"tr"|"ar"|"vi"|"ru">("en");

  function parseUTC(s: string): number | undefined {
    const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return undefined;
    const [, Y, Mo, D, H, Mi, S] = m;
    return Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
  }
  function parseBaseline(s: string): { map?: Record<string, number>; error?: string; preview?: string[] } {
    const out: Record<string, number> = {};
    const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return { map: undefined };
    const preview: string[] = [];
    for (const line of lines) {
      let m = line.match(/^([A-Z0-9_]+)\s+(-?\d+(?:\.\d+)?)(?:\s*)$/i);
      if (m) {
        const asset = m[1].toUpperCase(); const val = Number(m[2]);
        if (Number.isFinite(val)) { out[asset] = (out[asset] || 0) + val; preview.push(`${asset} ${val}`); continue; }
      }
      m = line.match(/^(-?\d+(?:\.\d+)?)\s+([A-Z0-9_]+)(?:\s*)$/i);
      if (m) {
        const asset = m[2].toUpperCase(); const val = Number(m[1]);
        if (Number.isFinite(val)) { out[asset] = (out[asset] || 0) + val; preview.push(`${asset} ${val}`); continue; }
      }
      return { error: `Could not parse line: "${line}". Use "USDT 123.45" or "123.45 USDT".` };
    }
    if (!Object.keys(out).length) return { map: undefined };
    return { map: out, preview };
  }
  function parseTransfer(amountStr: string, assetStr: string) {
    const amount = Number((amountStr || "").trim());
    const asset = (assetStr || "").trim().toUpperCase();
    if (!asset || !Number.isFinite(amount)) return undefined;
    return { asset, amount };
  }

  const baselineParsed = useMemo(() => parseBaseline(baselineText), [baselineText]);
  const transferParsed = useMemo(() => parseTransfer(trAmount, trAsset), [trAmount, trAsset]);

  // ---- Narrative ----
  const anchorISO = useMemo(() => {
    const ts = anchor ? parseUTC(anchor) : undefined;
    if (!ts) return undefined;
    return new Date(ts).toISOString().replace("T"," ").replace("Z","");
  }, [anchor]);

  const narrativeText = useMemo(() =>
    buildNarrativeParagraphs(rows, anchorISO, {
      initialBalances: baselineParsed.map,
      anchorTransfer: transferParsed,
      lang,
    }),
  [rows, anchorISO, baselineParsed.map, transferParsed, lang]);

  // Summary rows
  const summaryRows: SummaryRow[] = useMemo(() => buildSummaryRows(rows), [rows]);

  // ---- Audit ----
  const auditText = useMemo(() => {
    const anchorTs = anchor ? parseUTC(anchor) : undefined;
    if (!anchorTs) return "Set an Anchor time (UTC+0) to run the audit.";
    const endTs = end ? parseUTC(end) : undefined;
    try {
      return buildAudit(rows, { anchorTs, endTs, baseline: baselineParsed.map, anchorTransfer: transferParsed });
    } catch (e: any) {
      return "Audit failed: " + (e?.message || String(e));
    }
  }, [anchor, end, rows, baselineParsed.map, transferParsed]);

  // ---- Raw (diagnostics) ----
  const rawPreview = useMemo(() => {
    const t = totalsByType(rows);
    const lines: string[] = [];
    lines.push("Diagnostics (Totals by Type):");
    for (const typeKey of Object.keys(t).sort()) {
      lines.push(`  ${typeKey}:`);
      const m = t[typeKey];
      for (const k of Object.keys(m).sort()) {
        const v = m[k];
        lines.push(`    • ${k}  +${v.pos}  −${v.neg}  = ${v.net}`);
      }
    }
    return lines.join("\n");
  }, [rows]);

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); alert("Copied to clipboard."); }
    catch { alert("Copy failed. Your browser may block clipboard access."); }
  }

  // PNG Export only for the summary table
  async function exportSummaryPng() {
    try {
      const el = document.getElementById("story-summary-table");
      if (!el) throw new Error("Summary table not found");
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2 });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "balance-story-summary.png";
      a.click();
    } catch (err: any) {
      alert("Export failed: " + (err?.message || String(err)));
    }
  }

  // -------------------- Charts data (simple) --------------------
  const dailySeries = useMemo(() => buildDailyNet(rows), [rows]);
  const assetNets = useMemo(() => buildAssetNet(rows), [rows]);

  if (!open) return null;

  return (
    <div aria-modal role="dialog" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.25)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} className="card"
        style={{ width: "min(980px, 100%)", height: "100%", margin: 0, borderRadius: 0, overflow: "auto", background: "#fff", boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>

        {/* Header */}
        <div className="section-head" style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h3 className="section-title">Balance Story (UTC+0)</h3>
          <div className="btn-row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="btn" value={lang} onChange={(e)=>setLang(e.target.value as any)} title="Language"
              style={{ paddingRight: 28 }}>
              <option value="en">English</option>
              <option value="tr">Türkçe</option>
              <option value="ar">العربية</option>
              <option value="vi">Tiếng Việt</option>
              <option value="ru">Русский</option>
            </select>
            {tab === "narrative" && <button className="btn" onClick={() => copy(narrativeText)}>Copy Story</button>}
            {tab === "audit" &&     <button className="btn" onClick={() => copy(auditText)}>Copy Audit</button>}
            {tab === "raw" &&       <button className="btn" onClick={() => copy(rawPreview)}>Copy Raw</button>}
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="card" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setTab("narrative")} style={{ background: tab==="narrative" ? "#111827" : "#fff", color: tab==="narrative" ? "#fff" : undefined }}>Narrative</button>
            <button className="btn" onClick={() => setTab("audit")}     style={{ background: tab==="audit" ? "#111827" : "#fff", color: tab==="audit" ? "#fff" : undefined }}>Agent Audit</button>
            <button className="btn" onClick={() => setTab("charts")}    style={{ background: tab==="charts" ? "#111827" : "#fff", color: tab==="charts" ? "#fff" : undefined }}>Charts</button>
            <button className="btn" onClick={() => setTab("raw")}       style={{ background: tab==="raw" ? "#111827" : "#fff", color: tab==="raw" ? "#fff" : undefined }}>Raw</button>
          </div>
        </div>

        {/* Narrative */}
        {tab === "narrative" && (
          <div className="card" style={{ marginTop: 8 }}>
            {/* Inputs row (responsive, prevents right-side clipping) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 10,
                alignItems: "start",
              }}
            >
              <label className="muted" style={{ minWidth: 0 }}>
                Anchor time (UTC+0)
                <input
                  className="btn"
                  style={inputStyle}
                  value={anchor}
                  onChange={(e)=>setAnchor(e.target.value)}
                  placeholder="YYYY-MM-DD HH:MM:SS"
                />
              </label>

              <label className="muted" style={{ minWidth: 0 }}>
                Baseline balances (optional)
                <textarea
                  className="btn"
                  style={{ ...inputStyle, minHeight: 64, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12 }}
                  placeholder={`One per line:\nUSDT 3450.12345678\n0.015 BTC`}
                  value={baselineText}
                  onChange={(e)=>setBaselineText(e.target.value)}
                />
              </label>

              <div style={{ minWidth: 0 }}>
                <div className="muted">Anchor transfer (optional)</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(140px,1fr) minmax(110px,1fr)",
                    gap: 8,
                    marginTop: 6,
                  }}
                >
                  <input className="btn" style={inputStyle} placeholder="Amount (e.g. 2000 or -0.015)" value={trAmount} onChange={(e)=>setTrAmount(e.target.value)} />
                  <input className="btn" style={inputStyle} placeholder="Asset (e.g. USDT)" value={trAsset} onChange={(e)=>setTrAsset(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Story text */}
            <div className="card" style={{ marginTop: 10 }}>
              <h4 className="section-title" style={{ marginBottom: 8 }}>Narrative</h4>
              <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: "20px", background: "#f7f7f9", padding: 12, borderRadius: 8 }}>
                {narrativeText}
              </pre>
            </div>

            {/* Summary table + Export PNG */}
            <div className="card" style={{ marginTop: 10 }}>
              <div className="section-head" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <h4 className="section-title">Summary (by Type & Asset)</h4>
                <div className="btn-row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" onClick={exportSummaryPng}>Export Summary PNG</button>
                </div>
              </div>

              <div id="story-summary-table" style={{ overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 760 }}>
                  <thead style={{ background: "#f3f4f6" }}>
                    <tr>
                      <th style={thStyleLeft}>Type</th>
                      <th style={thStyle}>Asset</th>
                      <th style={thStyle}>In</th>
                      <th style={thStyle}>Out</th>
                      <th style={thStyleRight}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: "12px 14px", textAlign: "center", color: "#6b7280" }}>No data</td></tr>
                    )}
                    {summaryRows.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 ? "#fff" : "#fbfbfd" }}>
                        <td style={tdStyleLeft}>{r.label}</td>
                        <td style={tdStyleMono}>
                          <span style={{ marginRight: 6 }}>{assetIcon(r.asset)}</span>
                          {r.asset}
                        </td>
                        <td style={{ ...tdStyleMono, color: r.in !== 0 ? "#047857" : "#6b7280" }}>{r.in !== 0 ? `+${r.in}` : "—"}</td>
                        <td style={{ ...tdStyleMono, color: r.out !== 0 ? "#b91c1c" : "#6b7280" }}>{r.out !== 0 ? `-${r.out}` : "—"}</td>
                        <td style={{ ...tdStyleMonoBold, color: r.net === 0 ? "#6b7280" : (r.net > 0 ? "#047857" : "#b91c1c") }}>{r.net}</td>
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
          <div className="card" style={{ marginTop: 8 }}>
            <h4 className="section-title" style={{ marginBottom: 8 }}>Agent Audit</h4>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10, alignItems: "start" }}>
              <label className="muted" style={{ minWidth: 0 }}>
                Anchor time (UTC+0)
                <input className="btn" style={inputStyle} value={anchor} onChange={(e)=>setAnchor(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" />
              </label>
              <label className="muted" style={{ minWidth: 0 }}>
                End time (UTC+0, optional)
                <input className="btn" style={inputStyle} value={end} onChange={(e)=>setEnd(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" />
              </label>
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label className="muted" style={{ minWidth: 0 }}>
                Baseline balances (optional)
                <textarea className="btn" style={{ ...inputStyle, minHeight: 120, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12 }}
                  placeholder={`One per line:\nUSDT 3450.12345678\n0.015 BTC`}
                  value={baselineText} onChange={(e)=>setBaselineText(e.target.value)} />
              </label>
              <div style={{ minWidth: 0 }}>
                <div className="muted">Anchor transfer (optional)</div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(140px,1fr) minmax(110px,1fr)", gap: 8, marginTop: 6 }}>
                  <input className="btn" style={inputStyle} placeholder="Amount (e.g. 2000 or -0.015)" value={trAmount} onChange={(e)=>setTrAmount(e.target.value)} />
                  <input className="btn" style={inputStyle} placeholder="Asset (e.g. USDT)" value={trAsset} onChange={(e)=>setTrAsset(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 10 }}>
              <h4 className="section-title" style={{ marginBottom: 8 }}>Preview</h4>
              <pre className="mono"
                style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: "20px", background: "#f7f7f9", padding: 12, borderRadius: 8, maxHeight: 480, overflow: "auto" }}>
                {auditText}
              </pre>
            </div>
          </div>
        )}

        {/* Charts */}
        {tab === "charts" && (
          <div className="card" style={{ marginTop: 8 }}>
            <h4 className="section-title" style={{ marginBottom: 8 }}>Charts</h4>
            <div className="card" style={{ marginTop: 8 }}>
              <div className="section-head" style={{ alignItems: "center" }}>
                <h4 className="section-title">Daily Net Change (All assets)</h4>
              </div>
              <ChartLine data={dailySeries} height={240} />
            </div>
            <div className="card" style={{ marginTop: 8 }}>
              <div className="section-head" style={{ alignItems: "center" }}>
                <h4 className="section-title">Net by Asset (Top 12)</h4>
              </div>
              <ChartBars data={assetNets} height={280} />
            </div>
          </div>
        )}

        {/* Raw */}
        {tab === "raw" && (
          <div className="card" style={{ marginTop: 8 }}>
            <h4 className="section-title" style={{ marginBottom: 8 }}>Raw</h4>
            <pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: 12, lineHeight: "18px", background: "#f7f7f9", padding: 12, borderRadius: 8, maxHeight: 560, overflow: "auto" }}>
              {rawPreview}
            </pre>
          </div>
        )}

      </div>
    </div>
  );
}

// ------- tiny styles for table cells -------
const cellBase: React.CSSProperties = { padding: "10px 12px", borderTop: "1px solid #e5e7eb", verticalAlign: "top", fontSize: 13 };
const thBase: React.CSSProperties = { ...cellBase, fontWeight: 600, color: "#111827", borderTop: "none", textAlign: "left" };
const tdBase: React.CSSProperties = { ...cellBase, color: "#111827" };

const thStyleLeft: React.CSSProperties = { ...thBase, borderTopLeftRadius: 8 };
const thStyle: React.CSSProperties = { ...thBase };
const thStyleRight: React.CSSProperties = { ...thBase, borderTopRightRadius: 8 };

const tdStyleLeft: React.CSSProperties = { ...tdBase, fontWeight: 500 };
const tdStyleMono: React.CSSProperties = { ...tdBase, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };
const tdStyleMonoBold: React.CSSProperties = { ...tdStyleMono, fontWeight: 700 };

// Shared input style to prevent clipping and force responsiveness
const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  textAlign: "left",
  marginTop: 6,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

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

/* ---------------- Charts utils ---------------- */
type LinePoint = { label: string; value: number };
type BarDatum = { asset: string; net: number };

function buildDailyNet(rows: Row[]): LinePoint[] {
  if (!rows?.length) return [];
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = r.time.split(" ")[0];
    map.set(d, (map.get(d) || 0) + r.amount);
  }
  const arr = Array.from(map.entries()).sort(([a],[b]) => (a < b ? -1 : 1));
  let cum = 0;
  return arr.map(([d, v]) => { cum += v; return { label: d, value: cum }; });
}

function buildAssetNet(rows: Row[]): BarDatum[] {
  if (!rows?.length) return [];
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.asset, (map.get(r.asset) || 0) + r.amount);
  const arr = Array.from(map.entries()).map(([asset, net]) => ({ asset, net }));
  arr.sort((a,b) => Math.abs(b.net) - Math.abs(a.net));
  return arr.slice(0, 12);
}

/* ---------------- Line Chart ---------------- */
function ChartLine({ data, height = 240 }: { data: LinePoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    const obs = new ResizeObserver(() => { if (ref.current) setW(Math.max(560, ref.current.clientWidth - 24)); });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  const pad = { t: 12, r: 12, b: 28, l: 44 };
  const width = w, h = height;
  const innerW = width - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  if (!data.length) return <div ref={ref} style={{ padding: 12, color: "#6b7280" }}>No data</div>;

  const minY = Math.min(0, Math.min(...data.map(d => d.value)));
  const maxY = Math.max(0, Math.max(...data.map(d => d.value)));
  const yScale = (v: number) => pad.t + (maxY === minY ? innerH/2 : innerH - ((v - minY) / (maxY - minY)) * innerH);
  const xScale = (i: number) => pad.l + (data.length === 1 ? innerW/2 : (i / (data.length - 1)) * innerW);

  const path = data.map((d, i) => `${i===0?"M":"L"} ${xScale(i)} ${yScale(d.value)}`).join(" ");
  const zeroY = yScale(0);

  return (
    <div ref={ref} style={{ overflow: "hidden" }}>
      <svg width={width} height={h}>
        <line x1={pad.l} y1={zeroY} x2={width - pad.r} y2={zeroY} stroke="#e5e7eb" />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={h - pad.b} stroke="#e5e7eb" />
        <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} />
        {data.map((d, i) => (<circle key={i} cx={xScale(i)} cy={yScale(d.value)} r={2.5} fill="#2563eb" />))}
        {data.map((d, i) => (i % Math.ceil(data.length / 6) === 0) && (
          <text key={"x"+i} x={xScale(i)} y={h - 8} textAnchor="middle" fontSize="11" fill="#6b7280">{d.label.slice(5)}</text>
        ))}
        {[minY, (minY+maxY)/2, maxY].map((val, i) => (
          <g key={"y"+i}>
            <text x={8} y={yScale(val)+4} fontSize="11" fill="#6b7280">{val.toFixed(6).replace(/\.?0+$/,"")}</text>
            <line x1={pad.l-4} y1={yScale(val)} x2={pad.l} y2={yScale(val)} stroke="#9ca3af" />
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ---------------- Bar Chart ---------------- */
function ChartBars({ data, height = 280 }: { data: { asset: string; net: number }[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    const obs = new ResizeObserver(() => { if (ref.current) setW(Math.max(560, ref.current.clientWidth - 24)); });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  if (!data.length) return <div ref={ref} style={{ padding: 12, color: "#6b7280" }}>No data</div>;

  const width = w, pad = { t: 12, r: 12, b: 28, l: 56 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const maxAbs = Math.max(...data.map(d => Math.abs(d.net))) || 1;
  const barW = innerW / data.length - 8;

  return (
    <div ref={ref} style={{ overflow: "hidden" }}>
      <svg width={width} height={height}>
        <line x1={pad.l} y1={pad.t + innerH/2} x2={width - pad.r} y2={pad.t + innerH/2} stroke="#e5e7eb" />
        {data.map((d, i) => {
          const x = pad.l + i * (innerW / data.length) + 4;
          const h = Math.max(1, Math.abs(d.net) / maxAbs * (innerH/2));
          const y = d.net >= 0 ? pad.t + innerH/2 - h : pad.t + innerH/2;
          const fill = d.net >= 0 ? "#047857" : "#b91c1c";
          return (
            <g key={d.asset}>
              <rect x={x} y={y} width={barW} height={h} fill={fill} rx={3} />
              <text x={x + barW/2} y={pad.t + innerH + 14} textAnchor="middle" fontSize="11" fill="#374151">
                {d.asset}
              </text>
            </g>
          );
        })}
        {[maxAbs, 0, -maxAbs].map((v, idx) => (
          <text key={idx} x={8} y={pad.t + innerH/2 - (v/maxAbs)*(innerH/2) + 4} fontSize="11" fill="#6b7280">
            {v.toFixed(6).replace(/\.?0+$/,"")}
          </text>
        ))}
      </svg>
    </div>
  );
}
