// Shared types
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

export const ALL_ASSETS = ["BTC","LDUSDT","BFUSD","FDUSD","BNB","ETH","USDT","USDC","BNFCR"] as const;
export type AssetCode = typeof ALL_ASSETS[number];
