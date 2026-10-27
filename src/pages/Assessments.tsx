import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useData, useToday } from '../app/data';
import { Badge, Button, Confirm, EmptyState, ExternalLink, Field, Input, Modal, PageHeader, Select, Segmented, Textarea } from '../components/ui';
import { downloadText, newId } from '../lib/id';
import { buildCalendar } from '../lib/ics';
import { assessmentInstant } from '../lib/assessments';
import { formatDate, formatInstant, isValidTimeZone, listTimeZones } from '../lib/time';
import { ASSESSMENT_STATUSES, type Assessment, type AssessmentStatus } from '../lib/types';

const ACTIVE: AssessmentStatus[] = ['Planned', 'Applied', 'Scheduled'];
const tone = (s: AssessmentStatus) =>
  s === 'Passed' ? 'ok' : s === 'Rejected' ? 'danger' : s === 'Scheduled' ? 'accent' : s === 'Cancelled' ? 'neutral' : s === 'Completed' ? 'ok' : 'neutral';

type Draft = Omit<Assessment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };


function AssessmentForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const { db, repo } = useData();
  const tasks = useLiveQuery(() => db.tasks.where('status').notEqual('Done').toArray(), [db]) ?? [];
  const [d, setD] = useState<Draft>(initial);
  const [newItem, setNewItem] = useState('');
  const [error, setError] = useState('');
  const zones = useMemo(() => listTimeZones([initial.timezone]), [initial.timezone]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!d.company.trim() && !d.title.trim()) return setError('Add a company or an assessment title.');
    if (d.link && !/^https?:\/\//i.test(d.link)) return setError('The link must start with https://');
    if (!isValidTimeZone(d.timezone)) return setError('Choose a valid timezone.');
    const { id, ...data } = { ...d, company: d.company.trim(), title: d.title.trim() };
    if (id) await repo.update<Assessment>('assessments', id, data);
    else await repo.create<Assessment>('assessments', data);
    onDone();
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {error && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {error}
        </p>
      )}
      <Field label="Company or organiser">{(id) => <Input id={id} value={d.company} onChange={(e) => set('company', e.target.value)} autoFocus />}</Field>
      <Field label="Role or assessment">{(id) => <Input id={id} value={d.title} onChange={(e) => set('title', e.target.value)} />}</Field>
      <Field label="Platform">{(id) => <Input id={id} placeholder="HackerRank, Google Meet…" value={d.platform} onChange={(e) => set('platform', e.target.value)} />}</Field>
      <Field label="Stage">{(id) => <Input id={id} placeholder="OA, Round 1, HM, Offer…" value={d.stage} onChange={(e) => set('stage', e.target.value)} />}</Field>
      <Field label="Assessment link" className="sm:col-span-2">{(id) => <Input id={id} type="url" placeholder="https://" value={d.link} onChange={(e) => set('link', e.target.value)} />}</Field>
      <Field label="Date and time" hint="As written in the invite, in the timezone below.">
        {(id) => <Input id={id} type="datetime-local" value={d.scheduledLocal ?? ''} onChange={(e) => set('scheduledLocal', e.target.value || null)} />}
      </Field>
      <Field label="Timezone of the invite">
        {(id) => (
          <Select id={id} value={d.timezone} onChange={(e) => set('timezone', e.target.value)}>
            {zones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Duration (minutes)">{(id) => <Input id={id} type="number" min={0} value={d.durationMin || ''} onChange={(e) => set('durationMin', Math.max(0, Number(e.target.value) || 0))} />}</Field>
      <Field label="Status">
        {(id) => (
          <Select id={id} value={d.status} onChange={(e) => set('status', e.target.value as AssessmentStatus)}>
            {ASSESSMENT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Topics tested" hint="Separate with commas." className="sm:col-span-2">
        {(id) => <Input id={id} value={d.topics.join(', ')} onChange={(e) => set('topics', e.target.value.split(',').map((s) => s.trimStart()))} onBlur={() => set('topics', d.topics.map((s) => s.trim()).filter(Boolean))} />}
      </Field>
      <Field label="Score or result">{(id) => <Input id={id} value={d.result} onChange={(e) => set('result', e.target.value)} />}</Field>
      <Field label="Follow up on">{(id) => <Input id={id} type="date" value={d.followUpOn ?? ''} onChange={(e) => set('followUpOn', e.target.value || null)} />}</Field>

      <fieldset className="sm:col-span-2">
        <legend className="mb-1.5 text-sm font-medium">Preparation checklist</legend>
        <ul className="mb-2 flex flex-col gap-1.5">
          {d.checklist.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={c.done} aria-label={c.text} onChange={(e) => set('checklist', d.checklist.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)))} />
              <span className="flex-1">{c.text}</span>
              <Button size="sm" variant="ghost" aria-label={`Remove ${c.text}`} onClick={() => set('checklist', d.checklist.filter((x) => x.id !== c.id))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            aria-label="New checklist item"
            placeholder="e.g. Revise closures and event loop"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newItem.trim()) {
                e.preventDefault();
                set('checklist', [...d.checklist, { id: newId(), text: newItem.trim(), done: false }]);
                setNewItem('');
              }
            }}
          />
          <Button
            disabled={!newItem.trim()}
            onClick={() => {
              set('checklist', [...d.checklist, { id: newId(), text: newItem.trim(), done: false }]);
              setNewItem('');
            }}
          >
            Add
          </Button>
        </div>
      </fieldset>

      {tasks.length > 0 && (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Related study tasks</legend>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border border-line p-2">
            {tasks.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={d.relatedTaskIds.includes(t.id)}
                  onChange={(e) => set('relatedTaskIds', e.target.checked ? [...d.relatedTaskIds, t.id] : d.relatedTaskIds.filter((x) => x !== t.id))}
                />
                {t.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} value={d.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary">
          {d.id ? 'Save changes' : 'Add'}
        </Button>
      </div>
    </form>
  );
}

export default function Assessments() {
  const { db, repo, settings } = useData();
  const today = useToday();
  const all = useLiveQuery(() => db.assessments.toArray(), [db]);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]) ?? [];
  const [tab, setTab] = useState<'upcoming' | 'followup' | 'past' | 'all'>('upcoming');
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Assessment | null>(null);
  const now = new Date();

  const rows = useMemo(() => {
    const list = (all ?? []).map((a) => ({ a, at: assessmentInstant(a) }));
    const upcoming = list.filter((r) => ACTIVE.includes(r.a.status) && (!r.at || r.at >= now));
    const followup = list.filter((r) => r.a.followUpOn && r.a.followUpOn <= today && !['Passed', 'Rejected', 'Cancelled'].includes(r.a.status));
    const past = list.filter((r) => !upcoming.includes(r));
    const pick = { upcoming, followup, past, all: list }[tab];
    const key = (r: { at: Date | null }) => r.at?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const dir = tab === 'past' ? -1 : 1;
    return [...pick].sort((x, y) => (key(x) - key(y)) * dir);
  }, [all, tab, today]);
  const overdueScheduled = (all ?? []).filter((a) => a.status === 'Scheduled' && (assessmentInstant(a)?.getTime() ?? Infinity) < now.getTime());

  const blank = (): Draft => ({
    company: '',
    title: '',
    platform: '',
    link: '',
    stage: '',
    scheduledLocal: null,
    timezone: settings.timezone,
    durationMin: 60,
    status: 'Planned',
    checklist: [],
    topics: [],
    result: '',
    followUpOn: null,
    notes: '',
    relatedTaskIds: []
  });

  if (!all) return <p className="text-muted">Loading…</p>;
  const exportable = (all ?? []).filter((a) => ACTIVE.includes(a.status) && (assessmentInstant(a)?.getTime() ?? 0) >= now.getTime());

  return (
    <>
      <PageHeader
        title="Interviews & tests"
        description="Every assessment and interview round, with prep checklists and calendar export."
        actions={
          <>
            <Button disabled={!exportable.length} onClick={() => downloadText('codecompass-interviews.ics', buildCalendar(exportable), 'text/calendar')}>
              Export upcoming to calendar
            </Button>
            <Button variant="primary" onClick={() => setEditing(blank())}>
              Add interview or test
            </Button>
          </>
        }
      />
      {overdueScheduled.length > 0 && (
        <p className="mb-4 rounded-lg bg-due-soft p-3 text-sm text-due" role="status">
          {overdueScheduled.length} scheduled item{overdueScheduled.length === 1 ? ' has' : 's have'} passed. Update the status to Completed, Passed or Rejected.
        </p>
      )}
      <div className="mb-4">
        <Segmented
          label="Show"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'followup', label: 'Follow-ups due' },
            { value: 'past', label: 'Past' },
            { value: 'all', label: 'All' }
          ]}
        />
      </div>
      {all.length === 0 ? (
        <EmptyState title="Nothing tracked yet" action={<Button variant="primary" onClick={() => setEditing(blank())}>Add interview or test</Button>}>
          Add an online assessment, a technical round or a recruiter call. Times are stored in the invite’s own timezone and shown in yours.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title={tab === 'followup' ? 'No follow-ups due' : 'Nothing here'}>Switch tabs to see other items.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ a, at }) => {
            const done = a.checklist.filter((c) => c.done).length;
            const related = tasks.filter((t) => a.relatedTaskIds.includes(t.id));
            return (
              <li key={a.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{[a.company, a.title].filter(Boolean).join(' — ')}</p>
                    <p className="text-sm text-muted">
                      {at ? formatInstant(at, settings.timezone, true) : 'Date not set'}
                      {at && a.timezone !== settings.timezone && ` (${formatInstant(at, a.timezone, true)} in invite timezone)`}
                      {a.durationMin ? ` · ${a.durationMin} min` : ''}
                      {a.stage ? ` · ${a.stage}` : ''}
                      {a.platform ? ` · ${a.platform}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.followUpOn && a.followUpOn <= today && !['Passed', 'Rejected', 'Cancelled'].includes(a.status) && <Badge tone="due">Follow up {formatDate(a.followUpOn)}</Badge>}
                    <Badge tone={tone(a.status)}>{a.status}</Badge>
                  </div>
                </div>
                {(a.checklist.length > 0 || related.length > 0 || a.result) && (
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    {a.checklist.length > 0 && (
                      <span>
                        Prep {done}/{a.checklist.length}
                      </span>
                    )}
                    {related.length > 0 && <span>{related.filter((t) => t.status === 'Done').length}/{related.length} related tasks done</span>}
                    {a.result && <span>Result: {a.result}</span>}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.link && (
                    <ExternalLink href={a.link} className="mr-auto self-center text-sm">
                      Open assessment link
                    </ExternalLink>
                  )}
                  {at && (
                    <Button size="sm" variant="ghost" onClick={() => downloadText(`${(a.company || 'assessment').replace(/[^\w-]+/g, '-')}.ics`, buildCalendar([a]), 'text/calendar')}>
                      Add to calendar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(a)}>
                    Delete
                  </Button>
                  <Button size="sm" onClick={() => setEditing({ ...a })}>
                    Edit
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit' : 'Add interview or test'} wide>
        {editing && <AssessmentForm key={editing.id ?? 'new'} initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Confirm
        open={!!deleting}
        title="Delete this item?"
        body={<>“{[deleting?.company, deleting?.title].filter(Boolean).join(' — ')}” and its notes will be removed.</>}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await repo.remove('assessments', deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
