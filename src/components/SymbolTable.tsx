// src/components/SymbolTable.tsx
import React, { useMemo, useRef } from "react";

export type Row = { symbol: string; asset: string; type: string; amount: number };

export default function SymbolTable({ rows }: { rows: Row[] }) {
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const fmt = (n: number) =>
    Number.isFinite(n) ? (Math.round(n * 1e12) / 1e12).toString() : "0";

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

  type Totals = { pos: number; neg: number; net: number };
  type TotalsMap = Record<string, Totals>;
  type Block = {
    symbol: string;
    realized: TotalsMap;
    funding: TotalsMap;
    commission: TotalsMap;
    insurance: TotalsMap; // liquidation/clearance fees
  };

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
      const insurance = rs.filter(
        (r) => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE"
      );

      const rMap = sumByAsset(realized);
      const fMap = sumByAsset(funding);
      const cMap = sumByAsset(commission);
      const iMap = sumByAsset(insurance);

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

  // ——— Tek satır metin export’u (PNG, tüm tablo için aşağıda) ———
  const buildBlockText = (b: Block) => {
    const lines: string[] = [];
    const dispSym = b.symbol === "ADMIN_CLEARING" ? "Insurance Fund Clearance" : b.symbol;
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
    lines.push(`Symbol: ${dispSym}`);
    sect("Realized PnL", b.realized);
    sect("Funding", b.funding);
    sect("Trading Fees", b.commission);
    sect("Insurance Clearance Fee", b.insurance);
    // Final Net (All Fees)
    const allAssets = new Set<string>([
      ...Object.keys(b.realized),
      ...Object.keys(b.funding),
      ...Object.keys(b.commission),
      ...Object.keys(b.insurance),
    ]);
    const finals: Record<string, number> = {};
    for (const a of allAssets) {
      finals[a] =
        (b.realized[a]?.net || 0) +
        (b.funding[a]?.net || 0) +
        (b.commission[a]?.net || 0) +
        (b.insurance[a]?.net || 0);
    }
    const keys = Object.keys(finals).sort();
    if (keys.length) {
      lines.push("  Final Net (All Fees):");
      for (const k of keys) lines.push(`    • ${k}  = ${fmt(finals[k])}`);
    }
    return lines.join("\n");
  };

  // ——— Tablonun tamamını (kaydırmasız) PNG olarak dışa aktar; Actions sütununu çıkar ———
  async function exportWholeTablePNG() {
    try {
      const wrap = tableWrapRef.current;
      if (!wrap) throw new Error("Table container not found");
      const table = wrap.querySelector("table") as HTMLElement | null;
      if (!table) throw new Error("Table element not found");

      const { default: html2canvas } = await import("html2canvas");

      // Klonla
      const clone = table.cloneNode(true) as HTMLElement;
      // Actions sütununu (son sütun) kaldır: colgroup, thead, tbody
      const lastCol = clone.querySelector("colgroup col:last-child");
      if (lastCol && lastCol.parentElement) lastCol.parentElement.removeChild(lastCol);
      clone.querySelectorAll("thead tr").forEach(tr => tr.lastElementChild?.remove());
      clone.querySelectorAll("tbody tr").forEach(tr => tr.lastElementChild?.remove());

      // Klonu sahne dışına yerleştir, tam genişlik/yükseklik ver
      clone.style.position = "fixed";
      clone.style.left = "-10000px";
      clone.style.top = "0";
      clone.style.background = "#ffffff";
      clone.style.maxWidth = "none";
      clone.style.width = clone.scrollWidth + "px";
      clone.style.height = clone.scrollHeight + "px";

      document.body.appendChild(clone);
      const fullW = clone.scrollWidth || clone.clientWidth;
      const fullH = clone.scrollHeight || clone.clientHeight;

      const canvas = await html2canvas(clone, {
        backgroundColor: "#ffffff",
        scale: 2,
        width: fullW,
        height: fullH,
        scrollX: 0,
        scrollY: 0,
      });
      document.body.removeChild(clone);

      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "by-symbol-table.png";
      a.click();
    } catch (err: any) {
      alert("Export failed: " + (err?.message || String(err)));
    }
  }

  async function copyAll() {
    try {
      const text = blocks.map((b) => buildBlockText(b)).join("\n\n");
      await navigator.clipboard.writeText(text);
      alert("All symbol details copied.");
    } catch {
      alert("Copy failed.");
    }
  }

  if (!blocks.length) {
    return (
      <div className="card">
        <div className="section-head"><h3 className="section-title">By Symbol (Futures, not Events)</h3></div>
        <div className="muted">No symbol activity.</div>
      </div>
    );
  }

  const colStyles = {
    sym: { width: 180 },
    col: { width: 1 },
    act: { width: 200 },
  } as const;

  const renderMapSimple = (m: TotalsMap) => {
    const keys = Object.keys(m).sort();
    if (!keys.length) return <span className="muted">—</span>;
    return (
      <div style={{ display: "grid", gap: 4 }}>
        {keys.map((k) => {
          const v = m[k];
          const parts: React.ReactNode[] = [];
          if (v.pos !== 0) parts.push(<span key="p" style={{ color: "#0b7a0b" }}>+{fmt(v.pos)} </span>);
          if (v.neg !== 0) parts.push(<span key="n" style={{ color: "#a01212" }}>−{fmt(v.neg)} </span>);
          return (
            <div key={k} className="nowrap">
              {k} {parts}
            </div>
          );
        })}
      </div>
    );
  };

  const renderFinalNet = (b: Block) => {
    const allAssets = new Set<string>([
      ...Object.keys(b.realized),
      ...Object.keys(b.funding),
      ...Object.keys(b.commission),
      ...Object.keys(b.insurance),
    ]);
    const keys = Array.from(allAssets).sort();
    if (!keys.length) return <span className="muted">—</span>;
    return (
      <div style={{ display: "grid", gap: 4 }}>
        {keys.map((a) => {
          const net =
            (b.realized[a]?.net || 0) +
            (b.funding[a]?.net || 0) +
            (b.commission[a]?.net || 0) +
            (b.insurance[a]?.net || 0);
          const col = net === 0 ? "#374151" : net > 0 ? "#0b7a0b" : "#a01212";
          return (
            <div key={a} className="nowrap" style={{ color: col }}>
              {a} <strong>= {fmt(net)}</strong>
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
          <button className="btn" onClick={exportWholeTablePNG}>Export PNG</button>
          <button className="btn" onClick={copyAll}>Copy ALL (text)</button>
        </div>
      </div>

      <div
        ref={tableWrapRef}
        className="tablewrap horizontal"
        style={{ maxHeight: 560, overflow: "auto" }}
      >
        <table className="table mono small" style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <colgroup>
            <col style={{ width: colStyles.sym.width }} />
            <col style={{ width: colStyles.col.width }} />
            <col style={{ width: colStyles.col.width }} />
            <col style={{ width: colStyles.col.width }} />
            <col style={{ width: colStyles.col.width }} />
            {/* Final Net (All Fees) */}
            <col style={{ width: colStyles.col.width }} />
            <col style={{ width: colStyles.act.width }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>Symbol</th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>Realized PnL</th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>Funding</th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>Trading Fees</th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>Insurance Clearance Fee</th>
              <th style={{ textAlign: "left", position: "sticky", top: 0, background: "#fff" }}>Final Net (All Fees)</th>
              <th style={{ textAlign: "right", position: "sticky", top: 0, background: "#fff" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b, i) => {
              const textForRow = buildBlockText(b);
              const displaySymbol = b.symbol === "ADMIN_CLEARING" ? "Insurance Fund Clearance" : b.symbol;
              return (
                <tr key={b.symbol} style={{ background: i % 2 ? "#fafafa" : "transparent" }}>
                  <td style={{ textAlign: "left", fontWeight: 700, whiteSpace: "nowrap", wordBreak: "keep-all", minWidth: 180, maxWidth: 180 }} title={displaySymbol}>
                    {displaySymbol}
                  </td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{renderMapSimple(b.realized)}</td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{renderMapSimple(b.funding)}</td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{renderMapSimple(b.commission)}</td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{renderMapSimple(b.insurance)}</td>
                  <td style={{ textAlign: "left", verticalAlign: "top" }}>{renderFinalNet(b)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap", verticalAlign: "top" }}>
                    <button
                      className="btn"
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(textForRow); alert(`${displaySymbol} details copied.`); }
                        catch { alert("Copy failed."); }
                      }}
                    >Copy</button>
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
