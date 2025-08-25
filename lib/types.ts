// lib/types.ts
export type Row = {
  id: string;
  uid: string;
  asset: string;
  type: string;
  amount: number;
  time: string; // "YYYY-MM-DD HH:MM:SS" UTC+0
  ts: number;   // epoch ms (UTC)
  symbol: string;
  extra: string;
  raw: string;
};

export const TYPE = {
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

export const EVENT_PREFIX = "EVENT_CONTRACTS_";
export const EVENT_KNOWN_CORE = new Set([TYPE.EVENT_ORDER, TYPE.EVENT_PAYOUT]);
export const KNOWN_TYPES = new Set<string>(Object.values(TYPE));

export const EPS = 1e-12;
export const SPLIT_W = 12; // splitter width (px)

export const ALL_ASSETS = ["BTC","LDUSDT","BFUSD","FDUSD","BNB","ETH","USDT","USDC","BNFCR"] as const;
export type AssetCode = typeof ALL_ASSETS[number];

export const DATE_RE = /(\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2})/; // UTC+0
export const SYMBOL_RE = /^[A-Z0-9]{2,}(USDT|USDC|USD|BTC|ETH|BNB|BNFCR)$/;
