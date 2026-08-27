import { testnetBradbury } from "genlayer-js/chains";
import { getAddress, type Address } from "viem";

export const NETWORK = {
  name: testnetBradbury.name,
  shortName: "Bradbury",
  chainId: testnetBradbury.id,
  rpcUrl: String(
    import.meta.env["VITE_GENLAYER_RPC_URL"] ?? testnetBradbury.rpcUrls.default.http[0],
  ),
  explorerUrl: "https://explorer-bradbury.genlayer.com",
} as const;

export const GENLAYER_CHAIN = testnetBradbury;
export const GENLAYER_RPC_ENDPOINT = NETWORK.rpcUrl;
export const NETWORK_NAME = NETWORK.name;
export const CONTRACT_ADDRESS: Address = getAddress("0x1Dd45ED4eD6f66768deAF6C3c91F8999f6eD7807");

export const TOKEN = {
  symbol: "GEN",
  decimals: 18,
} as const;

export const STAKE_RULES = {
  minStake: 1,
  maxStakePerWallet: 10,
} as const;

export const MAX_PAGE = 50;
export const PRICE_SOURCES = ["BINANCE", "BITGET"] as const;
export const MAX_ATTEMPTS = 3;
export const CONTRACT_EXPLORER = "https://explorer-bradbury.genlayer.com";
