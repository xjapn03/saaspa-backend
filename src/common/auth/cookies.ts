import { Response } from 'express';

export const ACCESS_COOKIE = 'kamerinos_access_token';
export const REFRESH_COOKIE = 'kamerinos_refresh_token';

function parseMs(value?: string): number | undefined {
  if (!value) return undefined;
  const m = /^(\d+)([smhd])$/.exec(value.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return n * factor;
}

function maxAgeFrom(envValue: string | undefined, fallback: number): number {
  return parseMs(envValue) ?? fallback;
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const secure = process.env.NODE_ENV === 'production';
  const accessMaxAge = maxAgeFrom(process.env.JWT_EXPIRATION, 15 * 60 * 1000);
  const refreshMaxAge = maxAgeFrom(process.env.JWT_REFRESH_EXPIRATION, 7 * 24 * 60 * 60 * 1000);
  const base = { httpOnly: true, secure, sameSite: 'lax' as const };
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: '/', maxAge: accessMaxAge });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, path: '/api/auth', maxAge: refreshMaxAge });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}
