import type { Question } from './types';

/**
 * Canonical identity for a coding problem, so the same problem logged twice
 * (manual entry + CSV import, or with/without query strings) is counted once.
 * URL wins when present; otherwise platform + normalised title.
 */
export function normaliseUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, '').toLowerCase();
    // LeetCode: /problems/two-sum/description → /problems/two-sum
    const lc = /^\/problems\/([^/]+)/.exec(path);
    if (host.endsWith('leetcode.com') && lc) path = `/problems/${lc[1]}`;
    return `${host}${path}`;
  } catch {
    return null;
  }
}

export function normaliseTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/^\s*\d+\s*[.)-]\s*/, '') // "1. Two Sum" → "two sum"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function questionKey(q: Pick<Question, 'url' | 'platform' | 'title'>): string {
  return normaliseUrl(q.url) ?? `${q.platform.toLowerCase()}::${normaliseTitle(q.title)}`;
}

export function findDuplicate<T extends Pick<Question, 'id' | 'url' | 'platform' | 'title'>>(
  candidate: Pick<Question, 'url' | 'platform' | 'title'> & { id?: string },
  existing: T[]
): T | undefined {
  const k = questionKey(candidate);
  return existing.find((q) => q.id !== candidate.id && questionKey(q) === k);
}

/** Keep one record per canonical key (most recently updated wins). */
export function uniqueQuestions<T extends Pick<Question, 'url' | 'platform' | 'title' | 'updatedAt'>>(qs: T[]): T[] {
  const map = new Map<string, T>();
  for (const q of qs) {
    const k = questionKey(q);
    const prev = map.get(k);
    if (!prev || prev.updatedAt < q.updatedAt) map.set(k, q);
  }
  return [...map.values()];
}
