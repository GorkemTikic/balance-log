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

/** App'ten gelen satırlar (EVENT_CONTRACTS_* hariç) bu bileşene verilir */
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

      // sembolde hiç anlamlı bir toplam yoksa atla
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

  const buildAllText = () =>
    blocks.map((b) => buildBlockText(b)).join("\n\n");

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

  return (
    <div className="card">
      <div className="section-head" style={{ alignItems: "center" }}>
        <h3 className="section-title">By Symbol (Futures, not Events)</h3>
        <div className="btn-row">
          {/* tüm semboller için toplu butonlar */}
          <ExportPNG
            text={buildAllText()}
            fileName="symbols-all.png"
            width={1400}
          />
          <button className="btn" onClick={copyAll}>
            Copy ALL (text)
          </button>
        </div>
      </div>

      {/* tablo */}
      <div
        className="tablewrap horizontal"
        style={{ maxHeight: 520, overflow: "auto" }}
      >
        <table className="table mono small" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Symbol</th>
              <th style={{ textAlign: "left" }}>Realized PnL</th>
              <th style={{ textAlign: "left" }}>Funding</th>
              <th style={{ textAlign: "left" }}>Trading Fees</th>
              <th style={{ textAlign: "left" }}>Insurance / Liq.</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => {
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

              const textForRow = buildBlockText(b);

              return (
                <tr key={b.symbol}>
                  <td style={{ textAlign: "left", fontWeight: 700 }}>
                    {b.symbol}
                  </td>
                  <td style={{ textAlign: "left" }}>{renderMap(b.realized)}</td>
                  <td style={{ textAlign: "left" }}>{renderMap(b.funding)}</td>
                  <td style={{ textAlign: "left" }}>{renderMap(b.commission)}</td>
                  <td style={{ textAlign: "left" }}>{renderMap(b.insurance)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
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
