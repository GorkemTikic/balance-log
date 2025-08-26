// src/components/SymbolTable.tsx
import React, { useMemo } from "react";
import ExportPNG from "@/components/ExportPNG";

/** App tarafındaki satır tipinin sadeleştirilmiş hâli */
export type Row = {
  symbol: string;
  asset: string;
  type: string;
  amount: number;
};

/** App'ten gelen satırlar (EVENT_CONTRACTS_* dahil/haric App.tsx karar verir) bu bileşene verilir */
export default function SymbolTable({ rows }: { rows: Row[] }) {
  // ---- helpers ----
  const fmt = (n: number) => (Number.isFinite(n) ? n.toString() : "0");
  const isEmptyMap = (m: Record<string, { pos: number; neg: number; net: number }>) =>
    Object.keys(m || {}).length === 0;

  function sumByAsset(rs: Row[]) {
    const acc: Record<string, { pos: number; neg: number; net: number }> = {};
    for (const r of rs) {
      const a = (acc[r.asset] ||= { pos: 0, neg: 0, net: 0 });
      if (r.amount >= 0) a.pos += r.amount;
      else a.neg += Math.abs(r.amount);
      a.net += r.amount;
    }
    return acc;
  }

  // ---- build blocks by symbol ----
  type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;
  type Block = {
    symbol: string;
    realized: TotalsMap;
    funding: TotalsMap;
    commission: TotalsMap;
    insurance: TotalsMap;
  };

  const blocks = useMemo<Block[]>(() => {
    if (!rows?.length) return [];
    const bySym = new Map<string, Row[]>();
    for (const r of rows) {
      if (!r.symbol) continue;
      const g = bySym.get(r.symbol) || [];
      g.push(r);
      bySym.set(r.symbol, g);
    }
    const out: Block[] = [];
    for (const [sym, rs] of bySym.entries()) {
      const realized = rs.filter((r) => r.type === "REALIZED_PNL");
      const funding = rs.filter((r) => r.type === "FUNDING_FEE");
      const commission = rs.filter((r) => r.type === "COMMISSION");
      const insurance = rs.filter(
        (r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE"
      );
      const rMap = sumByAsset(realized);
      const fMap = sumByAsset(funding);
      const cMap = sumByAsset(commission);
      const iMap = sumByAsset(insurance);

      // hiç anlamlı toplam yoksa atla
      if (
        isEmptyMap(rMap) &&
        isEmptyMap(fMap) &&
        isEmptyMap(cMap) &&
        isEmptyMap(iMap)
      )
        continue;

      out.push({
        symbol: sym,
        realized: rMap,
        funding: fMap,
        commission: cMap,
        insurance: iMap,
      });
    }
    out.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return out;
  }, [rows]);

  // ---- text builders (copy & PNG export için) ----
  const buildBlockText = (b: Block) => {
    const lines: string[] = [];
    const sect = (title: string, m: TotalsMap) => {
      const keys = Object.keys(m).sort();
      if (!keys.length) return;
      lines.push(`  ${title}:`);
      for (const k of keys) {
        const v = m[k];
        lines.push(
          `    • ${k}  +${fmt(v.pos)}  −${fmt(v.neg)}  = ${fmt(v.net)}`
        );
      }
    };
    lines.push(`Symbol: ${b.symbol}`);
    sect("Realized PnL", b.realized);
    sect("Funding", b.funding);
    sect("Trading Fees", b.commission);
    sect("Insurance/Liq.", b.insurance);
    return lines.join("\n");
  };

  const buildAllText = () => blocks.map((b) => buildBlockText(b)).join("\n\n");

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(buildAllText());
      alert("All symbol details copied to clipboard.");
    } catch (e) {
      alert("Copy failed. Your browser may not allow clipboard write.");
    }
  }

  // ---- UI ----
  if (!blocks.length) {
    return (
      <div className="card">
        <div className="section-head">
          <h3 className="section-title">By Symbol (Futures, not Events)</h3>
        </div>
        <div className="muted">No symbol activity.</div>
      </div>
    );
  }

  // Kolon genişliklerini garantilemek için colgroup kullanıyoruz
  const colStyles = {
    sym:  { width: 140 },     // sembol sabit genişlik, nowrap
    col:  { width: 1 },       // içerik genişledikçe büyür
    act:  { width: 170 },     // actions sabit
  } as const;

  const renderMap = (m: Record<string, { pos: number; neg: number; net: number }>) => {
    const keys = Object.keys(m).sort();
    if (!keys.length) return <span className="muted">—</span>;
    return (
      <div style={{ display: "grid", gap: 4 }}>
        {keys.map((k) => {
          const v = m[k];
          return (
            <div key={k} className="nowrap">
              {k}{" "}
              <span style={{ color: "#0b7a0b" }}>+{fmt(v.pos)}</span>{" "}
              <span style={{ color: "#a01212" }}>−{fmt(v.neg)}</span>{" "}
              <strong>= {fmt(v.net)}</strong>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="section-head" style={{ alignItems: "center" }}>
        <h3 className="section-title">By Symbol (Futures, not Events)</h3>
        <div className="btn-row">
          {/* tüm semboller için toplu butonlar */}
          <ExportPNG text={buildAllText()} fileName="symbols-all.png" width={1400} />
          <button className="btn" onClick={copyAll}>Copy ALL (text)</button>
        </div>
      </div>

      <div className="tablewrap horizontal" style={{ maxHeight: 560, overflow: "auto" }}>
        <table
          className="table mono small"
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
          }}
        >
          <colgroup>
            <col style={{ width: colStyles.sym.width }} />
            <col style={{ width: colStyles.col.width }} />
            <col style={{ width: colStyles.col.width }} />
            <col style={{ width: colStyles.col.width }} />
            <col style={{ width: colStyles.act.width }} />
          </colgroup>

          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  position: "sticky",
                  top: 0,
                  background: "#fff",
                  zIndex: 1,
                }}
              >
                Symbol
              </th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>
                Realized PnL
              </th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>
                Funding
              </th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>
                Trading Fees
              </th>
              <th style={{ textAlign: "right", position: "sticky", top: 0, background: "#fff" }}>
                Actions
              </th>
            </tr>
          </thead>

          <tbody>
            {blocks.map((b, i) => {
              const textForRow = buildBlockText(b);
              return (
                <tr
                  key={b.symbol}
                  style={{
                    background: i % 2 === 0 ? "transparent" : "#fafafa",
                  }}
                >
                  <td
                    style={{
                      textAlign: "left",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      wordBreak: "keep-all",
                      minWidth: colStyles.sym.width,
                      maxWidth: colStyles.sym.width,
                    }}
                    title={b.symbol}
                  >
                    {b.symbol}
                  </td>

                  <td style={{ textAlign: "left", verticalAlign: "top" }}>
                    {renderMap(b.realized)}
                  </td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>
                    {renderMap(b.funding)}
                  </td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>
                    {renderMap(b.commission)}
                  </td>

                  <td
                    style={{
                      textAlign: "right",
                      whiteSpace: "nowrap",
                      verticalAlign: "top",
                    }}
                  >
                    <ExportPNG
                      text={textForRow}
                      fileName={`symbol-${b.symbol}.png`}
                      width={1000}
                    />
                    <button
                      className="btn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(textForRow);
                          alert(`${b.symbol} details copied.`);
                        } catch {
                          alert("Copy failed.");
                        }
                      }}
                    >
                      Copy
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
