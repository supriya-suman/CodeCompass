import { findDuplicate } from './dedupe';
import { newId, nowIso } from './id';
import type { Difficulty, Platform, Question, QuestionStatus } from './types';
import { DIFFICULTIES, PLATFORMS, QUESTION_STATUSES } from './types';

/** RFC 4180-style parser: quoted fields, escaped quotes, CRLF/LF, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** Prefix cells that spreadsheet apps would treat as formulas (CSV injection). */
function cell(v: unknown): string {
  let s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  return [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n');
}

export const QUESTION_CSV_HEADERS = [
  'title',
  'url',
  'platform',
  'topic',
  'subtopic',
  'difficulty',
  'status',
  'attemptedOn',
  'solvedOn',
  'timeSpentMin',
  'timeComplexity',
  'spaceComplexity',
  'approach',
  'notes',
  'mistakes',
  'nextRevisionOn',
  'companyTags',
  'sheet'
] as const;

export const QUESTION_CSV_TEMPLATE = toCsv([...QUESTION_CSV_HEADERS], [
  {
    title: 'Two Sum',
    url: 'https://leetcode.com/problems/two-sum/',
    platform: 'LeetCode',
    topic: 'Arrays',
    subtopic: 'Hashing',
    difficulty: 'Easy',
    status: 'Solved',
    attemptedOn: '2026-10-20',
    solvedOn: '2026-10-20',
    timeSpentMin: 20,
    timeComplexity: 'O(n)',
    spaceComplexity: 'O(n)',
    approach: 'Store complement in a map while scanning once.',
    notes: '',
    mistakes: '',
    nextRevisionOn: '2026-10-21',
    companyTags: 'Amazon; Google',
    sheet: ''
  }
]);

export interface ImportIssue {
  row: number; // 1-based, header = row 1
  message: string;
}

export interface QuestionImportResult {
  valid: Question[];
  duplicates: { row: number; title: string }[];
  errors: ImportIssue[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T | null {
  const v = value.trim();
  if (!v) return fallback;
  return allowed.find((a) => a.toLowerCase() === v.toLowerCase()) ?? null;
}

export function importQuestionsCsv(text: string, existing: Question[]): QuestionImportResult {
  const rows = parseCsv(text);
  const result: QuestionImportResult = { valid: [], duplicates: [], errors: [] };
  if (!rows.length) {
    result.errors.push({ row: 1, message: 'The file is empty.' });
    return result;
  }
  const header = rows[0].map((h) => h.trim());
  if (!header.includes('title')) {
    result.errors.push({ row: 1, message: 'Missing required "title" column. Download the template to see the expected columns.' });
    return result;
  }
  const idx = (k: string) => header.indexOf(k);
  const get = (r: string[], k: string) => (idx(k) >= 0 ? (r[idx(k)] ?? '').trim() : '');
  const seen: Question[] = [...existing];

  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    const problems: string[] = [];
    const title = get(r, 'title');
    if (!title) problems.push('title is required');
    const platform = pick<Platform>(get(r, 'platform'), PLATFORMS, 'Other');
    if (!platform) problems.push(`platform must be one of ${PLATFORMS.join(', ')}`);
    const difficulty = pick<Difficulty>(get(r, 'difficulty'), DIFFICULTIES, 'Medium');
    if (!difficulty) problems.push('difficulty must be Easy, Medium or Hard');
    const status = pick<QuestionStatus>(get(r, 'status'), QUESTION_STATUSES, 'Not Started');
    if (!status) problems.push(`status must be one of ${QUESTION_STATUSES.join(', ')}`);
    const dates: Record<string, string | null> = {};
    for (const k of ['attemptedOn', 'solvedOn', 'nextRevisionOn']) {
      const v = get(r, k);
      if (v && !DATE_RE.test(v)) problems.push(`${k} must be YYYY-MM-DD`);
      dates[k] = v || null;
    }
    const tsRaw = get(r, 'timeSpentMin');
    const timeSpentMin = tsRaw ? Number(tsRaw) : 0;
    if (!Number.isFinite(timeSpentMin) || timeSpentMin < 0) problems.push('timeSpentMin must be a non-negative number');
    const url = get(r, 'url');
    if (url && !/^https?:\/\//i.test(url)) problems.push('url must start with http:// or https://');

    if (problems.length) {
      result.errors.push({ row: rowNo, message: problems.join('; ') });
      return;
    }
    const now = nowIso();
    const q: Question = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      title,
      url,
      platform: platform!,
      topic: get(r, 'topic'),
      subtopic: get(r, 'subtopic'),
      difficulty: difficulty!,
      status: status!,
      attemptedOn: dates.attemptedOn,
      solvedOn: dates.solvedOn,
      timeSpentMin,
      approach: get(r, 'approach'),
      notes: get(r, 'notes'),
      code: '',
      timeComplexity: get(r, 'timeComplexity'),
      spaceComplexity: get(r, 'spaceComplexity'),
      mistakes: get(r, 'mistakes'),
      nextRevisionOn: dates.nextRevisionOn,
      revisionStage: 0,
      companyTags: get(r, 'companyTags')
        .split(/[;|]/)
        .map((s) => s.trim())
        .filter(Boolean),
      sheet: get(r, 'sheet')
    };
    if (findDuplicate(q, seen)) {
      result.duplicates.push({ row: rowNo, title });
      return;
    }
    seen.push(q);
    result.valid.push(q);
  });
  return result;
}
