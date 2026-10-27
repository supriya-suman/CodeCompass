import { uniqueQuestions } from './dedupe';
import { addDays, dateInTz } from './time';
import type { LearningTask, Question, TimeCategory, TimeEntry } from './types';
import { TIME_CATEGORIES } from './types';

// Every number on the dashboard comes from these functions so the
// definitions shown in the UI ("How is this calculated?") stay true.

export const CODING_CATEGORIES: TimeCategory[] = ['Coding practice', 'Contests', 'Assessments'];
export const STUDY_CATEGORIES: TimeCategory[] = [
  'Frontend learning',
  'Research and paper reading',
  'Interview preparation',
  'Conferences and workshops'
];

export function minutesByCategory(entries: TimeEntry[], from: string, to: string, tz: string) {
  const out = Object.fromEntries(TIME_CATEGORIES.map((c) => [c, 0])) as Record<TimeCategory, number>;
  for (const e of entries) {
    const d = dateInTz(e.start, tz);
    if (d >= from && d <= to) out[e.category] += e.durationMin;
  }
  return out;
}

export function dailyMinutes(entries: TimeEntry[], days: string[], tz: string, cats?: TimeCategory[]) {
  const map = new Map(days.map((d) => [d, 0]));
  for (const e of entries) {
    if (cats && !cats.includes(e.category)) continue;
    const d = dateInTz(e.start, tz);
    if (map.has(d)) map.set(d, map.get(d)! + e.durationMin);
  }
  return days.map((d) => ({ date: d, minutes: map.get(d)! }));
}

/**
 * Coding streak: consecutive calendar days (user timezone) with at least one
 * unique question solved OR at least 1 minute logged in a coding category.
 * Today counts if active; an inactive today does not break the streak yet.
 */
export function codingStreak(questions: Question[], entries: TimeEntry[], today: string, tz: string): number {
  const active = new Set<string>();
  for (const q of uniqueQuestions(questions)) if (q.solvedOn) active.add(q.solvedOn);
  for (const e of entries) if (CODING_CATEGORIES.includes(e.category) && e.durationMin >= 1) active.add(dateInTz(e.start, tz));
  let day = active.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (active.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export interface SolvedSummary {
  total: number;
  byDifficulty: Record<'Easy' | 'Medium' | 'Hard', number>;
  thisWeek: number;
  duplicatesIgnored: number;
}

export function solvedSummary(questions: Question[], weekFrom: string, today: string): SolvedSummary {
  const solved = questions.filter((q) => q.status === 'Solved' || q.status === 'Needs Revision');
  const unique = uniqueQuestions(solved);
  const byDifficulty = { Easy: 0, Medium: 0, Hard: 0 };
  let thisWeek = 0;
  for (const q of unique) {
    byDifficulty[q.difficulty]++;
    if (q.solvedOn && q.solvedOn >= weekFrom && q.solvedOn <= today) thisWeek++;
  }
  return { total: unique.length, byDifficulty, thisWeek, duplicatesIgnored: solved.length - unique.length };
}

/** Topic coverage: share of topics (from the given list) with ≥1 unique solved question. */
export function topicCoverage(questions: Question[], topics: string[]) {
  const solved = uniqueQuestions(questions.filter((q) => q.status === 'Solved' || q.status === 'Needs Revision'));
  const counts = new Map<string, number>();
  for (const q of solved) {
    const t = q.topic.trim().toLowerCase();
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const rows = topics.map((t) => ({ topic: t, solved: counts.get(t.toLowerCase()) ?? 0 }));
  const covered = rows.filter((r) => r.solved > 0).length;
  return { rows, covered, total: topics.length, percent: topics.length ? Math.round((covered / topics.length) * 100) : 0 };
}

/** Goal completion = done tasks / all tasks (milestones count like tasks). */
export function goalProgress(tasks: LearningTask[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'Done').length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function weekDays(weekFrom: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i));
}
