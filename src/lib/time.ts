// src/lib/time.ts
import { Row } from "./types";

export function normalizeTimeString(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return s;
  const [, y, mo, d, h, mi, se] = m;
  const hh = h.padStart(2, "0");
  return `${y}-${mo}-${d} ${hh}:${mi}:${se}`;
}
export function parseUtcMs(s: string): number {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return NaN;
  const [, Y, Mo, D, H, Mi, S] = m;
  return Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
}
export function tsToUtcString(millis: number): string {
  const d = new Date(millis);
  const pad = (n: number) => String(n).padStart(2, "0");
  const Y = d.getUTCFullYear();
  const M = pad(d.getUTCMonth() + 1);
  const D = pad(d.getUTCDate());
  const H = pad(d.getUTCHours());
  const I = pad(d.getUTCMinutes());
  const S = pad(d.getUTCSeconds());
  return `${Y}-${M}-${D} ${H}:${I}:${S}`;
}

export function filterRowsInRangeUTC(rows: Row[], start?: string, end?: string, exclusiveStart = false) {
  const s = start ? parseUtcMs(normalizeTimeString(start)) : Number.NEGATIVE_INFINITY;
  const e = end ? parseUtcMs(normalizeTimeString(end)) : Number.POSITIVE_INFINITY;
  return rows.filter((r) => {
    if (exclusiveStart ? !(r.ts > s) : !(r.ts >= s)) return false;
    if (!(r.ts <= e)) return false;
    return true;
  });
}
