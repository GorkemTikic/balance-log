// src/components/SymbolTable.tsx
import React from "react";
import { fmtAbs, gt } from "@/lib/format";


export type SymbolBlock = {
symbol: string;
realizedByAsset: Record<string, { pos: number; neg: number }>;
fundingByAsset: Record<string, { pos: number; neg: number }>;
commByAsset: Record<string, { pos: number; neg: number }>;
insByAsset: Record<string, { pos: number; neg: number }>;
};


function renderPairs(map: Record<string, { pos: number; neg: number }>) {
const entries = Object.entries(map).filter(([, v]) => gt(v.pos) || gt(v.neg));
if (!entries.length) return <span className="muted">–</span>;
return (
<>
{entries.map(([asset, v], i) => (
<span key={asset} className="pair">
{gt(v.pos) && <span className="good">+{fmtAbs(v.pos)}</span>}
{gt(v.pos) && gt(v.neg) && " / "}
{gt(v.neg) && <span className="bad">−{fmtAbs(v.neg)}</span>} {asset}
{i < entries.length - 1 ? ", " : ""}
</span>
))}
</>
);
}


export default function SymbolTable({
blocks,
onFocus,
}: {
blocks: SymbolBlock[];
onFocus?: (symbol: string) => void;
}) {
return (
<div className="card">
<div className="section-head">
<h3 className="section-title">By Symbol (Futures, not Events)</h3>
<div className="help">Aggregated across Realized PnL, Funding, Fees, Insurance</div>
</div>
<div className="table-wrap">
<table className="table">
<thead>
<tr>
<th style={{ minWidth: 120 }}>Symbol</th>
<th>Realized PnL</th>
<th>Funding</th>
<th>Trading Fees</th>
<th>Insurance</th>
</tr>
</thead>
<tbody>
{blocks.length ? (
blocks.map((b) => (
<tr id={`row-${b.symbol}`} key={b.symbol}>
<td>
<button className="btn btn-small btn-ghost" onClick={() => onFocus?.(b.symbol)}>{b.symbol}</button>
</td>
<td className="mono">{renderPairs(b.realizedByAsset)}</td>
<td className="mono">{renderPairs(b.fundingByAsset)}</td>
<td className="mono">{renderPairs(b.commByAsset)}</td>
<td className="mono">{renderPairs(b.insByAsset)}</td>
</tr>
))
) : (
<tr>
<td colSpan={5} className="muted">No symbol activity.</td>
</tr>
)}
</tbody>
</table>
</div>
</div>
);
}
