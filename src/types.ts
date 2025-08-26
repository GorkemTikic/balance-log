export type Row = {
  time: string;     // original text time
  ts: number;       // epoch ms (UTC)
  type: string;
  asset: string;
  amount: number;
  symbol?: string;
  id?: string;
  uid?: string;
  extra?: string;
};

export type Sum = { pos: number; neg: number; net: number };
export type ByAssetMap = Record<string, Sum>;
