import { addDays } from './time';
import type { Question } from './types';

// Spaced revision with user-configurable intervals (days), e.g. [1,3,7,14,30].

export type RevisionOutcome = 'confident' | 'shaky' | 'forgot';

export function sanitizeIntervals(input: number[]): number[] {
  const clean = input.map((n) => Math.round(n)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 365);
  return clean.length ? [...new Set(clean)].sort((a, b) => a - b) : [1, 3, 7, 14, 30];
}

/** Schedule the first revision when a question is first marked solved. */
export function firstRevision(solvedOn: string, intervals: number[]): Pick<Question, 'nextRevisionOn' | 'revisionStage'> {
  const iv = sanitizeIntervals(intervals);
  return { nextRevisionOn: addDays(solvedOn, iv[0]), revisionStage: 0 };
}

/**
 * Apply a revision outcome. Confident advances a stage, shaky repeats the
 * current interval, forgot restarts and flags the question for revision.
 * Past the last stage the interval stays at the longest value.
 */
export function applyRevision(
  q: Pick<Question, 'revisionStage' | 'status'>,
  outcome: RevisionOutcome,
  today: string,
  intervals: number[]
): Pick<Question, 'nextRevisionOn' | 'revisionStage' | 'status'> {
  const iv = sanitizeIntervals(intervals);
  const last = iv.length - 1;
  let stage = q.revisionStage;
  let status = q.status;
  if (outcome === 'confident') {
    stage = Math.min(stage + 1, last);
    if (status === 'Needs Revision') status = 'Solved';
  } else if (outcome === 'forgot') {
    stage = 0;
    status = 'Needs Revision';
  }
  return { revisionStage: stage, nextRevisionOn: addDays(today, iv[Math.min(stage, last)]), status };
}

export function isDue(q: Pick<Question, 'nextRevisionOn' | 'status'>, today: string): boolean {
  if (!q.nextRevisionOn) return false;
  if (q.status === 'Not Started') return false;
  return q.nextRevisionOn <= today;
}

export function revisionQueue<T extends Pick<Question, 'nextRevisionOn' | 'status'>>(qs: T[], today: string): T[] {
  return qs
    .filter((q) => isDue(q, today))
    .sort((a, b) => (a.nextRevisionOn! < b.nextRevisionOn! ? -1 : a.nextRevisionOn! > b.nextRevisionOn! ? 1 : 0));
}
