import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { bpsPct, ticker } from "@/lib/baskt/format";
import { friendlyError } from "@/lib/baskt/errors";
import type { MarketState, Side } from "@/lib/baskt/types";
import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";

const ASSET_TONE: Record<string, string> = {
  SPYUSDT: "bg-[oklch(0.79_0.13_189_/_14%)] text-primary",
  QQQUSDT: "bg-[oklch(0.7_0.15_290_/_16%)] text-[oklch(0.78_0.13_290)]",
  EWYUSDT: "bg-[oklch(0.8_0.15_78_/_14%)] text-warn",
  EWJUSDT: "bg-[oklch(0.7_0.14_20_/_14%)] text-[oklch(0.75_0.15_25)]",
};

export function AssetIcon({ asset, size = "md" }: { asset: string; size?: "sm" | "md" | "lg" }) {
  const dims =
    size === "lg"
      ? "h-12 w-12 text-sm"
      : size === "sm"
        ? "h-7 w-7 text-[10px]"
        : "h-9 w-9 text-[11px]";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-tight num",
        dims,
        ASSET_TONE[asset] ?? "bg-muted text-muted-foreground",
      )}
      aria-hidden
    >
      {ticker(asset)}
    </span>
  );
}

const STATE_STYLES: Record<MarketState, string> = {
  OPEN: "border-[oklch(0.74_0.18_152_/_35%)] bg-up-soft text-up",
  LOCKED: "border-border-strong bg-elevated text-muted-foreground",
  READY_TO_SETTLE:
    "border-[oklch(0.79_0.13_189_/_35%)] bg-[oklch(0.79_0.13_189_/_12%)] text-primary",
  SETTLED: "border-border-strong bg-elevated text-foreground",
  INCONCLUSIVE: "border-[oklch(0.8_0.15_78_/_35%)] bg-warn-soft text-warn",
};

export const STATE_LABEL: Record<MarketState, string> = {
  OPEN: "Open",
  LOCKED: "Locked",
  READY_TO_SETTLE: "Ready to settle",
  SETTLED: "Settled",
  INCONCLUSIVE: "Inconclusive",
};

export function StateBadge({ state, className }: { state: MarketState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        STATE_STYLES[state],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATE_LABEL[state]}
    </span>
  );
}

export function SideTag({ side }: { side: Side }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold",
        side === "UP" ? "bg-up-soft text-up" : "bg-down-soft text-down",
      )}
    >
      {side}
    </span>
  );
}

export function PoolBar({
  upBps,
  downBps,
  showLabels = true,
  height = "h-2",
}: {
  upBps: number;
  downBps: number;
  showLabels?: boolean;
  height?: string;
}) {
  const empty = upBps === 0 && downBps === 0;
  return (
    <div className="space-y-1.5">
      {showLabels && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-up num">UP {empty ? "—" : bpsPct(upBps)}</span>
          <span className="font-medium text-down num">{empty ? "—" : bpsPct(downBps)} DOWN</span>
        </div>
      )}
      <div className={cn("flex w-full overflow-hidden rounded-full bg-elevated", height)}>
        {empty ? (
          <div className="w-full bg-border" />
        ) : (
          <>
            <div className="bg-up" style={{ width: `${upBps / 100}%` }} />
            <div className="bg-down" style={{ width: `${downBps / 100}%` }} />
          </>
        )}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="label-xs">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="mt-2 text-xl font-semibold num">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="panel flex flex-col items-center justify-center gap-2 border-[oklch(0.62_0.21_22_/_35%)] px-6 py-12 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="text-sm font-medium">Couldn't load contract data</p>
      <p className="max-w-md text-xs text-muted-foreground">{friendlyError(message, message)}</p>
      {retry && (
        <button
          onClick={retry}
          className="mt-3 rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium hover:bg-elevated"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel space-y-4 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex gap-3">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="panel divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
