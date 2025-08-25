// src/components/Modals.tsx
import React from "react";

export function FullTextModal({
  title,
  text,
  onChange,
  onClose,
  onCopy,
  onReset,
}: {
  title: string;
  text: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onCopy: () => void;
  onReset?: () => void;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <textarea className="modal-text" value={text} onChange={(e) => onChange(e.target.value)} />
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn btn-success" onClick={onCopy}>Copy</button>
          {onReset && <button className="btn" onClick={onReset}>Reset</button>}
        </div>
        <p className="hint">All times are UTC+0.</p>
      </div>
    </div>
  );
}
