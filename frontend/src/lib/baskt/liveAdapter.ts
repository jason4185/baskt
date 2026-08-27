import { createClient } from "genlayer-js";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type { Address } from "viem";
import type { Connector } from "wagmi";

import type { BasktAdapter } from "./adapter";
import {
  CONTRACT_ADDRESS,
  GENLAYER_CHAIN,
  GENLAYER_RPC_ENDPOINT,
  MAX_PAGE,
  NETWORK_NAME,
} from "./config";
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
  SourceDirection,
  SourceReading,
  SourceStatus,
  TxKind,
  TxReceipt,
  UserPosition,
  UserResult,
} from "./types";

type RawRecord = {
  [key: string]: unknown;
  cause?: unknown;
  market_state?: unknown;
  state?: unknown;
  up_pool?: unknown;
  down_pool?: unknown;
  total_pool?: unknown;
  up_percentage_bps?: unknown;
  down_percentage_bps?: unknown;
  market_id?: unknown;
  asset?: unknown;
  target_day?: unknown;
  target_start?: unknown;
  target_end?: unknown;
  entries_open?: unknown;
  settlement_ready?: unknown;
  settled?: unknown;
  inconclusive?: unknown;
  evidence_available?: unknown;
  winning_side?: unknown;
  paid_out?: unknown;
  refund_all?: unknown;
  wallet?: unknown;
  side?: unknown;
  stake?: unknown;
  remaining_capacity?: unknown;
  claimed?: unknown;
  claimable?: unknown;
  claim_type?: unknown;
  result?: unknown;
  status?: unknown;
  open?: unknown;
  close?: unknown;
  target_timestamp?: unknown;
  direction?: unknown;
  attempts_used?: unknown;
  final_status?: unknown;
  consensus_direction?: unknown;
  next_offset?: unknown;
  has_more?: unknown;
  total?: unknown;
  txExecutionResultName?: unknown;
  assets?: unknown;
  name?: unknown;
  sources?: unknown;
  price_scale?: unknown;
  minimum_stake?: unknown;
  maximum_stake?: unknown;
  max_page?: unknown;
  source_attempts?: unknown;
  sides?: unknown;
  source_directions?: unknown;
  final_states?: unknown;
};
type AnyClient = {
  readContract(args: Record<string, unknown>): Promise<unknown>;
  writeContract(args: Record<string, unknown>): Promise<unknown>;
  waitForTransactionReceipt(args: Record<string, unknown>): Promise<RawRecord>;
};

let activeWallet: { connector: Connector; account: Address } | null = null;

export function setActiveWallet(wallet: { connector: Connector; account: Address } | null) {
  activeWallet = wallet;
}

function client(provider?: unknown, account?: Address): AnyClient {
  return createClient({
    chain: GENLAYER_CHAIN as never,
    endpoint: GENLAYER_RPC_ENDPOINT,
    ...(provider ? { provider } : {}),
    ...(account ? { account } : {}),
  }) as unknown as AnyClient;
}

function parsed(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function record(value: unknown, label: string): RawRecord {
  const result = parsed(value);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return result as RawRecord;
}

function text(value: unknown): string {
  return String(value ?? "");
}

function integer(value: unknown, label: string): bigint {
  try {
    return typeof value === "bigint" ? value : BigInt(text(value));
  } catch {
    throw new Error(`${label} returned an invalid integer.`);
  }
}

function safeNumber(value: unknown, label: string): number {
  const result = Number(integer(value, label));
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`${label} returned an invalid number.`);
  }
  return result;
}

function base(value: unknown, label: string): string {
  return integer(value, label).toString();
}

function asset(value: unknown): Asset {
  const result = text(value).toUpperCase();
  if (
    result !== "SPYUSDT" &&
    result !== "QQQUSDT" &&
    result !== "EWYUSDT" &&
    result !== "EWJUSDT"
  ) {
    throw new Error(`Contract returned unsupported asset ${result}.`);
  }
  return result;
}

