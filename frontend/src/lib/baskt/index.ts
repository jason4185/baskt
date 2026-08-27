import type { BasktAdapter } from "./adapter";
import { liveAdapter } from "./liveAdapter";

/** The deployed Baskt contract is the only runtime adapter. */
export const baskt: BasktAdapter = liveAdapter;

export * from "./types";
export * from "./format";
export * from "./config";
export type { BasktAdapter, PageArgs } from "./adapter";
