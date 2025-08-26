// src/components/StoryDrawer.tsx
import React, { useMemo } from "react";
import ExportPNG from "@/components/ExportPNG";

type TotalsMap = Record<string, { pos: number; neg: number; net: number }>;
type TotalsByType = Record<string, TotalsMap>;

export default function StoryDrawer({
  open,
  onClose,
  t0,
  t1,
  setT0,
  setT1,
  totalsByType,
}: {
  open: boolean;
  onClose: () => void;
  t0: string;
  t1: string;
  setT0: (s: string) => void;
  setT1: (s: string) => void;
  /** App’ten gelen: TYPE -> (asset -> +/−/net) */
  totalsByType: TotalsByType;
}) {
  if (!open) return null;

  const human = (t: string) =>
    t.replace(/_/g, " ").replace(/\b([a-z])/g, (s) => s.toUpperCase());
  const fmt = (n: number) =>
    Number.isFinite(n) ? (Math.round(n * 1e12) / 1e12).toString() : "0";

  // Story metni: +0/−0 bastır ve tamamen sıfır satırları çıkar
  const storyText = useMemo(() => {
    const blocks: string[] = [];
    blocks.push("Balance Story", `Range (UTC+0): ${t0 || "—"} → ${t1 || "—"}`, "");

    const typeKeys = Object.keys(totalsByType).sort();
    for (const typeKey of typeKeys) {
      const m = totalsByType[typeKey] || {};
      const assets = Object.keys(m).sort();

      // Bu TYPE için yazılacak en az bir satır var mı?
      const anyLine = assets.some((a) => {
        const v = m[a];
        return (v.pos !== 0) || (v.neg !== 0) || (v.net !== 0);
      });
      if (!anyLine) continue;

      blocks.push(`${human(typeKey)}:`);

      for (const a of assets) {
        const v = m[a];
        // tamamen sıfırsa hiç yazma
        if (v.pos === 0 && v.neg === 0 && v.net === 0) continue;

        const parts: string[] = [];
        if (v.pos !== 0) parts.push(`+${fmt(v.pos)}`);
        if (v.neg !== 0) parts.push(`−${fmt(v.neg)}`);
        // net her zaman anlamlı; ama tümü 0 ise zaten yukarıda atlandı
        parts.push(`= ${fmt(v.net)}`);

        blocks.push(`  • ${a}  ${parts.join("  ")}`);
      }
      blocks.push(""); // TYPE bloğu arası boş satır
    }

    return blocks.join("\n");
  }, [t0, t1, totalsByType]);

  return (
    <div
      aria-modal
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-end",
        background: "rgba(0,0,0,0.25)",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "min(720px, 100%)",
          height: "100%",
          margin: 0,
          borderRadius: 0,
          overflow: "auto",
          boxShadow: "0 10px 30px rgba(0,0,0,.25)",
          background: "#fff",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="section-head"
          style={{ alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}
        >
          <h3 className="section-title">Balance Story (UTC+0)</h3>
          <div className="btn-row" style={{ gap: 8 }}>
            <ExportPNG text={storyText} fileName="balance-story.png" width={1200} />
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="card" style={{ marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
            <label className="muted">
              Start (UTC+0)
              <input
                className="btn"
                style={{ width: "100%", textAlign: "left", marginTop: 6 }}
                value={t0}
                onChange={(e) => setT0(e.target.value)}
                placeholder="YYYY-MM-DD HH:MM:SS"
              />
            </label>
            <label className="muted">
              End (UTC+0)
              <input
                className="btn"
                style={{ width: "100%", textAlign: "left", marginTop: 6 }}
                value={t1}
                onChange={(e) => setT1(e.target.value)}
                placeholder="YYYY-MM-DD HH:MM:SS"
              />
            </label>
          </div>
        </div>

        <div className="card" style={{ marginTop: 8 }}>
          <h4 className="section-title" style={{ marginBottom: 8 }}>Preview</h4>
          <pre
            className="mono"
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: "20px",
              background: "#f7f7f9",
              padding: 12,
              borderRadius: 8,
              maxHeight: 520,
              overflow: "auto",
            }}
          >
            {storyText}
          </pre>
        </div>
      </div>
    </div>
  );
}