function state(value: unknown): MarketState {
  const result = text(value);
  if (
    result !== "OPEN" &&
    result !== "LOCKED" &&
    result !== "READY_TO_SETTLE" &&
    result !== "SETTLED" &&
    result !== "INCONCLUSIVE"
  ) {
    throw new Error(`Contract returned unsupported market state ${result}.`);
  }
  return result;
}

function side(value: unknown): Side | null {
  const result = text(value).toUpperCase();
  return result === "UP" || result === "DOWN" ? result : null;
}

function sourceDirection(value: unknown): SourceDirection {
  const result = text(value).toUpperCase();
  if (result === "UP" || result === "DOWN" || result === "NON_DIRECTIONAL" || result === "NONE") {
    return result;
  }
  throw new Error(`Contract returned unsupported source direction ${result}.`);
}

function sourceStatus(value: unknown): SourceStatus {
  const result = text(value).toUpperCase();
  if (result === "VALID" || result === "UNAVAILABLE") return result;
  throw new Error(`Contract returned unsupported source status ${result}.`);
}

function claimType(value: unknown): "WINNINGS" | "REFUND" | "NONE" {
  const result = text(value).toUpperCase();
  if (result === "WINNINGS" || result === "REFUND" || result === "NONE") return result;
  throw new Error(`Contract returned unsupported claim type ${result}.`);
}

function userResult(value: unknown): UserResult {
  const result = text(value).toUpperCase();
  if (
    result === "NOT_PARTICIPATED" ||
    result === "PENDING" ||
    result === "WON" ||
    result === "LOST" ||
    result === "REFUND_AVAILABLE" ||
    result === "CLAIMED"
  ) {
    return result;
  }
  throw new Error(`Contract returned unsupported user result ${result}.`);
}

function errorText(error: unknown): string {
  const values: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "string") {
      values.push(current);
      break;
    }
    if (typeof current !== "object") break;
    const item = current as RawRecord;
    for (const key of ["shortMessage", "message", "details", "reason", "data"]) {
      if (item[key]) values.push(String(item[key]));
    }
    current = item.cause;
  }
  return values.join(" ");
}

function includesError(error: unknown, pattern: RegExp): boolean {
  return pattern.test(`${errorText(error)} ${String(error)}`);
}

async function read(functionName: string, args: unknown[] = []): Promise<unknown> {
  return client().readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    transactionHashVariant: "latest-nonfinal",
  });
}

function mapMarket(value: unknown, label = "get_market"): Market {
  const raw = record(value, label);
  const marketState = state(raw.market_state ?? raw.state);
  const upPool = base(raw.up_pool, `${label} up_pool`);
  const downPool = base(raw.down_pool, `${label} down_pool`);
  const totalPool = base(raw.total_pool, `${label} total_pool`);
  const derivedUpBps =
    BigInt(upPool) + BigInt(downPool) === 0n
      ? 0
      : Number((BigInt(upPool) * 10000n) / (BigInt(upPool) + BigInt(downPool)));
  const upBps =
    raw.up_percentage_bps === undefined
      ? derivedUpBps
      : safeNumber(raw.up_percentage_bps, `${label} up_percentage_bps`);
  const downBps =
    raw.down_percentage_bps === undefined
      ? upBps === 0 && BigInt(totalPool) === 0n
        ? 0
        : 10000 - upBps
      : safeNumber(raw.down_percentage_bps, `${label} down_percentage_bps`);
  const entriesOpen =
    raw.entries_open === undefined ? marketState === "OPEN" : Boolean(raw.entries_open);
  const evidenceAvailable =
    raw.evidence_available === undefined
      ? marketState === "SETTLED" || marketState === "INCONCLUSIVE"
      : Boolean(raw.evidence_available);
  return {
    market_id: safeNumber(raw.market_id, `${label} market_id`),
    asset: asset(raw.asset),
    target_day: text(raw.target_day),
    target_start: safeNumber(raw.target_start, `${label} target_start`),
    target_end: safeNumber(raw.target_end, `${label} target_end`),
    state: marketState,
    entries_open: entriesOpen,
    settlement_ready: Boolean(raw.settlement_ready),
    settled: Boolean(raw.settled),
    inconclusive: Boolean(raw.inconclusive),
    evidence_available: evidenceAvailable,
    winning_side: side(raw.winning_side),
    up_pool: upPool,
    down_pool: downPool,
    total_pool: totalPool,
    paid_out: base(raw.paid_out ?? 0, `${label} paid_out`),
    up_bps: upBps,
    down_bps: downBps,
    refund_all: Boolean(raw.refund_all),
  };
}

