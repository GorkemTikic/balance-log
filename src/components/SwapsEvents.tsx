// src/components/SwapsEvents.tsx
import React from "react";

type Line = { time: string; ts: number; text: string };
type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;

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
  const fmt = (n: number) =>
    Number.isFinite(n) ? String(Math.round(n * 1e8) / 1e8) : "0";

  const assets = Array.from(
    new Set([
      ...Object.keys(eventsOrdersByAsset || {}),
      ...Object.keys(eventsPayoutsByAsset || {}),
    ])
  ).sort();

  const hasCoin = coinSwapLines && coinSwapLines.length > 0;
  const hasAuto = autoExLines && autoExLines.length > 0;
  const hasEvents = assets.length > 0;

  if (!hasCoin && !hasAuto && !hasEvents) return null;

  return (
    <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
      {/* COIN SWAPS */}
      {hasCoin && (
        <div className="card">
          <h3 className="section-title" style={{ marginBottom: 8 }}>
            Coin Swaps
          </h3>
          <ul className="mono small" style={{ lineHeight: "20px" }}>
            {coinSwapLines.map((l, i) => (
              <li key={i}>{l.text}</li>
            ))}
          </ul>
        </div>
      )}

      {/* AUTO-EXCHANGE */}
      {hasAuto && (
        <div className="card">
          <h3 className="section-title" style={{ marginBottom: 8 }}>
            Auto-Exchange
          </h3>
          <ul className="mono small" style={{ lineHeight: "20px" }}>
            {autoExLines.map((l, i) => (
              <li key={i}>{l.text}</li>
            ))}
          </ul>
        </div>
      )}

      {/* EVENT CONTRACTS */}
      {hasEvents && (
        <div className="card">
          <h3 className="section-title" style={{ marginBottom: 8 }}>
            Event Contracts — Orders vs Payouts (by Asset)
          </h3>
          <div className="tablewrap">
            <table className="table mono small">
              <thead>
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
                  const o = eventsOrdersByAsset[asset] || {
                    pos: 0,
                    neg: 0,
                    net: 0,
                  };
                  const p = eventsPayoutsByAsset[asset] || {
                    pos: 0,
                    neg: 0,
                    net: 0,
                  };
                  return (
                    <tr key={asset}>
                      <td style={{ textAlign: "left" }}>{asset}</td>
                      <td style={{ textAlign: "right" }}>{fmt(o.pos)}</td>
                      <td style={{ textAlign: "right" }}>-{fmt(o.neg)}</td>
                      <td style={{ textAlign: "right" }}>{fmt(o.net)}</td>
                      <td style={{ textAlign: "right" }}>{fmt(p.pos)}</td>
                      <td style={{ textAlign: "right" }}>-{fmt(p.neg)}</td>
                      <td style={{ textAlign: "right" }}>{fmt(p.net)}</td>
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
