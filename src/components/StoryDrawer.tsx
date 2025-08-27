// src/components/StoryDrawer.tsx
import React, { useMemo, useState } from "react";
import { buildNarrative, buildAudit, totalsByType } from "@/lib/story";

export type Row = {
  id: string; uid: string; asset: string; type: string; amount: number;
  time: string; ts: number; symbol: string; extra: string; raw: string;
};

export default function StoryDrawer({
  open,
  onClose,
  rows,        // FILTERED rows from App (date/symbol/type filters already applied)
  t0,
  t1,
}: {
  open: boolean;
  onClose: () => void;
  rows: Row[];
  t0?: string;
  t1?: string;
}) {
  const [tab, setTab] = useState<"narrative" | "audit" | "raw">("narrative");

  // --- Narrative text (friendly, clear, all types included)
  const narrative = useMemo(() => buildNarrative(rows, t0, t1), [rows, t0, t1]);

  // --- Audit inputs
  const [anchor, setAnchor] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [baselineText, setBaselineText] = useState<string>(""); // lines: ASSET amount
  const [anchorAsset, setAnchorAsset] = useState<string>("");
  const [anchorAmount, setAnchorAmount] = useState<string>("");

  // Baseline parser
  function parseBaseline(s: string): Record<string, number> | undefined {
    const out: Record<string, number> = {};
    const lines = s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return undefined;
    for (const line of lines) {
      const m = line.match(/^([A-Z0-9_]+)\s+(-?\d+(?:\.\d+)?)(?:\s*)$/i);
      if (!m) continue;
      const asset = m[1].toUpperCase();
      const val = Number(m[2]);
      if (!Number.isFinite(val)) continue;
      out[asset] = (out[asset] || 0) + val;
    }
    return Object.keys(out).length ? out : undefined;
  }

  // Timestamp parser (expects "YYYY-MM-DD HH:MM:SS")
  function parseUTC(s: string): number | undefined {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return undefined;
    const [,Y,Mo,D,H,Mi,S] = m;
    return Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
    // Note: UI says UTC+0 everywhere.
  }

  const auditText = useMemo(() => {
    const anchorTs = anchor ? parseUTC(anchor) : undefined;
    if (!anchorTs) return "Set an Anchor time (UTC+0) to run the audit.";
    const endTs = end ? parseUTC(end) : undefined;
    const baseline = parseBaseline(baselineText);
    const anchorTransfer =
      anchorAsset && anchorAmount
        ? { asset: anchorAsset.toUpperCase(), amount: Number(anchorAmount) }
        : undefined;

    try {
      return buildAudit(rows, {
        anchorTs,
        endTs,
        baseline,
        anchorTransfer,
      });
    } catch (e: any) {
      return "Audit failed: " + (e?.message || String(e));
    }
  }, [anchor, end, baselineText, anchorAsset, anchorAmount, rows]);

  const rawPreview = useMemo(() => {
    // quick raw totals by type (for debugging/ops)
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
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard.");
    } catch {
      alert("Copy failed. Your browser may block clipboard access.");
    }
  }

  if (!open) return null;

  return (
    <div
      aria-modal
      role="dialog"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.25)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "min(820px, 100%)",
          height: "100%",
          margin: 0,
          borderRadius: 0,
          overflow: "auto",
          background: "#fff",
          boxShadow: "0 10px 30px rgba(0,0,0,.25)",
        }}
      >
        {/* Header */}
        <div
          className="section-head"
          style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, alignItems: "center" }}
        >
          <h3 className="section-title">Balance Story (UTC+0)</h3>
          <div className="btn-row" style={{ gap: 8 }}>
            {tab === "narrative" && <button className="btn" onClick={() => copy(narrative)}>Copy Narrative</button>}
            {tab === "audit" && <button className="btn" onClick={() => copy(auditText)}>Copy Audit</button>}
            {tab === "raw" && <button className="btn" onClick={() => copy(rawPreview)}>Copy Raw</button>}
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="card" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setTab("narrative")} style={{ background: tab==="narrative" ? "#111827" : "#fff", color: tab==="narrative" ? "#fff" : undefined }}>Narrative</button>
            <button className="btn" onClick={() => setTab("audit")} style={{ background: tab==="audit" ? "#111827" : "#fff", color: tab==="audit" ? "#fff" : undefined }}>Agent Audit</button>
            <button className="btn" onClick={() => setTab("raw")} style={{ background: tab==="raw" ? "#111827" : "#fff", color: tab==="raw" ? "#fff" : undefined }}>Raw</button>
          </div>
        </div>

        {/* Narrative */}
        {tab === "narrative" && (
          <div className="card" style={{ marginTop: 8 }}>
            <h4 className="section-title" style={{ marginBottom: 8 }}>Narrative</h4>
            <pre
              className="mono"
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 13,
                lineHeight: "20px",
                background: "#f7f7f9",
                padding: 12,
                borderRadius: 8,
                maxHeight: 560,
                overflow: "auto",
              }}
            >
              {narrative}
            </pre>
          </div>
        )}

        {/* Agent Audit */}
        {tab === "audit" && (
          <div className="card" style={{ marginTop: 8 }}>
            <h4 className="section-title" style={{ marginBottom: 8 }}>Agent Audit</h4>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 10 }}>
              <label className="muted">Anchor time (UTC+0)
                <input className="btn" style={{ width: "100%", textAlign: "left", marginTop: 6 }} value={anchor} onChange={(e)=>setAnchor(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" />
              </label>
              <label className="muted">End time (UTC+0, optional)
                <input className="btn" style={{ width: "100%", textAlign: "left", marginTop: 6 }} value={end} onChange={(e)=>setEnd(e.target.value)} placeholder="YYYY-MM-DD HH:MM:SS" />
              </label>
            </div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label className="muted">Baseline balances (optional)
                <textarea
                  className="btn"
                  style={{ width: "100%", textAlign: "left", marginTop: 6, minHeight: 120, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12 }}
                  placeholder={`One per line, e.g.\nUSDT 3450.12345678\nBTC 0.015`}
                  value={baselineText}
                  onChange={(e)=>setBaselineText(e.target.value)}
                />
              </label>
              <div>
                <div className="muted">Anchor transfer (optional)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                  <input className="btn" placeholder="Asset (e.g. USDT)" value={anchorAsset} onChange={(e)=>setAnchorAsset(e.target.value)} />
                  <input className="btn" placeholder="Amount (e.g. 2000 or -0.015)" value={anchorAmount} onChange={(e)=>setAnchorAmount(e.target.value)} />
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>
                  If provided, the transfer is applied on the baseline first (e.g., incoming +2000 USDT).
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 10 }}>
              <h4 className="section-title" style={{ marginBottom: 8 }}>Preview</h4>
              <pre
                className="mono"
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 13,
                  lineHeight: "20px",
                  background: "#f7f7f9",
                  padding: 12,
                  borderRadius: 8,
                  maxHeight: 480,
                  overflow: "auto",
                }}
              >
                {auditText}
              </pre>
            </div>
          </div>
        )}

        {/* Raw */}
        {tab === "raw" && (
          <div className="card" style={{ marginTop: 8 }}>
            <h4 className="section-title" style={{ marginBottom: 8 }}>Raw</h4>
            <pre
              className="mono"
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 12,
                lineHeight: "18px",
                background: "#f7f7f9",
                padding: 12,
                borderRadius: 8,
                maxHeight: 560,
                overflow: "auto",
              }}
            >
              {rawPreview}
            </pre>
          </div>
        )}

      </div>
    </div>
  );
}
