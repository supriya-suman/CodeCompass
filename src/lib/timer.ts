import type { ActiveTimer, EntityLink, TimeCategory, TimeEntry } from './types';

// Pure timer logic. The UI ticks only for display; elapsed time always comes
// from stored timestamps, so reloads, backgrounding and sleep don't lose time.

export const LONG_SESSION_MS = 6 * 60 * 60 * 1000;

export function startTimer(category: TimeCategory, note: string, link: EntityLink | null, now: Date): ActiveTimer {
  const iso = now.toISOString();
  return { id: 'active', category, note, link, startedAt: iso, accumulatedMs: 0, runningSince: iso };
}

export function elapsedMs(t: ActiveTimer, now: Date): number {
  const running = t.runningSince ? Math.max(0, now.getTime() - new Date(t.runningSince).getTime()) : 0;
  return t.accumulatedMs + running;
}

export function pauseTimer(t: ActiveTimer, now: Date): ActiveTimer {
  if (!t.runningSince) return t;
  return { ...t, accumulatedMs: elapsedMs(t, now), runningSince: null };
}

export function resumeTimer(t: ActiveTimer, now: Date): ActiveTimer {
  if (t.runningSince) return t;
  return { ...t, runningSince: now.toISOString() };
}

/**
 * Convert the active timer into a time entry. `overrideMin` lets the user
 * correct a session (e.g. a timer left running overnight).
 */
export function finishTimer(t: ActiveTimer, now: Date, id: string, overrideMin?: number): TimeEntry {
  const measuredMin = elapsedMs(t, now) / 60000;
  const durationMin = Math.max(0, Math.round(overrideMin ?? measuredMin));
  const end = now.toISOString();
  // Start is reconstructed as end - duration so the entry never claims more
  // wall-clock span than the recorded effort (paused gaps are excluded).
  const start = new Date(now.getTime() - durationMin * 60000).toISOString();
  return {
    id,
    category: t.category,
    start,
    end,
    durationMin,
    note: t.note,
    link: t.link,
    source: 'timer',
    createdAt: end,
    updatedAt: end
  };
}

export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end);
}

export function findOverlap<T extends { id: string; start: string; end: string }>(
  candidate: { id?: string; start: string; end: string },
  existing: T[]
): T | undefined {
  return existing.find((e) => e.id !== candidate.id && overlaps(candidate, e));
}
