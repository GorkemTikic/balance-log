// src/components/FiltersBar.tsx
import React from "react";

export default function FiltersBar({
  symbolFilter,
  setSymbolFilter,
  date0,
  setDate0,
  date1,
  setDate1,
}: {
  symbolFilter: string;
  setSymbolFilter: (v: string) => void;
  date0: string;
  setDate0: (v: string) => void;
  date1: string;
  setDate1: (v: string) => void;
}) {
  return (
    <div className="card" style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
      <div>
        <label className="mono small">Symbol</label>
        <input
          className="btn"
          style={{ textAlign: "left" }}
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          placeholder="e.g. BTCUSDT"
        />
      </div>
      <div>
        <label className="mono small">From (UTC+0)</label>
        <input
          className="btn"
          style={{ textAlign: "left" }}
          value={date0}
          onChange={(e) => setDate0(e.target.value)}
          placeholder="YYYY-MM-DD HH:MM:SS"
        />
      </div>
      <div>
        <label className="mono small">To (UTC+0)</label>
        <input
          className="btn"
          style={{ textAlign: "left" }}
          value={date1}
          onChange={(e) => setDate1(e.target.value)}
          placeholder="YYYY-MM-DD HH:MM:SS"
        />
      </div>
    </div>
  );
}
