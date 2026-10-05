import type { Opportunity } from "./schema.js";
import { getText, redirectTarget } from "./http.js";
import { findApplyUrl, cleanUrl } from "./helpers.js";

/**
 * For the final picks only (keeps requests low): upgrade aggregator links to the employer's own
 * application page where the source lets us. Anything that can't be resolved keeps its listing URL.
 */
export async function resolveApplyUrls(items: Opportunity[]): Promise<void> {
  for (const o of items) {
    if (o.applyUrl) continue;
    try {
      if (o.source === "Working Nomads") {
        const t = await redirectTarget(o.url);
        if (t && !/workingnomads\.com/.test(t)) o.applyUrl = cleanUrl(t);
      } else if (o.source === "Remotive") {
        o.applyUrl = findApplyUrl(await getText(o.url), ["remotive.com", "remotive.io"]);
      }
    } catch { /* keep listing url */ }
  }
}
