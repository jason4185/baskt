import { TOKEN } from "./config";

/** Convert contract base units (18 decimals) to a display number. */
export function toGen(base: string | number | null | undefined): number {
  if (base === null || base === undefined) return 0;
  const s = String(base);
  if (!/^\d+$/.test(s)) return Number(s) || 0;
  const d = TOKEN.decimals;
  const padded = s.padStart(d + 1, "0");
  const whole = padded.slice(0, padded.length - d);
  const frac = padded.slice(padded.length - d);
  return Number(`${whole}.${frac}`);
}

/** Convert a display GEN amount to contract base units. */
export function toBase(gen: number): string {
  const [w, f = ""] = String(gen).split(".");
  return `${w}${f.padEnd(TOKEN.decimals, "0").slice(0, TOKEN.decimals)}`.replace(/^0+(?=\d)/, "");
}

export function formatGen(base: string | number, digits = 2): string {
  const n = toGen(base);
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(n) ? 0 : digits,
    maximumFractionDigits: digits,
  })} ${TOKEN.symbol}`;
}

export function formatNum(base: string | number, digits = 2): string {
  const n = toGen(base);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(n) ? 0 : digits,
    maximumFractionDigits: digits,
  });
}

export function formatScaledPrice(value: string | null, scale: string | undefined): string {
  if (!value || !scale) return "—";
  try {
    const raw = BigInt(value);
    const divisor = BigInt(scale);
    if (divisor <= 0n) return "—";
    const whole = raw / divisor;
    const fraction = (raw % divisor)
      .toString()
      .padStart(divisor.toString().length - 1, "0")
      .replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : whole.toString();
  } catch {
    return "—";
  }
}

/** Presentation-only conversion of contract epoch seconds. */
export function utcDateTime(epochSeconds: number): string {
  return `${new Date(epochSeconds * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function utcDayLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function utcDayLong(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function countdown(epochSeconds: number, now = Date.now()): string {
  const diff = epochSeconds * 1000 - now;
  if (diff <= 0) return "elapsed";
  const mins = Math.floor(diff / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ticker(asset: string): string {
  return asset.replace(/USDT$/, "");
}

export function bpsPct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}
