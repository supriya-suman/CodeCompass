import { describe, expect, it } from 'vitest';
import { elapsedMs, finishTimer, findOverlap, pauseTimer, resumeTimer, startTimer } from '../lib/timer';

const t0 = new Date('2026-10-27T10:00:00Z');
const at = (min: number) => new Date(t0.getTime() + min * 60000);

describe('timer recovery from stored timestamps', () => {
  it('derives elapsed time from timestamps after a simulated reload', () => {
    const stored = JSON.parse(JSON.stringify(startTimer('Coding practice', '', null, t0)));
    expect(elapsedMs(stored, at(25))).toBe(25 * 60000);
  });
  it('excludes paused time and survives pause/resume cycles', () => {
    let t = startTimer('Frontend learning', 'notes', null, t0);
    t = pauseTimer(t, at(10)); // 10 min
    expect(elapsedMs(t, at(50))).toBe(10 * 60000); // paused, doesn't grow
    t = resumeTimer(t, at(50));
    t = pauseTimer(t, at(65)); // +15
    t = resumeTimer(t, at(70));
    expect(elapsedMs(t, at(75))).toBe(30 * 60000); // +5
  });
  it('pause and resume are idempotent', () => {
    let t = startTimer('Contests', '', null, t0);
    t = pauseTimer(pauseTimer(t, at(5)), at(9));
    expect(t.accumulatedMs).toBe(5 * 60000);
    const r = resumeTimer(t, at(10));
    expect(resumeTimer(r, at(20)).runningSince).toBe(r.runningSince);
  });
  it('finishing creates an entry and honours a correction', () => {
    const t = startTimer('Coding practice', 'two sum', null, t0);
    const e = finishTimer(t, at(600), 'id1', 90); // left running 10h, corrected to 90m
    expect(e.durationMin).toBe(90);
    expect(new Date(e.end).getTime() - new Date(e.start).getTime()).toBe(90 * 60000);
    expect(finishTimer(t, at(42), 'id2').durationMin).toBe(42);
  });
  it('detects overlapping entries but not touching ones', () => {
    const existing = [{ id: 'a', start: '2026-10-27T10:00:00Z', end: '2026-10-27T11:00:00Z' }];
    expect(findOverlap({ start: '2026-10-27T10:30:00Z', end: '2026-10-27T11:30:00Z' }, existing)?.id).toBe('a');
    expect(findOverlap({ start: '2026-10-27T11:00:00Z', end: '2026-10-27T12:00:00Z' }, existing)).toBeUndefined();
    expect(findOverlap({ id: 'a', start: '2026-10-27T10:30:00Z', end: '2026-10-27T10:45:00Z' }, existing)).toBeUndefined();
  });
});
