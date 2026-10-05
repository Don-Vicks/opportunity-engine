import type { Health } from "./store.js";

export interface SourceResult { name: string; count?: number; error?: string }

export const FAIL_LIMIT = 3; // consecutive failed runs (~9h at 3-hourly cadence)
export const ZERO_LIMIT = 8; // consecutive empty runs (~24h)

/** Pure: folds this run's results into the health map and returns Telegram-ready alert lines. */
export function updateHealth(prev: Record<string, Health>, results: SourceResult[], now = new Date()) {
  const next: Record<string, Health> = { ...prev };
  const alerts: string[] = [];
  for (const r of results) {
    const h: Health = { ...(next[r.name] ?? { zero: 0, fail: 0 }) };
    if (r.error) { h.fail++; h.lastErr = r.error.slice(0, 160); }
    else {
      const recovered = h.alerted && (r.count ?? 0) > 0;
      h.fail = 0; h.lastErr = undefined;
      h.zero = (r.count ?? 0) === 0 ? h.zero + 1 : 0;
      if ((r.count ?? 0) > 0) h.lastOk = now.toISOString();
      if (recovered) { h.alerted = false; alerts.push(`✅ <b>${r.name}</b> is back (${r.count} items).`); }
    }
    if (!h.alerted && (h.fail >= FAIL_LIMIT || h.zero >= ZERO_LIMIT)) {
      h.alerted = true;
      alerts.push(
        h.fail >= FAIL_LIMIT
          ? `⚠️ <b>${r.name}</b> has failed ${h.fail} runs in a row.\n<i>${h.lastErr ?? ""}</i>`
          : `⚠️ <b>${r.name}</b> has returned nothing for ${h.zero} runs (~${Math.round(h.zero * 3)}h). Feed may have changed.`,
      );
    }
    next[r.name] = h;
  }
  return { health: next, alerts };
}
