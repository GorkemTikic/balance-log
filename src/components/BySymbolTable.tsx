// src/components/BySymbolTable.tsx
import React from "react";
import { fmtAbs, fmtSigned, gt } from "../lib/utils";
import { drawSingleRowCanvas } from "../lib/draw";

export type SymbolBlock = {
  symbol: string;
  realizedByAsset: Record<string, { pos: number; neg: number }>;
  fundingByAsset: Record<string, { pos: number; neg: number }>;
  commByAsset: Record<string, { pos: number; neg: number }>;
  insByAsset: Record<string, { pos: number; neg: number }>;
};

function renderAssetPairs(map: Record<string, { pos: number; neg: number }>) {
  const entries = Object.entries(map).filter(([, v]) => gt(v.pos) || gt(v.neg));
  if (!entries.length) return <span>–</span>;
  return (
    <>
      {entries.map(([asset, v], i) => (
        <span key={asset} className="pair">
          {gt(v.pos) && <span className="good">+{fmtAbs(v.pos)}</span>}
          {gt(v.pos) && gt(v.neg) && " / "}
          {gt(v.neg) && <span className="bad">−{fmtAbs(v.neg)}</span>}{" "}
          {asset}
          {i < entries.length - 1 ? ", " : ""}
        </span>
      ))}
    </>
  );
}

export default function BySymbolTable({
  blocks,
  onCopyOne,
}: {
  blocks: SymbolBlock[];
  onCopyOne: (b: SymbolBlock) => void;
}) {
  if (!blocks.length) return <p className="muted">No symbol activity.</p>;
  return (
    <div className="tablewrap right-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Realized PnL</th>
            <th>Funding</th>
            <th>Trading Fees</th>
            <th>Insurance</th>
            <th className="actcol">Actions</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.symbol} id={`row-${b.symbol}`}>
              <td className="label">{b.symbol}</td>
              <td className="num">{renderAssetPairs(b.realizedByAsset)}</td>
              <td className="num">{renderAssetPairs(b.fundingByAsset)}</td>
              <td className="num">{renderAssetPairs(b.commByAsset)}</td>
              <td className="num">{renderAssetPairs(b.insByAsset)}</td>
              <td className="actcol">
                <div className="btn-row">
                  <button className="btn btn-ico" aria-label="Copy details" title="Copy details" onClick={() => onCopyOne(b)}>📝</button>
                  <button className="btn btn-ico" aria-label="Save PNG" title="Save PNG" onClick={() => drawSingleRowCanvas(b)}>🖼️</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
