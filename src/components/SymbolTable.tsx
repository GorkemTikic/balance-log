import React from "react";
import { fmtAbs, gt } from "../utils/format";

export default function SymbolTable(props: {
  blocks: Array<{
    symbol: string;
    realizedByAsset: Record<string,{pos:number;neg:number;net:number}>;
    fundingByAsset:  Record<string,{pos:number;neg:number;net:number}>;
    commByAsset:     Record<string,{pos:number;neg:number;net:number}>;
    insByAsset:      Record<string,{pos:number;neg:number;net:number}>;
  }>;
}){
  return (
    <div className="panel">
      <div className="panel-head"><h3 style={{margin:0}}>By Symbol (Futures, not Events)</h3></div>
      {props.blocks.length ? (
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Realized PnL</th>
                <th>Funding</th>
                <th>Trading Fees</th>
                <th>Insurance</th>
              </tr>
            </thead>
            <tbody>
              {props.blocks.map(b => (
                <tr key={b.symbol}>
                  <td className="mono">{b.symbol}</td>
                  <td className="num">{pairText(b.realizedByAsset)}</td>
                  <td className="num">{pairText(b.fundingByAsset)}</td>
                  <td className="num">{pairText(b.commByAsset)}</td>
                  <td className="num">{pairText(b.insByAsset)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No symbol activity.</p>}
    </div>
  );
}

function pairText(m: Record<string,{pos:number;neg:number}>){
  const entries = Object.entries(m).filter(([,v]) => gt(v.pos) || gt(v.neg));
  if (!entries.length) return "—";
  return entries.map(([a,v])=>{
    const p = gt(v.pos) ? `+${fmtAbs(v.pos)}` : "0";
    const n = gt(v.neg) ? `−${fmtAbs(v.neg)}` : "0";
    return `${p} / ${n} ${a}`;
  }).join("; ");
}
