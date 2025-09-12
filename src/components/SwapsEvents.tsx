// src/components/SwapsEvents.tsx
import React from "react";

type Line = { time: string; ts: number; text: string };
type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;

/* --- Number formatting (same as StoryDrawer) --- */
function fmtTrim(value: number) {
  let s = String(value);
  if (/e/i.test(s)) s = value.toFixed(20); // expand scientific notation
  if (s.includes(".")) {
    s = s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  }
  return s === "-0" ? "0" : s;
}

/* -------- helpers: parse, copy, export (no extra deps) -------- */

function parseSwapText(l: Line) {
  const text = l.text || "";
  const guess = text.slice(0, 19);
  const date =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(guess) ? guess : l.time;

  const afterDash = text.split("—")[1] || "";
  const parts = afterDash.split("→");
  const outPart = (parts[0] || "").replace(/^\s*Out:\s*/i, "").trim();
  const inPart = (parts[1] || "").replace(/^\s*In:\s*/i, "").trim();

  return { date, out: outPart, inn: inPart };
}

function copyRowsAsText(headers: string[], rows: Array<[string, string, string]>) {
  const txt = [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(txt).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    });
  }
}

/** Render rows to a canvas and download as PNG (no DOM screenshot). */
function exportRowsAsPNG(
  headers: string[],
  rows: Array<[string, string, string]>,
  filename: string
) {
  const padX = 14;
  const padY = 10;
  const rowH = 24;
  const headH = 28;
  const gapX = 28;

  const font = "12px Menlo,Consolas,monospace";
  const fontBold = "700 12px Menlo,Consolas,monospace";

  // measure col widths
  const measure = (text: string, bold = false) => {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    ctx.font = bold ? fontBold : font;
    return Math.ceil(ctx.measureText(text).width);
  };

  const cols = [0, 1, 2].map((i) => {
    const headerW = measure(headers[i], true);
    const dataW = Math.max(
      ...rows.map((r) => measure(r[i] || "")),
      0
    );
    return Math.max(headerW, dataW) + padX * 2;
  });

  const width = cols.reduce((a, b) => a + b, 0) + gapX * 2;
  const height = headH + rows.length * rowH + padY * 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  // bg
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // header bg
  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(gapX, padY, width - gapX * 2, headH);

  // header text
  ctx.font = fontBold;
  ctx.fillStyle = "#111827";
  let x = gapX;
  const baseHeaderY = padY + headH / 2 + 4;
  headers.forEach((h, i) => {
    ctx.fillText(h, x + padX, baseHeaderY);
    x += cols[i];
  });

  // rows
  ctx.font = font;
  let y = padY + headH;
  rows.forEach((r) => {
    y += rowH;
    let cx = gapX;

    // Date (gray)
    ctx.fillStyle = "#6b7280";
    ctx.fillText(r[0], cx + padX, y);
    cx += cols[0];

    // Out (red)
    ctx.fillStyle = "#dc2626";
    ctx.textAlign = "right";
    ctx.fillText(r[1], cx + cols[1] - padX, y);
    ctx.textAlign = "start";
    cx += cols[1];

    // In (green)
    ctx.fillStyle = "#16a34a";
    ctx.textAlign = "right";
    ctx.fillText(r[2], cx + cols[2] - padX, y);
    ctx.textAlign = "start";
  });

  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export default function SwapsEvents({
  coinSwapLines,
  autoExLines,
  eventsOrdersByAsset,
  eventsPayoutsByAsset,
}: {
  coinSwapLines: Line[];
  autoExLines: Line[];
  eventsOrdersByAsset: TotalsMap;
  eventsPayoutsByAsset: TotalsMap;
}) {
  const assets = Array.from(
    new Set([
      ...Object.keys(eventsOrdersByAsset || {}),
      ...Object.keys(eventsPayoutsByAsset || {}),
    ])
  ).sort();

  const hasCoin = coinSwapLines && coinSwapLines.length > 0;
  const hasAuto = autoExLines && autoExLines.length > 0;
  const hasEvents = assets.length > 0;

  // Build table data for coin swaps & auto-exchange
  const coinRows = hasCoin
    ? coinSwapLines.map(parseSwapText).map(({ date, out, inn }) => [date, out, inn] as [string, string, string])
    : [];
  const autoRows = hasAuto
    ? autoExLines.map(parseSwapText).map(({ date, out, inn }) => [date, out, inn] as [string, string, string])
    : [];

  if (!hasCoin && !hasAuto && !hasEvents) return null;

  return (
    <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
      {/* COIN SWAPS (TABLE) */}
      {hasCoin && (
        <div className="card">
          <div className="section-head" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>Coin Swaps</h3>
            <div className="btn-row">
              <button
                className="btn small"
                onClick={() => exportRowsAsPNG(["Date", "Out", "In"], coinRows, "coin-swaps.png")}
              >
                Export PNG
              </button>
              <button
                className="btn small"
                onClick={() => copyRowsAsText(["Date", "Out", "In"], coinRows)}
              >
                Copy
              </button>
            </div>
          </div>
          <div className="tablewrap">
            <table className="table mono small">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Date</th>
                  <th style={{ textAlign: "right" }}>Out</th>
                  <th style={{ textAlign: "right" }}>In</th>
                </tr>
              </thead>
              <tbody>
                {coinRows.map(([date, out, inn], i) => (
                  <tr key={i}>
                    <td style={{ color: "#6b7280", textAlign: "left" }}>{date}</td>
                    <td style={{ color: "#dc2626", textAlign: "right" }}>{out}</td>
                    <td style={{ color: "#16a34a", textAlign: "right" }}>{inn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AUTO-EXCHANGE (TABLE) */}
      {hasAuto && (
        <div className="card" style={{ borderLeft: "4px solid #9333ea" }}>
          <div className="section-head" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <h3 className="section-title" style={{ marginBottom: 0, color: "#9333ea" }}>Auto-Exchange</h3>
            <div className="btn-row">
              <button
                className="btn small"
                onClick={() => exportRowsAsPNG(["Date", "Out", "In"], autoRows, "auto-exchange.png")}
              >
                Export PNG
              </button>
              <button
                className="btn small"
                onClick={() => copyRowsAsText(["Date", "Out", "In"], autoRows)}
              >
                Copy
              </button>
            </div>
          </div>
          <div className="tablewrap">
            <table className="table mono small">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Date</th>
                  <th style={{ textAlign: "right" }}>Out</th>
                  <th style={{ textAlign: "right" }}>In</th>
                </tr>
              </thead>
              <tbody>
                {autoRows.map(([date, out, inn], i) => (
                  <tr key={i}>
                    <td style={{ color: "#6b7280", textAlign: "left" }}>{date}</td>
                    <td style={{ color: "#dc2626", textAlign: "right" }}>{out}</td>
                    <td style={{ color: "#16a34a", textAlign: "right" }}>{inn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EVENT CONTRACTS (unchanged) */}
      {hasEvents && (
        <div className="card">
          <h3 className="section-title" style={{ marginBottom: 8 }}>
            Event Contracts — Orders vs Payouts (by Asset)
          </h3>
          <div className="tablewrap">
            <table className="table mono small">
              <thead style={{ background: "#f3f4f6" }}>
                <tr>
                  <th style={{ textAlign: "left" }}>Asset</th>
                  <th style={{ textAlign: "right" }}>Orders +</th>
                  <th style={{ textAlign: "right" }}>Orders −</th>
                  <th style={{ textAlign: "right" }}>Orders Net</th>
                  <th style={{ textAlign: "right" }}>Payouts +</th>
                  <th style={{ textAlign: "right" }}>Payouts −</th>
                  <th style={{ textAlign: "right" }}>Payouts Net</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const o = eventsOrdersByAsset[asset] || { pos: 0, neg: 0, net: 0 };
                  const p = eventsPayoutsByAsset[asset] || { pos: 0, neg: 0, net: 0 };
                  return (
                    <tr key={asset}>
                      <td style={{ textAlign: "left" }}>{asset}</td>
                      <td style={{ textAlign: "right", color: "#16a34a" }}>{fmtTrim(o.pos)}</td>
                      <td style={{ textAlign: "right", color: "#dc2626" }}>-{fmtTrim(o.neg)}</td>
                      <td style={{ textAlign: "right" }}>{fmtTrim(o.net)}</td>
                      <td style={{ textAlign: "right", color: "#16a34a" }}>{fmtTrim(p.pos)}</td>
                      <td style={{ textAlign: "right", color: "#dc2626" }}>-{fmtTrim(p.neg)}</td>
                      <td style={{ textAlign: "right" }}>{fmtTrim(p.net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
