import { describe, expect, it } from 'vitest';
import { addDays, dateInTz, diffDays, offsetMinutes, utcToZonedLocal, weekStart, zonedToUtc } from '../lib/time';

describe('timezone handling', () => {
  it('converts IST wall-clock to UTC', () => {
    expect(zonedToUtc('2026-10-27T11:00', 'Asia/Kolkata').toISOString()).toBe('2026-10-27T05:30:00.000Z');
  });
  it('round-trips through a non-IST zone', () => {
    const at = zonedToUtc('2026-07-01T09:30', 'America/New_York');
    expect(at.toISOString()).toBe('2026-07-01T13:30:00.000Z'); // EDT, UTC-4
    expect(utcToZonedLocal(at, 'America/New_York')).toBe('2026-07-01T09:30');
    expect(utcToZonedLocal(at, 'Asia/Kolkata')).toBe('2026-07-01T19:00');
  });
  it('handles DST: London winter and summer offsets', () => {
    expect(offsetMinutes('Europe/London', new Date('2026-01-15T12:00:00Z'))).toBe(0);
    expect(offsetMinutes('Europe/London', new Date('2026-07-15T12:00:00Z'))).toBe(60);
    // 2026-03-29 01:30 does not exist in London (clocks jump 01:00 → 02:00)
    const gap = zonedToUtc('2026-03-29T01:30', 'Europe/London');
    expect(gap.toISOString()).toMatch(/^2026-03-29T0[01]:30/);
  });
  it('computes calendar date in the user timezone, not UTC', () => {
    // 20:00 UTC is already the next day in India
    expect(dateInTz('2026-10-27T20:00:00Z', 'Asia/Kolkata')).toBe('2026-10-28');
    expect(dateInTz('2026-10-27T20:00:00Z', 'UTC')).toBe('2026-10-27');
  });
  it('date arithmetic across months and weeks', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(diffDays('2026-11-02', '2026-10-30')).toBe(3);
    expect(weekStart('2026-10-27')).toBe('2026-10-26'); // Tuesday → Monday
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // Sunday → previous Monday
  });
});

import { listTimeZones } from '../lib/time';
describe('timezone list', () => {
  it('always offers Asia/Kolkata and the saved zone, never the legacy Calcutta name', () => {
    const z = listTimeZones(['Pacific/Chatham']);
    expect(z).toContain('Asia/Kolkata');
    expect(z).toContain('Pacific/Chatham');
    expect(z).not.toContain('Asia/Calcutta');
  });
});
