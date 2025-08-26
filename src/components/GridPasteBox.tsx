// src/components/GridPasteBox.tsx
if (!text) return [];
if (text.includes("\t")) {
return text
.split(/\r?\n/)
.filter((l) => l.trim().length)
.map((l) => l.split("\t"));
}
return text
.split(/\r?\n/)
.filter((l) => l.trim().length)
.map((l) => l.trim().split(/\s{2,}|\s\|\s|\s+/));
}


function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
e.preventDefault();
setInfo("");
const cd = e.clipboardData;
const html = cd.getData("text/html");
const text = cd.getData("text/plain");
let g: string[][] = [];
if (html) g = parseHtmlToGrid(html);
if (!g.length) g = parseTextToGrid(text);
if (!g.length) {
onError("Nothing parseable was found on the clipboard. Try copying the table itself.");
return;
}
setGrid(g);
setInfo(`Detected ${g.length} row(s) × ${Math.max(...g.map((r) => r.length))} col(s).`);
}


function useAndParse() {
if (!grid.length) {
onError("Paste a table first.");
return;
}
const tsv = grid.map((r) => r.join("\t")).join("\n");
onUseTSV(tsv);
}


return (
<div className="card">
<div className="card-head">
<h3>Paste Table (Excel-like)</h3>
</div>
<div
className="dropzone"
contentEditable
suppressContentEditableWarning
onPaste={handlePaste}
onKeyDown={(e) => {
if (!(e.ctrlKey || e.metaKey) || (e.key.toLowerCase() !== "v" && e.key !== "V")) {
e.preventDefault();
}
}}
>
Click here and press <b>Ctrl/⌘+V</b> to paste directly from the Balance Log web page.
</div>


<div className="btn-row" style={{ marginTop: 8 }}>
<button className="btn btn-dark" onClick={useAndParse}>
Use & Parse
</button>
<span className="muted">{info}</span>
</div>


{grid.length > 0 && (
<div className="tablewrap" style={{ marginTop: 10, maxHeight: 280 }}>
<table className="table mono small">
<tbody>
{grid.map((r, i) => (
<tr key={i}>
{r.map((c, j) => (
<td key={j}>{c}</td>
))}
</tr>
))}
</tbody>
</table>
</div>
)}
</div>
);
}
