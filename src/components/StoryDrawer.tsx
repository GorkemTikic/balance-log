// src/components/StoryDrawer.tsx
import React, { useMemo } from "react";
import { fmtAbs, fmtSigned, gt } from "@/lib/format";


export type TotalsMaps = {
realized: Record<string, { pos: number; neg: number; net: number }>;
funding: Record<string, { pos: number; neg: number; net: number }>;
commission: Record<string, { pos: number; neg: number; net: number }>;
insurance: Record<string, { pos: number; neg: number; net: number }>;
transfers: Record<string, { pos: number; neg: number; net: number }>;
eventsO: Record<string, { pos: number; neg: number; net: number }>;
eventsP: Record<string, { pos: number; neg: number; net: number }>;
};


function sectionLines(title: string, m: Record<string, { pos: number; neg: number; net: number }>) {
const keys = Object.keys(m).filter((k) => gt(m[k].pos) || gt(m[k].neg) || gt(m[k].net));
if (!keys.length) return [] as string[];
const L = [`- ${title}:`];
keys.sort().forEach((a) => {
const v = m[a];
const parts: string[] = [];
if (gt(v.pos)) parts.push(`+${fmtAbs(v.pos)}`);
if (gt(v.neg)) parts.push(`−${fmtAbs(v.neg)}`);
if (gt(v.net)) parts.push(fmtSigned(v.net));
L.push(` ${a}: ${parts.join(" / ") || "0"}`);
});
return L;
}


export default function StoryDrawer({
open,
onClose,
t0,
t1,
setT0,
setT1,
totals,
}: {
open: boolean;
onClose: () => void;
t0: string;
t1: string;
setT0: (v: string) => void;
setT1: (v: string) => void;
totals: TotalsMaps;
}) {
const story = useMemo(() => {
const L: string[] = [];
if (t0 && t1) L.push(`Between ${t0} and ${t1} (UTC+0):`);
else if (t0) L.push(`From ${t0} (UTC+0):`);
else L.push("Summary of activity:");


L.push(...sectionLines("Realized PnL", totals.realized));
L.push(...sectionLines("Trading Fees / Commission", totals.commission));
L.push(...sectionLines("Funding Fees", totals.funding));
L.push(...sectionLines("Insurance / Liquidation", totals.insurance));
L.push(...sectionLines("Transfers (General)", totals.transfers));
L.push(...sectionLines("Event Contracts — Orders", totals.eventsO));
L.push(...sectionLines("Event Contracts — Payouts", totals.eventsP));
return L.join("\n");
}, [t0, t1, totals]);


return (
<div
aria-hidden={!open}
style={{
position: "fixed",
top: 0,
}