function mapPosition(value: unknown, wallet?: string, label = "get_position"): Position {
  const raw = record(value, label);
  return {
    market_id: safeNumber(raw.market_id, `${label} market_id`),
    wallet: text(raw.wallet || wallet).toLowerCase(),
    side: side(raw.side),
    amount: base(raw.stake ?? 0, `${label} stake`),
    remaining_capacity: base(raw.remaining_capacity ?? 0, `${label} remaining_capacity`),
    claimed: Boolean(raw.claimed),
    claimable_amount: base(raw.claimable ?? 0, `${label} claimable`),
    claim_type: claimType(raw.claim_type),
    result: userResult(raw.result),
  };
}

function mapClaimable(value: unknown, marketId: number, claimTypeValue: unknown): Claimable {
  const amount = base(value, "get_claimable");
  return {
    market_id: marketId,
    claimable: amount !== "0",
    amount,
    claim_type: claimType(claimTypeValue),
  };
}

function mapEvidence(value: unknown): SettlementEvidence {
  const raw = record(value, "get_settlement_evidence");
  const source = (key: "binance" | "bitget"): SourceReading => {
    const item = record(raw[key], `get_settlement_evidence ${key}`);
    const status = sourceStatus(item.status);
    const open = base(item.open ?? 0, `${key} open`);
    const close = base(item.close ?? 0, `${key} close`);
    return {
      source: key.toUpperCase() as "BINANCE" | "BITGET",
      target_timestamp: safeNumber(item.target_timestamp, `${key} target_timestamp`),
      open: status === "UNAVAILABLE" ? null : open,
      close: status === "UNAVAILABLE" ? null : close,
      direction: sourceDirection(item.direction),
      status,
      attempts_used: safeNumber(item.attempts_used, `${key} attempts_used`),
    };
  };
  const finalStatus = text(raw.final_status).toUpperCase();
  return {
    market_id: safeNumber(raw.market_id, "evidence market_id"),
    available: true,
    sources: [source("binance"), source("bitget")],
    consensus: side(raw.consensus_direction),
    final_status:
      finalStatus === "SETTLED" || finalStatus === "INCONCLUSIVE" ? finalStatus : "PENDING",
    refund_all: Boolean(raw.refund_all),
  };
}

function pageFrom<T>(
  value: unknown,
  label: string,
  key: string,
  map: (row: unknown) => T,
): Page<T> {
  const raw = record(value, label);
  const rows = Array.isArray(raw[key]) ? raw[key].map(map) : [];
  return {
    items: rows,
    next_offset:
      raw.next_offset === undefined ? null : safeNumber(raw.next_offset, `${label} next_offset`),
    has_more: Boolean(raw.has_more),
    total: raw.total === undefined ? null : safeNumber(raw.total, `${label} total`),
  };
}

async function getMarketById(marketId: number): Promise<Market | null> {
  try {
    return mapMarket(await read("get_market", [BigInt(marketId)]));
  } catch (error) {
    if (includesError(error, /market not found|invalid market id/i)) return null;
    throw error;
  }
}

async function mapUserPosition(raw: unknown, wallet: string): Promise<UserPosition> {
  const position = mapPosition(raw, wallet, "get_user_positions position");
  const market = await getMarketById(position.market_id);
  if (!market) throw new Error(`Market ${position.market_id} was not found.`);
  return {
    position,
    market,
    claimable: {
      market_id: position.market_id,
      claimable: position.claimable_amount !== "0",
      amount: position.claimable_amount,
      claim_type: position.claim_type,
    },
  };
}

