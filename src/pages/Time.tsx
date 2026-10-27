import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useData, useToday } from '../app/data';
import { CategoryBars } from '../components/charts';
import { Badge, Button, Confirm, EmptyState, Explain, Field, Input, Modal, PageHeader, Panel, Select, Segmented } from '../components/ui';
import { downloadText, newId } from '../lib/id';
import { toCsv } from '../lib/csv';
import { minutesByCategory, weekDays } from '../lib/stats';
import { addDays, dateInTz, formatClock, formatDate, formatMinutes, utcToZonedLocal, weekStart, zonedToUtc } from '../lib/time';
import { elapsedMs, finishTimer, findOverlap, LONG_SESSION_MS, pauseTimer, resumeTimer, startTimer } from '../lib/timer';
import { TIME_CATEGORIES, type EntityLink, type TimeCategory, type TimeEntry } from '../lib/types';

/** One select listing linkable records; value is "kind:id". */
function LinkPicker({ value, onChange, id }: { value: EntityLink | null; onChange: (l: EntityLink | null) => void; id: string }) {
  const { db } = useData();
  const data = useLiveQuery(async () => ({
    questions: await db.questions.where('status').anyOf('Not Started', 'In Progress', 'Needs Revision').limit(100).toArray(),
    tasks: await db.tasks.where('status').anyOf('To do', 'Doing').limit(100).toArray(),
    assessments: await db.assessments.where('status').anyOf('Planned', 'Applied', 'Scheduled').limit(50).toArray()
  }), [db]);
  const options = useMemo((): { group: string; items: EntityLink[] }[] => {
    if (!data) return [];
    return [
      { group: 'Questions', items: data.questions.map((q) => ({ kind: 'question' as const, id: q.id, label: q.title })) },
      { group: 'Learning tasks', items: data.tasks.map((t) => ({ kind: 'learningTask' as const, id: t.id, label: t.title })) },
      { group: 'Interviews and tests', items: data.assessments.map((a) => ({ kind: 'assessment' as const, id: a.id, label: [a.company, a.title].filter(Boolean).join(' — ') })) }
    ].filter((g) => g.items.length);
  }, [data]);
  const current = value ? `${value.kind}:${value.id}` : '';
  return (
    <Select
      id={id}
      value={current}
      onChange={(e) => {
        const [kind, rid] = e.target.value.split(':');
        const found = options.flatMap((g) => g.items).find((i) => i.kind === kind && i.id === rid);
        onChange(found ?? null);
      }}
    >
      <option value="">Nothing linked</option>
      {value && !options.some((g) => g.items.some((i) => i.id === value.id)) && <option value={current}>{value.label}</option>}
      {options.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.items.map((i) => (
            <option key={i.id} value={`${i.kind}:${i.id}`}>
              {i.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

function TimerCard() {
  const { db } = useData();
  const active = useLiveQuery(async () => (await db.activeTimer.get('active')) ?? null, [db]);
  const [category, setCategory] = useState<TimeCategory>('Coding practice');
  const [note, setNote] = useState('');
  const [link, setLink] = useState<EntityLink | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [stopping, setStopping] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 1000);
    // Re-sync immediately when the tab becomes visible again.
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);

  if (active === undefined) return <Panel title="Timer">Loading…</Panel>;

  async function start() {
    setError('');
    try {
      // add() fails if another tab already started a timer, preventing overlaps.
      await db.activeTimer.add(startTimer(category, note.trim(), link, new Date()));
    } catch {
      setError('A timer is already running, possibly in another tab.');
    }
  }
  async function save(minutes: number) {
    if (!active) return;
    const entry = finishTimer(active, new Date(), newId(), minutes);
    await db.transaction('rw', db.activeTimer, db.timeEntries, async () => {
      if (entry.durationMin > 0) await db.timeEntries.add(entry);
      await db.activeTimer.delete('active');
    });
    setStopping(null);
    setNote('');
    setLink(null);
  }

  const ms = active ? elapsedMs(active, now) : 0;
  return (
    <Panel title="Timer">
      {active ? (
        <div>
          <p className="tabular font-display text-5xl font-semibold tracking-tight" aria-live="off">
            {formatClock(ms)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {active.category}
            {active.link ? ` · ${active.link.label}` : ''}
            {active.note ? ` · ${active.note}` : ''}
            {!active.runningSince && ' · paused'}
          </p>
          {ms > LONG_SESSION_MS && (
            <p className="mt-3 rounded-lg bg-due-soft p-2 text-sm text-due">This timer has been running for over 6 hours. Check the duration when you stop it.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {active.runningSince ? (
              <Button onClick={() => db.activeTimer.put(pauseTimer(active, new Date()))}>Pause</Button>
            ) : (
              <Button onClick={() => db.activeTimer.put(resumeTimer(active, new Date()))}>Resume</Button>
            )}
            <Button variant="primary" onClick={() => setStopping(Math.round(ms / 60000))}>
              Stop and save
            </Button>
          </div>
          <Modal
            open={stopping !== null}
            onClose={() => setStopping(null)}
            title="Save this session"
            footer={
              <>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await db.activeTimer.delete('active');
                    setStopping(null);
                  }}
                >
                  Discard
                </Button>
                <Button variant="primary" onClick={() => save(stopping ?? 0)}>
                  Save {formatMinutes(stopping ?? 0)}
                </Button>
              </>
            }
          >
            <Field label="Duration in minutes" hint={`Measured: ${formatMinutes(ms / 60000)}, excluding pauses. Correct it if you forgot to pause.`}>
              {(id) => <Input id={id} type="number" min={0} max={1440} value={stopping ?? 0} onChange={(e) => setStopping(Math.min(1440, Math.max(0, Number(e.target.value) || 0)))} />}
            </Field>
          </Modal>
        </div>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <Field label="What are you working on?">
            {(id) => (
              <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as TimeCategory)}>
                {TIME_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Link to">{(id) => <LinkPicker id={id} value={link} onChange={setLink} />}</Field>
          <Field label="Note (optional)">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button type="submit" variant="primary">
            Start timer
          </Button>
        </form>
      )}
      <Explain summary="Does it keep counting if I close the tab?">
        Yes. The start time is saved, so the elapsed time is recalculated from timestamps when you come back, even after a reload or if your phone locks. It only counts time you start yourself; a website can’t see time spent in other apps or tabs.
      </Explain>
    </Panel>
  );
}

interface EntryDraft {
  id?: string;
  category: TimeCategory;
  date: string;
  startTime: string;
  minutes: number;
  note: string;
  link: EntityLink | null;
}

function EntryForm({ draft, onDone }: { draft: EntryDraft; onDone: () => void }) {
  const { db, settings } = useData();
  const [d, setD] = useState(draft);
  const [overlapAck, setOverlapAck] = useState(false);
  const [overlapWith, setOverlapWith] = useState<TimeEntry | null>(null);
  const set = <K extends keyof EntryDraft>(k: K, v: EntryDraft[K]) => {
    setOverlapAck(false);
    setOverlapWith(null);
    setD((p) => ({ ...p, [k]: v }));
  };

  async function save() {
    if (d.minutes <= 0) return;
    const start = zonedToUtc(`${d.date}T${d.startTime}`, settings.timezone);
    const end = new Date(start.getTime() + d.minutes * 60000);
    const cand = { id: d.id, start: start.toISOString(), end: end.toISOString() };
    const nearby = await db.timeEntries.where('start').between(addDays(d.date, -2), addDays(d.date, 2) + 'T23:59').toArray();
    const clash = findOverlap(cand, nearby);
    if (clash && !overlapAck) return setOverlapWith(clash);
    const nowIso = new Date().toISOString();
    const base = { category: d.category, start: cand.start, end: cand.end, durationMin: d.minutes, note: d.note.trim(), link: d.link };
    if (d.id) await db.timeEntries.update(d.id, { ...base, updatedAt: nowIso });
    else await db.timeEntries.add({ ...base, id: newId(), source: 'manual', createdAt: nowIso, updatedAt: nowIso });
    onDone();
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Category" className="sm:col-span-2">
        {(id) => (
          <Select id={id} value={d.category} onChange={(e) => set('category', e.target.value as TimeCategory)}>
            {TIME_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Date">{(id) => <Input id={id} type="date" required value={d.date} onChange={(e) => set('date', e.target.value)} />}</Field>
      <Field label={`Start time (${settings.timezone})`}>{(id) => <Input id={id} type="time" required value={d.startTime} onChange={(e) => set('startTime', e.target.value)} />}</Field>
      <Field label="Minutes">{(id) => <Input id={id} type="number" min={1} max={1440} required value={d.minutes || ''} onChange={(e) => set('minutes', Math.min(1440, Math.max(0, Number(e.target.value) || 0)))} />}</Field>
      <Field label="Link to">{(id) => <LinkPicker id={id} value={d.link} onChange={(l) => set('link', l)} />}</Field>
      <Field label="Note" className="sm:col-span-2">{(id) => <Input id={id} value={d.note} onChange={(e) => set('note', e.target.value)} />}</Field>
      {overlapWith && (
        <div role="alert" className="rounded-lg bg-due-soft p-3 text-sm text-due sm:col-span-2">
          This overlaps a {overlapWith.category.toLowerCase()} entry of {formatMinutes(overlapWith.durationMin)}. Overlapping entries both count toward totals.
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input type="checkbox" checked={overlapAck} onChange={(e) => setOverlapAck(e.target.checked)} /> Save anyway
          </label>
        </div>
      )}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!!overlapWith && !overlapAck}>
          {d.id ? 'Save changes' : 'Add entry'}
        </Button>
      </div>
    </form>
  );
}

export default function TimePage() {
  const { db, settings } = useData();
  const tz = settings.timezone;
  const today = useToday();
  const [range, setRange] = useState<'week' | 'today'>('week');
  const [offset, setOffset] = useState(0);
  const from = addDays(weekStart(today), offset * 7);
  const to = addDays(from, 6);
  const entries = useLiveQuery(() => db.timeEntries.where('start').between(addDays(from, -1), addDays(to, 1) + 'T23:59:59').toArray(), [db, from, to]);
  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const [deleting, setDeleting] = useState<TimeEntry | null>(null);

  const rangeFrom = range === 'today' ? today : from;
  const rangeTo = range === 'today' ? today : to;
  const inRange = useMemo(
    () => (entries ?? []).filter((e) => { const d = dateInTz(e.start, tz); return d >= rangeFrom && d <= rangeTo; }).sort((a, b) => (a.start < b.start ? 1 : -1)),
    [entries, rangeFrom, rangeTo, tz]
  );
  const byCat = useMemo(() => minutesByCategory(entries ?? [], rangeFrom, rangeTo, tz), [entries, rangeFrom, rangeTo, tz]);
  const total = Object.values(byCat).reduce((a, b) => a + b, 0);
  const days = weekDays(from);

  const newDraft = (): EntryDraft => ({ category: 'Coding practice', date: today, startTime: utcToZonedLocal(new Date(Date.now() - 3600000), tz).slice(11), minutes: 60, note: '', link: null });

  return (
    <>
      <PageHeader
        title="Time"
        description="Deliberate effort you record yourself, compared with your weekly targets."
        actions={
          <>
            <Button
              disabled={!inRange.length}
              onClick={() =>
                downloadText(
                  `codecompass-time-${rangeFrom}-to-${rangeTo}.csv`,
                  toCsv(
                    ['date', 'category', 'start', 'end', 'durationMin', 'note', 'linkedTo', 'source'],
                    inRange.map((e) => ({ ...e, date: dateInTz(e.start, tz), linkedTo: e.link?.label ?? '' }))
                  ),
                  'text/csv'
                )
              }
            >
              Export CSV
            </Button>
            <Button variant="primary" onClick={() => setEditing(newDraft())}>
              Add time manually
            </Button>
          </>
        }
      />
      <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-6">
          <TimerCard />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Range" value={range} onChange={setRange} options={[{ value: 'week', label: 'Week' }, { value: 'today', label: 'Today' }]} />
            {range === 'week' && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>
                  ‹
                </Button>
                <span className="text-sm font-medium">
                  {formatDate(from)} – {formatDate(to)}
                </span>
                <Button size="sm" variant="ghost" aria-label="Next week" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}>
                  ›
                </Button>
              </div>
            )}
          </div>
          <Panel title={<>Total {formatMinutes(total)}</>}>
            {total === 0 && !Object.values(settings.weeklyTargetsMin).some(Boolean) ? (
              <p className="text-sm text-muted">No time recorded in this range.</p>
            ) : (
              <CategoryBars
                caption={`Minutes by category, ${range === 'today' ? 'today' : 'this week'}`}
                rows={TIME_CATEGORIES.filter((c) => byCat[c] > 0 || (range === 'week' && settings.weeklyTargetsMin[c])).map((c) => ({
                  label: c,
                  actual: byCat[c],
                  target: range === 'week' ? settings.weeklyTargetsMin[c] : undefined
                }))}
              />
            )}
            {range === 'week' && (
              <p className="mt-4 text-xs text-muted">
                Daily: {days.map((d) => `${new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })} ${formatMinutes((entries ?? []).filter((e) => dateInTz(e.start, tz) === d).reduce((a, e) => a + e.durationMin, 0))}`).join(' · ')}
              </p>
            )}
          </Panel>
          <section aria-labelledby="entries-h">
            <h2 id="entries-h" className="mb-3 text-lg font-semibold">
              Entries
            </h2>
            {!entries ? (
              <p className="text-muted">Loading…</p>
            ) : inRange.length === 0 ? (
              <EmptyState title="No entries in this range">Start the timer, or add time you already spent.</EmptyState>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                {inRange.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="font-medium">{e.category}</p>
                      <p className="truncate text-sm text-muted">
                        {formatDate(dateInTz(e.start, tz))}, {utcToZonedLocal(e.start, tz).slice(11)}–{utcToZonedLocal(e.end, tz).slice(11)}
                        {e.link ? ` · ${e.link.label}` : ''}
                        {e.note ? ` · ${e.note}` : ''}
                      </p>
                    </div>
                    <span className="tabular font-semibold">{formatMinutes(e.durationMin)}</span>
                    {e.source === 'timer' && <Badge>Timer</Badge>}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setEditing({ id: e.id, category: e.category, date: dateInTz(e.start, tz), startTime: utcToZonedLocal(e.start, tz).slice(11), minutes: e.durationMin, note: e.note, link: e.link })
                      }
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(e)}>
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit time entry' : 'Add time manually'}>
        {editing && <EntryForm key={editing.id ?? 'new'} draft={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Confirm
        open={!!deleting}
        title="Delete this entry?"
        body={deleting ? `${formatMinutes(deleting.durationMin)} of ${deleting.category.toLowerCase()} will be removed.` : ''}
        confirmLabel="Delete entry"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await db.timeEntries.delete(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
