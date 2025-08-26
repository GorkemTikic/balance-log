// src/components/KpiStat.tsx
import React from "react";

export default function KpiStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono nowrap">{value}</div>
    </div>
  );
}
