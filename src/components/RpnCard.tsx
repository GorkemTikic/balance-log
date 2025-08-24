// src/components/RpnCard.tsx
import React from "react";

type AssetSummary = {
  pos: number;
  neg: number;
  net: number;
};

type RpnCardProps = {
  title: string;
  map: Record<string, AssetSummary>;
};

const EPS = 1e-12;

const abs = (x: number) => Math.abs(Number(x) || 0);
const gt = (x: number) => abs(x) > EPS;

function fmtAbs(x: number, maxDp = 12) {
  const v = abs(x);
  const s = v.toString().includes("e") ? v.toFixed(12) : v.toString();
  return s;
}

function fmtSigned(x: number, maxDp = 12) {
  const n = Number(x) || 0;
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${fmtAbs(n, maxDp)}`;
}

export default function RpnCard({ title, map }: RpnCardProps) {
  const keys = Object.keys(map);

  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
      </div>
      {keys.length ? (
        <ul className="kv">
          {keys.map((asset) => {
            const v = map[asset];
            const chunks: React.ReactNode[] = [];

            if (gt(v.pos)) chunks.push(<span key="p" className="num good">+{fmtAbs(v.pos)}</span>);
            if (gt(v.neg)) chunks.push(<span key="n" className="num bad">−{fmtAbs(v.neg)}</span>);

            const netEl = gt(v.net) ? (
              <span key="net" className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span>
            ) : (
              <span key="dash" className="num muted">–</span>
            );

            return (
              <li key={asset} className="kv-row">
                <span className="label">{asset}</span>
                {chunks.length ? chunks : <span className="num muted">–</span>}
                {chunks.length > 1 ? null : <span className="num muted"></span>}
                {netEl}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">None</p>
      )}
    </div>
  );
}
