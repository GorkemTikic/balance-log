export function parseUtcMs(s: string): number {
  // try ISO first
  const t = Date.parse(s);
  if (Number.isFinite(t)) return t;
  // try "YYYY-MM-DD HH:mm:ss" assume UTC
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m){
    const [_,Y,Mo,D,h,mi,se] = m;
    return Date.UTC(Number(Y), Number(Mo)-1, Number(D), Number(h), Number(mi), Number(se||"0"));
  }
  return Date.now();
}
export function tsToUtcString(ts: number){
  return new Date(ts).toISOString().replace(".000Z","Z");
}
