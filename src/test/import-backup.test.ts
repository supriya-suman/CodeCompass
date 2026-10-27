import { describe, expect, it } from 'vitest';
import { buildBackup, restoreBackup, validateBackup } from '../lib/backup';
import { importQuestionsCsv, parseCsv, QUESTION_CSV_TEMPLATE, toCsv } from '../lib/csv';
import { CompassDB } from '../lib/db';
import { seedDemo } from '../lib/demo';
import { buildCalendar } from '../lib/ics';
import type { Assessment } from '../lib/types';

describe('CSV', () => {
  it('parses quotes, embedded commas and newlines', () => {
    expect(parseCsv('a,b\r\n"x, y","line1\nline2"\n"say ""hi""",2')).toEqual([['a', 'b'], ['x, y', 'line1\nline2'], ['say "hi"', '2']]);
  });
  it('neutralises spreadsheet formulas on export', () => {
    expect(toCsv(['v'], [{ v: '=HYPERLINK("x")' }])).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it('imports the template and reports row errors and duplicates', () => {
    const ok = importQuestionsCsv(QUESTION_CSV_TEMPLATE, []);
    expect(ok.valid).toHaveLength(1);
    expect(ok.valid[0].companyTags).toEqual(['Amazon', 'Google']);
    const again = importQuestionsCsv(QUESTION_CSV_TEMPLATE, ok.valid);
    expect(again.valid).toHaveLength(0);
    expect(again.duplicates).toHaveLength(1);
    const bad = importQuestionsCsv('title,difficulty,solvedOn,url\n,Easy,,\nX,Impossible,27/10/2026,javascript:alert(1)\nY,hard,,', []);
    expect(bad.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(bad.errors[1].message).toMatch(/difficulty.*solvedOn.*url/);
    expect(bad.valid[0].difficulty).toBe('Hard');
  });
  it('rejects a file without a title column', () => {
    expect(importQuestionsCsv('name\nfoo', []).errors[0].message).toMatch(/title/);
  });
});

describe('backup and restore', () => {
  it('round-trips the demo data and merges without duplicating', async () => {
    const src = new CompassDB('test-src-' + Math.random());
    await seedDemo(src, new Date('2026-10-27T06:00:00Z'));
    await src.integrationCache.put({ key: 'github:x', fetchedAt: '', data: { secret: 1 }, error: null });
    const backup = JSON.parse(JSON.stringify(await buildBackup(src, 'demo')));
    expect(Object.keys(backup.tables)).not.toContain('integrationCache');
    const v = validateBackup(backup);
    expect(v.ok).toBe(true);

    const dst = new CompassDB('test-dst-' + Math.random());
    const r1 = await restoreBackup(dst, v.data!, 'merge');
    expect(await dst.questions.count()).toBe(await src.questions.count());
    const r2 = await restoreBackup(dst, v.data!, 'merge');
    expect(r2.added).toBe(0);
    expect(r2.skipped).toBe(r1.added);
    await dst.questions.add({ ...(await dst.questions.toArray())[0], id: 'extra' });
    await restoreBackup(dst, v.data!, 'replace');
    expect(await dst.questions.get('extra')).toBeUndefined();
  });
  it('rejects foreign, newer or malformed files', () => {
    expect(validateBackup({ hello: 1 }).ok).toBe(false);
    expect(validateBackup({ app: 'codecompass', schemaVersion: 99, tables: {} }).errors[0]).toMatch(/newer/);
    const bad = validateBackup({ app: 'codecompass', schemaVersion: 1, tables: { questions: [{ id: 'a' }, { id: 'a', title: 't', status: 's', platform: 'p' }] } });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(' ')).toMatch(/needs id, title.*duplicate id/);
  });
});

describe('calendar export', () => {
  it('writes UTC times from the invite timezone', () => {
    const a = { id: 'x', company: 'Acme, Inc', title: 'Round 1', scheduledLocal: '2026-11-02T10:00', timezone: 'America/New_York', durationMin: 45, link: 'https://example.com', stage: '', platform: '' } as Assessment;
    const ics = buildCalendar([a], new Date('2026-10-27T00:00:00Z'));
    expect(ics).toContain('DTSTART:20261102T150000Z'); // EST after DST ends on 1 Nov
    expect(ics).toContain('DTEND:20261102T154500Z');
    expect(ics).toContain('SUMMARY:Acme\\, Inc — Round 1');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
});
