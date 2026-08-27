import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, BadgeDollarSign, History, Layers3, ListChecks, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AssetIcon,
  EmptyState,
  ErrorState,
  RowSkeleton,
  SideTag,
  StateBadge,
  Stat,
} from "@/components/baskt/primitives";
import { baskt, formatGen, ticker, type MarketState, type UserPosition } from "@/lib/baskt";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Pager } from "@/components/baskt/Pager";
import { friendlyError } from "@/lib/baskt/errors";

export const Route = createFileRoute("/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio · BASKT" }] }),
  component: PortfolioPage,
});

type PortfolioTab = "active" | "claimable" | "history";

function PortfolioPage() {
  const { address, connect, connecting } = useWallet();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<PortfolioTab>("active");
  const [claiming, setClaiming] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<number[]>([0]);
  const cursor = offsets[offsets.length - 1] ?? 0;
  const positions = useQuery({
    queryKey: ["portfolio-positions", address, cursor],
    queryFn: () => baskt.get_user_positions({ wallet: address!, offset: cursor, limit: 50 }),
    enabled: !!address,
  });
  const claimableMarkets = useQuery({
    queryKey: ["portfolio-claimable", address, cursor],
    queryFn: () => baskt.get_claimable_markets({ wallet: address!, offset: cursor, limit: 50 }),
    enabled: !!address && tab === "claimable",
  });

  const rows = useMemo(() => positions.data?.items ?? [], [positions.data?.items]);
  const summary = useMemo(
    () => ({
      staked: rows.reduce((sum, row) => sum + BigInt(row.position.amount), 0n).toString(),
      claimable: rows.reduce((sum, row) => sum + BigInt(row.claimable.amount), 0n).toString(),
      active: rows.filter((row) => !isFinal(row.market.state)).length,
      settled: rows.filter((row) => isFinal(row.market.state)).length,
    }),
    [rows],
  );
  const visible = (tab === "claimable" ? (claimableMarkets.data?.items ?? []) : rows).filter(
    (row) => {
      if (tab === "claimable") return true;
      if (tab === "history") return isFinal(row.market.state);
      return !isFinal(row.market.state);
    },
  );
  const page = tab === "claimable" ? claimableMarkets.data : positions.data;

  const claim = async (row: UserPosition) => {
    if (!address) return;
    setClaiming(row.market.market_id);
    setActionError(null);
    try {
      const receipt = await baskt.claim(row.market.market_id);
      toast.success(
        receipt.status === "SUCCESS"
          ? "Claim confirmed."
          : "Claim submitted. Confirmation is still pending.",
      );
      await queryClient.invalidateQueries({ queryKey: ["portfolio-positions", address] });
      await queryClient.invalidateQueries({ queryKey: ["portfolio-claimable", address] });
    } catch (error) {
      setActionError(friendlyError(error));
    } finally {
      setClaiming(null);
    }
  };

  if (!address) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <EmptyState
          title="Your portfolio is private to your wallet"
          description="Connect your wallet to see active positions, claimable balances, and settled history."
          action={
            <Button onClick={() => void connect()} disabled={connecting}>
              <Wallet className="h-4 w-4" />
              {connecting ? "Connecting…" : "Connect wallet"}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="panel p-5 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-xs text-primary">Wallet portfolio</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">
              Your positions
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              One wallet view across active, claimable, and settled Baskt markets.
            </p>
          </div>
          <span className="num rounded-md border border-border bg-elevated px-3 py-2 text-xs">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total staked"
          value={formatGen(summary.staked)}
          hint="Across loaded positions"
          icon={<Layers3 className="h-4 w-4" />}
        />
        <Stat
          label="Claimable"
          value={formatGen(summary.claimable)}
          hint="Ready to claim or refund"
          icon={<BadgeDollarSign className="h-4 w-4" />}
        />
        <Stat
          label="Active positions"
          value={summary.active}
          hint="Open or awaiting settlement"
          icon={<ListChecks className="h-4 w-4" />}
        />
        <Stat
          label="Settled positions"
          value={summary.settled}
          hint="Finalized markets"
          icon={<History className="h-4 w-4" />}
        />
      </section>
      <section className="space-y-4">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as PortfolioTab);
            setOffsets([0]);
          }}
        >
          <TabsList className="bg-card">
            <TabsTrigger value="active">
              Active{" "}
              <span className="ml-1 text-[11px] text-muted-foreground">{summary.active}</span>
            </TabsTrigger>
            <TabsTrigger value="claimable">
              Claimable{" "}
              <span className="ml-1 text-[11px] text-muted-foreground">
                {claimableMarkets.data?.items.length ?? "—"}
              </span>
            </TabsTrigger>
            <TabsTrigger value="history">
              History{" "}
              <span className="ml-1 text-[11px] text-muted-foreground">{summary.settled}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {actionError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {actionError}
          </p>
        )}
        {positions.isLoading || (tab === "claimable" && claimableMarkets.isLoading) ? (
          <RowSkeleton />
        ) : positions.isError || (tab === "claimable" && claimableMarkets.isError) ? (
          <ErrorState
            message={((positions.error ?? claimableMarkets.error) as Error).message}
            retry={() =>
              void (tab === "claimable" ? claimableMarkets.refetch() : positions.refetch())
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title={
              tab === "active"
                ? "No active positions"
                : tab === "claimable"
                  ? "Nothing to claim"
                  : "No settled history"
            }
            description="Your positions will appear here after you join a market."
            action={
              <Button asChild variant="outline">
                <Link to="/">
                  Browse markets <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="panel overflow-hidden">
            <div className="hidden grid-cols-[minmax(180px,1.4fr)_90px_120px_130px_130px_120px] gap-4 border-b border-border px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground md:grid">
              <span>Market</span>
              <span>Side</span>
              <span>Stake</span>
              <span>Status</span>
              <span>Result</span>
              <span className="text-right">Claimable</span>
            </div>
            <div className="divide-y divide-border">
              {visible.map((row) => (
                <PositionRow
                  key={row.market.market_id}
                  row={row}
                  claiming={claiming === row.market.market_id}
                  onClaim={() => void claim(row)}
                />
              ))}
            </div>
          </div>
        )}
        {visible.length > 0 && page && (
          <Pager
            offsets={offsets}
            cursor={cursor}
            nextOffset={page.next_offset}
            hasMore={page.has_more}
            loading={positions.isFetching || claimableMarkets.isFetching}
            count={visible.length}
            onChange={setOffsets}
          />
        )}
      </section>
    </div>
  );
}

