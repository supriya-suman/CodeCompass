import { useLiveQuery } from 'dexie-react-hooks';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useData, useToday } from '../app/data';
import { Badge, Button, Confirm, EmptyState, ExternalLink, Explain, Field, Input, Modal, PageHeader, Panel, Select, Textarea } from '../components/ui';
import { importQuestionsCsv, QUESTION_CSV_HEADERS, QUESTION_CSV_TEMPLATE, toCsv, type QuestionImportResult } from '../lib/csv';
import { findDuplicate, uniqueQuestions } from '../lib/dedupe';
import { downloadText } from '../lib/id';
import { firstRevision } from '../lib/revision';
import { topicCoverage } from '../lib/stats';
import { DSA_TOPICS } from '../lib/starter';
import { formatDate, formatMinutes } from '../lib/time';
import { DIFFICULTIES, PLATFORMS, QUESTION_STATUSES, type Question, type QuestionStatus } from '../lib/types';

type Draft = Omit<Question, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

const blank = (): Draft => ({
  title: '',
  url: '',
  platform: 'LeetCode',
  topic: '',
  subtopic: '',
  difficulty: 'Medium',
  status: 'Not Started',
  attemptedOn: null,
  solvedOn: null,
  timeSpentMin: 0,
  approach: '',
  notes: '',
  code: '',
  timeComplexity: '',
  spaceComplexity: '',
  mistakes: '',
  nextRevisionOn: null,
  revisionStage: 0,
  companyTags: [],
  sheet: ''
});

export const statusTone = (s: QuestionStatus) => (s === 'Solved' ? 'ok' : s === 'Needs Revision' ? 'due' : s === 'In Progress' ? 'accent' : 'neutral');
const diffTone = { Easy: 'ok', Medium: 'accent', Hard: 'danger' } as const;

