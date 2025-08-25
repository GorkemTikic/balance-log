// src/lib/draw.ts
import { fmtAbs } from "./utils";

type SymbolBlock = {
  symbol: string;
  realizedByAsset: Record<string, { pos: number; neg: number }>;
  fundingByAsset: Record<string, { pos: number; neg: number }>;
  commByAsset: Record<string, { pos: number; neg: number }>;
  insByAsset: Record<string, { pos: number; neg: number }>;
};

export function drawSymbolsCanvas(blocks: SymbolBlock[], downloadName: string) {
  if (!blocks.length) return;
  const dpr = Math.max(1, Math.min(2, (window.devicePixelRatio || 1)));
  const padX = 16;
  const rowH = 36;
  const headH = 44;
  const colSymbol = 160;
  const cols = [
    { key: "Realized PnL", width: 260 },
    { key: "Funding", width: 220 },
    { key: "Trading Fees", width: 220 },
    { key: "Insurance", width: 220 },
  ];
  const width = padX * 2 + colSymbol + cols.reduce((s, c) => s + c.width, 0);
  const height = headH + rowH * blocks.length + padX;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const bg = "#ffffff";
  const line = "#e6e9ee";
  const txt = "#0f1720";
  const good = "#059669";
  const bad = "#dc2626";
  const headBg = "#fbfcfe";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = line;
  ctx.fillStyle = headBg;
  ctx.fillRect(0, 0, width, headH);
  ctx.fillStyle = txt;
  ctx.font = "600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  ctx.fillText("By Symbol (Futures, not Events)", padX, 26);

  let x = padX + colSymbol;
  ctx.font = "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
  cols.forEach((c) => {
    ctx.fillText(c.key, x + 6, 42);
    x += c.width;
  });

  ctx.beginPath();
  ctx.moveTo(0, headH + 0.5);
  ctx.lineTo(width, headH + 0.5);
  ctx.stroke();

  blocks.forEach((b, i) => {
    const y = headH + i * rowH;

    ctx.beginPath();
    ctx.moveTo(0, y + rowH + 0.5);
    ctx.lineTo(width, y + rowH + 0.5);
    ctx.stroke();

    ctx.font = "600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillStyle = txt;
    ctx.fillText(b.symbol, padX, y + 24);

    const cellTxt = (m: Record<string, { pos: number; neg: number }>) => {
      const parts: string[] = [];
      Object.entries(m).forEach(([asset, v]) => {
        const pos = v.pos > 1e-12 ? `+${fmtAbs(v.pos)} ${asset}` : "";
        const neg = v.neg > 1e-12 ? `−${fmtAbs(v.neg)} ${asset}` : "";
        if (pos) parts.push(pos);
        if (neg) parts.push(neg);
      });
      return parts.join(", ");
    };

    let cx = padX + colSymbol;
    const values = [
      cellTxt(b.realizedByAsset),
      cellTxt(b.fundingByAsset),
      cellTxt(b.commByAsset),
      cellTxt(b.insByAsset),
    ];

    values.forEach((val, idx) => {
      const tokens = val.split(/( [+,−][0-9.]+ [A-Z0-9]+)(?=,|$)/g).filter(Boolean);
      let tx = cx + 6;
      ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";
      tokens.length ? tokens.forEach((t) => {
        const isGood = /^\s*\+/.test(t);
        const isBad = /^\s*−/.test(t);
        ctx.fillStyle = isGood ? good : isBad ? bad : txt;
        ctx.fillText(t.trim(), tx, y + 24);
        tx += ctx.measureText(t.trim()).width + 4;
      }) : (ctx.fillStyle = "#6b7280", ctx.fillText("–", tx, y + 24));
      cx += cols[idx].width;
    });
  });

  const link = document.createElement("a");
  link.download = downloadName;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export function drawSingleRowCanvas(block: SymbolBlock) {
  drawSymbolsCanvas([block], `${block.symbol}.png`);
}
