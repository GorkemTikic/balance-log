// src/App.tsx
import React, { useMemo, useState, useRef, useEffect } from "react";
import GridPasteBox from "@/components/GridPasteBox";
import RpnCard from "@/components/RpnCard";
import { gt, fmtAbs, fmtSigned } from "@/lib/format";


// NOTE: This is a minimal, behavior-preserving extraction pass.
// Parsing/aggregation helpers remain here; UI pieces moved to components.


type Row = {
id: string; uid: string; asset: string; type: string; amount: number;
time: string; ts: number; symbol: string; extra: string; raw: string;
};


const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/; // UTC+0
const SYMBOL_RE = /^[A-Z0-9]{2,}(USDT|USDC|USD|BTC|ETH|BNB|BNFCR)$/;


const TYPE = {
REALIZED_PNL: "REALIZED_PNL",
FUNDING_FEE: "FUNDING_FEE",
COMMISSION: "COMMISSION",
INSURANCE_CLEAR: "INSURANCE_CLEAR",
LIQUIDATION_FEE: "LIQUIDATION_FEE",
REFERRAL_KICKBACK: "REFERRAL_KICKBACK",
TRANSFER: "TRANSFER",
GRIDBOT_TRANSFER: "STRATEGY_UMFUTURES_TRANSFER",
COIN_SWAP_DEPOSIT: "COIN_SWAP_DEPOSIT",
COIN_SWAP_WITHDRAW: "COIN_SWAP_WITHDRAW",
AUTO_EXCHANGE: "AUTO_EXCHANGE",
EVENT_ORDER: "EVENT_CONTRACTS_ORDER",
EVENT_PAYOUT: "EVENT_CONTRACTS_PAYOUT",
} as const;


const EVENT_PREFIX = "EVENT_CONTRACTS_";
const EVENT_KNOWN_CORE = new Set([TYPE.EVENT_ORDER, TYPE.EVENT_PAYOUT]);
const KNOWN_TYPES = new Set<string>(Object.values(TYPE));


/* ---------- time utils ---------- */
function normalizeTimeString(s: string): string {
const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
if (!m) return s;
const [, y, mo, d, h, mi, se] = m;
const hh = h.padStart(2, "0");
return `${y}-${mo}-${d} ${hh}:${mi}:${se}`;
}
function parseUtcMs(s: string): number {
const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
if (!m) return NaN;
const [, Y, Mo, D, H, Mi, S] = m;
return Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
}
function tsToUtcString(millis: number): string {
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


/* ---------- general helpers ---------- */
function splitColumns(line: string) {
if (line.includes("\t")) return line.split(/\t+/);
return line.trim().split(/\s{2,}|\s\|\s|\s+/);
}
function firstDateIn(line: string) {
const m = line.match(DATE_RE);
return m ? m[1] : "";
}
function parseBalanceLog(text: string) {
const rows: Row[] = [];
const diags: string[] = [];
const lines = text
.replace(/[\u00A0\u2000-\u200B]/g, " ")
.split(/\r?\n/)
.map((l) => l.trim())
.filter(Boolean);
for (const line of lines) {
}
