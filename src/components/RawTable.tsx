import React from "react";
import { Row } from "../lib/types";
import { fmtSigned, toCsv } from "../lib/number";

export default function RawTable({ rows }: { rows: Row[] }) {
  const headers = ["time","type","asset","amount","symbol","id","uid","extra"] as const;
  return (
    <div className="card">
      <div className="card-head" style={{ justifyContent:"space-between" }}>
        <h2>Raw Parsed Table (Excel-like)</h2>
        <div className="btn-row">
          <button className="btn" onClick={()=>{
            const L=[headers.join("\t")];
            rows.forEach(r=>L.push([r.time,r.type,r.asset,r.amount,r.symbol,r.id,r.uid,r.extra].join("\t")));
            navigator.clipboard.writeText(L.join("\n"));
          }}>Copy TSV</button>
          <button className="btn" onClick={()=>{
            const csv = toCsv(rows.map(r=>({time:r.time,type:r.type,asset:r.asset,amount:r.amount,symbol:r.symbol,id:r.id,uid:r.uid,extra:r.extra})));
            const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob);
            const a=document.createElement("a"); a.href=url; a.download="balance_log.csv"; a.click(); URL.revokeObjectURL(url);
          }}>Download CSV</button>
        </div>
      </div>
      <div className="tablewrap">
        <table className="table mono small">
          <thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={i}>
                <td>{r.time}</td><td>{r.type}</td><td>{r.asset}</td>
                <td className="num">{fmtSigned(r.amount)}</td>
                <td>{r.symbol}</td><td>{r.id}</td><td>{r.uid}</td><td>{r.extra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
