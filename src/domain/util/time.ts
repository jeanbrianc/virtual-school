import type { DayString, Timestamp } from '../types';

/** Injectable clock so domain logic and seeds are deterministic under test. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const t = new Date(iso).getTime();
  return { now: () => new Date(t) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day for a Date. */
export function toDay(date: Date): DayString {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayFromTimestamp(ts: Timestamp): DayString {
  return toDay(new Date(ts));
}

/** Parses a `YYYY-MM-DD` day as local midnight. */
export function parseDay(day: DayString): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(day: DayString, delta: number): DayString {
  const d = parseDay(day);
  d.setDate(d.getDate() + delta);
  return toDay(d);
}

export function daysBetween(a: DayString, b: DayString): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
}

export function isWithin(day: DayString, start: DayString, end: DayString): boolean {
  return day >= start && day <= end;
}

/** Timestamp at a given local day + hour (used by seeds and interpretation). */
export function timestampAt(day: DayString, hour = 10, minute = 0): Timestamp {
  const d = parseDay(day);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function startOfWeek(day: DayString): DayString {
  const d = parseDay(day);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

export function startOfMonth(day: DayString): DayString {
  return `${day.slice(0, 7)}-01`;
}

export function endOfMonth(day: DayString): DayString {
  const d = parseDay(startOfMonth(day));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toDay(d);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatDay(day: DayString, style: 'short' | 'long' | 'weekday' = 'short'): string {
  const d = parseDay(day);
  if (style === 'long') return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  if (style === 'weekday') return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function monthName(day: DayString): string {
  return MONTHS[parseDay(day).getMonth()] ?? '';
}

export function relativeDay(day: DayString, today: DayString): string {
  const diff = daysBetween(day, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAYS[parseDay(day).getDay()] ?? formatDay(day);
  return formatDay(day);
}

/** Age in years and months at a given day (parent-facing only). */
export function ageAt(birthDate: DayString, day: DayString): { years: number; months: number } {
  const b = parseDay(birthDate);
  const d = parseDay(day);
  let months = (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth());
  if (d.getDate() < b.getDate()) months -= 1;
  return { years: Math.floor(months / 12), months: months % 12 };
}
