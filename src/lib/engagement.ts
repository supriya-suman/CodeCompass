import { uniqueQuestions } from './dedupe';
import { addDays, dateInTz, weekStart } from './time';
import type { AppUsageDay, LearningTask, Platform, Question, TimeCategory, TimeEntry } from './types';

/**
 * The activity map: one square per day, darker for more engagement, and in
 * the "All" view coloured by the area that took most of that day.
 *
 * Engagement is measured in "focus minutes" so different activities can be
 * compared honestly:
 *   • logged time (timer or manual)            1 minute = 1 point
 *   • a problem solved (unique, by solved date) 15 points
 *   • a learning task completed                 10 points
 *   • a public GitHub event (push, PR, issue)   5 points
 *   • active minutes inside CodeCompass         1 minute = 1 point
 * Only things recorded in the app or fetched from a connected integration
 * count. A website can't see time spent in other apps.
 */

export const AREAS = ['coding', 'learning', 'interviews', 'projects', 'app'] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABEL: Record<Area, string> = {
  coding: 'Coding practice',
  learning: 'Learning',
  interviews: 'Interviews & tests',
  projects: 'Projects & GitHub',
  app: 'Time in CodeCompass'
};

export const POINTS = { solved: 15, taskDone: 10, githubEvent: 5 } as const;

const CATEGORY_AREA: Record<TimeCategory, Area> = {
  'Coding practice': 'coding',
  Contests: 'coding',
  'Frontend learning': 'learning',
  'Research and paper reading': 'learning',
  'Conferences and workshops': 'learning',
  'Interview preparation': 'interviews',
  Assessments: 'interviews',
  'Project development': 'projects'
};

/** What the map shows: every area, one area, or one coding platform. */
export type EngagementFilter = { kind: 'all' } | { kind: 'area'; area: Area } | { kind: 'platform'; platform: Platform | 'GitHub' };

export interface DayEngagement {
  date: string;
  points: number;
  byArea: Record<Area, number>;
  minutesLogged: number;
  solved: number;
  tasksDone: number;
  githubEvents: number;
  appMinutes: number;
  /** Area with most points that day (null when empty). */
  top: Area | null;
}

export interface EngagementInput {
  questions: Question[];
  entries: TimeEntry[];
  tasks: LearningTask[];
  appUsage: AppUsageDay[];
  githubEventDates: string[]; // ISO instants of public GitHub events
}

const emptyDay = (date: string): DayEngagement => ({
  date,
  points: 0,
  byArea: { coding: 0, learning: 0, interviews: 0, projects: 0, app: 0 },
  minutesLogged: 0,
  solved: 0,
  tasksDone: 0,
  githubEvents: 0,
  appMinutes: 0,
  top: null
});

