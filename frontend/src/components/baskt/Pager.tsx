import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Bounded pagination — driven strictly by the contract's returned
 * `next_offset` / `has_more`. Offsets are never guessed.
 */
export function Pager({
  offsets,
  cursor,
  nextOffset,
  hasMore,
  loading,
  count,
  onChange,
}: {
  /** stack of visited offsets */
  offsets: number[];
  cursor: number;
  nextOffset: number | null;
  hasMore: boolean;
  loading?: boolean;
  count: number;
  onChange: (offsets: number[]) => void;
}) {
  const page = offsets.length;
  const canPrev = page > 1;

  if (!canPrev && !hasMore) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-xs text-muted-foreground">
        Showing {count} {count === 1 ? "market" : "entries"} · page {page}
        {!hasMore && " · end of results"}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canPrev || loading}
          onClick={() => onChange(offsets.slice(0, -1))}
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasMore || nextOffset === null || loading}
          onClick={() => nextOffset !== null && onChange([...offsets, nextOffset])}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <span className="sr-only">current offset {cursor}</span>
    </div>
  );
}

export function usePagerState() {
  return null;
}
