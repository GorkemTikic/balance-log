import React from "react";

export default function SwapsSection({
  coinSwapLines, autoExLines, onCopyCoin, onCopyAuto,
}: {
  coinSwapLines: { text: string }[];
  autoExLines: { text: string }[];
  onCopyCoin: () => void;
  onCopyAuto: () => void;
}) {
  return (
    <div className="card">
      <div className="card-head" style={{ justifyContent: "space-between" }}>
        <h2>Swaps (UTC+0)</h2>
        <div className="btn-row">
          <button className="btn" onClick={onCopyCoin}>Copy Coin Swaps</button>
          <button className="btn" onClick={onCopyAuto}>Copy Auto-Exchange</button>
        </div>
      </div>
      <div className="grid two" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <div>
          <h4 className="muted">Coin Swaps</h4>
          {coinSwapLines.length ? <ul className="list">{coinSwapLines.map((s,i)=><li key={i} className="num">{s.text}</li>)}</ul> : <p className="muted">None</p>}
        </div>
        <div>
          <h4 className="muted">Auto-Exchange</h4>
          {autoExLines.length ? <ul className="list">{autoExLines.map((s,i)=><li key={i} className="num">{s.text}</li>)}</ul> : <p className="muted">None</p>}
        </div>
      </div>
      <p className="hint">Each line groups all legs that happened at the same second (UTC+0). Types are kept separate.</p>
    </div>
  );
}
