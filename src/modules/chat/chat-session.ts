import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Anonymous chat session id: 128 bits of entropy, issued by the server (the same
 * mechanism as the conversation id) and carried by the `kamerinos_chat_session`
 * cookie. The cookie value is `<id>.<hmac>` so a client can neither choose the id
 * nor keep an old one valid by editing it (finding J-03: any 16+ character value
 * used to be accepted as a session, which made the per-session message cap
 * trivial to reset).
 */
const SESSION_ID_BYTES = 16;
const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Derives a purpose-specific signing key from the session secret, so the chat
 * does not need another environment variable. Fails closed when the secret is
 * missing: an unsigned id could be invented by the client.
 */
export function deriveSessionKey(secret: string): Buffer {
  if (!secret) {
    throw new Error('JWT_SECRET is required to sign the anonymous chat session');
  }
  return createHmac('sha256', secret).update('kamerinos:chat-session:v1').digest();
}

/** Issues a new session id. Only the server calls this. */
export function issueAnonymousSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString('hex');
}

/** Wraps a server issued id with its signature, for the cookie value. */
export function signAnonymousSessionId(sessionId: string, key: Buffer): string {
  return `${sessionId}.${createHmac('sha256', key).update(sessionId).digest('hex')}`;
}

/**
 * Returns the session id only when the cookie carries a value this server
 * issued: the expected shape plus a signature that matches. Anything else
 * (absent, invented, truncated or tampered) is rejected and the caller issues a
 * new session.
 */
export function readIssuedSessionId(cookieValue: unknown, key: Buffer): string | null {
  if (typeof cookieValue !== 'string') return null;

  const [sessionId, signature, extra] = cookieValue.split('.');
  if (extra !== undefined) return null;
  if (!SESSION_ID_PATTERN.test(sessionId ?? '') || !SIGNATURE_PATTERN.test(signature ?? '')) {
    return null;
  }

  const expected = createHmac('sha256', key).update(sessionId).digest();
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected)) return null;

  return sessionId;
}
