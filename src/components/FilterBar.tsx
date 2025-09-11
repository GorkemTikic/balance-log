// src/components/FilterBar.tsx
import React, { useMemo } from "react";

type Row = {
  symbol: string;
  type: string;
  asset: string;
  amount: number;
};

export default function FilterBar({ rows }: { rows: Row[] }) {
  // 🔒 Önceki hesaplama mantığı burada saklı (yorum satırına alındı):
  /*
  const stats = useMemo(() => {
    const profitBySymbol: Record<string, number> = {};
    const tradeCount: Record<string, number> = {};
    let swapCount = 0;

    for (const r of rows) {
      if (r?.type && r.type.includes("COIN_SWAP")) swapCount++;
      const norm = r?.symbol || "";
      if (!norm) continue;

      tradeCount[norm] = (tradeCount[norm] || 0) + 1;
      profitBySymbol[norm] = (profitBySymbol[norm] || 0) + (r.amount || 0);
    }

    const topProfitable = Object.entries(profitBySymbol)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([s]) => s);

    const topLosing = Object.entries(profitBySymbol)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([s]) => s);

    const mostTraded =
      Object.entries(tradeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";

    return { topProfitable, topLosing, mostTraded, swapCount };
  }, [rows]);
  */

  return (
    <div className="card" style={{ marginTop: 12, textAlign: "center" }}>
      <h3 className="section-title">Performance Highlights</h3>
      <div
        style={{
          padding: "20px",
          fontSize: "14px",
          color: "#666",
          fontStyle: "italic",
        }}
      >
        Coming Soon...
      </div>
    </div>
  );
}