async function submit(
  kind: TxKind,
  functionName: string,
  args: unknown[],
  value: bigint,
  summary: string,
): Promise<TxReceipt> {
  if (!activeWallet) throw new Error("Connect an injected browser wallet before submitting.");
  const provider = await activeWallet.connector.getProvider();
  const request = (
    provider as {
      request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    }
  ).request;
  if (!request) throw new Error("The connected wallet does not expose an EIP-1193 provider.");
  const accounts = await request({ method: "eth_accounts" });
  const account = Array.isArray(accounts) ? String(accounts[0] ?? "") : "";
  if (account.toLowerCase() !== activeWallet.account.toLowerCase()) {
    throw new Error("The active wallet account changed. Reconnect the selected account.");
  }
  const chainId = String(await request({ method: "eth_chainId" })).toLowerCase();
  if (chainId !== `0x${GENLAYER_CHAIN.id.toString(16)}`) {
    throw new Error(`Wrong network. Switch your wallet to ${NETWORK_NAME}.`);
  }

  const writeClient = client(provider, activeWallet.account);
  let hash: string;
  try {
    hash = String(
      await writeClient.writeContract({
        address: CONTRACT_ADDRESS,
        functionName,
        args,
        value,
      }),
    );
  } catch (error) {
    throw new Error(errorText(error) || "The transaction could not be submitted.");
  }

  let receipt: RawRecord | null;
  try {
    const receiptPromise = writeClient.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      interval: 2_000,
      retries: 75,
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 150_000));
    receipt = await Promise.race([receiptPromise, timeout]);
  } catch (error) {
    throw new Error(errorText(error) || "The transaction could not be confirmed.");
  }
  if (!receipt) {
    return {
      hash,
      kind,
      market_id: null,
      submitted_at: Math.floor(Date.now() / 1000),
      status: "PENDING",
      summary,
    };
  }
  const execution = text(receipt.txExecutionResultName);
  if (execution === ExecutionResult.FINISHED_WITH_ERROR) {
    throw new Error(errorText(receipt) || "The contract rejected this transaction.");
  }
  return {
    hash,
    kind,
    market_id: null,
    submitted_at: Math.floor(Date.now() / 1000),
    status: execution === ExecutionResult.FINISHED_WITH_RETURN ? "SUCCESS" : "PENDING",
    summary,
  };
}

async function filteredMarkets(args: {
  offset?: number;
  limit?: number;
  asset?: Asset | null;
  state?: MarketState | null;
}): Promise<Page<Market>> {
  const requestedOffset = Math.max(0, Math.floor(args.offset ?? 0));
  const requestedLimit = Math.min(MAX_PAGE, Math.max(1, Math.floor(args.limit ?? 8)));
  if (!args.asset && !args.state) {
    return pageFrom(
      await read("get_markets", [BigInt(requestedOffset), BigInt(requestedLimit)]),
      "get_markets",
      "markets",
      (row) => mapMarket(row, "get_markets market"),
    );
  }

  const items: Market[] = [];
  let offset = requestedOffset;
  let total = 0;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const page = pageFrom(
      await read("get_markets", [BigInt(offset), BigInt(MAX_PAGE)]),
      "get_markets",
      "markets",
      (row) => mapMarket(row, "get_markets market"),
    );
    total = page.total ?? total;
    for (const item of page.items) {
      const itemCursor = item.market_id + 1;
      if (
        (!args.asset || item.asset === args.asset) &&
        (!args.state || item.state === args.state)
      ) {
        items.push(item);
        if (items.length >= requestedLimit) {
          return {
            items: items.slice(0, requestedLimit),
            next_offset: itemCursor < total ? itemCursor : null,
            has_more: itemCursor < total,
            total,
          };
        }
      }
    }
    if (!page.has_more || page.next_offset === null) {
      return {
        items: items.slice(0, requestedLimit),
        next_offset: null,
        has_more: false,
        total,
      };
    }
    if (page.next_offset <= offset) throw new Error("Market pagination did not advance.");
    offset = page.next_offset;
  }
  throw new Error("Market filter exceeded its safety limit.");
}

