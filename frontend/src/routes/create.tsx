import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, Check, Eye, Info, Plus, ShieldCheck } from "lucide-react";

import { AssetIcon, CardSkeleton, EmptyState, ErrorState } from "@/components/baskt/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { baskt, ticker, utcDateTime, utcDayLong, type Asset } from "@/lib/baskt";
import { friendlyError } from "@/lib/baskt/errors";
import { useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/create")({
  head: () => ({ meta: [{ title: "Create market · BASKT" }] }),
  component: CreateMarketPage,
});

const DAY = 86400;

function tomorrowUtc(): string {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return tomorrow.toISOString().slice(0, 10);
}

function epochForDay(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Number.NaN;
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    return Number.NaN;
  }
  return Math.floor(date.getTime() / 1000);
}

function CreateMarketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { address, connected, connect, connecting } = useWallet();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [targetDay, setTargetDay] = useState(tomorrowUtc());
  const [error, setError] = useState<string | null>(null);
  const assetsQuery = useQuery({
    queryKey: ["supported-assets"],
    queryFn: () => baskt.get_supported_assets(),
    staleTime: 60_000,
  });
  const assets = assetsQuery.data ?? [];
  const selectedAsset = asset ?? assets[0];
  const targetStart = epochForDay(targetDay);
  const validDate = Number.isFinite(targetStart) && targetStart >= epochForDay(tomorrowUtc());

  const create = useMutation({
    mutationFn: () => {
      if (!selectedAsset) throw new Error("Supported assets are not available yet.");
      return baskt.create_market(selectedAsset, targetDay);
    },
    onSuccess: async (receipt) => {
      toast.success(
        receipt.status === "SUCCESS"
          ? "Market created."
          : "Market creation submitted. Confirmation is still pending.",
      );
      await queryClient.invalidateQueries({ queryKey: ["markets"] });
      await queryClient.invalidateQueries({ queryKey: ["open-markets-stat"] });
      await queryClient.invalidateQueries({ queryKey: ["market-count"] });
      if (receipt.market_id !== null) {
        void navigate({ to: "/market/$id", params: { id: String(receipt.market_id) } });
      } else if (selectedAsset) {
        const market = await baskt.get_market_by_asset_day(selectedAsset, targetDay);
        if (market) void navigate({ to: "/market/$id", params: { id: String(market.market_id) } });
      }
    },
    onError: (reason) => setError(friendlyError(reason)),
  });

  const submit = () => {
    setError(null);
    if (!connected) {
      void connect();
      return;
    }
    if (!selectedAsset) {
      setError("Supported assets are not available yet.");
      return;
    }
    if (!validDate) {
      setError("Choose a future UTC day in YYYY-MM-DD format.");
      return;
    }
    create.mutate();
  };

  if (assetsQuery.isLoading) return <CardSkeleton count={2} />;
  if (assetsQuery.isError) {
    return (
      <ErrorState
        message={(assetsQuery.error as Error).message}
        retry={() => void assetsQuery.refetch()}
      />
    );
  }
  if (!selectedAsset) {
    return (
      <EmptyState title="No supported assets are available" description="Try again shortly." />
    );
  }

  return (
    <div className="space-y-6">
      <section className="panel p-5 lg:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label-xs text-primary">Permissionless market creation</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">
              Create a daily market
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Choose an asset and a future UTC day. Baskt handles the candle window and settlement
              rules.
            </p>
          </div>
          <div className="hidden rounded-md border border-border bg-elevated p-3 sm:block">
            <Plus className="h-5 w-5 text-primary" />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <section className="space-y-5">
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-xs">Step 1</p>
                <h2 className="mt-1 text-base font-semibold">Choose an asset</h2>
              </div>
              <span className="text-xs text-muted-foreground">{assets.length} supported</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {assets.map((item) => (
                <button
                  key={item}
                  onClick={() => setAsset(item)}
                  className={cn(
                    "flex items-center gap-3 rounded-md border p-4 text-left transition-colors",
                    selectedAsset === item
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-border-strong hover:bg-elevated/50",
                  )}
                >
                  <AssetIcon asset={item} />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{ticker(item)}</span>
                    <span className="num text-[11px] text-muted-foreground">{item}</span>
                  </span>
                  {selectedAsset === item && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
          </div>
          <div className="panel p-5">
            <div>
              <p className="label-xs">Step 2</p>
              <h2 className="mt-1 text-base font-semibold">Choose the target UTC day</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Entries close automatically at this day’s 00:00 UTC.
              </p>
            </div>
            <div className="mt-4 max-w-sm">
              <label htmlFor="target-day" className="label-xs">
                Target day
              </label>
              <Input
                id="target-day"
                type="date"
                min={tomorrowUtc()}
                value={targetDay}
                onChange={(event) => setTargetDay(event.target.value)}
                className="mt-2 bg-card num"
              />
            </div>
            {!validDate && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-warn">
                <Info className="h-3.5 w-3.5" /> Choose a valid future UTC day.
              </p>
            )}
          </div>
          <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                Creation has no fee. The market identity is canonical: only one{" "}
                {ticker(selectedAsset)} market can exist for {targetDay || "this day"}.
              </p>
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-20">
          <PreviewCard
            asset={selectedAsset}
            targetDay={targetDay}
            targetStart={targetStart}
            validDate={validDate}
          />
          <div className="panel mt-3 p-4">
            {error && (
              <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </p>
            )}
            {!connected ? (
              <Button className="w-full" onClick={submit} disabled={connecting}>
                {connecting ? "Connecting…" : "Connect wallet to create"}
              </Button>
            ) : (
              <Button className="w-full" onClick={submit} disabled={create.isPending || !validDate}>
                {create.isPending ? "Creating…" : "Create market"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              This transaction is sent to the deployed Baskt contract.
            </p>
          </div>
          <Link
            to="/how-it-works"
            className="mt-4 flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Review how markets settle <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </aside>
      </div>
    </div>
  );
}

function PreviewCard({
  asset,
  targetDay,
  targetStart,
  validDate,
}: {
  asset: Asset;
  targetDay: string;
  targetStart: number;
  validDate: boolean;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-border bg-elevated/35 p-5">
        <div className="flex items-center justify-between">
          <p className="label-xs">Market preview</p>
          <Eye className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <AssetIcon asset={asset} />
          <div>
            <p className="text-sm font-semibold">{ticker(asset)}: UP or DOWN?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {targetDay ? utcDayLong(targetDay) : "Choose a target day"}
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <PreviewRow
          icon={<CalendarClock className="h-4 w-4" />}
          label="Entries close"
          value={validDate ? utcDateTime(targetStart) : "—"}
        />
        <PreviewRow
          icon={<CalendarClock className="h-4 w-4" />}
          label="Prediction day"
          value={targetDay || "—"}
        />
        <PreviewRow
          icon={<ClockIcon />}
          label="Settlement eligible"
          value={validDate ? utcDateTime(targetStart + DAY) : "—"}
        />
      </div>
    </section>
  );
}

function ClockIcon() {
  return <CalendarClock className="h-4 w-4" />;
}
function PreviewRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div>
        <p className="label-xs">{label}</p>
        <p className="num mt-1 text-xs">{value}</p>
      </div>
    </div>
  );
}
