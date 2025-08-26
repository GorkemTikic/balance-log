// src/App.tsx
}
lines.push({ time: t, ts, text: `${t} (UTC+0) — Out: ${outs.length ? outs.join(", ") : "0"} → In: ${ins.length ? ins.join(", ") : "0"}` });
}
lines.sort((a, b) => a.ts - b.ts);
return lines;
}


// ---- Phase 3 additions: filters & persistence ----
const DEFAULT_FILTERS: Filters = {
t0: "",
t1: "",
symbol: "",
show: {
realized: true,
funding: true,
commission: true,
insurance: true,
transfers: true,
coinSwaps: true,
autoExchange: true,
events: true,
},
};


function applyFilters(rows: Row[], f: Filters) {
const start = f.t0 ? parseUtcMs(f.t0) : Number.NEGATIVE_INFINITY;
const end = f.t1 ? parseUtcMs(f.t1) : Number.POSITIVE_INFINITY;
const sym = f.symbol.trim().toUpperCase();
const keepType = (t: string) => {
switch (t) {
case TYPE.REALIZED_PNL: return f.show.realized;
case TYPE.FUNDING_FEE: return f.show.funding;
case TYPE.COMMISSION: return f.show.commission;
case TYPE.INSURANCE_CLEAR:
case TYPE.LIQUIDATION_FEE: return f.show.insurance;
case TYPE.TRANSFER: return f.show.transfers;
case TYPE.COIN_SWAP_DEPOSIT:
case TYPE.COIN_SWAP_WITHDRAW: return f.show.coinSwaps;
case TYPE.AUTO_EXCHANGE: return f.show.autoExchange;
default:
if (t.startsWith(EVENT_PREFIX)) return f.show.events;
return true;
}
};
return rows.filter((r) => {
if (!(r.ts >= start && r.ts <= end)) return false;
if (sym && !(r.symbol || "").toUpperCase().includes(sym)) return false;
if (!keepType(r.type)) return false;
return true;
});
}


export default function App() {
const [input, setInput] = useState("");
const [rows, setRows] = useState<Row[]>([]);
const [diags, setDiags] = useState<string[]>([]);
const [error, setError] = useState("");


const [filters, setFilters] = useLocalStorage<Filters>("bl.filters.v1", DEFAULT_FILTERS);


const [storyOpen, setStoryOpen] = useLocalStorage<boolean>("bl.story.open", false);
const [storyT0, setStoryT0] = useLocalStorage<string>("bl.story.t0", "");
const [storyT1, setStoryT1] = useLocalStorage<string>("bl.story.t1", "");


// Parse
function runParse(tsv: string) {
setError("");
try {
const { rows: rs, diags } = parseBalanceLog(tsv);
if (!rs.length) throw new Error("No valid rows detected.");
setRows(rs);
setDiags(diags);
} catch (e: any) {
setError(e?.message || String(e));
setRows([]);
setDiags([]);
}
}
function onPasteAndParseText() {
if (navigator.clipboard?.readText) {
navigator.clipboard.readText().then((t) => {
setInput(t);
setTimeout(() => runParse(t), 0);
});
}
}


// Derived (apply filters first)
const filteredRows = useMemo(() => applyFilters(rows, filters), [rows, filters]);
const nonEvent = useMemo(() => onlyNonEvents(filteredRows), [filteredRows]);
}
