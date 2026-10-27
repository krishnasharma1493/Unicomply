import { describe, it, expect } from 'vitest';
import {
  parseUtc,
  formatDate,
  formatDateTime,
  diffCalendarDays,
  ageingBucket,
  apiErrorMessage,
  MONTHS,
} from '../lib/format';

describe('format utilities (src/lib/format.ts)', () => {
  describe('parseUtc', () => {
    it('parses a timestamp with explicit Z as UTC', () => {
      const date = parseUtc('2026-11-20T12:00:00Z');
      expect(date.toISOString()).toBe('2026-11-20T12:00:00.000Z');
      expect(date.getUTCHours()).toBe(12);
    });

    it('parses a timestamp with an explicit positive timezone offset (+05:30)', () => {
      const date = parseUtc('2026-11-20T17:30:00+05:30');
      // 17:30 in +05:30 is 12:00 UTC
      expect(date.toISOString()).toBe('2026-11-20T12:00:00.000Z');
      expect(date.getUTCHours()).toBe(12);
    });

    it('treats an offset-less timestamp as UTC by appending Z', () => {
      const date = parseUtc('2026-11-20T12:00:00');
      expect(date.toISOString()).toBe('2026-11-20T12:00:00.000Z');
      expect(date.getUTCHours()).toBe(12);
    });

    it('treats an offset-less space-separated timestamp as UTC', () => {
      const date = parseUtc('2026-11-20 12:00:00');
      expect(date.toISOString()).toBe('2026-11-20T12:00:00.000Z');
    });
  });

  describe('formatDate', () => {
    it('formats a date-only value (YYYY-MM-DD) as a calendar date with NO timezone shift', () => {
      expect(formatDate('2026-11-20')).toBe('20 Nov 2026');
      expect(formatDate('2026-01-05')).toBe('05 Jan 2026');
      expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
    });

    it('formats a full ISO timestamp string', () => {
      expect(formatDate('2026-11-20T00:00:00Z')).toBe('20 Nov 2026');
    });

    it('formats a Date object', () => {
      const d = new Date(Date.UTC(2026, 10, 20)); // Month index 10 = Nov
      expect(formatDate(d)).toBe('20 Nov 2026');
    });

    it('returns fallback dash for null, undefined or empty', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate('')).toBe('—');
    });

    it('uses the fixed MONTHS array', () => {
      expect(MONTHS).toEqual([
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ]);
    });
  });

  describe('formatDateTime', () => {
    it('converts UTC timestamp to Indian Standard Time (IST, UTC+05:30)', () => {
      // 12:00 UTC -> 17:30 IST (+5:30)
      expect(formatDateTime('2026-11-20T12:00:00Z')).toBe('20 Nov 2026, 17:30');
    });

    it('converts midnight UTC to IST on the same day', () => {
      // 00:00 UTC -> 05:30 IST
      expect(formatDateTime('2026-11-20T00:00:00Z')).toBe('20 Nov 2026, 05:30');
    });

    it('converts late evening UTC to IST on the next calendar day', () => {
      // 20:00 UTC on 20 Nov -> 01:30 IST on 21 Nov
      expect(formatDateTime('2026-11-20T20:00:00Z')).toBe('21 Nov 2026, 01:30');
    });

    it('handles offset-less UTC timestamps', () => {
      expect(formatDateTime('2026-11-20T12:00:00')).toBe('20 Nov 2026, 17:30');
    });

    it('returns fallback for null, undefined or empty', () => {
      expect(formatDateTime(null)).toBe('—');
      expect(formatDateTime(undefined)).toBe('—');
    });
  });

  describe('diffCalendarDays', () => {
    it('computes exact calendar day difference', () => {
      expect(diffCalendarDays('2026-10-30', '2026-11-20')).toBe(21);
      expect(diffCalendarDays('2026-11-01', '2026-11-16')).toBe(15);
      expect(diffCalendarDays('2026-11-20', '2026-11-20')).toBe(0);
    });
  });

  describe('ageingBucket', () => {
    it('categorizes numeric days into correct buckets', () => {
      expect(ageingBucket(0)).toBe('0_7');
      expect(ageingBucket(7)).toBe('0_7');
      expect(ageingBucket(8)).toBe('8_14');
      expect(ageingBucket(14)).toBe('8_14');
      expect(ageingBucket(15)).toBe('15_21');
      expect(ageingBucket(21)).toBe('15_21');
      expect(ageingBucket(22)).toBe('22_45');
      expect(ageingBucket(45)).toBe('22_45');
      expect(ageingBucket(46)).toBe('45_plus');
      expect(ageingBucket(100)).toBe('45_plus');
    });

    it('categorizes dates with explicit today argument', () => {
      expect(ageingBucket('2026-11-15', '2026-11-20')).toBe('0_7'); // 5 days
      expect(ageingBucket('2026-11-01', '2026-11-20')).toBe('15_21'); // 19 days
      expect(ageingBucket('2026-09-01', '2026-11-20')).toBe('45_plus'); // 80 days
    });
  });

  describe('apiErrorMessage', () => {
    it('reads error.response.data.error.message when present', () => {
      const err = {
        response: {
          data: {
            error: {
              code: 'INVALID_TRANSITION',
              message: 'Cannot reopen an under_process case',
            },
          },
        },
      };
      expect(apiErrorMessage(err)).toBe('Cannot reopen an under_process case');
    });

    it('falls back to error.message when response data is missing', () => {
      const err = new Error('Network timeout');
      expect(apiErrorMessage(err)).toBe('Network timeout');
    });

    it('falls back to generic error message when no message is available', () => {
      expect(apiErrorMessage({})).toBe('Something went wrong — please try again');
      expect(apiErrorMessage(null)).toBe('Something went wrong — please try again');
    });
  });
});
