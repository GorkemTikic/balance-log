import React from "react";
import { ALL_ASSETS, AssetCode } from "../lib/types";

export type BalanceRow = { asset: AssetCode; amount: string };
const emptyRow = (): BalanceRow => ({ asset: "USDT", amount: "" });

export function pasteToRows(pasted: string): BalanceRow[] {
  const out: BalanceRow[] = [];
  pasted.split(/\r?\n/).forEach((line) => {
    const [a, val] = line.split(/\t|,|\s{2,}/);
    if (!a || !val) return;
    if (!ALL_ASSETS.includes(a as AssetCode)) return;
    out.push({ asset: a as AssetCode, amount: val.trim() });
  });
  return out.length ? out : [emptyRow()];
}

function BalRow({
  row, readonly, onChange, onRemove,
}: {
  row: BalanceRow;
  readonly?: boolean;
  onChange?: (r: BalanceRow) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="bal-row">
      <select className="select" disabled={readonly} value={row.asset} onChange={(e) => onChange?.({ ...row, asset: e.target.value as AssetCode })}>
        {ALL_ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <input className="input" disabled={readonly} placeholder="amount (can be negative)" value={row.amount} onChange={(e)=>onChange?.({ ...row, amount: e.target.value })}/>
      {!readonly && <button className="btn" onClick={onRemove}>✕</button>}
    </div>
  );
}

export default function BalancesEditor({
  rows, setRows, readonly,
}: {
  rows: BalanceRow[];
  setRows: (r: BalanceRow[]) => void;
  readonly?: boolean;
}) {
  return (
    <div className="bal-editor">
      {rows.map((r, i) => (
        <BalRow key={i} row={r} readonly={readonly}
          onRemove={() => setRows(rows.filter((_, idx) => idx !== i))}
          onChange={(nr) => setRows(rows.map((x, idx) => (idx === i ? nr : x)))}
        />
      ))}
      {!readonly && (
        <div className="btn-row" style={{ marginTop: 6 }}>
          <button className="btn" onClick={() => setRows([...rows, emptyRow()])}>+ Add row</button>
          <details>
            <summary className="btn">Paste TSV</summary>
            <div style={{ marginTop: 6 }}>
              <textarea className="paste" placeholder="Asset[TAB]Amount per line"
                onPaste={(e)=>{ setTimeout(()=>{ const ta=e.target as HTMLTextAreaElement; setRows(pasteToRows(ta.value)); ta.value=""; },0); }} />
              <div className="hint">Example:{"\n"}USDT↹300{"\n"}BTC↹-0.12</div>
            </div>
          </details>
          <div className="btn-row">
            {ALL_ASSETS.map((a) => (
              <button key={a} className="btn btn-small" onClick={() => setRows([...rows, { asset: a as AssetCode, amount: "" }])}>{a}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
