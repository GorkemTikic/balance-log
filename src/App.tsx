// src/App.tsx
import React, { useState, useMemo } from "react";
import GridPasteBox from "./components/GridPasteBox";
import RpnCard from "./components/RpnCard";
import { parseBalanceLog, Row } from "./utils/parser";
import { sumByAsset } from "./utils/summarizer";
import { fmtAbs, fmtSigned } from "./utils/format";
import "./styles.css";

export default function App() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [diags, setDiags] = useState<string[]>([]);
  const [error, setError] = useState("");

  const realizedRows = useMemo(
    () => rows.filter((r) => r.type === "REALIZED_PNL"),
    [rows]
  );

  const commissionRows = useMemo(
    () => rows.filter((r) => r.type === "COMMISSION"),
    [rows]
  );

  const fundingRows = useMemo(
    () => rows.filter((r) => r.type === "FUNDING_FEE"),
    [rows]
  );

  const realizedByAsset = useMemo(() => sumByAsset(realizedRows), [realizedRows]);
  const commissionByAsset = useMemo(() => sumByAsset(commissionRows), [commissionRows]);
  const fundingByAsset = useMemo(() => sumByAsset(fundingRows), [fundingRows]);

  function runParse(tsv: string) {
    setError("");
    try {
      const { rows: rs, diags } = parseBalanceLog(tsv);
      if (!rs.length) throw new Error("No valid rows found.");
      setRows(rs);
      setDiags(diags);
    } catch (e: any) {
      setError(e?.message || "Parsing failed.");
      setRows([]);
      setDiags([]);
    }
  }

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1 className="title">Balance Log Analyzer</h1>
          <p className="subtitle">All times are in UTC+0</p>
        </div>
      </header>

      <GridPasteBox
        onUseTSV={(tsv) => {
          setInput(tsv);
          runParse(tsv);
        }}
        onError={(m) => setError(m)}
      />

      {error && <div className="error">⚠️ {error}</div>}

      {rows.length > 0 && (
        <>
          <section className="grid-2" style={{ marginTop: 24 }}>
            <RpnCard title="Realized PnL" map={realizedByAsset} />
            <RpnCard title="Trading Fees" map={commissionByAsset} />
            <RpnCard title="Funding Fees" map={fundingByAsset} />
          </section>

          <div style={{ marginTop: 20 }}>
            <h3>Parsed Rows: {rows.length}</h3>
            <h4>Diagnostics:</h4>
            <ul className="mono">
              {diags.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