function isFinal(state: MarketState): boolean {
  return state === "SETTLED" || state === "INCONCLUSIVE";
}

function PositionRow({
  row,
  claiming,
  onClaim,
}: {
  row: UserPosition;
  claiming: boolean;
  onClaim: () => void;
}) {
  const { market, position, claimable } = row;
  const result =
    market.state === "INCONCLUSIVE" || market.refund_all
      ? "Refund"
      : claimable.claimable
        ? "Won"
        : market.state === "SETTLED"
          ? "Lost"
          : "Pending";
  return (
    <div className="grid gap-3 p-4 md:grid-cols-[minmax(180px,1.4fr)_90px_120px_130px_130px_120px] md:items-center md:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <AssetIcon asset={market.asset} size="sm" />
        <div className="min-w-0">
          <Link
            to="/market/$id"
            params={{ id: String(market.market_id) }}
            className="block truncate text-sm font-medium hover:text-primary"
          >
            {ticker(market.asset)} · {market.target_day}
          </Link>
          <span className="text-xs text-muted-foreground">Market #{market.market_id}</span>
        </div>
      </div>
      <div>
        <span className="label-xs md:hidden">Side</span>
        <div className="mt-1 md:mt-0">
          <SideTag side={position.side!} />
        </div>
      </div>
      <div>
        <span className="label-xs md:hidden">Stake</span>
        <p className="num mt-1 text-sm md:mt-0">{formatGen(position.amount)}</p>
      </div>
      <div>
        <span className="label-xs md:hidden">Status</span>
        <div className="mt-1 md:mt-0">
          <StateBadge state={market.state} />
        </div>
      </div>
      <div>
        <span className="label-xs md:hidden">Result</span>
        <p
          className={cn(
            "mt-1 text-sm font-medium md:mt-0",
            result === "Won" ? "text-up" : result === "Refund" ? "text-warn" : "text-foreground",
          )}
        >
          {position.claimed ? "Claimed" : result}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 md:justify-end">
        <div>
          <span className="label-xs md:hidden">Claimable</span>
          <p className="num mt-1 text-sm md:mt-0">
            {claimable.claimable ? formatGen(claimable.amount) : "—"}
          </p>
        </div>
        {claimable.claimable && !position.claimed && (
          <Button size="sm" variant="outline" disabled={claiming} onClick={onClaim}>
            {claiming ? "…" : "Claim"}
          </Button>
        )}
      </div>
    </div>
  );
}
