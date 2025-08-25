import React from "react";
import { Row } from "../types";
import { sumByAsset } from "../utils/aggregation";
import { fmtAbs, fmtSigned, gt, friendlyTypeName } from "../utils/format";

export default function OtherTypesBlock({ rows }: { rows: Row[] }) {
  const byType = new Map<string, Row[]>();
  rows.forEach((r) => {
    const g = byType.get(r.type) || [];
    g.push(r);
    byType.set(r.type, g);
  });
  const keys = Array.from(byType.keys()).sort();

  return (
    <div className="stack">
      {keys.map((t) => {
        const byAsset = sumByAsset(byType.get(t) || []);
        const ks = Object.keys(byAsset);
        return (
          <div key={t} className="typecard">
            <div className="card-head"><h4>{friendlyTypeName(t)}</h4></div>
            {ks.length ? (
              <ul className="kv">
                {ks.map((asset) => {
                  const v = byAsset[asset];
                  return (
                    <li key={asset} className="kv-row">
                      <span className="label">{asset}</span>
                      {gt(v.pos) ? <span className="num good">+{fmtAbs(v.pos)}</span> : <span className="num muted">–</span>}
                      {gt(v.neg) ? <span className="num bad">−{fmtAbs(v.neg)}</span> : <span className="num muted">–</span>}
                      {gt(v.net) ? <span className={`num ${v.net >= 0 ? "good" : "bad"}`}>{fmtSigned(v.net)}</span> : <span className="num muted">–</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (<p className="muted">None</p>)}
          </div>
        );
      })}
    </div>
  );
}
