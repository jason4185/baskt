import { Link } from "@tanstack/react-router";
import { AssetIcon, PoolBar, SideTag, StateBadge } from "./primitives";
import { countdown, formatGen, ticker, utcDayLabel, utcDateTime } from "@/lib/baskt/format";
import type { Market, Position } from "@/lib/baskt/types";
import type { LivePrice } from "@/lib/prices";
import { ArrowRight, Clock } from "lucide-react";

export function marketQuestion(m: Market) {
  return `${ticker(m.asset)}: UP or DOWN on ${utcDayLabel(m.target_day)}?`;
}

export function MarketCard({
  market,
  position,
  price,
}: {
  market: Market;
  position?: Position | null;
  price?: LivePrice | undefined;
}) {
  return (
    <Link
      to="/market/$id"
      params={{ id: String(market.market_id) }}
      className="panel group flex flex-col gap-4 p-4 transition-colors hover:border-border-strong hover:bg-elevated/40"
    >
      <div className="flex items-start gap-3">
        <AssetIcon asset={market.asset} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight">
            {marketQuestion(market)}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Target day {market.target_day} · close vs open (UTC)
          </p>
        </div>
        <StateBadge state={market.state} />
      </div>

      <PoolBar upBps={market.up_bps} downBps={market.down_bps} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <div className="label-xs">Total pool</div>
          <div className="num mt-0.5 text-sm font-semibold">{formatGen(market.total_pool)}</div>
        </div>
        <div>
          <div className="label-xs">
            {market.state === "OPEN" ? "Entries close" : "Entry cutoff"}
          </div>
          <div className="num mt-0.5 flex items-center gap-1.5 text-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            {market.state === "OPEN"
              ? countdown(market.target_start)
              : utcDateTime(market.target_start)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="num">
            {price
              ? `$${price.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}`
              : "Price unavailable"}
          </span>
          {price && (
            <span className={price.change24h >= 0 ? "text-up" : "text-down"}>
              {price.change24h >= 0 ? "+" : ""}
              {price.change24h.toFixed(2)}%
            </span>
          )}
          {position?.side ? (
            <span className="flex items-center gap-1.5">
              Your position <SideTag side={position.side} />
              <span className="num text-foreground">{formatGen(position.amount)}</span>
            </span>
          ) : (
            <span>No position</span>
          )}
        </div>
        <span className="flex items-center gap-1 text-xs font-medium text-primary">
          View market
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
