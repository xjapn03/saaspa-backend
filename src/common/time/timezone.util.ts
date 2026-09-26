export const DEFAULT_TIMEZONE = 'America/Bogota';

const DATE_PATTERN = new RegExp('^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

/**
 * Formats an instant with an explicit UTC offset in the given IANA time zone,
 * for example 2026-10-01T08:00:00-05:00. Uses Intl/ICU, so it does not depend on
 * the tzdata of the container (see the time zone risk in the T1.0 report).
 */
export function toOffsetIso(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'longOffset',
  }).formatToParts(date);

  const valueOf = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';

  const rawOffset = valueOf('timeZoneName');
  const offset = rawOffset === 'GMT' ? '+00:00' : rawOffset.replace('GMT', '');

  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}T${valueOf('hour')}:${valueOf('minute')}:${valueOf('second')}${offset}`;
}

/** True only for a YYYY-MM-DD value that is a real calendar date. */
export function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
