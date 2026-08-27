import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleHelp,
  Clock3,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AssetIcon,
  EmptyState,
  ErrorState,
  PoolBar,
  SideTag,
  StateBadge,
} from "@/components/baskt/primitives";
import { LivePriceChart } from "@/components/baskt/LivePriceChart";
import { baskt, formatGen, ticker, toBase, toGen, utcDateTime, utcDayLong } from "@/lib/baskt";
import { formatScaledPrice } from "@/lib/baskt/format";
import { friendlyError } from "@/lib/baskt/errors";
import type { Market, Side, SettlementEvidence, TxReceipt } from "@/lib/baskt/types";
import { useLivePrices } from "@/lib/prices";
import type { LivePrice } from "@/lib/prices";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/market/$id")({
  head: () => ({
    meta: [{ title: "Market detail · BASKT" }],
  }),
  component: MarketDetailPage,
});

function MarketDetailPage() {
  const { id } = useParams({ from: "/market/$id" });
  const marketId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { address, connect, connected, connecting, networkOk, switchToBradbury } = useWallet();
  const [selectedSide, setSelectedSide] = useState<Side>("UP");
  const [stakeAmount, setStakeAmount] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const market = useQuery({
    queryKey: ["market", marketId],
    queryFn: () => baskt.get_market(marketId),
    enabled: Number.isInteger(marketId),
    refetchInterval: 15_000,
  });
  const position = useQuery({
    queryKey: ["position", marketId, address],
    queryFn: () => baskt.get_user_market(marketId, address!),
    enabled: Number.isInteger(marketId) && !!address,
  });
  const claimable = useQuery({
    queryKey: ["claimable", marketId, address],
    queryFn: () => baskt.get_claimable(marketId, address!),
    enabled: Number.isInteger(marketId) && !!address,
  });
  const evidence = useQuery({
    queryKey: ["evidence", marketId],
    queryFn: () => baskt.get_settlement_evidence(marketId),
    enabled: Number.isInteger(marketId),
    refetchInterval: market.data?.settlement_ready ? 15_000 : false,
  });
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => baskt.get_config(),
    staleTime: 60_000,
  });
  const livePrices = useLivePrices();

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["market", marketId] }),
      queryClient.invalidateQueries({ queryKey: ["position", marketId] }),
      queryClient.invalidateQueries({ queryKey: ["claimable", marketId] }),
      queryClient.invalidateQueries({ queryKey: ["evidence", marketId] }),
      queryClient.invalidateQueries({ queryKey: ["markets"] }),
      queryClient.invalidateQueries({ queryKey: ["positions-stat"] }),
    ]);
  };

  const runAction = async (action: () => Promise<TxReceipt>) => {
    setSubmitting(true);
    setActionError(null);
    try {
      const receipt = await action();
      toast.success(
        receipt.status === "SUCCESS"
          ? "Transaction confirmed."
          : "Transaction submitted. Confirmation is still pending.",
      );
      await refresh();
    } catch (error) {
      const message = friendlyError(error);
      setActionError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!Number.isInteger(marketId)) {
    return <ErrorState message="The market id is not valid." />;
  }
  if (market.isLoading) return <MarketDetailSkeleton />;
  if (market.isError) {
    return (
      <ErrorState message={(market.error as Error).message} retry={() => void market.refetch()} />
    );
  }
  if (!market.data) {
    return (
      <EmptyState
        title="Market not found"
        description="This market is not available."
        action={
          <Button asChild>
            <Link to="/">Back to markets</Link>
          </Button>
        }
      />
    );
  }

  const current = market.data;
  const userPosition = position.data;
  const userClaimable = claimable.data;
  const chosenSide = userPosition?.side ?? selectedSide;
  const maxAdditional = toGen(
    userPosition?.remaining_capacity ?? config.data?.maximum_stake ?? "0",
  );
  const minStake = config.data ? toGen(config.data.minimum_stake) : null;

  return (
    <div className="space-y-5">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to markets
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <main className="min-w-0 space-y-5">
          <MarketHero market={current} />
          <LivePriceBlock price={livePrices.data?.[current.asset]} />
          <LivePriceChart asset={current.asset} />
          <PoolOverview market={current} />
          <MarketTimeline market={current} />
          <UserPositionCard position={userPosition} claimable={userClaimable} />
          <RulesCard />
          <EvidenceCard
            evidence={evidence.data}
            loading={evidence.isLoading}
            priceScale={config.data?.price_scale}
          />
        </main>

        <aside className="lg:sticky lg:top-20">
          <ActionPanel
            market={current}
            position={userPosition}
            claimable={userClaimable}
            connected={connected}
            connecting={connecting}
            address={address}
            selectedSide={chosenSide}
            onSideChange={setSelectedSide}
            stakeAmount={stakeAmount}
            onStakeAmountChange={setStakeAmount}
            maxAdditional={maxAdditional}
            minStake={minStake}
            submitting={submitting}
            error={actionError}
            onConnect={() => void connect()}
            networkOk={networkOk}
            onSwitchNetwork={() => void switchToBradbury()}
            onStake={() =>
              runAction(() => baskt.stake(marketId, chosenSide, toBase(Number(stakeAmount))))
            }
            onSettle={() => runAction(() => baskt.settle_market(marketId))}
            onClaim={() => runAction(() => baskt.claim(marketId))}
          />
        </aside>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Transactions are sent to GenLayer.
        </span>
        <button
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => void refresh()}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
    </div>
  );
}

