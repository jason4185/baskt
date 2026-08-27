import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { baskt } from "@/lib/baskt";
import { formatGen, ticker } from "@/lib/baskt/format";
import type { Asset, MarketState } from "@/lib/baskt/types";
import { MarketCard, marketQuestion } from "@/components/baskt/MarketCard";
import { CardSkeleton, EmptyState, ErrorState, Stat } from "@/components/baskt/primitives";
import { Pager } from "@/components/baskt/Pager";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { useLivePrices } from "@/lib/prices";
import { Activity, Gavel, Layers, Search, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BASKT — Daily ETF UP/DOWN Prediction Markets" },
      {
        name: "description",
        content:
          "Daily onchain markets on SPY, QQQ, EWY and EWJ: will the UTC day close above or below the open? Settled from Binance and Bitget data on GenLayer.",
      },
      { property: "og:title", content: "BASKT — Daily ETF UP/DOWN Markets" },
      {
        property: "og:description",
        content: "Predict the UTC daily direction of SPY, QQQ, EWY and EWJ onchain.",
      },
    ],
  }),
  component: MarketsPage,
});

const TABS: { value: string; label: string; state: MarketState | null }[] = [
  { value: "ALL", label: "All", state: null },
  { value: "OPEN", label: "Open", state: "OPEN" },
  { value: "LOCKED", label: "Locked", state: "LOCKED" },
  { value: "READY", label: "Ready to Settle", state: "READY_TO_SETTLE" },
  { value: "SETTLED", label: "Settled", state: "SETTLED" },
];

const LIMIT = 6;

function MarketsPage() {
  const { address } = useWallet();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [offsets, setOffsets] = useState<number[]>([0]);
  const cursor = offsets[offsets.length - 1] ?? 0;
  const state = TABS.find((t) => t.value === tab)?.state ?? null;

  const supported = useQuery({
    queryKey: ["supported-assets"],
    queryFn: () => baskt.get_supported_assets(),
    staleTime: 60_000,
  });
  const assets = supported.data ?? [];
  const prices = useLivePrices();

  const feed = useQuery({
    queryKey: ["markets", asset, state, cursor],
    queryFn: () => baskt.get_markets({ asset, state, offset: cursor, limit: LIMIT }),
    refetchInterval: 15_000,
  });

  const openMarkets = useQuery({
    queryKey: ["open-markets-stat"],
    queryFn: () => baskt.get_open_markets({ offset: 0, limit: 50 }),
    refetchInterval: 15_000,
  });
  const ready = useQuery({
    queryKey: ["ready-stat"],
    queryFn: () => baskt.get_ready_to_settle_markets({ offset: 0, limit: 50 }),
    refetchInterval: 15_000,
  });
  const marketCount = useQuery({
    queryKey: ["market-count"],
    queryFn: () => baskt.get_market_count(),
    refetchInterval: 15_000,
  });
  const positions = useQuery({
    queryKey: ["positions-stat", address],
    queryFn: () => baskt.get_user_positions({ wallet: address!, offset: 0, limit: 50 }),
    enabled: !!address,
  });

  const openPool = useMemo(() => {
    const items = openMarkets.data?.items ?? [];
    return items.reduce((sum, market) => sum + BigInt(market.total_pool), 0n).toString();
  }, [openMarkets.data]);

  const reset = (fn: () => void) => {
    fn();
    setOffsets([0]);
  };

  const items = (feed.data?.items ?? []).filter((m) =>
    search.trim()
      ? marketQuestion(m).toLowerCase().includes(search.trim().toLowerCase()) ||
        m.asset.toLowerCase().includes(search.trim().toLowerCase())
      : true,
  );

  if (supported.isError) {
    return (
      <ErrorState
        message={(supported.error as Error).message}
        retry={() => void supported.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="panel p-5 lg:p-6">
        <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">Daily ETF Markets</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          One canonical market per asset per UTC day. Stake UP or DOWN on whether the target day's
          close finishes above or below its open. Entries close at 00:00 UTC on the target day;
          settlement is permissionless once the day ends and Binance + Bitget agree.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Open pool"
          value={openMarkets.isLoading ? "—" : formatGen(openPool)}
          hint="Across all open markets"
          icon={<Layers className="h-4 w-4" />}
        />
        <Stat
          label="All markets"
          value={marketCount.isLoading ? "—" : (marketCount.data ?? 0)}
          hint="Across every market state"
          icon={<Activity className="h-4 w-4" />}
        />
        <Stat
          label="Your positions"
          value={address ? (positions.data?.total ?? "—") : "—"}
          hint={address ? "Across all states" : "Connect wallet"}
          icon={<Wallet className="h-4 w-4" />}
        />
        <Stat
          label="Ready to settle"
          value={ready.isLoading ? "—" : (ready.data?.total ?? 0)}
          hint="Anyone can settle"
          icon={<Gavel className="h-4 w-4" />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <aside className="space-y-2">
          <p className="label-xs">Assets</p>
          <div className="flex flex-wrap gap-2 lg:flex-col">
            <button
              onClick={() => reset(() => setAsset(null))}
              className={cn(
                "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                asset === null
                  ? "border-border-strong bg-elevated font-medium"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              All assets
            </button>
            {assets.map((a) => {
              const price = prices.data?.[a];
              const change = price?.change24h;
              return (
                <button
                  key={a}
                  onClick={() => reset(() => setAsset(a))}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    asset === a
                      ? "border-border-strong bg-elevated font-medium"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{ticker(a)}</span>
                    <span className="num block text-[11px] text-muted-foreground">{a}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-xs text-foreground">
                      {price
                        ? `$${price.price.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "—"}
                    </span>
                    <span
                      className={cn(
                        "num block text-[11px]",
                        change !== undefined && change > 0
                          ? "text-up"
                          : change !== undefined && change < 0
                            ? "text-down"
                            : "text-muted-foreground",
                      )}
                    >
                      {price
                        ? `${price.change24h > 0 ? "+" : ""}${price.change24h.toFixed(2)}%`
                        : prices.isError
                          ? "Unavailable"
                          : "—"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Tabs value={tab} onValueChange={(v) => reset(() => setTab(v))}>
              <TabsList className="bg-card">
                {TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative md:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search markets"
                className="bg-card pl-8"
              />
            </div>
          </div>

          {feed.isLoading ? (
            <CardSkeleton />
          ) : feed.isError ? (
            <ErrorState message={(feed.error as Error).message} retry={() => void feed.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              title="No markets match these filters"
              description="Try another asset or state, or create the canonical market for a future UTC day."
            />
          ) : (
            <>
              <div className="grid gap-3 xl:grid-cols-2">
                {items.map((m) => (
                  <MarketCard key={m.market_id} market={m} price={prices.data?.[m.asset]} />
                ))}
              </div>
              <Pager
                offsets={offsets}
                cursor={cursor}
                nextOffset={feed.data?.next_offset ?? null}
                hasMore={!!feed.data?.has_more}
                loading={feed.isFetching}
                count={items.length}
                onChange={setOffsets}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
