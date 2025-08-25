// src/components/EventSummary.tsx
import React from "react";
import { Row, TYPE } from "../lib/types";
import { sumByAsset } from "../lib/aggregation";
import { fmtAbs, fmtSigned } from "../lib/utils";

export default function EventSummary({ rows }: { rows: Row[] }) {
  const orders = rows.filter((r) => r.type === TYPE.EVENT_ORDER);
  const payouts = rows.filter((r) => r.type === TYPE.EVENT_PAYOUT);
  const byOrder = sumByAsset(orders);
  const byPayout = sumByAsset(payouts);
  const assets = Array.from(new Set([...Object.keys(byOrder), ...Object.keys(byPayout)])).sort();

  if (!assets.length) return <p className="muted">No event activity.</p>;

  return (
    <div className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Payout (Received)</th>
            <th>Orders (Paid)</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const p = byPayout[asset] || { pos: 0, neg: 0, net: 0 };
            const o = byOrder[asset] || { pos: 0, neg: 0, net: 0 };
            const net = (p.net || 0) + (o.net || 0);
            return (
              <tr key={asset}>
                <td className="label">{asset}</td>
                <td className="num good">+{fmtAbs(p.pos)}</td>
                <td className="num bad">−{fmtAbs(o.neg)}</td>
                <td className={`num ${net >= 0 ? "good" : "bad"}`}>{fmtSigned(net)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
