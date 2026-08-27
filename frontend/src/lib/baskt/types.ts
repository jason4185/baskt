/** Typed shapes for the deployed Baskt contract return values. */

export const SUPPORTED_ASSETS = ["SPYUSDT", "QQQUSDT", "EWYUSDT", "EWJUSDT"] as const;

export type Asset = (typeof SUPPORTED_ASSETS)[number];

export type MarketState = "OPEN" | "LOCKED" | "READY_TO_SETTLE" | "SETTLED" | "INCONCLUSIVE";

export type Side = "UP" | "DOWN";
export type SourceDirection = Side | "NON_DIRECTIONAL" | "NONE";
export type SourceStatus = "VALID" | "UNAVAILABLE";
export type ClaimType = "WINNINGS" | "REFUND" | "NONE";

export interface Market {
  market_id: number;
  asset: Asset;
  target_day: string;
  target_start: number;
  target_end: number;
  state: MarketState;
  entries_open: boolean;
  settlement_ready: boolean;
  settled: boolean;
  inconclusive: boolean;
  evidence_available: boolean;
  winning_side: Side | null;
  up_pool: string;
  down_pool: string;
  total_pool: string;
  paid_out: string;
  up_bps: number;
  down_bps: number;
  refund_all: boolean;
}

export type UserResult =
  "NOT_PARTICIPATED" | "PENDING" | "WON" | "LOST" | "REFUND_AVAILABLE" | "CLAIMED";

export interface Position {
  market_id: number;
  wallet: string;
  side: Side | null;
  amount: string;
  remaining_capacity: string;
  claimed: boolean;
  claimable_amount: string;
  claim_type: ClaimType;
  result: UserResult;
}

export interface Claimable {
  market_id: number;
  claimable: boolean;
  amount: string;
  claim_type: ClaimType;
}

export interface SourceReading {
  source: "BINANCE" | "BITGET";
  target_timestamp: number | null;
  open: string | null;
  close: string | null;
  direction: SourceDirection;
  status: SourceStatus;
  attempts_used: number;
}

export interface SettlementEvidence {
  market_id: number;
  available: boolean;
  sources: SourceReading[];
  consensus: Side | null;
  final_status: "SETTLED" | "INCONCLUSIVE" | "PENDING";
  refund_all: boolean;
}

export interface ContractConfig {
  name: string;
  assets: Asset[];
  sources: string[];
  price_scale: string;
  minimum_stake: string;
  maximum_stake: string;
  max_page: number;
  source_attempts: number;
  sides: Side[];
  source_directions: SourceDirection[];
  final_states: Array<"SETTLED" | "INCONCLUSIVE">;
}

export interface Page<T> {
  items: T[];
  next_offset: number | null;
  has_more: boolean;
  total: number | null;
}

export interface UserPosition {
  position: Position;
  market: Market;
  claimable: Claimable;
}

export type TxKind = "create_market" | "stake" | "settle_market" | "claim";

export interface TxReceipt {
  hash: string;
  kind: TxKind;
  market_id: number | null;
  submitted_at: number;
  status: "PENDING" | "SUCCESS" | "ERROR";
  summary: string;
}
