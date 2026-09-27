import { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Number of trusted proxy hops in front of the API. Nginx is the only hop that
 * appends the real client address to `X-Forwarded-For`
 * (`$proxy_add_x_forwarded_for`), and Cloudflare is already resolved by Nginx
 * (`real_ip_header CF-Connecting-IP`), so trusting exactly one hop makes Express
 * read the address Nginx appended — the rightmost entry.
 *
 * With `true` Express reads the **leftmost** entry instead, which any client can
 * write: the rate limit bucket, the logs and the audit trail became spoofable
 * with one header (finding J-03 of the joint integration review).
 */
export const TRUSTED_PROXY_HOPS = 1;

/** Applies the proxy trust of `TRUSTED_PROXY_HOPS` to an Express backed app. */
export function applyProxyTrust(app: NestExpressApplication): void {
  app.set('trust proxy', TRUSTED_PROXY_HOPS);
}
