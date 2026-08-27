import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, History, Wallet } from "lucide-react";

import {
  AssetIcon,
  EmptyState,
  ErrorState,
  RowSkeleton,
  SideTag,
  StateBadge,
} from "@/components/baskt/primitives";
import { Pager } from "@/components/baskt/Pager";
import { Button } from "@/components/ui/button";
import { baskt, formatGen, ticker } from "@/lib/baskt";
import type { UserPosition } from "@/lib/baskt/types";
import { useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity · BASKT" }] }),
  component: ActivityPage,
});

function ActivityPage() {
  const { address, connect, connecting } = useWallet();
  const [offsets, setOffsets] = useState<number[]>([0]);
  const cursor = offsets[offsets.length - 1] ?? 0;
  const positions = useQuery({
    queryKey: ["account-activity", address, cursor],
    queryFn: () => baskt.get_user_positions({ wallet: address!, offset: cursor, limit: 50 }),
    enabled: !!address,
  });

  if (!address) {
    return (
      <div className="mx-auto max-w-xl py-12">
        <EmptyState
          title="Connect to see your markets"
          description="Positions and claims recorded by the Baskt contract are private to your wallet."
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

  const rows = positions.data?.items ?? [];
  return (
    <div className="space-y-6">
      <section className="panel p-5 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-xs text-primary">Contract activity</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">Your markets</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Positions and claims recorded by the Baskt contract.
            </p>
          </div>
          <span className="num rounded-md border border-border bg-elevated px-3 py-2 text-xs">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        </div>
      </section>
      <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
        <div className="flex gap-2">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Baskt does not expose a transaction history feed. This page shows your contract-backed
            positions, market states, results, and claimable amounts.
          </span>
        </div>
      </div>
      {positions.isLoading ? (
        <RowSkeleton />
      ) : positions.isError ? (
        <ErrorState
          message={(positions.error as Error).message}
          retry={() => void positions.refetch()}
        />
      ) : rows.length === 0 ? (
        <div className="mx-auto max-w-xl">
          <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
            <History className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium">No markets yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Join a market and your position will appear here after the contract records it.
            </p>
            <Button asChild variant="outline">
              <Link to="/">
                Browse markets <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            Contract-backed positions · {positions.data?.total ?? rows.length}
          </div>
          <div className="divide-y divide-border">
            {rows.map((row) => (
              <AccountPositionRow key={row.market.market_id} row={row} />
            ))}
          </div>
        </section>
      )}
      {rows.length > 0 && positions.data && (
        <Pager
          offsets={offsets}
          cursor={cursor}
          nextOffset={positions.data.next_offset}
          hasMore={positions.data.has_more}
          loading={positions.isFetching}
          count={rows.length}
          onChange={setOffsets}
        />
      )}
    </div>
  );
}

function AccountPositionRow({ row }: { row: UserPosition }) {
  const { market, position, claimable } = row;
  const result = position.claimed
    ? "Claimed"
    : position.result === "WON"
      ? "Won"
      : position.result === "LOST"
        ? "Lost"
        : position.result === "REFUND_AVAILABLE"
          ? "Refund available"
          : position.result === "PENDING"
            ? "Pending"
            : "—";
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
        <div className="mt-1 md:mt-0">{position.side ? <SideTag side={position.side} /> : "—"}</div>
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
        <p className="mt-1 text-sm font-medium md:mt-0">{result}</p>
      </div>
      <div>
        <span className="label-xs md:hidden">Claimable</span>
        <p className="num mt-1 text-sm md:mt-0">
          {claimable.claimable ? formatGen(claimable.amount) : position.claimed ? "Claimed" : "—"}
        </p>
      </div>
    </div>
  );
}
