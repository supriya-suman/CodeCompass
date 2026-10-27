import { describe, expect, it } from 'vitest';
import { buildEngagement, level, summarise, weekColumns, type EngagementInput } from '../lib/engagement';
import type { LearningTask, Question, TimeEntry } from '../lib/types';

const q = (p: Partial<Question>): Question => ({
  id: Math.random().toString(36), createdAt: '', updatedAt: '2026-10-01T00:00:00Z', title: 'Two Sum', url: '', platform: 'LeetCode', topic: '', subtopic: '',
  difficulty: 'Easy', status: 'Solved', attemptedOn: null, solvedOn: '2026-10-20', timeSpentMin: 0, approach: '', notes: '', code: '', timeComplexity: '',
  spaceComplexity: '', mistakes: '', nextRevisionOn: null, revisionStage: 0, companyTags: [], sheet: '', ...p
});
const e = (start: string, durationMin: number, category: TimeEntry['category'], link: TimeEntry['link'] = null): TimeEntry => ({
  id: start + category, createdAt: '', updatedAt: '', category, start, end: start, durationMin, note: '', link, source: 'manual'
});
const input = (p: Partial<EngagementInput>): EngagementInput => ({ questions: [], entries: [], tasks: [], appUsage: [], githubEventDates: [], ...p });
const TZ = 'Asia/Kolkata';

describe('activity map', () => {
  it('combines sources into focus points and picks the main area per day', () => {
    const lc = q({ id: 'lc1', solvedOn: '2026-10-20' });
    const days = buildEngagement(
      input({
        questions: [lc, q({ id: 'dup', url: '', title: '1. Two Sum' })], // duplicate counted once
        entries: [e('2026-10-20T04:00:00Z', 40, 'Frontend learning'), e('2026-10-20T06:00:00Z', 20, 'Coding practice')],
        tasks: [{ id: 't', status: 'Done', completedOn: '2026-10-20' } as LearningTask],
        appUsage: [{ id: '2026-10-20__phone', minutes: 6, createdAt: '', updatedAt: '' }, { id: '2026-10-20__laptop', minutes: 4.4, createdAt: '', updatedAt: '' }],
        githubEventDates: ['2026-10-20T10:00:00Z', '2026-10-20T11:00:00Z']
      }),
      '2026-10-19', '2026-10-21', TZ
    );
    const d = days[1];
    expect(d.solved).toBe(1);
    expect(d.byArea).toEqual({ coding: 20 + 15, learning: 40 + 10, interviews: 0, projects: 10, app: 10 });
    expect(d.points).toBe(105);
    expect(d.top).toBe('learning');
    expect(days[0].points).toBe(0);
    expect(days[0].top).toBeNull();
  });

  it('uses the user timezone for the day of a session', () => {
    // 20:00 UTC on the 20th is the 21st in India
    const days = buildEngagement(input({ entries: [e('2026-10-20T20:00:00Z', 30, 'Coding practice')] }), '2026-10-20', '2026-10-21', TZ);
    expect(days.map((d) => d.points)).toEqual([0, 30]);
  });

  it('filters by area and by platform', () => {
    const cf = q({ id: 'cf', platform: 'Codeforces', title: 'Watermelon', solvedOn: '2026-10-20' });
    const data = input({
      questions: [cf, q({ id: 'lc', solvedOn: '2026-10-20' })],
      entries: [e('2026-10-20T04:00:00Z', 25, 'Coding practice', { kind: 'question', id: 'cf', label: 'Watermelon' }), e('2026-10-20T05:00:00Z', 60, 'Frontend learning')],
      githubEventDates: ['2026-10-20T10:00:00Z']
    });
    const only = (f: Parameters<typeof buildEngagement>[4]) => buildEngagement(data, '2026-10-20', '2026-10-20', TZ, f)[0].points;
    expect(only({ kind: 'area', area: 'learning' })).toBe(60);
    expect(only({ kind: 'area', area: 'coding' })).toBe(25 + 15 + 15);
    expect(only({ kind: 'platform', platform: 'Codeforces' })).toBe(25 + 15);
    expect(only({ kind: 'platform', platform: 'LeetCode' })).toBe(15);
    expect(only({ kind: 'platform', platform: 'GitHub' })).toBe(5);
  });

  it('has fixed intensity levels', () => {
    expect([0, 1, 29, 30, 59, 60, 119, 120, 500].map(level)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('summarises streaks, best day and busiest weekday', () => {
    const entries = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-24', '2026-10-25', '2026-10-26'].map((d, i) => e(`${d}T05:00:00Z`, 10 + i * 10, 'Coding practice'));
    const days = buildEngagement(input({ entries }), '2026-10-19', '2026-10-27', TZ);
    const s = summarise(days, '2026-10-27');
    expect(s.activeDays).toBe(6);
    expect(s.longestStreak).toBe(3);
    expect(s.currentStreak).toBe(3); // 24–26, today (27th) empty doesn't break it
    expect(s.bestDay?.date).toBe('2026-10-26');
    expect(s.busiestWeekday).toBe(0); // Monday 26th
  });

  it('lays days out in Monday-first week columns', () => {
    const days = buildEngagement(input({}), '2026-10-22', '2026-11-03', TZ);
    const cols = weekColumns(days, '2026-10-22', '2026-11-03');
    expect(cols).toHaveLength(3);
    expect(cols[0].slice(0, 3)).toEqual([null, null, null]); // Mon–Wed before range start (Thu 22nd)
    expect(cols[0][3]?.date).toBe('2026-10-22');
    expect(cols[2][1]?.date).toBe('2026-11-03');
    expect(cols[2][2]).toBeNull();
  });
});
