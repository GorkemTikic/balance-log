// src/components/StoryDrawer.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import {
  buildNarrativeParagraphs,
  buildAudit,
  buildSummaryRows,
  type Row,
  type Lang,
} from "@/lib/story";

type Props = {
  rows: Row[];
  onClose: () => void;
};

type AnchorTransfer = { amount: number; asset: string } | undefined;

const LANGS: Lang[] = ["en", "tr", "ar", "vi", "ru"];

export default function StoryDrawer({ rows, onClose }: Props) {
  const [tab, setTab] = useState<"narrative" | "audit" | "raw" | "charts">("narrative");

  // Inputs (shared)
  const [lang, setLang] = useState<Lang>("en");
  const [anchorISO, setAnchorISO] = useState<string>("");
  const [baselineText, setBaselineText] = useState<string>("");
  const [xfAmount, setXfAmount] = useState<string>(""); // anchor transfer amount
  const [xfAsset, setXfAsset] = useState<string>("USDT");
  const [endISO, setEndISO] = useState<string>("");

  // Derived
  const baseline = useMemo(() => parseBalances(baselineText), [baselineText]);
  const anchorTransfer: AnchorTransfer = useMemo(() => {
    const amt = toNum(xfAmount);
    const as = (xfAsset || "").trim().toUpperCase();
    if (!isFinite(amt) || !as) return undefined;
    return { amount: amt, asset: as };
  }, [xfAmount, xfAsset]);

  const filteredRows = useMemo(() => {
    const startTs = anchorISO ? Date.parse(`${anchorISO}Z`) : undefined;
    const endTs = endISO ? Date.parse(`${endISO}Z`) : undefined;
    return rows.filter((r) => (startTs === undefined || r.ts >= startTs) && (endTs === undefined || r.ts <= endTs));
  }, [rows, anchorISO, endISO]);

  // Narrative text (friendlier, multi-lingual)
  const narrative = useMemo(() => {
    return buildNarrativeParagraphs(filteredRows, anchorISO || undefined, {
      initialBalances: isEmpty(baseline) ? undefined : baseline,
      anchorTransfer,
      lang,
    });
  }, [filteredRows, anchorISO, baseline, anchorTransfer, lang]);

  // Agent audit
  const auditText = useMemo(() => {
    const anchorTs = anchorISO ? Date.parse(`${anchorISO}Z`) : 0;
    if (!anchorTs) return "Set an anchor time to see audit.";
    const endTs = endISO ? Date.parse(`${endISO}Z`) : undefined;
    return buildAudit(rows, {
      anchorTs,
      endTs,
      baseline: isEmpty(baseline) ? undefined : baseline,
      anchorTransfer,
    });
  }, [rows, anchorISO, endISO, baseline, anchorTransfer]);

  // Summary (colored table + PNG export)
  const summaryRows = useMemo(() => buildSummaryRows(filteredRows), [filteredRows]);
  const summaryRef = useRef<HTMLDivElement>(null);
  async function exportSummaryPNG() {
    if (!summaryRef.current) return;
    const canvas = await html2canvas(summaryRef.current);
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "balance-summary.png";
    a.click();
  }

  // Copy helpers
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied!");
    } catch {
      toast("Copy failed");
    }
  }

  // simple ephemeral toast
  const [toastMsg, setToastMsg] = useState<string>("");
  function toast(s: string) {
    setToastMsg(s);
    setTimeout(() => setToastMsg(""), 1200);
  }

  // Keep action area layout stable (fix for overflowing buttons)
  useEffect(() => {
    // try to focus first field when opened
    const el = document.getElementById("story-anchor");
    if (el) (el as HTMLInputElement).focus();
  }, []);

  return (
    <div className="drawer-overlay" style={overlayStyle}>
      <div className="drawer" style={drawerStyle}>
        {/* Header */}
        <div className="drawer-head" style={headStyle}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <strong>Balance Story (UTC+0)</strong>
            <div className="tabbar" style={{ display: "flex", gap: 6 }}>
              {(["narrative", "audit", "raw"] as const).map((k) => (
                <button
                  key={k}
                  className={`btn ${tab === k ? "btn-primary" : ""}`}
                  onClick={() => setTab(k)}
                >
                  {k === "narrative" ? "Narrative" : k === "audit" ? "Agent Audit" : "Raw"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 240 }}>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="btn"
              style={{ height: 34 }}
              title="Language"
            >
              <option value="en">English</option>
              <option value="tr">Türkçe</option>
              <option value="ar">العربية</option>
              <option value="vi">Tiếng Việt</option>
              <option value="ru">Русский</option>
            </select>

            {tab === "narrative" && (
              <button className="btn" onClick={() => copy(narrative)} title="Copy story">
                Copy Story
              </button>
            )}
            {tab === "audit" && (
              <button className="btn" onClick={() => copy(auditText)} title="Copy audit">
                Copy Audit
              </button>
            )}

            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Inputs */}
        <div className="inputs card" style={{ marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            <label className="muted">
              Anchor time (UTC+0)
              <input
                id="story-anchor"
                placeholder="YYYY-MM-DD HH:MM:SS"
                className="btn"
                value={anchorISO}
                onChange={(e) => setAnchorISO(e.target.value)}
                style={{ marginTop: 6, textAlign: "left" }}
              />
            </label>

            <label className="muted">
              End time (UTC+0, optional)
              <input
                placeholder="YYYY-MM-DD HH:MM:SS"
                className="btn"
                value={endISO}
                onChange={(e) => setEndISO(e.target.value)}
                style={{ marginTop: 6, textAlign: "left" }}
              />
            </label>

            <label className="muted" style={{ gridColumn: "1 / -1" }}>
              Baseline balances (optional)
              <textarea
                placeholder={'One per line:\nUSDT 3450.12345678\n0.015 BTC'}
                className="btn"
                value={baselineText}
                onChange={(e) => setBaselineText(e.target.value)}
                rows={3}
                style={{ marginTop: 6, whiteSpace: "pre" }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
              <label className="muted">
                Anchor transfer (optional) — Amount
                <input
                  className="btn"
                  placeholder="e.g. 2000 or -0.015"
                  value={xfAmount}
                  onChange={(e) => setXfAmount(e.target.value)}
                  style={{ marginTop: 6, textAlign: "left" }}
                />
              </label>
              <label className="muted">
                Asset (e.g. USDT)
                <input
                  className="btn"
                  placeholder="USDT"
                  value={xfAsset}
                  onChange={(e) => setXfAsset(e.target.value.toUpperCase())}
                  style={{ marginTop: 6, textAlign: "left" }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Body */}
        {tab === "narrative" && (
          <div className="body" style={{ display: "grid", gap: 10 }}>
            <div className="card">
              <h4 className="section-title">Narrative</h4>
              <pre className="mono" style={preStyle}>{narrative}</pre>
            </div>

            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <h4 className="section-title">Summary (by Type &amp; Asset)</h4>
                <button className="btn" onClick={exportSummaryPNG}>Export Summary PNG</button>
              </div>

              <div ref={summaryRef} style={{ overflowX: "auto", paddingTop: 8 }}>
                <table className="mono" style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Type</th>
                      <th>Asset</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: "center", padding: "16px 0" }}>No data</td></tr>
                    )}
                    {summaryRows.map((r, i) => (
                      <tr key={i}>
                        <td style={{ textAlign: "left" }}>{r.label}</td>
                        <td>{r.asset}</td>
                        <td className="pos">{fmt(r.in)}</td>
                        <td className="neg">{fmt(r.out)}</td>
                        <td className={r.net >= 0 ? "pos" : "neg"}>{fmt(r.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === "audit" && (
          <div className="card">
            <h4 className="section-title">Preview</h4>
            <pre className="mono" style={preStyle}>{auditText}</pre>
          </div>
        )}

        {tab === "raw" && (
          <div className="card">
            <h4 className="section-title">Raw (debug)</h4>
            <pre className="mono" style={preStyle}>{JSON.stringify(filteredRows.slice(0, 50), null, 2)}{filteredRows.length > 50 ? "\n… (truncated)" : ""}</pre>
          </div>
        )}

        {/* Toast */}
        {toastMsg && (
          <div style={toastStyle}>{toastMsg}</div>
        )}
      </div>
    </div>
  );
}

/* ---------------- helpers & styles ---------------- */

function parseBalances(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!text) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Accept "USDT 12.34" OR "12.34 USDT"
    const m1 = line.match(/^([A-Za-z0-9_]+)\s+([+\-]?\d+(\.\d+)?)$/);
    const m2 = line.match(/^([+\-]?\d+(\.\d+)?)\s+([A-Za-z0-9_]+)$/);
    if (m1) {
      const asset = m1[1].toUpperCase();
      const amt = Number(m1[2]);
      if (isFinite(amt)) out[asset] = amt;
    } else if (m2) {
      const asset = m2[3].toUpperCase();
      const amt = Number(m2[1]);
      if (isFinite(amt)) out[asset] = amt;
    }
  }
  return out;
}

function toNum(s: string) {
  const n = Number((s || "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function isEmpty(obj?: Record<string, number>) {
  return !obj || Object.keys(obj).length === 0;
}

function fmt(v: number) {
  if (!Number.isFinite(v)) return String(v);
  if (Object.is(v, -0)) return "0";
  if (Math.abs(v) < 1e-12) return "0";
  return String(v);
}

/* ----- styles (inline to avoid CSS edits) ----- */

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(16,16,20,0.45)",
  zIndex: 50,
  display: "flex",
  justifyContent: "flex-end",
};

const drawerStyle: React.CSSProperties = {
  width: "min(980px, 100%)",
  height: "100%",
  background: "var(--bg, #f7f8fb)",
  boxShadow: "-6px 0 20px rgba(0,0,0,0.15)",
  padding: 12,
  overflowY: "auto",
};

const headStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 10,
  flexWrap: "wrap",
};

const preStyle: React.CSSProperties = {
  background: "#0e1116",
  color: "#e5e7eb",
  borderRadius: 8,
  padding: 12,
  overflowX: "auto",
  lineHeight: 1.6,
  fontSize: 12,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
} as const;

const toastStyle: React.CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 18,
  background: "#111827",
  color: "#fff",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 4px 18px rgba(0,0,0,0.25)",
};

/* Minimal button styles (respect existing theme classes if present) */
declare global {
  interface HTMLElementTagNameMap {
    "div": HTMLDivElement;
  }
}
