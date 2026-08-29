// In-memory sliding-window rate limiter — per (IP, bucket) key.
//
// SCOPE: single Node process. On Vercel serverless, limits apply per warm
// function instance (not globally). This is enough to cut brute-force burst
// speed by 100x-1000x, but not enough to survive a coordinated distributed
// attack. Swap to Upstash Ratelimit before real traffic.
//
// USAGE:
//   const gate = checkRateLimit(request, 'auth-login', { max: 10, windowMs: 60_000 });
//   if (!gate.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

const buckets = new Map<string, number[]>();
// Keep the Map from growing unbounded — prune on every check with expired entries.
let lastPrune = Date.now();
const PRUNE_INTERVAL_MS = 60_000;

export interface RateLimitOptions {
  /** Max requests allowed per window per key. */
  max: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetInMs: number;
}

function clientIp(request: Request): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

function pruneIfNeeded(now: number) {
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  // Drop keys whose most recent hit is older than 10 minutes.
  const cutoff = now - 10 * 60_000;
  for (const [key, hits] of buckets) {
    if (hits.length === 0 || hits[hits.length - 1] < cutoff) buckets.delete(key);
  }
}

export function checkRateLimit(
  request: Request,
  bucket: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  pruneIfNeeded(now);

  const key = `${bucket}:${clientIp(request)}`;
  const windowStart = now - opts.windowMs;
  const hits = (buckets.get(key) || []).filter((t) => t > windowStart);

  if (hits.length >= opts.max) {
    return {
      ok: false,
      remaining: 0,
      resetInMs: hits[0] + opts.windowMs - now,
    };
  }

  hits.push(now);
  buckets.set(key, hits);
  return {
    ok: true,
    remaining: opts.max - hits.length,
    resetInMs: opts.windowMs,
  };
}
