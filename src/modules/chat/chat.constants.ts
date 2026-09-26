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

export const ANONYMOUS_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_IA_BOT_TIMEOUT_MS = 20000;
