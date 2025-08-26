// src/components/Tabs.tsx
import React from "react";

export type TabKey = "summary" | "symbol" | "swaps" | "diag";

export default function Tabs({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  const items: { key: TabKey; name: string }[] = [
    { key: "summary", name: "Summary" },
    { key: "symbol",  name: "By Symbol" },
    { key: "swaps",   name: "Swaps & Events" },
    { key: "diag",    name: "Diagnostics" },
  ];
  return (
    <div className="tabs">
      {items.map((it) => (
        <button
          key={it.key}
          className={`tab ${active === it.key ? "active" : ""}`}
          onClick={() => onChange(it.key)}
        >
          {it.name}
        </button>
      ))}
    </div>
  );
}
