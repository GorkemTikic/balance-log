// src/lib/story.ts
import { BalanceRow } from "../types";

type AnchorTransfer = { asset: string; amount: number };

export function buildNarrativeParagraphs(
  rows: BalanceRow[],
  anchorISO?: string,
  opts?: {
    initialBalances?: Record<string, number>;
    anchorTransfer?: AnchorTransfer;
    endISO?: string;
  }
): string {
  let out = "";

  // Always prepend UTC+0 notice
  out +=
    "All dates and times we will share are in UTC+0, so please adjust according to your timezone.\n\n";

  const balances0 = opts?.initialBalances || {};
  const anchorTransfer = opts?.anchorTransfer;

  if (anchorISO && anchorTransfer && opts?.initialBalances) {
    const { asset, amount } = anchorTransfer;
    const before = balances0[asset] || 0;
    const after = before + amount;
    out += `${anchorISO} UTC+0 — At this date and time, you transferred ${fmt(
      amount
    )} ${asset} to your Futures USDs-M Wallet. After this transfer your futures wallet balance increased from ${fmt(
      before
    )} to ${fmt(after)}.\n\n`;
    out += `If we check your transaction records after this transfer:\n\n`;
  } else if (anchorISO && opts?.initialBalances) {
    out += `${anchorISO} UTC+0 — At this date and time your Futures USDs-M Wallet balance was: ${Object.entries(
      balances0
    )
      .map(([a, v]) => `${fmt(v)} ${a}`)
      .join(", ")}.\n\nIf we check your transaction records after this point:\n\n`;
  } else {
    out += `Here are your transaction records:\n\n`;
  }

  // group by type
  const byType: Record<string, Record<string, number>> = {};
  rows.forEach((r) => {
    const t = r.type;
    if (!byType[t]) byType[t] = {};
    byType[t][r.asset] = (byType[t][r.asset] || 0) + r.amount;
  });

  // Narrative per type
  const order = [
    "REALIZED_PNL",
    "COMMISSION",
    "FUNDING_FEE",
    "INSURANCE_CLEAR",
    "REFERRAL_KICKBACK",
    "COMISSION_REBATE",
    "CASH_COUPON",
    "POSITION_LIMIT_INCREASE_FEE",
    "POSITION_CLAIM_TRANSFER",
    "DELIVERED_SETTELMENT",
    "STRATEGY_UMFUTURES_TRANSFER",
    "FUTURES_PRESENT",
    "EVENT_CONTRACTS_ORDER",
    "EVENT_CONTRACTS_PAYOUT",
    "COIN_SWAP_DEPOSIT",
    "COIN_SWAP_WITHDRAW",
    "AUTO_EXCHANGE",
  ];

  order.forEach((t) => {
    if (!byType[t]) return;
    out += describeType(t, byType[t]) + "\n";
  });

  // any other types
  Object.keys(byType)
    .filter((t) => !order.includes(t))
    .forEach((t) => {
      out += `Other (${t}): ${summarize(byType[t])}\n`;
    });

  // final balances
  const balances: Record<string, number> = { ...balances0 };
  rows.forEach((r) => {
    balances[r.asset] = (balances[r.asset] || 0) + r.amount;
  });

  const filteredFinal = Object.entries(balances).filter(([a, v]) => {
    if (["BFUSD", "FDUSD", "LDUSDT"].includes(a) && Math.abs(v) < 1e-7) {
      return false;
    }
    return true;
  });

  out += `\nFinal expected balances:\n`;
  filteredFinal.forEach(([a, v]) => {
    out += `  • ${a} ${fmt(v)}\n`;
  });

  return out;
}

function fmt(n: number): string {
  return Number(n).toFixed(12).replace(/\.?0+$/, "");
}

function summarize(map: Record<string, number>): string {
  return Object.entries(map)
    .map(([a, v]) => `${fmt(v)} ${a}`)
    .join(", ");
}

function describeType(type: string, map: Record<string, number>): string {
  switch (type) {
    case "REALIZED_PNL":
      return `Realized PnL: ${summarize(map)}`;
    case "COMMISSION":
      return `Trading Fees: ${summarize(map)}`;
    case "FUNDING_FEE":
      return `Funding Fees: ${summarize(map)}`;
    case "INSURANCE_CLEAR":
      return `Insurance / Liquidation Fees: ${summarize(map)}`;
    case "REFERRAL_KICKBACK":
      return `Referral Incomes: ${summarize(map)}`;
    case "COMISSION_REBATE":
      return `Trading Fee Rebates: ${summarize(map)}`;
    case "CASH_COUPON":
      return `Gift Money: ${summarize(map)}`;
    case "POSITION_LIMIT_INCREASE_FEE":
      return `Position Limit Increase Fees: ${summarize(map)}`;
    case "POSITION_CLAIM_TRANSFER":
      return `Free Positions: ${summarize(map)}`;
    case "DELIVERED_SETTELMENT":
      return `Delivery Contracts Settlement: ${summarize(map)}`;
    case "STRATEGY_UMFUTURES_TRANSFER":
      return `GridBot Transfers: ${summarize(map)}`;
    case "FUTURES_PRESENT":
      return `Futures Presents: ${summarize(map)}`;
    case "EVENT_CONTRACTS_ORDER":
      return `Event Contracts (Order): ${summarize(map)}`;
    case "EVENT_CONTRACTS_PAYOUT":
      return `Event Contracts (Payout): ${summarize(map)}`;
    case "COIN_SWAP_DEPOSIT":
      return `Coin Swap Deposit: ${summarize(map)}`;
    case "COIN_SWAP_WITHDRAW":
      return `Coin Swap Withdraw: ${summarize(map)}`;
    case "AUTO_EXCHANGE":
      return `Auto-Exchange: ${summarize(map)}`;
    default:
      return `${type}: ${summarize(map)}`;
  }
}
