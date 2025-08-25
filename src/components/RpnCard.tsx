import React from "react";
import { fmtAbs, fmtSigned, gt } from "../utils/format";

export default function RpnCard({
  title,
  map,
}: {
  title: string;
  map: Record<string, { pos: number; neg: number; net: number }>;
}) {
  const keys = Object.keys(map);
  return (
    <div className="card">
      <div className="card-head"><h3>{title}</h3></div>
      {keys.length ? (
        <ul className="kv">
          {keys.map((asset) => {
            const v = map[asset];
            const chunks: React.ReactNode[] = [];
            if (gt(v.pos)) chunks.push(<span key="p" className="num good">+{fmtAbs(v.pos)}</span>);
            if (gt(v.neg)) chunks.push(<span key="n" className="num bad">−{fmtAbs(v.neg)}</span>);
            const netEl = gt(v.net)
              ? <span key="net" className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span>
              : <span key="dash" className="num muted">–</span>;
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
      ) : <p className="muted">None</p>}
    </div>
  );
}
