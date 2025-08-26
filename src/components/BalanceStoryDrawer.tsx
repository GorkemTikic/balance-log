import React from "react";
import { ByAssetMap } from "../types";
import { fmtAbs, fmtSigned, gt } from "../utils/format";

export default function BalanceStoryDrawer(props: {
  open: boolean;
  onClose: () => void;
  realized: ByAssetMap;
  commission: ByAssetMap;
  referral: ByAssetMap;
  funding: ByAssetMap;
  insurance: ByAssetMap;
}){
  if (!props.open) return null;

  const story = buildStory(props.realized, props.commission, props.referral, props.funding, props.insurance);

  const copy = () => {
    if (!navigator.clipboard) return alert("Clipboard not available");
    navigator.clipboard.writeText(story).catch(()=>alert("Copy failed"));
  };

  return (
    <div className="drawer-overlay" onClick={props.onClose}>
      <div className="drawer" onClick={(e)=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <h3>Balance Story (UTC+0)</h3>
          <button className="btn" onClick={props.onClose}>Close</button>
        </div>
        <textarea className="modal-text" value={story} onChange={()=>{}} />
        <div className="toolbar" style={{marginTop:8}}>
          <button className="btn success" onClick={copy}>Copy Text</button>
        </div>
      </div>
    </div>
  );
}

function buildStory(...maps: ByAssetMap[]){
  const totals: Record<string, number> = {};
  const bump = (m: ByAssetMap) => {
    Object.entries(m).forEach(([a,v]) => { totals[a] = (totals[a]||0) + (v.net||0); });
  };
  maps.forEach(bump);

  const assets = Object.keys(totals).sort();
  const lines: string[] = [];
  lines.push("Summary of your balance log (UTC+0):", "");
  assets.forEach(a=>{
    const parts: string[] = [];
    const pushed = (name:string, m:ByAssetMap) => {
      const v = m[a];
      if (!v) return;
      if (gt(v.pos) || gt(v.neg)) parts.push(`${name}: ${gt(v.pos)?`+${fmtAbs(v.pos)}`:"0"} / ${gt(v.neg)?`-${fmtAbs(v.neg)}`:"0"}`);
    };
    pushed("Realized PnL", maps[0]);
    pushed("Trading Fees", maps[1]);
    pushed("Referral",     maps[2]);
    pushed("Funding",      maps[3]);
    pushed("Insurance/Liq",maps[4]);

    const net = totals[a] || 0;
    lines.push(`Asset: ${a}`);
    if (parts.length) parts.forEach(p => lines.push("  " + p));
    if (gt(net)) lines.push(`  Net: ${fmtSigned(net)} ${a}`);
    lines.push("");
  });

  return lines.join("\n").replace(/\n{3,}/g,"\n\n");
}
