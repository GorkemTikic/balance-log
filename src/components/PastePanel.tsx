import React from "react";

export default function PastePanel(props: {
  value: string;
  onChange: (v: string) => void;
  onParse: () => void;
  onPasteFromClipboard: () => void;
  error?: string;
  diags: string[];
}){
  const { value, onChange, onParse, onPasteFromClipboard, error, diags } = props;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3 style={{margin:0}}>Paste Log</h3>
        <div className="toolbar">
          <button className="btn primary" onClick={onPasteFromClipboard}>Paste & Parse</button>
          <button className="btn" onClick={onParse}>Use & Parse</button>
        </div>
      </div>
      <textarea
        className="textarea"
        placeholder="Paste raw text / table here (TSV or CSV)."
        value={value}
        onChange={(e)=>onChange(e.target.value)}
      />
      {error && <p className="bad" style={{marginTop:8}}>{error}</p>}
      {!!diags.length && (
        <details style={{marginTop:8}}>
          <summary>Diagnostics ({diags.length})</summary>
          <pre className="modal-text" style={{height:160}}>{diags.join("\n")}</pre>
        </details>
      )}
    </section>
  );
}
