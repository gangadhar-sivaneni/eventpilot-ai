"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536e6], ["month", 2592e6], ["week", 6048e5], ["day", 864e5], ["hour", 36e5], ["minute", 6e4],
];

function relative(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  for (const [unit, ms] of STEPS) if (Math.abs(diff) >= ms || unit === "minute") return rtf!.format(Math.round(diff / ms), unit);
  return "";
}

// Timestamps are stored in UTC and shown in the viewer's timezone. The server renders UTC;
// the browser swaps in local time after hydration. `relative` shows "in 3 days" with the exact time as a tooltip.
export function LocalTime({ iso, fallback = "Not announced", relative: rel = false }: {
  iso: string | null;
  fallback?: string;
  relative?: boolean;
}) {
  const text = useSyncExternalStore(
    noop,
    () => (iso ? (rel ? relative(iso) : new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })) : null),
    () => (iso ? new Date(iso).toUTCString().replace(" GMT", " UTC").slice(5, -7) + " UTC" : null),
  );
  if (!iso) return <span className="text-faint">{fallback}</span>;
  return (
    <time dateTime={iso} title={new Date(iso).toUTCString()} suppressHydrationWarning>
      {text}
    </time>
  );
}
