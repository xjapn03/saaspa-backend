const UUID_PATTERN = new RegExp(
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
);

/** True when the value looks like a UUID (the internal API accepts id or slug). */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
