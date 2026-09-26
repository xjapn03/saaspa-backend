export type TurnChannel = 'WHATSAPP' | 'WEB_WIDGET' | 'WEB_LOGGED' | 'DASHBOARD';

export type TurnAgent = 'CLIENTAS' | 'ADMIN';

export type TurnRole = 'CLIENTE' | 'EMPLEADO' | 'ADMIN';

/**
 * Payload of the turn token (ADR 0006 in saaspa-IA).
 * The identity of a turn travels ONLY signed here; it is never taken from request
 * parameters or from model-generated tool arguments.
 */
export interface TurnTokenPayload {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  tenantId: string;
  conversationId: string;
  channel: TurnChannel;
  agent: TurnAgent;
  userId?: string;
  role?: TurnRole;
}

export interface IssueTurnTokenInput {
  turnId: string;
  conversationId: string;
  channel: TurnChannel;
  agent: TurnAgent;
  userId?: string;
  role?: TurnRole;
}
