// src/components/SymbolTable.tsx
import React, { useMemo } from "react";
import ExportPNG from "@/components/ExportPNG";

export type Row = { symbol: string; asset: string; type: string; amount: number };

export default function SymbolTable({ rows }: { rows: Row[] }) {
  const fmt = (n: number) => (Number.isFinite(n) ? (Math.round(n * 1e12) / 1e12).toString() : "0");

  function sumByAsset(rs: Row[]) {
    const acc: Record<string, { pos: number; neg: number; net: number }> = {};
    for (const r of rs) {
      const a = (acc[r.asset] ||= { pos: 0, neg: 0, net: 0 });
      if (r.amount >= 0) a.pos += r.amount; else a.neg += Math.abs(r.amount);
      a.net += r.amount;
    }
    return acc;
  }

  type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;
  type Block = { symbol: string; realized: TotalsMap; funding: TotalsMap; commission: TotalsMap; insurance: TotalsMap };

  const blocks = useMemo<Block[]>(() => {
    if (!rows?.length) return [];
    const bySym = new Map<string, Row[]>();
    for (const r of rows) {
      if (!r.symbol) continue;
      (bySym.get(r.symbol) || bySym.set(r.symbol, []).get(r.symbol)!).push(r);
    }
    const out: Block[] = [];
    for (const [sym, rs] of bySym.entries()) {
      const realized = rs.filter((r) => r.type === "REALIZED_PNL");
      const funding = rs.filter((r) => r.type === "FUNDING_FEE");
      const commission = rs.filter((r) => r.type === "COMMISSION");
      const insurance = rs.filter((r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE");
      const rMap = sumByAsset(realized);
      const fMap = sumByAsset(funding);
      const cMap = sumByAsset(commission);
      const iMap = sumByAsset(insurance);

      // keep only assets with activity
      const prune = (m: TotalsMap) => {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v.pos === 0 && v.neg === 0 && v.net === 0) delete (m as any)[k];
        }
      };
      prune(rMap); prune(fMap); prune(cMap); prune(iMap);

      const any =
        Object.keys(rMap).length || Object.keys(fMap).length ||
        Object.keys(cMap).length || Object.keys(iMap).length;

      if (any) out.push({ symbol: sym, realized: rMap, funding: fMap, commission: cMap, insurance: iMap });
    }
    out.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return out;
  }, [rows]);

  const buildBlockText = (b: Block) => {
    const lines: string[] = [];
    const sect = (title: string, m: TotalsMap) => {
      const keys = Object.keys(m).sort();
      if (!keys.length) return;
      lines.push(`  ${title}:`);
      for (const k of keys) {
        const v = m[k];
        const parts: string[] = [];
        if (v.pos !== 0) parts.push(`+${fmt(v.pos)}`);
        if (v.neg !== 0) parts.push(`−${fmt(v.neg)}`);
        parts.push(`= ${fmt(v.net)}`);
        lines.push(`    • ${k}  ${parts.join("  ")}`);
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
    try { await navigator.clipboard.writeText(buildAllText()); alert("All symbol details copied."); }
    catch { alert("Copy failed."); }
  }

  if (!blocks.length) {
    return (
      <div className="card">
        <div className="section-head"><h3 className="section-title">By Symbol (Futures, not Events)</h3></div>
        <div className="muted">No symbol activity.</div>
      </div>
    );
  }

  const colStyles = { sym: { width: 140 }, col: { width: 1 }, act: { width: 170 } } as const;

  const renderMap = (m: TotalsMap) => {
    const keys = Object.keys(m).sort();
    if (!keys.length) return <span className="muted">—</span>;
    return (
      <div style={{ display: "grid", gap: 4 }}>
        {keys.map((k) => {
          const v = m[k];
          const parts: React.ReactNode[] = [];
          if (v.pos !== 0) parts.push(<span key="p" style={{ color: "#0b7a0b" }}>+{fmt(v.pos)} </span>);
          if (v.neg !== 0) parts.push(<span key="n" style={{ color: "#a01212" }}>−{fmt(v.neg)} </span>);
          parts.push(<strong key="t">= {fmt(v.net)}</strong>);
          return (
            <div key={k} className="nowrap">
              {k} {parts}
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
          <ExportPNG text={buildAllText()} fileName="symbols-all.png" width={1400} />
          <button className="btn" onClick={copyAll}>Copy ALL (text)</button>
        </div>
      </div>

      <div className="tablewrap horizontal" style={{ maxHeight: 560, overflow: "auto" }}>
        <table className="table mono small" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <colgroup>
            <col style={{ width: colStyles.sym.width }} />
            <col style={{ width: colStyles.col.width }} />
            <col style={{ width: colStyles.col.width }} />
            <col style={{ width: colStyles.col.width }} />
            <col style={{ width: colStyles.act.width }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>Symbol</th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>Realized PnL</th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>Funding</th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>Trading Fees</th>
              <th style={{ textAlign: "right", position: "sticky", top: 0, background: "#fff" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b, i) => {
              const textForRow = buildBlockText(b);
              return (
                <tr key={b.symbol} style={{ background: i % 2 ? "#fafafa" : "transparent" }}>
                  <td style={{ textAlign: "left", fontWeight: 700, whiteSpace: "nowrap", wordBreak: "keep-all", minWidth: 140, maxWidth: 140 }} title={b.symbol}>
                    {b.symbol}
                  </td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{renderMap(b.realized)}</td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{renderMap(b.funding)}</td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{renderMap(b.commission)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap", verticalAlign: "top" }}>
                    <ExportPNG text={textForRow} fileName={`symbol-${b.symbol}.png`} width={1000} />
                    <button className="btn" onClick={async () => {
                      try { await navigator.clipboard.writeText(textForRow); alert(`${b.symbol} details copied.`); }
                      catch { alert("Copy failed."); }
                    }}>Copy</button>
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