export const liveAdapter: BasktAdapter = {
  mode: "live",

  async get_supported_assets() {
    const value = parsed(await read("get_supported_assets"));
    if (!Array.isArray(value))
      throw new Error("get_supported_assets returned an invalid response.");
    return value.map(asset);
  },

  async get_config(): Promise<ContractConfig> {
    const raw = record(await read("get_config"), "get_config");
    const assets = Array.isArray(raw.assets) ? raw.assets.map(asset) : [];
    return {
      name: text(raw.name),
      assets,
      sources: Array.isArray(raw.sources) ? raw.sources.map(text) : [],
      price_scale: base(raw.price_scale, "get_config price_scale"),
      minimum_stake: base(raw.minimum_stake, "get_config minimum_stake"),
      maximum_stake: base(raw.maximum_stake, "get_config maximum_stake"),
      max_page: safeNumber(raw.max_page, "get_config max_page"),
      source_attempts: safeNumber(raw.source_attempts, "get_config source_attempts"),
      sides: Array.isArray(raw.sides)
        ? raw.sides
            .map((value: unknown) => side(value))
            .filter((value: Side | null): value is Side => value !== null)
        : [],
      source_directions: Array.isArray(raw.source_directions)
        ? raw.source_directions.map((value: unknown) => sourceDirection(value))
        : [],
      final_states: Array.isArray(raw.final_states)
        ? raw.final_states.filter(
            (value: unknown): value is "SETTLED" | "INCONCLUSIVE" =>
              value === "SETTLED" || value === "INCONCLUSIVE",
          )
        : [],
    };
  },

  get_market_count: async () => safeNumber(await read("get_market_count"), "get_market_count"),
  get_market: getMarketById,
  async get_market_summary(marketId) {
    try {
      const summary = mapMarket(
        await read("get_market_summary", [BigInt(marketId)]),
        "get_market_summary",
      );
      return {
        ...summary,
        entries_open: summary.state === "OPEN",
        evidence_available: summary.settled || summary.inconclusive,
      };
    } catch (error) {
      if (includesError(error, /market not found|invalid market id/i)) return null;
      throw error;
    }
  },
  get_market_state: async (marketId) => {
    try {
      const raw = record(await read("get_market_state", [BigInt(marketId)]), "get_market_state");
      return state(raw.state);
    } catch (error) {
      if (includesError(error, /market not found|invalid market id/i)) return null;
      throw error;
    }
  },
  async get_market_by_asset_day(assetValue, targetDay) {
    try {
      return mapMarket(
        await read("get_market_by_asset_day", [assetValue, targetDay]),
        "get_market_by_asset_day",
      );
    } catch (error) {
      if (includesError(error, /market not found/i)) return null;
      throw error;
    }
  },
  get_position: async (marketId, wallet) => {
    if (!wallet) return null;
    const raw = await read("get_position", [BigInt(marketId), wallet.toLowerCase()]);
    const position = mapPosition(raw, wallet, "get_position");
    return position.side ? position : null;
  },
  async get_user_market(marketId, wallet) {
    if (!wallet) {
      return {
        market_id: marketId,
        wallet: "",
        side: null,
        amount: "0",
        remaining_capacity: "0",
        claimed: false,
        claimable_amount: "0",
        claim_type: "NONE",
        result: "NOT_PARTICIPATED",
      };
    }
    return mapPosition(
      await read("get_user_market", [BigInt(marketId), wallet.toLowerCase()]),
      wallet,
      "get_user_market",
    );
  },
  async get_claimable(marketId, wallet) {
    if (!wallet) return { market_id: marketId, claimable: false, amount: "0", claim_type: "NONE" };
    const [amount, detail] = await Promise.all([
      read("get_claimable", [BigInt(marketId), wallet.toLowerCase()]),
      read("get_user_market", [BigInt(marketId), wallet.toLowerCase()]),
    ]);
    const position = mapPosition(detail, wallet, "get_user_market");
    return mapClaimable(amount, marketId, position.claim_type);
  },
  get_remaining_position_capacity: async (marketId, wallet) => {
    if (!wallet) return "0";
    return base(
      await read("get_remaining_position_capacity", [BigInt(marketId), wallet.toLowerCase()]),
      "get_remaining_position_capacity",
    );
  },
  async get_settlement_evidence(marketId) {
    try {
      const market = record(await read("get_market", [BigInt(marketId)]), "get_market");
      if (!market.evidence_available) {
        return {
          market_id: marketId,
          available: false,
          sources: [],
          consensus: null,
          final_status: "PENDING",
          refund_all: false,
        };
      }
      return mapEvidence(await read("get_settlement_evidence", [BigInt(marketId)]));
    } catch (error) {
      if (includesError(error, /evidence unavailable/i)) {
        return {
          market_id: marketId,
          available: false,
          sources: [],
          consensus: null,
          final_status: "PENDING",
          refund_all: false,
        };
      }
      throw error;
    }
  },
  get_markets: filteredMarkets,
  get_open_markets: async (args) =>
    pageFrom(
      await read("get_open_markets", [
        BigInt(args.offset ?? 0),
        BigInt(Math.min(MAX_PAGE, args.limit ?? 8)),
      ]),
      "get_open_markets",
      "markets",
      (row) => mapMarket(row, "get_open_markets market"),
    ),
  get_ready_to_settle_markets: async (args) =>
    pageFrom(
      await read("get_ready_to_settle_markets", [
        BigInt(args.offset ?? 0),
        BigInt(Math.min(MAX_PAGE, args.limit ?? 8)),
      ]),
      "get_ready_to_settle_markets",
      "markets",
      (row) => mapMarket(row, "get_ready_to_settle_markets market"),
    ),
  async get_user_positions(args) {
    const page = pageFrom(
      await read("get_user_positions", [
        args.wallet.toLowerCase(),
        BigInt(args.offset ?? 0),
        BigInt(Math.min(MAX_PAGE, args.limit ?? 8)),
      ]),
      "get_user_positions",
      "positions",
      (row) => row,
    );
    return {
      ...page,
      items: await Promise.all(page.items.map((row) => mapUserPosition(row, args.wallet))),
    };
  },
  async get_claimable_markets(args) {
    const page = pageFrom(
      await read("get_claimable_markets", [
        args.wallet.toLowerCase(),
        BigInt(args.offset ?? 0),
        BigInt(Math.min(MAX_PAGE, args.limit ?? 8)),
      ]),
      "get_claimable_markets",
      "claims",
      (row) => row,
    );
    const items = await Promise.all(
      page.items.map(async (row) => {
        const raw = record(row, "get_claimable_markets claim");
        const position = mapPosition(
          {
            market_id: raw.market_id,
            wallet: args.wallet,
            side: raw.side,
            stake: raw.stake,
            remaining_capacity: 0,
            claimed: raw.claimed,
            claimable: raw.claimable,
            claim_type: raw.claim_type,
            result: raw.claim_type === "REFUND" ? "REFUND_AVAILABLE" : "WON",
          },
          args.wallet,
          "get_claimable_markets claim",
        );
        const market = await getMarketById(position.market_id);
        if (!market) throw new Error(`Market ${position.market_id} was not found.`);
        return {
          position,
          market,
          claimable: {
            market_id: position.market_id,
            claimable: position.claimable_amount !== "0",
            amount: position.claimable_amount,
            claim_type: position.claim_type,
          },
        };
      }),
    );
    return { ...page, items };
  },
  async create_market(assetValue, targetDay) {
    const receipt = await submit(
      "create_market",
      "create_market",
      [assetValue, targetDay],
      0n,
      `Created ${assetValue.replace("USDT", "")} market for ${targetDay}.`,
    );
    if (receipt.status !== "SUCCESS") return receipt;
    const market = await this.get_market_by_asset_day(assetValue, targetDay);
    return { ...receipt, market_id: market?.market_id ?? null };
  },
  stake: (marketId, chosenSide, value) =>
    submit(
      "stake",
      "stake",
      [BigInt(marketId), chosenSide],
      BigInt(value),
      `Staked on ${chosenSide}.`,
    ),
  settle_market: (marketId) =>
    submit("settle_market", "settle_market", [BigInt(marketId)], 0n, "Settlement submitted."),
  claim: (marketId) => submit("claim", "claim", [BigInt(marketId)], 0n, "Claim submitted."),
};
