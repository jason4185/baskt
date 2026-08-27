import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FilePlus2,
  History,
  RefreshCw,
  ShieldAlert,
  Trash2,
  WalletCards,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { clearActivity, useActivity } from "@/lib/activity";
import type { TxKind, TxReceipt } from "@/lib/baskt/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity · BASKT" }] }),
  component: ActivityPage,
});

function ActivityPage() {
  const entries = useActivity();
  return (
    <div className="space-y-6">
      <section className="panel p-5 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-xs text-primary">Browser activity</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight lg:text-3xl">
              Your submissions
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Transactions you submitted from this browser are shown here. This is not full wallet
              history.
            </p>
          </div>
          {entries.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearActivity}>
              <Trash2 className="h-4 w-4" /> Clear local activity
            </Button>
          )}
        </div>
      </section>
      <div className="rounded-md border border-primary/20 bg-primary/5 p-4 text-xs leading-relaxed text-muted-foreground">
        <div className="flex gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            These records are saved locally in this browser. The transaction id links to the real
            submission returned by GenLayer.
          </span>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="mx-auto max-w-xl">
          <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
            <History className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium">No local activity yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Submit a create, stake, settle, or claim transaction and it will appear here.
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
            Recent local actions · {entries.length}
          </div>
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <ActivityRow key={`${entry.hash}-${entry.submitted_at}`} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: TxReceipt }) {
  const icon =
    entry.kind === "stake" ? (
      <WalletCards className="h-4 w-4" />
    ) : entry.kind === "create_market" ? (
      <FilePlus2 className="h-4 w-4" />
    ) : entry.kind === "settle_market" ? (
      <RefreshCw className="h-4 w-4" />
    ) : (
      <CheckCircle2 className="h-4 w-4" />
    );
  const marketLabel = entry.market_id === null ? "Market creation" : `Market #${entry.market_id}`;
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-elevated text-primary",
            entry.status === "ERROR" && "text-destructive",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{entry.summary}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{labelFor(entry.kind)}</span>
            <span>{marketLabel}</span>
            <span className="flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {new Date(entry.submitted_at * 1000).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 pl-11 sm:pl-0">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
            entry.status === "SUCCESS"
              ? "border-up/30 bg-up-soft text-up"
              : entry.status === "ERROR"
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-border text-muted-foreground",
          )}
        >
          {entry.status}
        </span>
        <span className="num max-w-28 truncate text-[11px] text-muted-foreground">
          {entry.hash}
        </span>
      </div>
    </div>
  );
}

function labelFor(kind: TxKind): string {
  return kind === "create_market"
    ? "Create market"
    : kind === "stake"
      ? "Stake"
      : kind === "settle_market"
        ? "Settlement"
        : "Claim";
}
