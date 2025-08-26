// src/App.tsx
import React, { useMemo, useState, useEffect } from "react";
import GridPasteBox from "@/components/GridPasteBox";
import RpnCard from "@/components/RpnCard";
import FiltersBar from "@/components/FiltersBar";
import ExportPNG from "@/components/ExportPNG";
import { gt } from "@/lib/format"; // (opsiyonel) kullanmıyorsan bu satırı silebilirsin

type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string;
  ts: number;
  symbol: string;
  extra: string;
  raw: string;
};

const TYPE = {
  REALIZED_PNL: "REALIZED_PNL",
  COMMISSION: "COMMISSION",
  FUNDING_FEE: "FUNDING_FEE",
  INSURANCE_CLEAR: "INSURANCE_CLEAR",
  LIQUIDATION_FEE: "LIQUIDATION_FEE",
  TRANSFER: "TRANSFER",
} as const;

function parseBalanceLog(text: string): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Row[] = [];
  lines.forEach((line) => {
    const cols = line.split(/\t|\s{2,}|\s\|\s/);
    if (cols.length < 6) return;
    const [id, uid, asset, type, amtRaw, time] = cols;
    const amt = Number(amtRaw);
    if (Number.isNaN(amt)) return;
    out.push({
      id,
      uid,
      asset,
      type,
      amount: amt,
      time,
      ts: Date.parse(time),
      symbol: cols[6] || "",
      extra: cols.slice(7).join(" "),
      raw: line,
    });
  });
  return out;
}

function sumByAsset(rows: Row[]) {
  const acc: Record<string, { pos: number; neg: number; net: number }> = {};
  rows.forEach((r) => {
    const a = (acc[r.asset] = acc[r.asset] || { pos: 0, neg: 0, net: 0 });
    if (r.amount >= 0) a.pos += r.amount;
    else a.neg += Math.abs(r.amount);
    a.net += r.amount;
  });
  return acc;
}

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  const [filterSymbol, setFilterSymbol] = useState(
    localStorage.getItem("filterSymbol") || ""
  );
  const [filterT0, setFilterT0] = useState(
    localStorage.getItem("filterT0") || ""
  );
  const [filterT1, setFilterT1] = useState(
    localStorage.getItem("filterT1") || ""
  );

  useEffect(() => {
    localStorage.setItem("filterSymbol", filterSymbol);
  }, [filterSymbol]);
  useEffect(() => {
    localStorage.setItem("filterT0", filterT0);
  }, [filterT0]);
  useEffect(() => {
    localStorage.setItem("filterT1", filterT1);
  }, [filterT1]);

  function runParse(tsv: string) {
    try {
      const rs = parseBalanceLog(tsv);
      setRows(rs);
      setError(rs.length ? "" : "No valid rows");
    } catch (e: any) {
      setError(e.message || String(e));
      setRows([]);
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterSymbol && r.symbol !== filterSymbol) return false; // tam eşleşme; istersen includes() yapabiliriz
      if (filterT0 && r.ts < Date.parse(filterT0)) return false;
      if (filterT1 && r.ts > Date.parse(filterT1)) return false;
      return true;
    });
  }, [rows, filterSymbol, filterT0, filterT1]);

  const realizedByAsset = useMemo(
    () => sumByAsset(filtered.filter((r) => r.type === TYPE.REALIZED_PNL)),
    [filtered]
  );
  const commissionByAsset = useMemo(
    () => sumByAsset(filtered.filter((r) => r.type === TYPE.COMMISSION)),
    [filtered]
  );
  const fundingByAsset = useMemo(
    () => sumByAsset(filtered.filter((r) => r.type === TYPE.FUNDING_FEE)),
    [filtered]
  );
  const insuranceByAsset = useMemo(
    () =>
      sumByAsset(
        filtered.filter(
          (r) => r.type === TYPE.INSURANCE_CLEAR || r.type === TYPE.LIQUIDATION_FEE
        )
      ),
    [filtered]
  );
  const transfersByAsset = useMemo(
    () => sumByAsset(filtered.filter((r) => r.type === TYPE.TRANSFER)),
    [filtered]
  );

  return (
    <div className="container" id="app-root">
      <header className="header">
        <div>
          <h1 className="title">Balance Log Analyzer</h1>
          <div className="subtitle">Phase 3 — Filters & PNG Export</div>
        </div>
        <div className="toolbar">
          <PngExport targetId="app-root" />
        </div>
      </header>

      <FiltersBar
        symbolFilter={filterSymbol}
        setSymbolFilter={setFilterSymbol}
        date0={filterT0}
        setDate0={setFilterT0}
        date1={filterT1}
        setDate1={setFilterT1}
      />

      <section className="space">
        <GridPasteBox onUseTSV={runParse} onError={setError} />
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </section>

      {!!filtered.length && (
        <section className="grid-2" style={{ marginTop: 16 }}>
          <RpnCard title="Realized PnL" map={realizedByAsset} />
          <RpnCard title="Trading Fees / Commission" map={commissionByAsset} />
          <RpnCard title="Funding Fees" map={fundingByAsset} />
          <RpnCard title="Insurance / Liquidation" map={insuranceByAsset} />
          <RpnCard title="Transfers (General)" map={transfersByAsset} />
        </section>
      )}
    </div>
  );
}
