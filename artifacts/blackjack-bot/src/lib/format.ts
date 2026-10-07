// The game keeps 20% of every transfer.
export const TAX_RATE = 0.2;
export const afterTax = (gross: number) => Math.floor(gross * (1 - TAX_RATE));

export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString();

export function timeAgo(date: string | number) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(date).toLocaleDateString();
}

export function duration(seconds: number) {
  if (seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function clock(ms: number) {
  const secs = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/** "@name" for usernames, the raw ID for numeric user IDs. */
export function handle(recipient: string) {
  return /^\d{17,20}$/.test(recipient) ? recipient : `@${recipient}`;
}
