// src/components/SwapsEvents.tsx
import React from "react";
import { fmtAbs, fmtSigned, gt } from "@/lib/format";


type Line = { time: string; ts: number; text: string };


export default function SwapsEvents({
coinSwapLines,
autoExLines,
eventsOrdersByAsset,
eventsPayoutsByAsset,
}: {
coinSwapLines: Line[];
autoExLines: Line[];
eventsOrdersByAsset: Record<string, { pos: number; neg: number; net: number }>;
eventsPayoutsByAsset: Record<string, { pos: number; neg: number; net: number }>;
}) {
const assets = Array.from(
new Set([
...Object.keys(eventsOrdersByAsset || {}),
...Object.keys(eventsPayoutsByAsset || {}),
])
).sort();


return (
<div className="grid-2" style={{ marginTop: 16 }}>
<div className="card">
<div className="section-head">
<h3 className="section-title">Coin Swaps</h3>
<div className="help">Grouped by second (UTC)</div>
</div>
<ul className="mono" style={{ margin: 0, paddingLeft: 18 }}>
{coinSwapLines.length ? (
coinSwapLines.map((l, i) => <li key={i} style={{ margin: "4px 0" }}>• {l.text}</li>)
) : (
<li className="muted">None</li>
)}
</ul>
</div>


<div className="card">
<div className="section-head">
<h3 className="section-title">Auto-Exchange</h3>
<div className="help">Grouped by second (UTC)</div>
</div>
<ul className="mono" style={{ margin: 0, paddingLeft: 18 }}>
{autoExLines.length ? (
autoExLines.map((l, i) => <li key={i} style={{ margin: "4px 0" }}>• {l.text}</li>)
) : (
<li className="muted">None</li>
)}
</ul>
</div>


<div className="card" style={{ gridColumn: "1 / -1" }}>
<div className="section-head">
<h3 className="section-title">Event Contracts</h3>
<div className="help">Orders (−) and Payouts (+)</div>
</div>
<div className="table-wrap">
<table className="table">
<thead>
<tr>
<th>Asset</th>
<th>Orders (−)</th>
<th>Payouts (+)</th>
<th>Net</th>
</tr>
</thead>
<tbody>
{assets.length ? (
}
