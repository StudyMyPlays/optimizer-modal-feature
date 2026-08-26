interface Bucket {
  count: number
  resetAt: number
}
const buckets = new Map<string, Bucket>()
/**
 * Hard cap on tracked keys. Without it the map only ever shed an entry when the
 * *same* key came back after expiry, so a stream of distinct keys (rotated
 * headers, or just months of distinct client IPs on a long-lived server) grew
 * it without bound until the process ran out of memory.
 */
const MAX_TRACKED_KEYS = 10_000
function evict(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
  if (buckets.size >= MAX_TRACKED_KEYS) {
    const excess = buckets.size - MAX_TRACKED_KEYS + 1
    let dropped = 0
    for (const key of buckets.keys()) {
      buckets.delete(key)
      if (++dropped >= excess) break
    }
  }
}
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    if (!bucket && buckets.size >= MAX_TRACKED_KEYS) evict(now)
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}
/**
 * Caller identifier for use as a rate-limit key.
 *
 * `x-forwarded-for` is set by the *client* unless a trusted proxy overwrites
 * it, so reading it unconditionally meant an attacker could rotate the header
 * and bypass every limit in the app. Vercel sets `x-vercel-forwarded-for`
 * itself and strips any client-supplied copy, so that header is trustworthy
 * where it exists. Behind a different reverse proxy, set TRUST_PROXY_HEADERS=1
 * — but only if that proxy overwrites `x-forwarded-for` rather than appending.
 *
 * Prefer a session user id over this wherever one is available.
 */
export function getClientIp(req: Request): string {
  const vercel = req.headers.get('x-vercel-forwarded-for')
  if (vercel) return vercel.split(',')[0].trim()
  if (process.env.TRUST_PROXY_HEADERS === '1') {
    const forwarded = req.headers.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    const real = req.headers.get('x-real-ip')
    if (real) return real.trim()
  }
  return 'unknown'
}
