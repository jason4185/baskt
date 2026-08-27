/**
 * Local activity log — derived only from transactions this browser submitted.
 * There is no chain-history API; nothing here is invented.
 */
import { useSyncExternalStore } from "react";
import type { TxReceipt } from "./baskt/types";

const KEY = "baskt.activity.v1";

let entries: TxReceipt[] = [];
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    entries = raw ? (JSON.parse(raw) as TxReceipt[]) : [];
  } catch {
    entries = [];
  }
}

let loaded = false;
function ensure() {
  if (!loaded && typeof window !== "undefined") {
    load();
    loaded = true;
  }
}

function emit() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 100)));
    } catch {
      /* storage unavailable */
    }
  }
  listeners.forEach((l) => l());
}

export function recordActivity(tx: TxReceipt) {
  ensure();
  entries = [tx, ...entries].slice(0, 100);
  emit();
}

export function clearActivity() {
  entries = [];
  emit();
}

const EMPTY: TxReceipt[] = [];

export function useActivity(): TxReceipt[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      ensure();
      return entries;
    },
    () => EMPTY,
  );
}
