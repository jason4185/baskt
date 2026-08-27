import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Check,
  CircleDollarSign,
  Clock3,
  Database,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AssetIcon } from "@/components/baskt/primitives";
import { baskt, formatGen, ticker } from "@/lib/baskt";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({ meta: [{ title: "How it works · BASKT" }] }),
  component: () => <HowItWorksPage />,
});

const STEPS = [
  {
    number: "01",
    icon: <BarChart3 className="h-4 w-4" />,
    title: "Choose an ETF",
    text: "Pick SPY, QQQ, EWY, or EWJ for a specific UTC target day.",
  },
  {
    number: "02",
    icon: <WalletCards className="h-4 w-4" />,
    title: "Pick a direction",
    text: "Choose UP if you expect the close above the open, or DOWN if below.",
  },
  {
    number: "03",
    icon: <CircleDollarSign className="h-4 w-4" />,
    title: "Stake 1–10 GEN",
    text: "Start at 1 GEN and top up the same side up to 10 GEN per market.",
  },
  {
    number: "04",
    icon: <Clock3 className="h-4 w-4" />,
    title: "Wait for the UTC close",
    text: "Entries close automatically at target-day 00:00 UTC. No keeper is needed.",
  },
  {
    number: "05",
    icon: <Database className="h-4 w-4" />,
    title: "Sources are checked",
    text: "Binance Futures and Bitget Futures provide the target daily candle.",
  },
  {
    number: "06",
    icon: <Sparkles className="h-4 w-4" />,
    title: "Settle and claim",
    text: "Matching direction settles the market; winners claim the pari-mutuel payout.",
  },
] as const;

export function HowItWorksPage() {
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => baskt.get_config(),
    staleTime: 60_000,
  });
  const assets = config.data?.assets ?? [];
  const sources = config.data?.sources.join(" + ") ?? "the two sources";
  const minimum = config.data ? formatGen(config.data.minimum_stake) : "the contract minimum";
  const maximum = config.data ? formatGen(config.data.maximum_stake) : "the contract maximum";

  return (
    <div className="space-y-6">
      <section className="panel p-5 lg:p-7">
        <p className="label-xs text-primary">Baskt in six steps</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">
          Daily markets, clearly settled.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Baskt keeps the prediction simple: one ETF-linked market, one UTC day, and a transparent
          UP/DOWN result checked against two independent futures sources.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Stake between {minimum} and {maximum}. {sources} provide the daily candle used for
          settlement.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {assets.map((asset) => (
            <span
              key={asset}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-elevated/50 px-2.5 py-1.5 text-xs"
            >
              <AssetIcon asset={asset} size="sm" />
              {ticker(asset)}
            </span>
          ))}
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.number} className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="num text-xs text-primary">{step.number}</span>
              <span className="text-muted-foreground">{step.icon}</span>
            </div>
            <h2 className="mt-5 text-sm font-semibold">{step.title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step.text}</p>
          </div>
        ))}
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <InfoCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title="What determines the result?"
          items={[
            "close > open = UP",
            "close < open = DOWN",
            "close == open is valid non-directional evidence",
            "Both sources must agree on UP or DOWN",
          ]}
        />
        <InfoCard
          icon={<RefreshCw className="h-4 w-4" />}
          title="What if evidence is inconclusive?"
          items={[
            "Source failures use three total attempts",
            "Disagreement or flat evidence cannot settle either side",
            "Every participant can refund their original stake",
            "No protocol fee captures inconclusive funds",
          ]}
        />
      </section>
      <section className="panel flex flex-col items-start justify-between gap-4 bg-primary/5 p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold">Ready to see the markets?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Browse live markets or create a future UTC-day market.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/">
              Browse markets <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/create">Create market</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="mt-4 space-y-2.5">
        {items.map((item) => (
          <div key={item} className="flex gap-2 text-xs text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