export function buildEngagement(input: EngagementInput, from: string, to: string, tz: string, filter: EngagementFilter = { kind: 'all' }) {
  const days = new Map<string, DayEngagement>();
  for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, emptyDay(d));
  const qById = new Map(input.questions.map((q) => [q.id, q]));

  const wantArea = (a: Area) => filter.kind === 'all' || (filter.kind === 'area' && filter.area === a);
  const add = (date: string, area: Area, pts: number, f: (d: DayEngagement) => void) => {
    const day = days.get(date);
    if (!day || pts <= 0) return;
    day.byArea[area] += pts;
    day.points += pts;
    f(day);
  };

  for (const e of input.entries) {
    const area = CATEGORY_AREA[e.category] ?? 'coding';
    if (filter.kind === 'platform') {
      // Time counts for a platform when the session was linked to one of its questions.
      const q = e.link?.kind === 'question' ? qById.get(e.link.id) : undefined;
      if (!q || q.platform !== filter.platform) continue;
    } else if (!wantArea(area)) continue;
    add(dateInTz(e.start, tz), area, e.durationMin, (d) => (d.minutesLogged += e.durationMin));
  }

  for (const q of uniqueQuestions(input.questions)) {
    if (!q.solvedOn || (q.status !== 'Solved' && q.status !== 'Needs Revision')) continue;
    if (filter.kind === 'platform' ? q.platform !== filter.platform : !wantArea('coding')) continue;
    add(q.solvedOn, 'coding', POINTS.solved, (d) => d.solved++);
  }

  if (filter.kind !== 'platform' && wantArea('learning')) {
    for (const t of input.tasks) if (t.status === 'Done' && t.completedOn) add(t.completedOn, 'learning', POINTS.taskDone, (d) => d.tasksDone++);
  }

  if (filter.kind === 'platform' ? filter.platform === 'GitHub' : wantArea('projects')) {
    for (const at of input.githubEventDates) add(dateInTz(at, tz), 'projects', POINTS.githubEvent, (d) => d.githubEvents++);
  }

  if (filter.kind !== 'platform' && wantArea('app')) {
    for (const u of input.appUsage) add(u.id.slice(0, 10), 'app', Math.round(u.minutes), (d) => (d.appMinutes += Math.round(u.minutes)));
  }

  for (const d of days.values()) {
    let best: Area | null = null;
    for (const a of AREAS) if (d.byArea[a] > 0 && (!best || d.byArea[a] > d.byArea[best])) best = a;
    d.top = best;
  }
  return [...days.values()];
}

/**
 * Intensity 0–4. Thresholds are fixed so a square means the same thing every
 * week: 1 = a little (<30 points), 2 = up to an hour, 3 = up to two hours,
 * 4 = more than two hours of focus.
 */
export const LEVEL_THRESHOLDS = [1, 30, 60, 120] as const;
export function level(points: number): 0 | 1 | 2 | 3 | 4 {
  if (points <= 0) return 0;
  if (points < LEVEL_THRESHOLDS[1]) return 1;
  if (points < LEVEL_THRESHOLDS[2]) return 2;
  if (points < LEVEL_THRESHOLDS[3]) return 3;
  return 4;
}

export interface EngagementSummary {
  activeDays: number;
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  bestDay: DayEngagement | null;
  byArea: Record<Area, number>;
  busiestWeekday: number | null; // 0 = Monday
}

export function summarise(days: DayEngagement[], today: string): EngagementSummary {
  const byArea: Record<Area, number> = { coding: 0, learning: 0, interviews: 0, projects: 0, app: 0 };
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  let active = 0;
  let longest = 0;
  let run = 0;
  let best: DayEngagement | null = null;
  for (const d of days) {
    for (const a of AREAS) byArea[a] += d.byArea[a];
    total += d.points;
    if (d.points > 0) {
      active++;
      run++;
      longest = Math.max(longest, run);
      if (!best || d.points > best.points) best = d;
      const [y, m, dd] = d.date.split('-').map(Number);
      weekday[(new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7] += d.points;
    } else if (d.date < today) run = 0;
  }
  // Current streak counts back from today; an empty today doesn't break it yet.
  const map = new Map(days.map((d) => [d.date, d.points]));
  let cur = 0;
  let day = (map.get(today) ?? 0) > 0 ? today : addDays(today, -1);
  while ((map.get(day) ?? 0) > 0) {
    cur++;
    day = addDays(day, -1);
  }
  const maxW = Math.max(...weekday);
  return { activeDays: active, totalPoints: total, currentStreak: cur, longestStreak: longest, bestDay: best, byArea, busiestWeekday: maxW > 0 ? weekday.indexOf(maxW) : null };
}

/** Grid columns (weeks, Monday first) covering [from, to]; days outside the range are null. */
export function weekColumns(days: DayEngagement[], from: string, to: string): (DayEngagement | null)[][] {
  const map = new Map(days.map((d) => [d.date, d]));
  const cols: (DayEngagement | null)[][] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) {
    cols.push(Array.from({ length: 7 }, (_, i) => {
      const d = addDays(w, i);
      return d < from || d > to ? null : (map.get(d) ?? null);
    }));
  }
  return cols;
}
