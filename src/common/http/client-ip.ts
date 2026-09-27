/**
 * The client address this backend trusts for a request, and the only source the
 * turn token may carry.
 *
 * It is Express's `req.ip`, which `applyProxyTrust` computes with
 * `TRUSTED_PROXY_HOPS = 1`: Nginx is the only hop that **appends** the real
 * address to `X-Forwarded-For`, so `req.ip` is that appended value and never the
 * prefix a client wrote (finding J-03). The `ThrottlerGuard` buckets on exactly
 * this value (`getTracker` returns `req.ip`), so the rate limit and the token
 * claim can never disagree on who the caller is.
 *
 * The value is returned as is, without normalising IPv6 or IPv4-mapped IPv6, so
 * it stays identical to the throttler bucket. `undefined` when Express did not
 * resolve an address (non-HTTP contexts and unit tests).
 */
export function resolveClientIp(
  request: { ip?: string } | null | undefined,
): string | undefined {
  const ip = request?.ip;
  return typeof ip === 'string' && ip.trim().length > 0 ? ip : undefined;
}
