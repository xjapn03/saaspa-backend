import { Response } from 'express';

export const ACCESS_COOKIE = 'kamerinos_access_token';
export const REFRESH_COOKIE = 'kamerinos_refresh_token';

const ACCESS_MAX_AGE = 15 * 60 * 1000;
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const secure = process.env.NODE_ENV === 'production';
  const base = { httpOnly: true, secure, sameSite: 'lax' as const };
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, path: '/', maxAge: ACCESS_MAX_AGE });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...base, path: '/api/auth', maxAge: REFRESH_MAX_AGE });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}
