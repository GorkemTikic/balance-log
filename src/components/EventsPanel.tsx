import React from "react";
import { ByAssetMap } from "../types";
import { fmtAbs, fmtSigned, gt } from "../utils/format";

export default function EventsPanel(props: {
  orders: ByAssetMap;
  payouts: ByAssetMap;
}){
  const assets = Array.from(new Set([...Object.keys(props.orders), ...Object.keys(props.payouts)])).sort();
  return (
    <div className="panel">
      <div className="panel-head"><h3 style={{margin:0}}>Event Contracts</h3></div>
      {assets.length ? (
        <div className="tablewrap">
          <table className="table">
            <thead><tr><th>Asset</th><th>Payouts</th><th>Orders</th><th>Net</th></tr></thead>
            <tbody>
              {assets.map(a => {
                const p = props.payouts[a] || {pos:0,neg:0,net:0};
                const o = props.orders[a]  || {pos:0,neg:0,net:0};
                const net = (p.net||0)+(o.net||0);
                return (
                  <tr key={a}>
                    <td className="mono">{a}</td>
                    <td className="num">{gt(p.pos)?`+${fmtAbs(p.pos)}`:"0"}</td>
                    <td className="num">{gt(o.neg)?`−${fmtAbs(o.neg)}`:"0"}</td>
                    <td className={`num ${net>0?"good":net<0?"bad":"muted"}`}>{net===0?"0":fmtSigned(net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No event activity.</p>}
    </div>
  );
}
