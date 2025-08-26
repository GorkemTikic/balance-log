import { Row } from "../types";
import { parseUtcMs } from "./time";

/**
 * Accepts tab- or comma-separated text with optional header.
 * Tries to map columns: time,type,asset,amount,symbol,id,uid,extra
 */
export function parseBalanceLog(raw: string): { rows: Row[]; diags: string[] } {
  const diags: string[] = [];
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (!lines.length) return { rows: [], diags: ["No input"] };

  const delim = detectDelimiter(lines);
  const header = split(lines[0], delim);
  const maybeHeader = looksLikeHeader(header);

  const start = maybeHeader ? 1 : 0;
  const idx = indexMap(maybeHeader ? header : []);

  const rows: Row[] = [];
  for(let i=start;i<lines.length;i++){
    const cols = split(lines[i], delim);
    const get = (name: keyof typeof idx) => {
      const k = idx[name];
      return (k != null && k < cols.length) ? cols[k].trim() : "";
    };
    const time = idx.time != null ? get("time") : cols[0]?.trim() || "";
    const type = idx.type != null ? get("type") : cols[1]?.trim() || "";
    const asset= idx.asset!= null ? get("asset"): cols[2]?.trim() || "";
    const amtS = idx.amount!=null ? get("amount"): cols[3]?.trim() || "0";
    const symbol = idx.symbol!=null ? get("symbol") : cols[4]?.trim() || "";
    const id = idx.id!=null ? get("id") : cols[5]?.trim() || "";
    const uid = idx.uid!=null ? get("uid"): cols[6]?.trim() || "";
    const extra = idx.extra!=null ? get("extra"): cols.slice(7).join(delim).trim();

    const amount = Number(amtS.replace(/,/g,""));
    if (!Number.isFinite(amount)) { diags.push(`Line ${i+1}: amount not numeric → "${amtS}"`); continue; }

    const ts = parseUtcMs(time);
    rows.push({ time, ts, type, asset, amount, symbol, id, uid, extra });
  }
  if (!rows.length) diags.push("Parsed 0 rows. Check delimiter (tab/comma) or header names.");
  return { rows, diags };
}

function detectDelimiter(lines: string[]): string {
  // prefer TAB; fallback to comma
  const tabScore = lines.slice(0,10).filter(l => l.includes("\t")).length;
  const commaScore = lines.slice(0,10).filter(l => l.includes(",")).length;
  return tabScore >= commaScore ? "\t" : ",";
}
function split(line: string, d: string){ return line.split(d); }

function looksLikeHeader(cols: string[]){
  const f = (s:string) => s.toLowerCase().replace(/\s+/g,"");
  const set = new Set(cols.map(f));
  return set.has("time") || set.has("type") || set.has("asset") || set.has("amount");
}
function indexMap(header: string[]){
  const idx: any = {};
  const f = (s:string)=>s.toLowerCase().replace(/\s+/g,"");
  header.forEach((h,i)=>{
    const k = f(h);
    if (["time","timestamp","date"].includes(k)) idx.time = i;
    else if (["type","txntype","event"].includes(k)) idx.type = i;
    else if (["asset","currency","coin"].includes(k)) idx.asset = i;
    else if (["amount","qty","quantity","change"].includes(k)) idx.amount = i;
    else if (["symbol","pair"].includes(k)) idx.symbol = i;
    else if (["id","txid"].includes(k)) idx.id = i;
    else if (["uid","user"].includes(k)) idx.uid = i;
    else if (["extra","note","memo","data"].includes(k)) idx.extra = i;
  });
  return idx as {
    time?: number; type?: number; asset?: number; amount?: number; symbol?: number; id?: number; uid?: number; extra?: number;
  };
}
