// lib/draw.ts
import { fmtAbs } from "./number";
import { bySymbolSummary } from "./aggregation";

export type SymbolBlock = ReturnType<typeof bySymbolSummary>[number];

export function drawSymbolsCanvas(blocks: SymbolBlock[], downloadName: string) {
  if (!blocks.length) return;
  const dpr = Math.max(1, Math.min(2, (window.devicePixelRatio || 1)));
  const padX = 16, rowH = 36, headH = 44, colSymbol = 160;
  const cols = [{key:"Realized PnL",width:260},{key:"Funding",width:220},{key:"Trading Fees",width:220},{key:"Insurance",width:220}];
  const width = padX*2 + colSymbol + cols.reduce((s,c)=>s+c.width,0);
  const height = headH + rowH*blocks.length + padX;
  const c = document.createElement("canvas");
  c.width = Math.ceil(width*dpr); c.height = Math.ceil(height*dpr);
  const ctx = c.getContext("2d")!; ctx.scale(dpr,dpr);

  const line="#e6e9ee", txt="#0f1720", good="#059669", bad="#dc2626";
  ctx.fillStyle="#fff"; ctx.fillRect(0,0,width,height);
  ctx.fillStyle="#fbfcfe"; ctx.fillRect(0,0,width,headH);
  ctx.strokeStyle=line; ctx.beginPath(); ctx.moveTo(0,headH+0.5); ctx.lineTo(width,headH+0.5); ctx.stroke();
  ctx.fillStyle=txt; ctx.font="600 14px system-ui,Segoe UI,Roboto"; ctx.fillText("By Symbol (Futures, not Events)", padX, 26);
  let x = padX+colSymbol; ctx.font="600 12px system-ui,Segoe UI,Roboto";
  cols.forEach(cn=>{ctx.fillText(cn.key, x+6, 42); x+=cn.width;});

  blocks.forEach((b,i)=>{
    const y=headH+i*rowH;
    ctx.beginPath(); ctx.moveTo(0,y+rowH+0.5); ctx.lineTo(width,y+rowH+0.5); ctx.stroke();
    ctx.font="600 14px system-ui,Segoe UI,Roboto"; ctx.fillStyle=txt; ctx.fillText(b.symbol, padX, y+24);

    const toTxt = (m: Record<string,{pos:number;neg:number}>) =>
      Object.entries(m).flatMap(([asset,v])=>[
        v.pos>0?`+${fmtAbs(v.pos)} ${asset}`:"",
        v.neg>0?`−${fmtAbs(v.neg)} ${asset}`:""
      ].filter(Boolean)).join(", ");

    let cx=padX+colSymbol;
    [toTxt(b.realizedByAsset),toTxt(b.fundingByAsset),toTxt(b.commByAsset),toTxt(b.insByAsset)].forEach((val,idx)=>{
      let tx=cx+6; ctx.font="12px system-ui,Segoe UI,Roboto";
      if (!val) { ctx.fillStyle="#6b7280"; ctx.fillText("–", tx, y+24); cx+=cols[idx].width; return; }
      val.split(/,\s*/).forEach(token=>{
        const t=token.trim(); const isGood=/^\+/.test(t); const isBad=/^−/.test(t);
        ctx.fillStyle=isGood?good:isBad?bad:txt; ctx.fillText(t, tx, y+24); tx+=ctx.measureText(t).width+4;
      });
      cx+=cols[idx].width;
    });
  });

  const a=document.createElement("a"); a.download=downloadName; a.href=c.toDataURL("image/png"); a.click();
}
export const drawSingleRowCanvas = (b: SymbolBlock) => drawSymbolsCanvas([b], `${b.symbol}.png`);
