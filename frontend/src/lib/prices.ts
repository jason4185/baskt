import { useQuery } from "@tanstack/react-query";
import { SUPPORTED_ASSETS, type Asset } from "./baskt/types";

const BINANCE_FUTURES = "https://fapi.binance.com/fapi/v1";

export interface LivePrice {
  asset: Asset;
  price: number;
  change24h: number;
  updatedAt: number;
}

export interface PriceCandle {
  t: string;
  price: number;
}

export type PriceRange = "1H" | "4H" | "1D" | "1W";

const RANGE_CONFIG: Record<PriceRange, { interval: string; limit: number }> = {
  "1H": { interval: "1m", limit: 60 },
  "4H": { interval: "5m", limit: 48 },
  "1D": { interval: "15m", limit: 96 },
  "1W": { interval: "1h", limit: 168 },
};

async function binanceJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BINANCE_FUTURES}${path}`, {
    signal: signal ?? null,
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Binance price request failed with HTTP ${response.status}.`);
  return (await response.json()) as T;
}

export async function fetchLivePrices(
  assets: readonly Asset[],
  signal?: AbortSignal,
): Promise<Record<Asset, LivePrice>> {
  if (assets.length === 0) return {} as Record<Asset, LivePrice>;
  const symbols = encodeURIComponent(JSON.stringify(assets));
  const rows = await binanceJson<
    Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>
  >(`/ticker/24hr?symbols=${symbols}`, signal);
  const now = Date.now();
  const result = {} as Record<Asset, LivePrice>;
  for (const row of rows) {
    const symbol = row.symbol as Asset;
    const price = Number(row.lastPrice);
    const change24h = Number(row.priceChangePercent);
    if (
      !assets.includes(symbol) ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(change24h)
    ) {
      continue;
    }
    result[symbol] = { asset: symbol, price, change24h, updatedAt: now };
  }
  return result;
}

export async function fetchPriceCandles(
  asset: Asset,
  range: PriceRange,
  signal?: AbortSignal,
): Promise<PriceCandle[]> {
  const config = RANGE_CONFIG[range];
  const rows = await binanceJson<Array<[number, string, string, string, string]>>(
    `/klines?symbol=${asset}&interval=${config.interval}&limit=${config.limit}`,
    signal,
  );
  return rows
    .map((row) => ({
      t: new Date(Number(row[0])).toISOString(),
      price: Number(row[4]),
    }))
    .filter(
      (row) => Number.isFinite(Date.parse(row.t)) && Number.isFinite(row.price) && row.price > 0,
    );
}

export function useLivePrices() {
  return useQuery({
    queryKey: ["live-prices", "supported-assets"],
    queryFn: ({ signal }) => fetchLivePrices(SUPPORTED_ASSETS, signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 2,
  });
}

export function usePriceCandles(asset: Asset | undefined, range: PriceRange) {
  return useQuery({
    queryKey: ["live-price-candles", asset, range],
    queryFn: ({ signal }) => fetchPriceCandles(asset!, range, signal),
    enabled: Boolean(asset),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 1,
  });
}
