/**
 * Extension members an RFC 9457 ProblemDetail may carry. saaspa-IA adds the cost
 * cap ones (ADR 0010/0020); they travel with the turn rejection and are copied
 * into our own problem document, so the widget can tell a conversation cap from
 * a tenant one or an origin one (J-07).
 */
export const PROBLEM_EXTENSIONS = ['scope', 'measure', 'measured', 'limit', 'window'] as const;

export type ProblemExtensionKey = (typeof PROBLEM_EXTENSIONS)[number];

/**
 * Copies the known ProblemDetail extensions present in `source`. Anything else
 * is ignored on purpose: only documented members reach the client.
 */
export function pickProblemExtensions(source: unknown): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  if (!source || typeof source !== 'object') return picked;

  const record = source as Record<string, unknown>;
  for (const key of PROBLEM_EXTENSIONS) {
    if (record[key] !== undefined) picked[key] = record[key];
  }
  return picked;
}
