import React from "react";
import { ByAssetMap } from "../types";
import { fmtAbs, fmtSigned } from "../utils/format";
import { EPS } from "../constants";

export default function SummaryCards(props: {
  title: string;
  map: ByAssetMap;
}){
  const entries = Object.entries(props.map);
  return (
    <div className="panel">
      <div className="panel-head"><h3 style={{margin:0}}>{props.title}</h3></div>
      {entries.length ? (
        <div className="grid auto">
          {entries.map(([asset, v]) => {
            const netClass = v.net > EPS ? "good" : v.net < -EPS ? "bad" : "muted";
            return (
              <div key={asset} className="kpi-card" title={asset}>
                <div className="kpi-title">{asset}</div>
                <div className={`kpi-value ${netClass}`}>{v.net === 0 ? "0" : fmtSigned(v.net)}</div>
                <div className="muted" style={{marginTop:6,fontSize:12}}>
                  +{fmtAbs(v.pos)} / −{fmtAbs(v.neg)}
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className="muted">No data.</p>}
    </div>
  );
}
