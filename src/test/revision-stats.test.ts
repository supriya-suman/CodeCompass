import { describe, expect, it } from 'vitest';
import { questionKey, uniqueQuestions } from '../lib/dedupe';
import { applyRevision, firstRevision, revisionQueue, sanitizeIntervals } from '../lib/revision';
import { codingStreak, solvedSummary } from '../lib/stats';
import type { Question, TimeEntry } from '../lib/types';

const q = (p: Partial<Question>): Question => ({
  id: Math.random().toString(36), createdAt: '', updatedAt: '2026-10-01T00:00:00Z', title: 'Two Sum', url: '', platform: 'LeetCode', topic: 'Arrays', subtopic: '',
  difficulty: 'Easy', status: 'Solved', attemptedOn: null, solvedOn: '2026-10-20', timeSpentMin: 0, approach: '', notes: '', code: '', timeComplexity: '',
  spaceComplexity: '', mistakes: '', nextRevisionOn: null, revisionStage: 0, companyTags: [], sheet: '', ...p
});

describe('revision scheduling', () => {
  const iv = [1, 3, 7];
  it('schedules first revision and advances on confidence', () => {
    expect(firstRevision('2026-10-27', iv)).toEqual({ nextRevisionOn: '2026-10-28', revisionStage: 0 });
    expect(applyRevision({ revisionStage: 0, status: 'Solved' }, 'confident', '2026-10-28', iv)).toEqual({ revisionStage: 1, nextRevisionOn: '2026-10-31', status: 'Solved' });
  });
  it('caps at the last interval, repeats on shaky, resets on forgot', () => {
    expect(applyRevision({ revisionStage: 2, status: 'Solved' }, 'confident', '2026-10-28', iv).nextRevisionOn).toBe('2026-11-04');
    expect(applyRevision({ revisionStage: 1, status: 'Solved' }, 'shaky', '2026-10-28', iv)).toMatchObject({ revisionStage: 1, nextRevisionOn: '2026-10-31' });
    expect(applyRevision({ revisionStage: 2, status: 'Solved' }, 'forgot', '2026-10-28', iv)).toEqual({ revisionStage: 0, nextRevisionOn: '2026-10-29', status: 'Needs Revision' });
  });
  it('sanitises user-entered intervals', () => {
    expect(sanitizeIntervals([7, 1, 1, 0, -3, NaN, 400])).toEqual([1, 7]);
    expect(sanitizeIntervals([])).toEqual([1, 3, 7, 14, 30]);
  });
  it('queues only due, started questions oldest first', () => {
    const list = [q({ nextRevisionOn: '2026-10-27' }), q({ nextRevisionOn: '2026-10-20', title: 'B' }), q({ nextRevisionOn: '2026-10-29' }), q({ status: 'Not Started', nextRevisionOn: '2026-10-01' })];
    expect(revisionQueue(list, '2026-10-27').map((x) => x.nextRevisionOn)).toEqual(['2026-10-20', '2026-10-27']);
  });
});

describe('no double counting', () => {
  it('treats URL variants of one problem as the same', () => {
    expect(questionKey(q({ url: 'https://leetcode.com/problems/two-sum/description/?envType=x' }))).toBe(questionKey(q({ url: 'https://www.LeetCode.com/problems/two-sum' })));
    expect(questionKey(q({ title: '1. Two Sum' }))).toBe(questionKey(q({ title: 'two sum' })));
  });
  it('solved summary counts duplicates once', () => {
    const list = [q({ url: 'https://leetcode.com/problems/two-sum/' }), q({ url: 'https://leetcode.com/problems/two-sum' }), q({ title: 'Other', difficulty: 'Hard', solvedOn: '2026-10-27' })];
    const s = solvedSummary(list, '2026-10-26', '2026-10-27');
    expect(s.total).toBe(2);
    expect(s.duplicatesIgnored).toBe(1);
    expect(s.thisWeek).toBe(1);
    expect(uniqueQuestions(list)).toHaveLength(2);
  });
});

describe('coding streak', () => {
  const entry = (start: string, min = 30): TimeEntry => ({ id: start, createdAt: '', updatedAt: '', category: 'Coding practice', start, end: start, durationMin: min, note: '', link: null, source: 'manual' });
  it('counts consecutive days in the user timezone, and an empty today does not break it', () => {
    const qs = [q({ solvedOn: '2026-10-25' })];
    // 2026-10-26T20:00Z is 27 Oct in IST
    const es = [entry('2026-10-24T05:00:00Z'), entry('2026-10-26T05:00:00Z')];
    expect(codingStreak(qs, es, '2026-10-26', 'Asia/Kolkata')).toBe(3);
    expect(codingStreak(qs, es, '2026-10-27', 'Asia/Kolkata')).toBe(3);
    expect(codingStreak(qs, [...es, entry('2026-10-26T20:00:00Z')], '2026-10-27', 'Asia/Kolkata')).toBe(4);
    expect(codingStreak(qs, es, '2026-10-28', 'Asia/Kolkata')).toBe(0);
  });
});
