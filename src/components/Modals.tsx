import React from "react";

export function FullResponseModal({
  open, text, onChange, onClose, onCopy, onReset, hint,
}: {
  open: boolean;
  text: string;
  hint?: string;
  onChange: (s: string) => void;
  onClose: () => void;
  onCopy: () => void;
  onReset: () => void;
}) {
  if (!open) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Full response preview">
      <div className="modal">
        <div className="modal-head">
          <h3>Copy Response (Full) — Preview &amp; Edit</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <textarea className="modal-text" value={text} onChange={(e)=>onChange(e.target.value)} />
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn btn-success" onClick={onCopy}>Copy Edited Text</button>
          <button className="btn" onClick={onReset}>Reset to Auto Text</button>
        </div>
        {hint ? <p className="hint">{hint}</p> : null}
      </div>
    </div>
  );
}

export function StoryModal({
  open, text, onChange, onClose, onCopy, onRebuild,
}: {
  open: boolean;
  text: string;
  onChange: (s: string) => void;
  onClose: () => void;
  onCopy: () => void;
  onRebuild: () => void;
}) {
  if (!open) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Balance Story preview">
      <div className="modal">
        <div className="modal-head">
          <h3>Balance Story — Preview &amp; Edit</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <textarea className="modal-text" value={text} onChange={(e)=>onChange(e.target.value)} />
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn btn-success" onClick={onCopy}>Copy Balance Story</button>
          <button className="btn" onClick={onRebuild}>Rebuild</button>
        </div>
        <p className="hint">All times are UTC+0. Zero-suppression (EPS = 1e-12) applies to the text only.</p>
      </div>
    </div>
  );
}
