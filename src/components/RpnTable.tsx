// src/components/RpnTable.tsx
import React from "react";
import Amount from "@/components/Amount";

type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;

export default function RpnTable({ title, map }: { title: string; map: TotalsMap }) {
  const assets = Object.keys(map || {}).sort();
  return (
    <div className="card">
      <div className="section-head">
        <h3 className="section-title">{title}</h3>
      </div>
      <div className="tablewrap horizontal">
        <table className="table mono small">
          <thead>
            <tr>
              <th style={{textAlign:"left"}}>Asset</th>
              <th style={{textAlign:"right"}}>+</th>
              <th style={{textAlign:"right"}}>−</th>
              <th style={{textAlign:"right"}}>Net</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr><td colSpan={4} style={{textAlign:"center", padding:16, color:"#64748b"}}>No entries</td></tr>
            ) : (
              assets.map((a) => {
                const v = map[a];
                return (
                  <tr key={a}>
                    <td style={{textAlign:"left"}}>{a}</td>
                    <td style={{textAlign:"right"}}><Amount value={v.pos} sign="pos" /></td>
                    <td style={{textAlign:"right"}}><Amount value={-v.neg} sign="neg" /></td>
                    <td style={{textAlign:"right"}}><Amount value={v.net} sign="net" /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
