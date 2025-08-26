// src/components/ExportPNG.tsx
import React from "react";


export default function ExportPNG({ text, fileName = "balance-story.png", width = 1200 }: {
text: string;
fileName?: string;
width?: number;
}) {
function exportNow() {
const pad = 24;
const lineHeight = 20;
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
if (!ctx) return;


ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";


// word wrap by measuring
const words = text.split(/\s+/);
const lines: string[] = [];
let current = "";
const maxLineWidth = width - pad * 2;
for (const w of words) {
const test = current ? current + " " + w : w;
const testWidth = ctx.measureText(test).width;
if (testWidth > maxLineWidth && current) {
lines.push(current);
current = w;
} else {
current = test;
}
}
if (current) lines.push(current);


// Also respect explicit newlines in text: re-wrap segments
const finalLines: string[] = [];
for (const rawLine of text.split("\n")) {
if (!rawLine) { finalLines.push(""); continue; }
let c = "";
for (const word of rawLine.split(/\s+/)) {
const t = c ? c + " " + word : word;
if (ctx.measureText(t).width > maxLineWidth && c) {
finalLines.push(c);
c = word;
} else {
c = t;
}
}
if (c) finalLines.push(c);
}


const totalLines = finalLines.length;
const height = pad * 2 + totalLines * lineHeight;


canvas.width = width;
canvas.height = height;


// draw
const ctx2 = canvas.getContext("2d")!;
ctx2.fillStyle = "#fff";
ctx2.fillRect(0, 0, width, height);


ctx2.fillStyle = "#111";
ctx2.font = "14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
let y = pad + 14;
for (const ln of finalLines) {
ctx2.fillText(ln, pad, y);
y += lineHeight;
}


const url = canvas.toDataURL("image/png");
const a = document.createElement("a");
a.href = url;
a.download = fileName;
a.click();
}


return (
<button className="btn" onClick={exportNow} title="Export current text as PNG">
Export PNG
</button>
);
}
