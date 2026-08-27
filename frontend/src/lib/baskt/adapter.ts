import type {
  Asset,
  Claimable,
  ContractConfig,
  Market,
  MarketState,
  Page,
  Position,
  SettlementEvidence,
  Side,
  TxReceipt,
  UserPosition,
} from "./types";

export interface PageArgs {
  offset?: number;
  limit?: number;
}

/**
 * The single boundary between BASKT's UI and the GenLayer contract.
 * Every read below maps 1:1 to a contract method name.
 */
export interface BasktAdapter {
  readonly mode: "live";

  // ---- reads -------------------------------------------------------------
  get_supported_assets(): Promise<Asset[]>;
  get_config(): Promise<ContractConfig>;
  get_market_count(): Promise<number>;
  get_market(market_id: number): Promise<Market | null>;
  get_market_summary(market_id: number): Promise<Market | null>;
  get_market_state(market_id: number): Promise<MarketState | null>;
  get_market_by_asset_day(asset: Asset, target_day: string): Promise<Market | null>;
  get_position(market_id: number, wallet: string): Promise<Position | null>;
  get_user_market(market_id: number, wallet: string): Promise<Position | null>;
  get_claimable(market_id: number, wallet: string): Promise<Claimable>;
  get_remaining_position_capacity(market_id: number, wallet: string): Promise<string>;
  get_settlement_evidence(market_id: number): Promise<SettlementEvidence>;
  get_markets(
    args: PageArgs & { asset?: Asset | null; state?: MarketState | null },
  ): Promise<Page<Market>>;
  get_open_markets(args: PageArgs): Promise<Page<Market>>;
  get_ready_to_settle_markets(args: PageArgs): Promise<Page<Market>>;
  get_user_positions(args: PageArgs & { wallet: string }): Promise<Page<UserPosition>>;
  get_claimable_markets(args: PageArgs & { wallet: string }): Promise<Page<UserPosition>>;

  // ---- writes ------------------------------------------------------------
  create_market(asset: Asset, target_day: string): Promise<TxReceipt>;
  /** payable — `value` is the staked GEN amount in base units */
  stake(market_id: number, side: Side, value: string): Promise<TxReceipt>;
  settle_market(market_id: number): Promise<TxReceipt>;
  claim(market_id: number): Promise<TxReceipt>;
}
