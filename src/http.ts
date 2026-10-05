const UA = "opportunity-engine/1.0 (personal digest bot)";
const lastHit = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with UA, timeout, retry and a 1s per-host politeness delay */
export async function get(url: string, retries = 2): Promise<Response> {
  const host = new URL(url).host;
  for (let attempt = 0; ; attempt++) {
    const wait = 1000 - (Date.now() - (lastHit.get(host) ?? 0));
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json, application/xml, text/html" },
        signal: AbortSignal.timeout(20_000),
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (attempt >= retries) throw new Error(`${url}: ${(e as Error).message}`);
      await sleep(1500 * (attempt + 1));
    }
  }
}
export const getJson = async <T>(url: string) => (await get(url)).json() as Promise<T>;
export const getText = async (url: string) => (await get(url)).text();

/** Follow ONE redirect hop and return its Location (used for tracking links like workingnomads /job/go/). */
export async function redirectTarget(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const loc = res.headers.get("location");
    return loc ? new URL(loc, url).toString() : null;
  } catch { return null; }
}
