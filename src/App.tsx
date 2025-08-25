import React, { useMemo, useRef, useState, useEffect } from "react";

/** -------- Types you already use (minimal) -------- */
type Row = {
  time: string;
  ts: number;
  type: string;
  asset: string;
  amount: number;
  symbol?: string;
  id?: string;
  uid?: string;
  extra?: string;
};

/** -------- Tiny helpers (no external deps) -------- */
const EPS = 1e-12;
const gt = (n?: number) => !!n && Math.abs(n) > EPS;
const fmtAbs = (n: number) => {
  const s = Math.abs(n);
  return s >= 1 ? s.toLocaleString(undefined, { maximumFractionDigits: 6 }) : s.toPrecision(8);
};
const fmtSigned = (n: number) => (n >= 0 ? `+${fmtAbs(n)}` : `-${fmtAbs(n)}`);

/** --------- Placeholder parser ----------
 * Replace the body with your real parser later.
 * For now it detects TSV with columns and builds a minimal row list so the UI is usable.
 */
function parseBalanceLog(raw: string): { rows: Row[]; diags: string[] } {
  const out: Row[] = [];
  const diags: string[] = [];
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { rows: [], diags: ["No input"] };
  // try to detect header
  const header = lines[0].split("\t");
  const hasHeader = header.includes("time") && header.includes("type") && header.includes("asset");
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (cols.length < 4) continue;
    const t = cols[0];
    const type = cols[1];
    const asset = cols[2];
    const amount = Number(cols[3]);
    const symbol = cols[4] || "";
    const r: Row = {
      time: t,
      ts: Date.parse(t) || Date.now(),
      type, asset, amount, symbol,
      id: cols[5], uid: cols[6], extra: cols.slice(7).join(" "),
    };
    out.push(r);
  }
  if (!out.length) diags.push("Parsed 0 rows (expected tab-separated columns).");
  return { rows: out, diags };
}

