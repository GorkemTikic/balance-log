// src/components/Amount.tsx
import React from "react";

/** Show full precision without rounding/truncation. */
export default function Amount({ value, sign }: { value: number; sign?: "pos" | "neg" | "net" }) {
  const str = Number.isFinite(value) ? value.toString() : "0";
  const color =
    sign === "pos" ? "#0b7a0b" :
    sign === "neg" ? "#a01212" :
    sign === "net" ? "#1f2937" : "inherit";
  return (
    <span className="mono nowrap" style={{ color }}>{str}</span>
  );
}
