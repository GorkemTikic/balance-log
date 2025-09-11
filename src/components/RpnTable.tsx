// src/components/RpnTable.tsx
import React from "react";

export type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;

/* --- Number formatter to expand scientific notation --- */
function fmtTrim(value: number) {
  if (!Number.isFinite(value)) return "0";
  let s = value.toString();

  // Expand scientific notation
  if (/e/i.test(s)) {
    s = value.toFixed(20);
  }

  // Trim trailing zeros
  if (s.includes(".")) {
    s = s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  }

  // Keep leading zero for decimals
  if (s.startsWith(".")) {
    s = "0" + s;
  }
  if (s.startsWith("-.") ) {
    s = "-0" + s.slice(1);
  }

  return s === "-0" ? "0" : s;
}

export default function RpnTable({ title, map }: { title: string; map: TotalsMap }) {
  // Filter out assets that are entirely zero
  const rows = Object.entries(map)
    .filter(([, v]) => !(v.pos === 0 && v.neg === 0 && v.net === 0))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="card">
      <h3 className="section-title" style={{ marginBottom: 8 }}>{title}</h3>
      {rows.length === 0 ? (
        <div className="muted small">No activity.</div>
      ) : (
        <table
          className="table mono small"
          style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Asset</th>
              <th style={{ textAlign: "left" }}>Totals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([asset, v], i) => {
              const parts: string[] = [];
              if (v.pos !== 0) parts.push(`+${fmtTrim(v.pos)}`);
              if (v.neg !== 0) parts.push(`−${fmtTrim(v.neg)}`);
              parts.push(`= ${fmtTrim(v.net)}`);

              return (
                <tr
                  key={asset}
                  style={{ background: i % 2 ? "#fafafa" : "transparent" }}
                >
                  <td style={{ fontWeight: 700 }}>{asset}</td>
                  <td>
                    <span style={{ whiteSpace: "pre-wrap" }}>
                      {parts.join("  ")}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