function MarketHero({ market }: { market: Market }) {
  return (
    <section className="panel p-5 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <AssetIcon asset={market.asset} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-xs">Daily ETF market</span>
              <StateBadge state={market.state} />
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">
              {ticker(market.asset)}: UP or DOWN?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Will {ticker(market.asset)} close above or below its {market.target_day} UTC open?
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className="label-xs">Target day</div>
          <div className="num mt-1 text-sm text-foreground">{utcDayLong(market.target_day)}</div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" /> UTC daily close
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> Binance + Bitget evidence
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" /> No market fees
        </span>
      </div>
    </section>
  );
}

function LivePriceBlock({ price }: { price: LivePrice | undefined }) {
  return (
    <section className="panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div>
        <p className="label-xs">Live price</p>
        <p className="num mt-1 text-xl font-semibold">
          {price
            ? `$${price.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
            : "Price unavailable"}
        </p>
      </div>
      <div className="text-right text-xs">
        {price ? (
          <>
            <p className={price.change24h >= 0 ? "text-up" : "text-down"}>
              {price.change24h >= 0 ? "+" : ""}
              {price.change24h.toFixed(2)}% · 24h
            </p>
            <p className="mt-1 text-muted-foreground">
              Live · updated {new Date(price.updatedAt).toLocaleTimeString()}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">Binance data is unavailable right now.</p>
        )}
      </div>
    </section>
  );
}

function PoolOverview({ market }: { market: Market }) {
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="label-xs">Current market split</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pari-mutuel pool · winner takes the proportional share
          </p>
        </div>
        <div className="text-right">
          <p className="label-xs">Total pool</p>
          <p className="num mt-1 text-lg font-semibold">{formatGen(market.total_pool)}</p>
        </div>
      </div>
      <div className="mt-5">
        <PoolBar upBps={market.up_bps} downBps={market.down_bps} height="h-3" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-elevated/50 p-3">
          <p className="label-xs text-up">UP pool</p>
          <p className="num mt-1 text-sm font-semibold">{formatGen(market.up_pool)}</p>
        </div>
        <div className="rounded-md border border-border bg-elevated/50 p-3 text-right">
          <p className="label-xs text-down">DOWN pool</p>
          <p className="num mt-1 text-sm font-semibold">{formatGen(market.down_pool)}</p>
        </div>
      </div>
    </section>
  );
}

function MarketTimeline({ market }: { market: Market }) {
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <TimelineItem
        icon={<LockKeyhole className="h-4 w-4" />}
        label="Entry cutoff"
        value={utcDateTime(market.target_start)}
      />
      <TimelineItem
        icon={<CalendarDays className="h-4 w-4" />}
        label="Prediction day"
        value={market.target_day}
      />
      <TimelineItem
        icon={<Clock3 className="h-4 w-4" />}
        label="Settlement eligible"
        value={utcDateTime(market.target_end)}
      />
    </section>
  );
}

function TimelineItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="panel flex items-start gap-3 p-4">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div>
        <p className="label-xs">{label}</p>
        <p className="num mt-1 text-xs text-foreground">{value}</p>
      </div>
    </div>
  );
}

function UserPositionCard({
  position,
  claimable,
}: {
  position: Awaited<ReturnType<typeof baskt.get_user_market>> | undefined;
  claimable: Awaited<ReturnType<typeof baskt.get_claimable>> | undefined;
}) {
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="label-xs">Your position</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your position from the Baskt contract
          </p>
        </div>
        <Wallet className="h-4 w-4 text-muted-foreground" />
      </div>
      {position?.side ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="label-xs">Side</p>
            <div className="mt-1">
              <SideTag side={position.side} />
            </div>
          </div>
          <div>
            <p className="label-xs">Cumulative stake</p>
            <p className="num mt-1 text-sm font-semibold">{formatGen(position.amount)}</p>
          </div>
          <div>
            <p className="label-xs">Claimable</p>
            <p className="num mt-1 text-sm font-semibold">
              {claimable?.claimable ? formatGen(claimable.amount) : "—"}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Connect your wallet to see your position here.
        </p>
      )}
    </section>
  );
}

function RulesCard() {
  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2">
        <CircleHelp className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Market rules</h2>
      </div>
      <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
        <Rule text="Stake UP or DOWN before the target day begins at 00:00 UTC." />
        <Rule text="Minimum stake is 1 GEN; cumulative wallet cap is 10 GEN." />
        <Rule text="Binance and Bitget must agree on the daily direction." />
        <Rule text="Disagreement, flat evidence, or source failure refunds original stakes." />
      </div>
    </section>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <div className="flex gap-2">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span>{text}</span>
    </div>
  );
}

function EvidenceCard({
  evidence,
  loading,
  priceScale,
}: {
  evidence: SettlementEvidence | undefined;
  loading: boolean;
  priceScale: string | undefined;
}) {
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="label-xs">Settlement evidence</p>
          <p className="mt-1 text-sm text-muted-foreground">Normalized source readings only</p>
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      </div>
      {loading ? (
        <div className="mt-5 h-20 animate-pulse rounded-md bg-elevated" />
      ) : evidence?.available && evidence.sources.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {evidence.sources.map((source) => (
              <SourceRow key={source.source} source={source} priceScale={priceScale} />
            ))}
          </div>
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-xs",
              evidence.refund_all
                ? "border-warn/30 bg-warn-soft/40"
                : "border-border bg-elevated/40",
            )}
          >
            <span className="text-muted-foreground">
              Consensus:{" "}
              <strong className="text-foreground">{evidence.consensus ?? "INCONCLUSIVE"}</strong>
            </span>
            <span className="num">
              {evidence.refund_all ? "REFUND ALL" : evidence.final_status}
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Evidence becomes available after settlement evaluation.
        </p>
      )}
    </section>
  );
}

function SourceRow({
  source,
  priceScale,
}: {
  source: SettlementEvidence["sources"][number];
  priceScale: string | undefined;
}) {
  return (
    <div className="rounded-md border border-border bg-elevated/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide">{source.source}</span>
        <span className="text-[11px] text-muted-foreground">
          {source.status === "VALID" ? "Valid" : "Unavailable"} · {source.attempts_used}/3 attempts
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="label-xs">Open</p>
          <p className="num mt-1">{formatScaledPrice(source.open, priceScale)}</p>
        </div>
        <div>
          <p className="label-xs">Close</p>
          <p className="num mt-1">{formatScaledPrice(source.close, priceScale)}</p>
        </div>
        <div>
          <p className="label-xs">Direction</p>
          <p className="mt-1 font-semibold">{source.direction ?? "—"}</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Target timestamp:{" "}
        {source.target_timestamp === null ? "—" : utcDateTime(source.target_timestamp / 1000)}
      </p>
    </div>
  );
}

function ActionPanel({
  market,
  position,
  claimable,
  connected,
  connecting,
  address,
  selectedSide,
  onSideChange,
  stakeAmount,
  onStakeAmountChange,
  maxAdditional,
  minStake,
  submitting,
  error,
  onConnect,
  networkOk,
  onSwitchNetwork,
  onStake,
  onSettle,
  onClaim,
}: {
  market: Market;
  position: Awaited<ReturnType<typeof baskt.get_user_market>> | undefined;
  claimable: Awaited<ReturnType<typeof baskt.get_claimable>> | undefined;
  connected: boolean;
  connecting: boolean;
  address: string | null;
  selectedSide: Side;
  onSideChange: (side: Side) => void;
  stakeAmount: string;
  onStakeAmountChange: (value: string) => void;
  maxAdditional: number;
  minStake: number | null;
  submitting: boolean;
  error: string | null;
  onConnect: () => void;
  networkOk: boolean;
  onSwitchNetwork: () => void;
  onStake: () => void;
  onSettle: () => void;
  onClaim: () => void;
}) {
  const amount = Number(stakeAmount);
  const stakeValid =
    minStake !== null && Number.isFinite(amount) && amount >= minStake && amount <= maxAdditional;
  const actionCopy = market.entries_open
    ? "Place prediction"
    : market.settlement_ready
      ? "Evaluate market"
      : market.settled
        ? market.refund_all
          ? "Claim refund"
          : "Claim winnings"
        : "Claim refund";
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-border bg-elevated/35 p-5">
        <div className="flex items-center justify-between">
          <p className="label-xs">Trade panel</p>
          <span className="text-[11px] text-muted-foreground">
            {address ? "Wallet connected" : "Connect wallet"}
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold">{actionCopy}</h2>
      </div>
      <div className="space-y-4 p-5">
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        )}
        {!connected ? (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your wallet to stake, settle, or claim from this market.
            </p>
            <Button className="w-full" onClick={onConnect} disabled={connecting}>
              <Wallet className="h-4 w-4" />
              {connecting ? "Connecting…" : "Connect wallet"}
            </Button>
          </>
        ) : !networkOk ? (
          <div className="rounded-md border border-warn/30 bg-warn-soft/40 p-4">
            <p className="text-sm font-medium text-warn">Wrong network</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Switch to the Baskt network to continue.
            </p>
            <Button className="mt-4 w-full" variant="outline" onClick={onSwitchNetwork}>
              Switch network
            </Button>
          </div>
        ) : market.entries_open ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={Boolean(position?.side && position.side !== "UP")}
                onClick={() => onSideChange("UP")}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  position?.side === "DOWN" && "cursor-not-allowed opacity-40",
                  selectedSide === "UP"
                    ? "border-up bg-up-soft"
                    : "border-border hover:bg-elevated",
                )}
              >
                <span className="text-xs text-muted-foreground">Predict</span>
                <span className="mt-1 block text-lg font-semibold text-up">UP</span>
              </button>
              <button
                disabled={Boolean(position?.side && position.side !== "DOWN")}
                onClick={() => onSideChange("DOWN")}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors",
                  position?.side === "UP" && "cursor-not-allowed opacity-40",
                  selectedSide === "DOWN"
                    ? "border-down bg-down-soft"
                    : "border-border hover:bg-elevated",
                )}
              >
                <span className="text-xs text-muted-foreground">Predict</span>
                <span className="mt-1 block text-lg font-semibold text-down">DOWN</span>
              </button>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="stake-amount" className="label-xs">
                  Stake amount
                </label>
                <span className="num text-xs text-muted-foreground">
                  up to {maxAdditional.toFixed(2)} GEN
                </span>
              </div>
              <div className="relative">
                <Input
                  id="stake-amount"
                  type="number"
                  min={minStake ?? undefined}
                  max={maxAdditional}
                  step="0.1"
                  value={stakeAmount}
                  onChange={(event) => onStakeAmountChange(event.target.value)}
                  className="bg-card pr-14 num"
                />
                <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-muted-foreground">
                  GEN
                </span>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={submitting || !stakeValid || maxAdditional < (minStake ?? 1)}
              onClick={onStake}
            >
              <Wallet className="h-4 w-4" />
              {submitting ? "Submitting…" : `Stake ${stakeAmount || "0"} GEN on ${selectedSide}`}
            </Button>
            {position?.side && (
              <p className="text-center text-[11px] text-muted-foreground">
                You are already on <strong className="text-foreground">{position.side}</strong>.
                Same-side top-ups only.
              </p>
            )}
          </>
        ) : !market.settlement_ready && !market.settled && !market.inconclusive ? (
          <LockedPanel />
        ) : market.settlement_ready ? (
          <>
            <p className="text-sm text-muted-foreground">
              The target day is complete. Anyone can trigger the two-source settlement evaluation.
            </p>
            <Button className="w-full" disabled={submitting} onClick={onSettle}>
              <Sparkles className="h-4 w-4" />
              {submitting ? "Evaluating…" : "Settle market"}
            </Button>
          </>
        ) : (
          <FinalPanel
            market={market}
            claimable={claimable}
            submitting={submitting}
            onClaim={onClaim}
          />
        )}
        <div className="border-t border-border pt-4 text-[11px] leading-relaxed text-muted-foreground">
          Your transaction is sent to the deployed Baskt contract. Position and claim status come
          from the contract.
        </div>
      </div>
    </div>
  );
}

function LockedPanel() {
  return (
    <div className="rounded-md border border-border bg-elevated/40 p-4">
      <LockKeyhole className="h-5 w-5 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">Entries are closed</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        The target UTC day has started. Wait for settlement eligibility after the next midnight.
      </p>
    </div>
  );
}

function FinalPanel({
  market,
  claimable,
  submitting,
  onClaim,
}: {
  market: Market;
  claimable: Awaited<ReturnType<typeof baskt.get_claimable>> | undefined;
  submitting: boolean;
  onClaim: () => void;
}) {
  const inconclusive = market.state === "INCONCLUSIVE" || market.refund_all;
  return (
    <div
      className={cn(
        "rounded-md border p-4",
        inconclusive ? "border-warn/30 bg-warn-soft/40" : "border-up/30 bg-up-soft/30",
      )}
    >
      <div className="flex items-center gap-2">
        {inconclusive ? (
          <RefreshCw className="h-5 w-5 text-warn" />
        ) : (
          <Trophy className="h-5 w-5 text-up" />
        )}
        <p className="text-sm font-semibold">
          {inconclusive ? "Refund available" : `${market.winning_side ?? "Market"} won`}
        </p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {inconclusive
          ? "The market did not establish matching directional evidence. Original stakes can be refunded."
          : "Winning claims are calculated from the total pool and your winning-side stake."}
      </p>
      {claimable?.claimable && (
        <Button className="mt-4 w-full" disabled={submitting} onClick={onClaim}>
          {submitting ? "Claiming…" : `Claim ${formatGen(claimable.amount)}`}
        </Button>
      )}
    </div>
  );
}

function MarketDetailSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-4 w-28 animate-pulse rounded bg-elevated" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="panel h-52 animate-pulse" />
          <div className="panel h-40 animate-pulse" />
          <div className="panel h-32 animate-pulse" />
        </div>
        <div className="panel h-96 animate-pulse" />
      </div>
    </div>
  );
}
