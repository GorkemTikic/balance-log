// src/components/RawTable.tsx
import React from "react";
import { Row } from "../lib/types";

export default function RawTable({ rows, onCopy, onDownload }: {
  rows: Row[];
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="card">
      <div className="card-head" style={{ justifyContent: "space-between" }}>
        <h2>Raw Parsed Table (Excel-like)</h2>
        <div className="btn-row">
          <button className="btn" onClick={onCopy}>Copy TSV</button>
          <button className="btn" onClick={onDownload}>Download CSV</button>
        </div>
      </div>
      <div className="tablewrap">
        <table className="table mono small">
          <thead>
            <tr>{["time","type","asset","amount","symbol","id","uid","extra"].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.time}</td>
                <td>{r.type}</td>
                <td>{r.asset}</td>
                <td className="num">{r.amount >= 0 ? `+${r.amount}` : `−${Math.abs(r.amount)}`}</td>
                <td>{r.symbol}</td>
                <td>{r.id}</td>
                <td>{r.uid}</td>
                <td>{r.extra}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
