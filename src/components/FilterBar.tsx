// src/components/FilterBar.tsx
import React from "react";

export type Filters = {
  t0: string; // UTC start (YYYY-MM-DD HH:MM:SS)
  t1: string; // UTC end (YYYY-MM-DD HH:MM:SS)
  symbol: string; // substring match on symbol
  show: {
    realized: boolean;
    funding: boolean;
    commission: boolean;
    insurance: boolean;
    transfers: boolean;
    coinSwaps: boolean;
    autoExchange: boolean;
    events: boolean;
  };
};

export default function FilterBar({
  value,
  onChange,
  onReset,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
  onReset?: () => void;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const setShow = (k: keyof Filters["show"], v: boolean) =>
    onChange({ ...value, show: { ...value.show, [k]: v } });

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="section-head" style={{ alignItems: "center" }}>
        <h3 className="section-title">Filters</h3>
        <div className="btn-row">
          {onReset && <button className="btn" onClick={onReset}>Reset</button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <label className="muted">Start (UTC+0)
          <input
            className="btn"
            style={{ width: "100%", textAlign: "left", marginTop: 6 }}
            value={value.t0}
            onChange={(e) => set({ t0: e.target.value })}
            placeholder="YYYY-MM-DD HH:MM:SS"
          />
        </label>
        <label className="muted">End (UTC+0)
          <input
            className="btn"
            style={{ width: "100%", textAlign: "left", marginTop: 6 }}
            value={value.t1}
            onChange={(e) => set({ t1: e.target.value })}
            placeholder="YYYY-MM-DD HH:MM:SS"
          />
        </label>
        <label className="muted">Symbol contains
          <input
            className="btn"
            style={{ width: "100%", textAlign: "left", marginTop: 6 }}
            value={value.symbol}
            onChange={(e) => set({ symbol: e.target.value })}
            placeholder="e.g. BTC, ETH, PEPEUSDT"
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 10 }}>
        <label><input type="checkbox" checked={value.show.realized}    onChange={(e) => setShow("realized", e.target.checked)} /> Realized PnL</label>
        <label><input type="checkbox" checked={value.show.funding}     onChange={(e) => setShow("funding", e.target.checked)} /> Funding</label>
        <label><input type="checkbox" checked={value.show.commission}  onChange={(e) => setShow("commission", e.target.checked)} /> Trading Fees</label>
        <label><input type="checkbox" checked={value.show.insurance}   onChange={(e) => setShow("insurance", e.target.checked)} /> Insurance/Liq.</label>
        <label><input type="checkbox" checked={value.show.transfers}   onChange={(e) => setShow("transfers", e.target.checked)} /> Transfers</label>
        <label><input type="checkbox" checked={value.show.coinSwaps}   onChange={(e) => setShow("coinSwaps", e.target.checked)} /> Coin Swaps</label>
        <label><input type="checkbox" checked={value.show.autoExchange}onChange={(e) => setShow("autoExchange", e.target.checked)} /> Auto-Exchange</label>
        <label><input type="checkbox" checked={value.show.events}      onChange={(e) => setShow("events", e.target.checked)} /> Event Contracts</label>
      </div>
    </div>
  );
}