export function QuestionForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const { db, repo, settings } = useData();
  const today = useToday();
  const all = useLiveQuery(() => db.questions.toArray(), [db]) ?? [];
  const [d, setD] = useState<Draft>(initial);
  const [error, setError] = useState('');
  const [dupAck, setDupAck] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const dup = d.title.trim() ? findDuplicate({ ...d, id: d.id }, all) : undefined;
  const topics = useMemo(() => [...new Set([...DSA_TOPICS, ...all.map((q) => q.topic).filter(Boolean)])].sort(), [all]);
  const sheets = useMemo(() => [...new Set(all.map((q) => q.sheet).filter(Boolean))], [all]);

  async function save() {
    if (!d.title.trim()) return setError('Add a title so you can find this question later.');
    if (d.url && !/^https?:\/\//i.test(d.url.trim())) return setError('The problem link must start with https://');
    if (dup && !dupAck) return setError('');
    const next: Draft = { ...d, title: d.title.trim(), url: d.url.trim() };
    const solvedish = next.status === 'Solved' || next.status === 'Needs Revision';
    if (solvedish && !next.solvedOn) next.solvedOn = today;
    if (next.status !== 'Not Started' && !next.attemptedOn) next.attemptedOn = next.solvedOn ?? today;
    if (solvedish && !next.nextRevisionOn) Object.assign(next, firstRevision(next.solvedOn!, settings.revisionIntervals));
    const { id, ...data } = next;
    if (id) await repo.update<Question>('questions', id, data);
    else await repo.create<Question>('questions', data);
    onDone();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-4 sm:grid-cols-2"
    >
      <Field label="Title" className="sm:col-span-2" error={error || undefined}>
        {(id) => <Input id={id} value={d.title} onChange={(e) => set('title', e.target.value)} autoFocus required />}
      </Field>
      <Field label="Problem link" className="sm:col-span-2" hint="The original problem page. Used to detect duplicates.">
        {(id) => <Input id={id} type="url" inputMode="url" placeholder="https://" value={d.url} onChange={(e) => set('url', e.target.value)} />}
      </Field>
      {dup && (
        <div className="rounded-lg bg-due-soft p-3 text-sm text-due sm:col-span-2" role="alert">
          This looks like “{dup.title}”, which you already logged. It will be counted once in your stats.
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input type="checkbox" checked={dupAck} onChange={(e) => setDupAck(e.target.checked)} /> Save it anyway
          </label>
        </div>
      )}
      <Field label="Platform">
        {(id) => (
          <Select id={id} value={d.platform} onChange={(e) => set('platform', e.target.value as Draft['platform'])}>
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Difficulty">
        {(id) => (
          <Select id={id} value={d.difficulty} onChange={(e) => set('difficulty', e.target.value as Draft['difficulty'])}>
            {DIFFICULTIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Topic">
        {(id) => (
          <>
            <Input id={id} list="topic-list" value={d.topic} onChange={(e) => set('topic', e.target.value)} />
            <datalist id="topic-list">
              {topics.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </>
        )}
      </Field>
      <Field label="Subtopic">{(id) => <Input id={id} value={d.subtopic} onChange={(e) => set('subtopic', e.target.value)} />}</Field>
      <Field label="Status">
        {(id) => (
          <Select id={id} value={d.status} onChange={(e) => set('status', e.target.value as QuestionStatus)}>
            {QUESTION_STATUSES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Time spent (minutes)">
        {(id) => <Input id={id} type="number" min={0} inputMode="numeric" value={d.timeSpentMin || ''} onChange={(e) => set('timeSpentMin', Math.max(0, Number(e.target.value) || 0))} />}
      </Field>
      <Field label="Attempted on">{(id) => <Input id={id} type="date" value={d.attemptedOn ?? ''} onChange={(e) => set('attemptedOn', e.target.value || null)} />}</Field>
      <Field label="Solved on" hint="Filled with today when you mark it solved.">
        {(id) => <Input id={id} type="date" value={d.solvedOn ?? ''} onChange={(e) => set('solvedOn', e.target.value || null)} />}
      </Field>
      <Field label="Time complexity">{(id) => <Input id={id} placeholder="O(n log n)" value={d.timeComplexity} onChange={(e) => set('timeComplexity', e.target.value)} />}</Field>
      <Field label="Space complexity">{(id) => <Input id={id} placeholder="O(1)" value={d.spaceComplexity} onChange={(e) => set('spaceComplexity', e.target.value)} />}</Field>
      <Field label="Approach" className="sm:col-span-2">{(id) => <Textarea id={id} value={d.approach} onChange={(e) => set('approach', e.target.value)} />}</Field>
      <Field label="Code snippet" className="sm:col-span-2">
        {(id) => <Textarea id={id} spellCheck={false} className="min-h-32 font-mono text-sm" value={d.code} onChange={(e) => set('code', e.target.value)} />}
      </Field>
      <Field label="Mistakes and lessons" className="sm:col-span-2">{(id) => <Textarea id={id} value={d.mistakes} onChange={(e) => set('mistakes', e.target.value)} />}</Field>
      <Field label="Personal notes" className="sm:col-span-2">{(id) => <Textarea id={id} value={d.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
      <Field label="Next revision" hint="Scheduled automatically when solved. Change it if you like.">
        {(id) => <Input id={id} type="date" value={d.nextRevisionOn ?? ''} onChange={(e) => set('nextRevisionOn', e.target.value || null)} />}
      </Field>
      <Field label="Coding sheet">
        {(id) => (
          <>
            <Input id={id} list="sheet-list" placeholder="e.g. My Blind-style list" value={d.sheet} onChange={(e) => set('sheet', e.target.value)} />
            <datalist id="sheet-list">
              {sheets.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </>
        )}
      </Field>
      <Field label="Company tags" className="sm:col-span-2" hint="Separate with commas.">
        {(id) => (
          <Input
            id={id}
            value={d.companyTags.join(', ')}
            onChange={(e) =>
              set(
                'companyTags',
                e.target.value.split(',').map((s) => s.trimStart())
              )
            }
            onBlur={() => set('companyTags', d.companyTags.map((s) => s.trim()).filter(Boolean))}
          />
        )}
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!!dup && !dupAck}>
          {d.id ? 'Save changes' : 'Add question'}
        </Button>
      </div>
    </form>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db } = useData();
  const [result, setResult] = useState<QuestionImportResult | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File) {
    setDone(null);
    if (f.size > 5_000_000) return setResult({ valid: [], duplicates: [], errors: [{ row: 0, message: 'File is larger than 5 MB.' }] });
    const text = await f.text();
    setResult(importQuestionsCsv(text, await db.questions.toArray()));
  }
  async function commit() {
    if (!result?.valid.length) return;
    await db.questions.bulkAdd(result.valid);
    setDone(result.valid.length);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }
  const close = () => {
    setResult(null);
    setDone(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Import questions from CSV"
      footer={
        <>
          <Button onClick={() => downloadText('codecompass-questions-template.csv', QUESTION_CSV_TEMPLATE, 'text/csv')}>Download template</Button>
          <Button variant="primary" disabled={!result?.valid.length} onClick={commit}>
            Import {result?.valid.length ? `${result.valid.length} question${result.valid.length === 1 ? '' : 's'}` : ''}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        Use the template columns. Only <strong>title</strong> is required. Rows that match a question you already have (same problem link, or same platform and title) are skipped.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        aria-label="Choose CSV file"
        className="mt-4 block w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-sunken file:px-4 file:font-medium"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {done !== null && (
        <p role="status" className="mt-4 rounded-lg bg-ok-soft p-3 text-sm text-ok">
          Imported {done} question{done === 1 ? '' : 's'}.
        </p>
      )}
      {result && (
        <div className="mt-4 space-y-3 text-sm" role="status">
          <p>
            <strong>{result.valid.length}</strong> ready to import · <strong>{result.duplicates.length}</strong> duplicates skipped · <strong>{result.errors.length}</strong> rows with errors
          </p>
          {result.duplicates.length > 0 && (
            <details>
              <summary className="cursor-pointer text-accent">Show skipped duplicates</summary>
              <ul className="mt-2 list-disc pl-5 text-muted">
                {result.duplicates.slice(0, 50).map((d) => (
                  <li key={d.row}>
                    Row {d.row}: {d.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {result.errors.length > 0 && (
            <ul className="max-h-48 list-disc overflow-y-auto rounded-lg bg-danger-soft p-3 pl-8 text-danger">
              {result.errors.slice(0, 100).map((e) => (
                <li key={e.row}>
                  {e.row ? `Row ${e.row}: ` : ''}
                  {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Questions() {
  const { db, repo } = useData();
  const all = useLiveQuery(() => db.questions.orderBy('updatedAt').reverse().toArray(), [db]);
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search);
  const [status, setStatus] = useState('');
  const [platform, setPlatform] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [topic, setTopic] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<Question | null>(null);
  const [deleting, setDeleting] = useState<Question | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (all ?? []).filter(
      (x) =>
        (!status || x.status === status) &&
        (!platform || x.platform === platform) &&
        (!difficulty || x.difficulty === difficulty) &&
        (!topic || x.topic === topic) &&
        (!needle || [x.title, x.topic, x.subtopic, x.notes, x.approach, x.sheet, ...x.companyTags].some((s) => s.toLowerCase().includes(needle)))
    );
  }, [all, q, status, platform, difficulty, topic]);

  const topicsInUse = useMemo(() => [...new Set((all ?? []).map((x) => x.topic).filter(Boolean))].sort(), [all]);
  const coverage = useMemo(() => topicCoverage(all ?? [], DSA_TOPICS), [all]);
  const uniqueCount = useMemo(() => uniqueQuestions(all ?? []).length, [all]);

  if (!all) return <p className="text-muted">Loading questions…</p>;

  return (
    <>
      <PageHeader
        title="Questions"
        description="Every problem you attempt, with your approach, mistakes and revision schedule."
        actions={
          <>
            <Button onClick={() => setImportOpen(true)}>Import CSV</Button>
            <Button
              disabled={!all.length}
              onClick={() =>
                downloadText(
                  'codecompass-questions.csv',
                  toCsv([...QUESTION_CSV_HEADERS], all as unknown as Record<string, unknown>[]),
                  'text/csv'
                )
              }
            >
              Export CSV
            </Button>
            <Button variant="primary" onClick={() => setEditing(blank())}>
              Add question
            </Button>
          </>
        }
      />

      {all.length === 0 ? (
        <EmptyState
          title="No questions logged yet"
          action={
            <>
              <Button variant="primary" onClick={() => setEditing(blank())}>
                Add your first question
              </Button>
              <Button onClick={() => setImportOpen(true)}>Import from CSV</Button>
            </>
          }
        >
          Log a problem you solved today, or import a list you already keep in a spreadsheet.
        </EmptyState>
      ) : (
        <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[1fr_280px]">
          <div className="min-w-0">
            <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Input type="search" placeholder="Search title, topic, notes, company…" aria-label="Search questions" value={search} onChange={(e) => setSearch(e.target.value)} className="col-span-full" />
              <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {QUESTION_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Select aria-label="Filter by platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                <option value="">All platforms</option>
                {PLATFORMS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Select aria-label="Filter by difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="">All difficulties</option>
                {DIFFICULTIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Select aria-label="Filter by topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option value="">All topics</option>
                {topicsInUse.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </div>
            <p className="mb-2 text-sm text-muted" role="status">
              Showing {filtered.length} of {all.length}
              {uniqueCount !== all.length ? ` (${all.length - uniqueCount} logged twice, counted once in stats)` : ''}
            </p>
            {filtered.length === 0 ? (
              <EmptyState title="Nothing matches these filters">Clear a filter or change the search.</EmptyState>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {filtered.map((x) => (
                  <li key={x.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setViewing(x)}>
                      <p className="truncate font-medium">{x.title}</p>
                      <p className="truncate text-sm text-muted">
                        {[x.platform, x.topic, x.subtopic].filter(Boolean).join(' / ')}
                        {x.nextRevisionOn ? ` · revise ${formatDate(x.nextRevisionOn)}` : ''}
                      </p>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={diffTone[x.difficulty]}>{x.difficulty}</Badge>
                      <Badge tone={statusTone(x.status)}>{x.status}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ ...x })}>
                        Edit
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Panel title="Topic coverage">
            <p className="text-sm">
              <span className="font-display text-2xl font-semibold tabular">{coverage.covered}</span>
              <span className="text-muted"> of {coverage.total} core topics have a solved question</span>
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {coverage.rows.map((r) => (
                <li key={r.topic} className="flex justify-between gap-2">
                  <span className={r.solved ? '' : 'text-muted'}>{r.topic}</span>
                  <span className="tabular text-muted">{r.solved || '–'}</span>
                </li>
              ))}
            </ul>
            <Explain summary="How is this calculated?">
              A topic counts as covered when at least one question with that topic name is Solved or Needs Revision. Duplicate entries of the same problem count once.
            </Explain>
          </Panel>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit question' : 'Add question'} wide>
        {editing && <QuestionForm key={editing.id ?? 'new'} initial={editing} onDone={() => setEditing(null)} />}
      </Modal>

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title ?? ''}
        wide
        footer={
          viewing && (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  setDeleting(viewing);
                  setViewing(null);
                }}
              >
                Delete
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setEditing({ ...viewing });
                  setViewing(null);
                }}
              >
                Edit
              </Button>
            </>
          )
        }
      >
        {viewing && <QuestionDetail q={viewing} />}
      </Modal>

      <Confirm
        open={!!deleting}
        title="Delete this question?"
        body={<>“{deleting?.title}” and its notes will be removed from this browser. Time entries linked to it are kept.</>}
        confirmLabel="Delete question"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await repo.remove('questions', deleting.id);
          setDeleting(null);
        }}
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}

function QuestionDetail({ q }: { q: Question }) {
  const rows: [string, string][] = [
    ['Approach', q.approach],
    ['Mistakes and lessons', q.mistakes],
    ['Notes', q.notes]
  ];
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge tone={diffTone[q.difficulty]}>{q.difficulty}</Badge>
        <Badge tone={statusTone(q.status)}>{q.status}</Badge>
        {q.companyTags.map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
      </div>
      {q.url && <ExternalLink href={q.url}>Open problem on {q.platform}</ExternalLink>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Topic', [q.topic, q.subtopic].filter(Boolean).join(' / ') || '—'],
          ['Solved', formatDate(q.solvedOn)],
          ['Time spent', q.timeSpentMin ? formatMinutes(q.timeSpentMin) : '—'],
          ['Next revision', formatDate(q.nextRevisionOn)],
          ['Time', q.timeComplexity || '—'],
          ['Space', q.spaceComplexity || '—'],
          ['Sheet', q.sheet || '—']
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <h3 className="text-xs font-medium text-muted">{k}</h3>
            <p className="mt-1 whitespace-pre-wrap">{v}</p>
          </div>
        ))}
      {q.code && (
        <div>
          <h3 className="text-xs font-medium text-muted">Code</h3>
          <pre className="mt-1 max-h-80 overflow-auto rounded-lg bg-sunken p-3 font-mono text-[13px] leading-relaxed">
            <code>{q.code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
