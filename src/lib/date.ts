/**
 * Parsing and formatting for the catalogue's "added" filter.
 *
 * Two shapes come from the browser: `<input type="date">` submits
 * `yyyy-mm-dd`, `<input type="month">` submits `yyyy-mm`. Both are turned
 * into a UTC `[gte, lt)` range for Prisma, and both have a matching
 * formatter that renders them the way the catalogue already shows dates
 * elsewhere (see BookCard's "added" line) - dd-mmm-yyyy for a day,
 * mmm-yyyy for a month.
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export type DateRange = { gte: Date; lt: Date };

/**
 * `yyyy-mm-dd` -> the UTC range covering that single calendar day, or null
 * if the value is missing, malformed, or not a real date.
 *
 * `Date` quietly rolls an out-of-range day into the next month instead of
 * rejecting it (`2026-02-30` becomes 2 March), so a bad value would
 * otherwise silently filter on the wrong day rather than being ignored.
 * The round-trip check catches that: a value that formats back to itself
 * was real.
 */
export function parseExactDate(value: string | null | undefined): DateRange | null {
  if (!value || !DAY_RE.test(value)) return null;
  const gte = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(gte.getTime()) || gte.toISOString().slice(0, 10) !== value) return null;
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

/** `yyyy-mm` -> the UTC range covering that whole calendar month, or null. */
export function parseMonth(value: string | null | undefined): DateRange | null {
  if (!value || !MONTH_RE.test(value)) return null;
  const gte = new Date(`${value}-01T00:00:00.000Z`);
  // The day is always 01, so unlike parseExactDate there's no overflow to
  // guard against - an out-of-range month (13, 00) is simply Invalid Date.
  if (Number.isNaN(gte.getTime())) return null;
  const lt = new Date(gte);
  lt.setUTCMonth(lt.getUTCMonth() + 1);
  return { gte, lt };
}

/** `yyyy-mm` -> the `yyyy-mm-dd` of that month's last day, or null if malformed. */
export function monthEnd(value: string | null | undefined): string | null {
  const range = parseMonth(value);
  if (!range) return null;
  const last = new Date(range.lt);
  last.setUTCDate(last.getUTCDate() - 1);
  return last.toISOString().slice(0, 10);
}

/** `2026-09-07` -> `07-Sep-2026`. Returns the input unchanged if malformed. */
export function formatDay(value: string): string {
  const match = DAY_RE.exec(value);
  if (!match) return value;
  const [, y, m, d] = match;
  const name = MONTHS[Number(m) - 1];
  return name ? `${d}-${name}-${y}` : value;
}

/** `2026-09` -> `Sep-2026`. Returns the input unchanged if malformed. */
export function formatMonth(value: string): string {
  const match = MONTH_RE.exec(value);
  if (!match) return value;
  const [, y, m] = match;
  const name = MONTHS[Number(m) - 1];
  return name ? `${name}-${y}` : value;
}