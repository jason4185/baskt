import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePriceCandles, type PriceRange } from "@/lib/prices";
import type { Asset } from "@/lib/baskt/types";
import { cn } from "@/lib/utils";

const RANGES: PriceRange[] = ["1H", "4H", "1D", "1W"];

export function LivePriceChart({ asset }: { asset: Asset }) {
  const [range, setRange] = useState<PriceRange>("1D");
  const candles = usePriceCandles(asset, range);

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-xs">Live market price</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Display-only Binance Futures data. It does not determine settlement.
          </p>
        </div>
        <div className="flex rounded-md border border-border bg-elevated/50 p-0.5">
          {RANGES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={cn(
                "rounded px-2 py-1 text-[11px] transition-colors",
                range === item
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {candles.isLoading ? (
        <div className="mt-5 h-56 animate-pulse rounded-md bg-elevated" />
      ) : candles.isError ? (
        <p className="mt-5 flex h-56 items-center justify-center rounded-md border border-border text-xs text-muted-foreground">
          Price unavailable
        </p>
      ) : candles.data?.length ? (
        <div className="mt-4 h-56 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={candles.data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id={`baskt-price-area-${asset}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={(value: string) => {
                  const date = new Date(value);
                  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                }}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                stroke="var(--color-border)"
                minTickGap={40}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                stroke="var(--color-border)"
                width={62}
                tickFormatter={(value: number) => `$${Number(value).toFixed(2)}`}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(value) => new Date(String(value)).toLocaleString()}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, "Price"]}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill={`url(#baskt-price-area-${asset})`}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-5 flex h-56 items-center justify-center rounded-md border border-border text-xs text-muted-foreground">
          Price unavailable
        </p>
      )}
    </section>
  );
}