/** --------- Aggregation helpers (simple) ---------- */
function sumByAsset(rows: Row[]) {
  const m: Record<string, { pos: number; neg: number; net: number }> = {};
  rows.forEach((r) => {
    const k = r.asset || "—";
    if (!m[k]) m[k] = { pos: 0, neg: 0, net: 0 };
    if (r.amount >= 0) m[k].pos += r.amount; else m[k].neg += -r.amount;
    m[k].net += r.amount;
  });
  return m;
}
function bySymbolSummary(rows: Row[]) {
  const bySym = new Map<string, Row[]>();
  rows.forEach((r) => {
    const k = r.symbol || "(no symbol)";
    if (!bySym.has(k)) bySym.set(k, []);
    bySym.get(k)!.push(r);
  });
  return Array.from(bySym.entries()).map(([symbol, rs]) => ({
    symbol,
    realizedByAsset: sumByAsset(rs.filter(r => r.type === "REALIZED_PNL")),
    fundingByAsset:  sumByAsset(rs.filter(r => r.type === "FUNDING_FEE")),
    commByAsset:     sumByAsset(rs.filter(r => r.type === "COMMISSION")),
    insByAsset:      sumByAsset(rs.filter(r => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE")),
  }));
}

/** ----------------- App ----------------- */
export default function App() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [diags, setDiags] = useState<string[]>([]);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState<"summary" | "swaps" | "events" | "raw">("summary");

  const [storyOpen, setStoryOpen] = useState(false);
  const [storyText, setStoryText] = useState("");

  // Right pane size + drag
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rightPct, setRightPct] = useState<number>(() => {
    const v = localStorage.getItem("paneRightPct");
    const n = v ? Number(v) : 55;
    return isFinite(n) ? Math.min(70, Math.max(36, n)) : 55;
  });
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const cw = rect.width;
      const newRightPct = ((cw - x) / cw) * 100;
      const minPct = (420 / cw) * 100;
      const clamped = Math.min(70, Math.max(minPct, newRightPct));
      setRightPct(clamped);
    };
    const onUp = () => {
      if (dragging) {
        setDragging(false);
        localStorage.setItem("paneRightPct", String(Math.round(rightPct)));
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, rightPct]);

  /* --------- parse actions --------- */
  function runParse(text: string) {
    setError("");
    try {
      const { rows: rs, diags } = parseBalanceLog(text);
      setRows(rs);
      setDiags(diags);
      setActiveTab("summary");
    } catch (e: any) {
      setError(e?.message || String(e));
      setRows([]); setDiags([]);
    }
  }
  function onParse() { runParse(input); }
  function onPasteAndParseText() {
    if ((navigator as any).clipboard?.readText) {
      (navigator as any).clipboard.readText().then((t: string) => {
        setInput(t);
        setTimeout(() => runParse(t), 0);
      });
    } else {
      alert("Clipboard API not available in this browser.");
    }
  }

  /* --------- summaries --------- */
  const nonEvent = useMemo(() => rows.filter(r => !r.type.startsWith("EVENT_")), [rows]);
  const realized = useMemo(() => nonEvent.filter(r => r.type === "REALIZED_PNL"), [nonEvent]);
  const commission = useMemo(() => rows.filter(r => r.type === "COMMISSION"), [rows]);
  const referral   = useMemo(() => rows.filter(r => r.type === "REFERRAL_KICKBACK"), [rows]);
  const funding    = useMemo(() => rows.filter(r => r.type === "FUNDING_FEE"), [rows]);
  const insurance  = useMemo(() => rows.filter(r => r.type === "INSURANCE_CLEAR" || r.type === "LIQUIDATION_FEE"), [rows]);

  const realizedByAsset  = useMemo(() => sumByAsset(realized),  [realized]);
  const commissionByAsset= useMemo(() => sumByAsset(commission),[commission]);
  const referralByAsset  = useMemo(() => sumByAsset(referral),  [referral]);
  const fundingByAsset   = useMemo(() => sumByAsset(funding),   [funding]);
  const insuranceByAsset = useMemo(() => sumByAsset(insurance), [insurance]);

  const bySymbol = useMemo(() => bySymbolSummary(nonEvent), [nonEvent]);

  /** Build a simple “Balance Story” text (UTC+0) */
  function buildStory(): string {
    const L: string[] = [];
    L.push("Summary of your balance log (UTC+0):", "");
    const allAssets = new Set<string>([
      ...Object.keys(realizedByAsset),
      ...Object.keys(commissionByAsset),
      ...Object.keys(referralByAsset),
      ...Object.keys(fundingByAsset),
      ...Object.keys(insuranceByAsset),
    ]);
    Array.from(allAssets).sort().forEach((asset) => {
      const R = realizedByAsset[asset] || { pos: 0, neg: 0, net: 0 };
      const C = commissionByAsset[asset] || { pos: 0, neg: 0, net: 0 };
      const RK= referralByAsset[asset]   || { pos: 0, neg: 0, net: 0 };
      const F = fundingByAsset[asset]    || { pos: 0, neg: 0, net: 0 };
      const I = insuranceByAsset[asset]  || { pos: 0, neg: 0, net: 0 };
      const net = R.net + C.net + RK.net + F.net + I.net;
      L.push(`Asset: ${asset}`);
      if (gt(R.pos) || gt(R.neg)) L.push(`  Realized PnL: ${gt(R.pos)?`+${fmtAbs(R.pos)}`:"0"} / ${gt(R.neg)?`-${fmtAbs(R.neg)}`:"0"}`);
      if (gt(C.pos) || gt(C.neg)) L.push(`  Trading Fees: ${gt(C.neg)?`-${fmtAbs(C.neg)}`:"0"} (refunds ${gt(C.pos)?`+${fmtAbs(C.pos)}`:"0"})`);
      if (gt(RK.pos) || gt(RK.neg)) L.push(`  Referral: ${gt(RK.pos)?`+${fmtAbs(RK.pos)}`:"0"} / ${gt(RK.neg)?`-${fmtAbs(RK.neg)}`:"0"}`);
      if (gt(F.pos) || gt(F.neg)) L.push(`  Funding: ${gt(F.pos)?`+${fmtAbs(F.pos)}`:"0"} / ${gt(F.neg)?`-${fmtAbs(F.neg)}`:"0"}`);
      if (gt(I.pos) || gt(I.neg)) L.push(`  Insurance/Liq.: ${gt(I.pos)?`+${fmtAbs(I.pos)}`:"0"} / ${gt(I.neg)?`-${fmtAbs(I.neg)}`:"0"}`);
      if (gt(net)) L.push(`  Net: ${fmtSigned(net)} ${asset}`);
      L.push("");
    });
    return L.join("\n").replace(/\n{3,}/g, "\n\n");
  }

  function openStory() {
    const t = buildStory();
    setStoryText(t);
    setStoryOpen(true);
  }

  function renderAssetPairs(map: Record<string, { pos: number; neg: number }>) {
    const entries = Object.entries(map).filter(([, v]) => gt(v.pos) || gt(v.neg));
    if (!entries.length) return <span>–</span>;
    return (
      <>
        {entries.map(([asset, v], i) => (
          <span key={asset} className="pair">
            {gt(v.pos) && <span className="good">+{fmtAbs(v.pos)}</span>}
            {gt(v.pos) && gt(v.neg) && " / "}
            {gt(v.neg) && <span className="bad">−{fmtAbs(v.neg)}</span>}{" "}
            {asset}
            {i < entries.length - 1 ? ", " : ""}
          </span>
        ))}
      </>
    );
  }

  return (
    <div className="wrap">
      <header className="header">
        <div>
          <h1>Balance Log Analyzer</h1>
          <div className="muted">All times are UTC+0</div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={onPasteAndParseText}>Paste plain text & Parse</button>
          <button className="btn" onClick={() => { setInput(""); setRows([]); setDiags([]); setError(""); }}>Clear</button>
          <button className="btn btn-success" onClick={openStory}>Balance Story</button>
        </div>
      </header>

      <section className="space">
        <details className="card" open>
          <summary className="card-head" style={{ cursor:"pointer" }}>
            <h3>Paste Table (Excel-like)</h3>
          </summary>
          <textarea className="paste" placeholder="Paste raw/TSV here (Ctrl/Cmd+V)" value={input} onChange={(e)=>setInput(e.target.value)} />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn btn-dark" onClick={onParse}>Use & Parse</button>
          </div>
          {error && <p className="error">{error}</p>}
          {!!diags.length && (
            <details style={{ marginTop: 8 }}>
              <summary>Diagnostics ({diags.length})</summary>
              <pre className="modal-text" style={{ height: 160 }}>{diags.join("\n")}</pre>
            </details>
          )}
        </details>
      </section>

      {/* Tabs */}
      <nav className="tabs">
        {[
          { k: "summary", label: "Summary" },
          { k: "swaps",   label: "Coin Swaps" },
          { k: "events",  label: "Event Contracts" },
          { k: "raw",     label: "Raw Log" },
        ].map(t => (
          <button key={t.k} className={`tab ${activeTab === t.k ? "active" : ""}`} onClick={() => setActiveTab(t.k as any)}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* SUMMARY */}
      {activeTab === "summary" && (
        <section className="space">
          <div className="kpi sticky card">
            <div className="kpi-row">
              <div className="kpigrid">
                <div className="kpi-block">
                  <div className="kpi-title">Trades parsed</div>
                  <div className="kpi-num">{rows.length}</div>
                </div>
                <div className="kpi-block">
                  <div className="kpi-title">Active symbols</div>
                  <div className="kpi-num">{bySymbol.length}</div>
                </div>
              </div>
              <div className="kpi-actions btn-row">
                <button className="btn btn-success" onClick={openStory}>Copy Summary (Full)</button>
              </div>
            </div>
          </div>

          <div className="grid three space">
            <div className="card">
              <div className="card-head"><h3>Trading Fees / Commission</h3></div>
              <ul className="kv">
                {Object.entries(commissionByAsset).map(([asset,v]) => (
                  <li key={asset} className="kv-row">
                    <span className="label">{asset}</span>
                    {gt(v.pos) ? <span className="num good">+{fmtAbs(v.pos)}</span> : <span className="num muted">–</span>}
                    {gt(v.neg) ? <span className="num bad">−{fmtAbs(v.neg)}</span>  : <span className="num muted">–</span>}
                    {gt(v.net) ? <span className={`num ${v.net>=0?"good":"bad"}`}>{fmtSigned(v.net)}</span> : <span className="num muted">–</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <div className="card-head"><h3>Referral Kickback</h3></div>
              <ul className="kv">
                {Object.entries(referralByAsset).map(([asset,v]) => (
                  <li key={asset} className="kv-row">
                    <span className="label">{asset}</span>
                    {gt(v.pos) ? <span className="num good">+{fmtAbs(v.pos)}</span> : <span className="num muted">–</span>}
                    {gt(v.neg) ? <span className="num bad">−{fmtAbs(v.neg)}</span>  : <span className="num muted">–</span>}
                    {gt(v.net) ? <span className={`num ${v.net>=0?"good":"bad"}`}>{fmtSigned(v.net)}</span> : <span className="num muted">–</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <div className="card-head"><h3>Funding Fees</h3></div>
              <ul className="kv">
                {Object.entries(fundingByAsset).map(([asset,v]) => (
                  <li key={asset} className="kv-row">
                    <span className="label">{asset}</span>
                    {gt(v.pos) ? <span className="num good">+{fmtAbs(v.pos)}</span> : <span className="num muted">–</span>}
                    {gt(v.neg) ? <span className="num bad">−{fmtAbs(v.neg)}</span>  : <span className="num muted">–</span>}
                    {gt(v.net) ? <span className={`num ${v.net>=0?"good":"bad"}`}>{fmtSigned(v.net)}</span> : <span className="num muted">–</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <div className="card-head"><h3>Insurance / Liquidation</h3></div>
              <ul className="kv">
                {Object.entries(insuranceByAsset).map(([asset,v]) => (
                  <li key={asset} className="kv-row">
                    <span className="label">{asset}</span>
                    {gt(v.pos) ? <span className="num good">+{fmtAbs(v.pos)}</span> : <span className="num muted">–</span>}
                    {gt(v.neg) ? <span className="num bad">−{fmtAbs(v.neg)}</span>  : <span className="num muted">–</span>}
                    {gt(v.net) ? <span className={`num ${v.net>=0?"good":"bad"}`}>{fmtSigned(v.net)}</span> : <span className="num muted">–</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Symbols table (right pane) */}
          <div className="space dual" ref={containerRef} style={{ gridTemplateColumns:`minmax(0,1fr) 12px ${Math.round(rightPct)}%` }}>
            <div className="left">
              {/* left side free for future cards */}
            </div>
            <div className={`splitter ${dragging ? "drag" : ""}`} onMouseDown={() => setDragging(true)} title="Drag to resize" />
            <div className="right card">
              <div className="card-head"><h3>By Symbol (Futures, not Events)</h3></div>
              {bySymbol.length ? (
                <div className="tablewrap right-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Realized PnL</th>
                        <th>Funding</th>
                        <th>Trading Fees</th>
                        <th>Insurance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bySymbol.map((b) => (
                        <tr key={b.symbol}>
                          <td className="label">{b.symbol}</td>
                          <td className="num">{renderAssetPairs(b.realizedByAsset)}</td>
                          <td className="num">{renderAssetPairs(b.fundingByAsset)}</td>
                          <td className="num">{renderAssetPairs(b.commByAsset)}</td>
                          <td className="num">{renderAssetPairs(b.insByAsset)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="muted">No symbol activity.</p>}
            </div>
          </div>
        </section>
      )}

      {activeTab === "swaps" && (
        <section className="space">
          <div className="card"><h3>Coin Swaps</h3><p className="muted">Parsing for swaps can be added here.</p></div>
        </section>
      )}

      {activeTab === "events" && (
        <section className="space">
          <div className="card"><h3>Event Contracts</h3><p className="muted">Parsing for Event Contracts can be added here.</p></div>
        </section>
      )}

      {activeTab === "raw" && (
        <section className="space">
          <div className="card">
            <div className="card-head"><h3>Raw Parsed Table</h3></div>
            {rows.length ? (
              <div className="tablewrap">
                <table className="table mono small">
                  <thead><tr>{["time","type","asset","amount","symbol","id","uid","extra"].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.time}</td><td>{r.type}</td><td>{r.asset}</td><td className="num">{fmtSigned(r.amount)}</td>
                        <td>{r.symbol}</td><td>{r.id}</td><td>{r.uid}</td><td>{r.extra}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">No rows parsed yet.</p>}
          </div>
        </section>
      )}

      {/* Balance Story Drawer (this is the thing that “vanished”) */}
      {storyOpen && (
        <div className="drawer-overlay" onClick={() => setStoryOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <h3>Balance Story (UTC+0)</h3>
              <button className="btn" onClick={() => setStoryOpen(false)}>Close</button>
            </div>
            <textarea className="modal-text" style={{ height: "70vh" }} value={storyText} onChange={(e)=>setStoryText(e.target.value)} />
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button
                className="btn btn-success"
                onClick={() => navigator.clipboard?.writeText(storyText)}
              >
                Copy Story
              </button>
              <button className="btn" onClick={() => setStoryText(buildStory())}>
                Reset to Auto Text
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
