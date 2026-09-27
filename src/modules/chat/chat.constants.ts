export const CHAT_SESSION_COOKIE = 'kamerinos_chat_session';

/** Maximum length accepted for a single web chat message (contract: 413 above it). */
export const MAX_MESSAGE_LENGTH = 1000;

/** Message cap per anonymous chat session inside ANONYMOUS_MESSAGE_WINDOW_MS (contract: 429). */
export const ANONYMOUS_MESSAGE_CAP = 30;

/**
 * The cap is evaluated over the session's recent activity: when the last message
 * is older than this window the counter starts again. The counter lives in the
 * database so it survives restarts.
 */
export const ANONYMOUS_MESSAGE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Reply used when the conversation was already handed off to a person (A-10a).
 * The backend answers it without calling saaspa-IA so the bot cannot take the
 * conversation back.
 */
export const HANDOFF_ACTIVE_MESSAGE =
  'Esta conversación ya fue derivada a una persona del equipo de Kamerinos. Un asesor te responderá muy pronto.';

export const CHAT_LOCALE = 'es-CO';

/** Reason stored when a person of the salon hands the conversation back to a human. */
export const MANUAL_REOPEN_REASON = 'MANUAL_REOPEN';

export const ANONYMOUS_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Timeout of the call to `POST /api/v1/chat` in saaspa-IA (hallazgo J-04, la
 * escalera de plazos). The backend must wait **longer** than the turn deadline
 * the assistant applies to the same turn: if the backend cuts first it answers
 * 504 while saaspa-IA keeps working, spending tokens, calling the internal API
 * after a reply nobody is waiting for and leaving a turn in its memory that the
 * clienta never saw. The agreed ladder is:
 *
 *   backend 25 s  >  saaspa-IA turn-deadline 20 s  >  saaspa-IA read-timeout 8-10 s por intento
 *
 * The relation is asserted by `__tests__/timeout-ladder.spec.ts`, so lowering the
 * backend timeout below the assistant deadline fails the suite. Both numbers are
 * a joint decision with saaspa-IA (its `application.yml` and the shared note in
 * `docs/contracts/` of that repo): move them together.
 */
export const DEFAULT_IA_BOT_TIMEOUT_MS = 25000;
