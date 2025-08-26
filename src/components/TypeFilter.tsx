// src/components/TypeFilter.tsx
import React from "react";

export type TypeFilterProps = {
  types: string[];                 // elde edilen tüm TYPE anahtarları
  counts?: Record<string, number>; // isteğe bağlı: her TYPE için satır sayısı
  selected: Set<string>;           // seçili TYPE’lar (boşsa hepsi anlamına gelir)
  onChange: (next: Set<string>) => void;
  onSelectAll?: () => void;
  onClear?: () => void;
};

export default function TypeFilter({
  types,
  counts = {},
  selected,
  onChange,
  onSelectAll,
  onClear,
}: TypeFilterProps) {
  if (!types.length) return null;

  const toggle = (t: string) => {
    const n = new Set(selected);
    if (n.has(t)) n.delete(t);
    else n.add(t);
    onChange(n);
  };

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="section-head" style={{ alignItems: "center" }}>
        <h3 className="section-title">Types</h3>
        <div className="btn-row">
          <button className="btn" onClick={onSelectAll}>Select All</button>
          <button className="btn" onClick={onClear}>Clear</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {types.map((t) => {
          const isOn = selected.size === 0 || selected.has(t);
          return (
            <button
              key={t}
              className="btn"
              onClick={() => toggle(t)}
              title={t}
              style={{
                borderColor: isOn ? "#111827" : undefined,
                background: isOn ? "#111827" : "#fff",
                color: isOn ? "#fff" : undefined,
              }}
            >
              <span className="mono small">{t}</span>
              {typeof counts[t] === "number" ? (
                <span className="mono small" style={{ opacity: 0.8 }}> · {counts[t]}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
