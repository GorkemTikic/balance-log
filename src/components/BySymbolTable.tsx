import React from "react";
import { bySymbolSummary } from "../lib/aggregation";
import { drawSingleRowCanvas, SymbolBlock } from "../lib/draw";
import { fmtAbs, gt } from "../lib/number";

function renderPairs(map: Record<string,{pos:number;neg:number}>) {
  const entries = Object.entries(map).filter(([,v]) => gt(v.pos) || gt(v.neg));
  if (!entries.length) return <span>–</span>;
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

export default function BySymbolTable({
  blocks,
  onCopy,
}: {
  blocks: ReturnType<typeof bySymbolSummary>;
  onCopy: (b: SymbolBlock) => void;
}) {
  if (!blocks.length) return <p className="muted">No symbol activity.</p>;
  return (
    <div className="tablewrap right-scroll">
      <table className="table">
        <thead><tr>
          <th>Symbol</th><th>Realized PnL</th><th>Funding</th><th>Trading Fees</th><th>Insurance</th><th className="actcol">Actions</th>
        </tr></thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.symbol} id={`row-${b.symbol}`}>
              <td className="label">{b.symbol}</td>
              <td className="num">{renderPairs(b.realizedByAsset)}</td>
              <td className="num">{renderPairs(b.fundingByAsset)}</td>
              <td className="num">{renderPairs(b.commByAsset)}</td>
              <td className="num">{renderPairs(b.insByAsset)}</td>
              <td className="actcol">
                <div className="btn-row">
                  <button className="btn btn-ico" title="Copy details" onClick={() => onCopy(b)}>📝</button>
                  <button className="btn btn-ico" title="Save PNG" onClick={() => drawSingleRowCanvas(b)}>🖼️</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
