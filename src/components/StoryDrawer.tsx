// src/components/StoryDrawer.tsx
import React, { useMemo } from "react";
import ExportPNG from "@/components/ExportPNG";

type TotalsMap = Record<
  string,
  { pos: number; neg: number; net: number }
>;

export default function StoryDrawer({
  open,
  onClose,
  t0,
  t1,
  setT0,
  setT1,
  totals,
}: {
  open: boolean;
  onClose: () => void;
  t0: string;
  t1: string;
  setT0: (s: string) => void;
  setT1: (s: string) => void;
  totals: {
    realized: TotalsMap;
    funding: TotalsMap;
    commission: TotalsMap;
    insurance: TotalsMap;
    transfers: TotalsMap;
    eventsO: TotalsMap; // Event Contracts - Orders
    eventsP: TotalsMap; // Event Contracts - Payouts
  };
}) {
  if (!open) return null;

  const fmt = (n: number) =>
    Number.isFinite(n) ? (Math.round(n * 1e8) / 1e8).toString() : "0";

  function tableLines(title: string, m: TotalsMap) {
    const keys = Object.keys(m).sort();
    if (!keys.length) return [`${title}: (no entries)`];
    const lines: string[] = [`${title}:`];
    for (const k of keys) {
      const v = m[k];
      lines.push(
        `  • ${k}  +${fmt(v.pos)}  −${fmt(v.neg)}  = ${fmt(v.net)}`
      );
    }
    return lines;
  }

  const storyText = useMemo(() => {
    const blocks: string[] = [];
    blocks.push(
      "Balance Story",
      `Range (UTC+0): ${t0 || "—"} → ${t1 || "—"}`,
      ""
    );
    blocks.push(...tableLines("Realized PnL", totals.realized), "");
    blocks.push(...tableLines("Trading Fees / Commission", totals.commission), "");
    blocks.push(...tableLines("Funding Fees", totals.funding), "");
    blocks.push(...tableLines("Insurance / Liquidation", totals.insurance), "");
    blocks.push(...tableLines("Transfers", totals.transfers), "");
    blocks.push(...tableLines("Event Contracts — Orders", totals.eventsO), "");
    blocks.push(...tableLines("Event Contracts — Payouts", totals.eventsP), "");
    return blocks.join("\n");
  }, [t0, t1, totals]);

  return (
    <div
      aria-modal
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-end",
        background: "rgba(0,0,0,0.25)",
      }}
      onClick={onClose}
    >
      {/* Drawer panel */}
      <div
        className="card"
        style={{
          width: "min(720px, 100%)",
          height: "100%",
          margin: 0,
          borderRadius: 0,
          overflow: "auto",
          boxShadow: "0 10px 30px rgba(0,0,0,.25)",
          background: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="section-head"
          style={{ alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}
        >
          <h3 className="section-title">Balance Story (UTC+0)</h3>
          <div className="btn-row" style={{ gap: 8 }}>
            <ExportPNG text={storyText} fileName="balance-story.png" width={1200} />
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="card" style={{ marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
            <label className="muted">
              Start (UTC+0)
              <input
                className="btn"
                style={{ width: "100%", textAlign: "left", marginTop: 6 }}
                value={t0}
                onChange={(e) => setT0(e.target.value)}
                placeholder="YYYY-MM-DD HH:MM:SS"
              />
            </label>
            <label className="muted">
              End (UTC+0)
              <input
                className="btn"
                style={{ width: "100%", textAlign: "left", marginTop: 6 }}
                value={t1}
                onChange={(e) => setT1(e.target.value)}
                placeholder="YYYY-MM-DD HH:MM:SS"
              />
            </label>
          </div>
        </div>

        {/* Plain text preview */}
        <div className="card" style={{ marginTop: 8 }}>
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
              maxHeight: 520,
              overflow: "auto",
            }}
          >
            {storyText}
          </pre>
        </div>
      </div>
    </div>
  );
}
