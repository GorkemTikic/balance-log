// src/App.tsx
useEffect(() => { if (!rows.length) { setStoryT0(""); setStoryT1(""); } }, [rows.length]);


return (
<div className="container">
<header className="header">
<div>
<h1 className="title">Balance Log Analyzer</h1>
<div className="subtitle">All times are UTC+0</div>
</div>
<div className="toolbar">
<button className="btn btn-primary" onClick={onPasteAndParseText}>Paste plain text & Parse</button>
<button className="btn" onClick={() => alert('To parse, paste a table below or raw text, then click Parse.')}>Help</button>
<button className="btn btn-dark" onClick={() => setStoryOpen(true)}>Open Balance Story</button>
</div>
</header>


<section className="space">
<GridPasteBox onUseTSV={(tsv) => { setInput(tsv); runParse(tsv); }} onError={(m) => {/* optional toast */}} />
{error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
</section>


{!!rows.length && (
<section className="grid-2" style={{ marginTop: 16 }}>
<RpnCard title="Realized PnL" map={realizedByAsset} />
<RpnCard title="Trading Fees / Commission" map={commissionByAsset} />
<RpnCard title="Funding Fees" map={fundingByAsset} />
<RpnCard title="Insurance / Liquidation" map={insuranceByAsset} />
<RpnCard title="Transfers (General)" map={transfersByAsset} />
</section>
)}


{!!allSymbolBlocks.length && (
<section style={{ marginTop: 16 }}>
<SymbolTable blocks={allSymbolBlocks} onFocus={focusSymbolRow} />
</section>
)}


{(coinSwapLines.length || autoExLines.length || Object.keys(eventsOrderByAsset).length || Object.keys(eventsPayoutByAsset).length) && (
<section>
<SwapsEvents
coinSwapLines={coinSwapLines}
autoExLines={autoExLines}
eventsOrdersByAsset={eventsOrderByAsset}
eventsPayoutsByAsset={eventsPayoutByAsset}
/>
</section>
)}


{!!diags.length && (
<details className="card" style={{ marginTop: 16 }}>
<summary>Parser diagnostics</summary>
<ul style={{ marginTop: 8 }}>
{diags.map((d, i) => (<li key={i} className="mono" style={{ fontSize: 12 }}>{d}</li>))}
</ul>
</details>
)}


<footer className="footer-note">This build adds Symbol Table, Swaps & Events, and a right-side Balance Story drawer.</footer>


<StoryDrawer
open={storyOpen}
onClose={() => setStoryOpen(false)}
t0={storyT0}
t1={storyT1}
setT0={setStoryT0}
setT1={setStoryT1}
totals={storyTotals}
/>
</div>
);
}
