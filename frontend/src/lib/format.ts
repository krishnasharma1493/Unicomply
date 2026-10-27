import type { AgeingBucketKey } from './api/enums';

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * SQLite drops the UTC offset; treat offset-less timestamps as UTC.
 * Matches docs/HACKATHON_PRD.md pattern exactly.
 */
export const parseUtc = (s: string): Date =>
  new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);

/**
 * Extracts calendar date [year, monthIndex, day] without any timezone shift.
 */
function extractCalendarParts(dateInput: string | Date): {
  year: number;
  monthIndex: number;
  day: number;
} | null {
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // YYYY-MM-DD date-only string
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
      const year = parseInt(dateOnlyMatch[1], 10);
      const monthIndex = parseInt(dateOnlyMatch[2], 10) - 1;
      const day = parseInt(dateOnlyMatch[3], 10);
      return { year, monthIndex, day };
    }
    // Full ISO / timestamp string -> parse as UTC and extract UTC calendar date
    const d = parseUtc(trimmed);
    if (isNaN(d.getTime())) return null;
    return {
      year: d.getUTCFullYear(),
      monthIndex: d.getUTCMonth(),
      day: d.getUTCDate(),
    };
  }

  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return null;
    return {
      year: dateInput.getUTCFullYear(),
      monthIndex: dateInput.getUTCMonth(),
      day: dateInput.getUTCDate(),
    };
  }

  return null;
}

/**
 * Formats a calendar date or timestamp to `DD MMM YYYY` (e.g. `20 Nov 2026`).
 * Date-only values (`YYYY-MM-DD`) are calendar dates and shown with no timezone shift.
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const parts = extractCalendarParts(date);
  if (!parts) return '—';
  const { year, monthIndex, day } = parts;
  const dayStr = String(day).padStart(2, '0');
  const monthStr = MONTHS[monthIndex] ?? '';
  return `${dayStr} ${monthStr} ${year}`;
}

/**
 * Formats a UTC timestamp to Indian Standard Time (IST, UTC+05:30) as `DD MMM YYYY, HH:mm`.
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  let d: Date;
  if (typeof date === 'string') {
    // If date-only, format as calendar date without time
    if (/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      return formatDate(date);
    }
    d = parseUtc(date);
  } else {
    d = date;
  }
  if (isNaN(d.getTime())) return '—';

  // Offset to Indian Standard Time (UTC + 05:30)
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(d.getTime() + istOffsetMs);

  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const month = MONTHS[istDate.getUTCMonth()] ?? '';
  const year = istDate.getUTCFullYear();
  const hours = String(istDate.getUTCHours()).padStart(2, '0');
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

/**
 * Computes calendar day difference (end - start).
 */
export function diffCalendarDays(
  startDate: string | Date,
  endDate: string | Date,
): number {
  const startParts = extractCalendarParts(startDate);
  const endParts = extractCalendarParts(endDate);
  if (!startParts || !endParts) return 0;

  const startUtc = Date.UTC(startParts.year, startParts.monthIndex, startParts.day);
  const endUtc = Date.UTC(endParts.year, endParts.monthIndex, endParts.day);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((endUtc - startUtc) / msPerDay);
}

/**
 * Maps elapsed days to PRD §4.1 ageing bucket key:
 * - 0–7 days: '0_7'
 * - 8–14 days: '8_14'
 * - 15–21 days: '15_21'
 * - 22–45 days: '22_45'
 * - 46+ days: '45_plus'
 */
export function ageingBucket(
  daysOrReceivedAt: number | string | Date,
  today?: string | Date,
): AgeingBucketKey {
  let days: number;
  if (typeof daysOrReceivedAt === 'number') {
    days = daysOrReceivedAt;
  } else {
    if (!today) {
      throw new Error('ageingBucket requires `today` when passing a date string or Date object');
    }
    days = diffCalendarDays(daysOrReceivedAt, today);
  }

  if (days <= 7) return '0_7';
  if (days <= 14) return '8_14';
  if (days <= 21) return '15_21';
  if (days <= 45) return '22_45';
  return '45_plus';
}

/**
 * Human-readable message from any API error. Plain text only.
 */
export function apiErrorMessage(err: unknown): string {
  if (!err) return 'Something went wrong — please try again';
  const anyErr = err as {
    response?: {
      data?: {
        error?: {
          message?: string;
        };
      };
    };
    message?: string;
  };
  return (
    anyErr.response?.data?.error?.message ??
    anyErr.message ??
    'Something went wrong — please try again'
  );
}
