import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useData, useToday } from '../app/data';
import { Badge, Button, Confirm, EmptyState, ExternalLink, Explain, Field, Input, Modal, PageHeader, Select, Segmented, Textarea, cx } from '../components/ui';
import { newId, nowIso } from '../lib/id';
import { goalProgress } from '../lib/stats';
import { STARTER_PLANS } from '../lib/starter';
import { formatDate, formatMinutes } from '../lib/time';
import { LEARNING_CATEGORIES, TASK_STATUSES, type LearningCategory, type LearningGoal, type LearningTask, type TaskStatus } from '../lib/types';

function GoalForm({ goal, onDone }: { goal: Partial<LearningGoal>; onDone: () => void }) {
  const { db, repo } = useData();
  const [d, setD] = useState({ title: '', category: 'DSA' as LearningCategory, description: '', targetDate: null as string | null, ...goal });
  const [useStarter, setUseStarter] = useState(!goal.id);
  const starter = STARTER_PLANS[d.category];

  async function save() {
    if (!d.title.trim() && !useStarter) return;
    if (goal.id) {
      await repo.update<LearningGoal>('goals', goal.id, { title: d.title.trim(), category: d.category, description: d.description, targetDate: d.targetDate });
      return onDone();
    }
    const created = await repo.create<LearningGoal>('goals', {
      title: d.title.trim() || starter.title,
      category: d.category,
      description: d.description || (useStarter ? starter.description : ''),
      targetDate: d.targetDate,
      archived: false
    });
    if (useStarter) {
      const now = nowIso();
      await db.tasks.bulkAdd(
        starter.tasks.map((t, i) => ({
          id: newId(),
          createdAt: now,
          updatedAt: now,
          goalId: created.id,
          title: t.title,
          status: 'To do' as TaskStatus,
          isMilestone: !!t.isMilestone,
          dueOn: null,
          plannedMin: t.plannedMin,
          resourceUrl: t.resourceUrl ?? '',
          completionNotes: '',
          completedOn: null,
          order: i
        }))
      );
    }
    onDone();
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Area">
        {(id) => (
          <Select id={id} value={d.category} onChange={(e) => setD({ ...d, category: e.target.value as LearningCategory })}>
            {LEARNING_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        )}
      </Field>
      {!goal.id && (
        <label className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={useStarter} onChange={(e) => setUseStarter(e.target.checked)} />
          <span>
            <span className="font-medium">Start from the suggested plan</span>
            <span className="block text-muted">
              “{starter.title}” — {starter.tasks.length} tasks you can edit or remove.
            </span>
          </span>
        </label>
      )}
      <Field label="Goal title" hint={useStarter && !goal.id ? 'Leave blank to use the suggested title.' : undefined}>
        {(id) => <Input id={id} value={d.title} required={!useStarter || !!goal.id} onChange={(e) => setD({ ...d, title: e.target.value })} />}
      </Field>
      <Field label="Description">{(id) => <Textarea id={id} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />}</Field>
      <Field label="Target date">{(id) => <Input id={id} type="date" value={d.targetDate ?? ''} onChange={(e) => setD({ ...d, targetDate: e.target.value || null })} />}</Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary">
          {goal.id ? 'Save goal' : 'Create goal'}
        </Button>
      </div>
    </form>
  );
}

function TaskForm({ task, onDone }: { task: Partial<LearningTask> & { goalId: string }; onDone: () => void }) {
  const { repo } = useData();
  const today = useToday();
  const [d, setD] = useState({ title: '', status: 'To do' as TaskStatus, isMilestone: false, dueOn: null as string | null, plannedMin: 60, resourceUrl: '', completionNotes: '', ...task });
  const [error, setError] = useState('');
  async function save() {
    if (!d.title.trim()) return setError('Add a task title.');
    if (d.resourceUrl && !/^https?:\/\//i.test(d.resourceUrl)) return setError('Resource link must start with https://');
    const completedOn = d.status === 'Done' ? (task.completedOn ?? today) : null;
    const data = { goalId: d.goalId, title: d.title.trim(), status: d.status, isMilestone: d.isMilestone, dueOn: d.dueOn, plannedMin: d.plannedMin, resourceUrl: d.resourceUrl.trim(), completionNotes: d.completionNotes, completedOn };
    if (task.id) await repo.update<LearningTask>('tasks', task.id, data);
    else await repo.create<LearningTask>('tasks', { ...data, order: Date.now() });
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
      <Field label="Task" className="sm:col-span-2" error={error || undefined}>
        {(id) => <Input id={id} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} autoFocus />}
      </Field>
      <Field label="Status">
        {(id) => (
          <Select id={id} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as TaskStatus })}>
            {TASK_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Due">{(id) => <Input id={id} type="date" value={d.dueOn ?? ''} onChange={(e) => setD({ ...d, dueOn: e.target.value || null })} />}</Field>
      <Field label="Planned minutes">{(id) => <Input id={id} type="number" min={0} value={d.plannedMin || ''} onChange={(e) => setD({ ...d, plannedMin: Math.max(0, Number(e.target.value) || 0) })} />}</Field>
      <label className="flex items-center gap-2 self-end pb-3 text-sm">
        <input type="checkbox" checked={d.isMilestone} onChange={(e) => setD({ ...d, isMilestone: e.target.checked })} /> This is a milestone
      </label>
      <Field label="Resource link" className="sm:col-span-2">{(id) => <Input id={id} type="url" placeholder="https://" value={d.resourceUrl} onChange={(e) => setD({ ...d, resourceUrl: e.target.value })} />}</Field>
      <Field label="Completion notes" className="sm:col-span-2">{(id) => <Textarea id={id} value={d.completionNotes} onChange={(e) => setD({ ...d, completionNotes: e.target.value })} />}</Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary">
          {task.id ? 'Save task' : 'Add task'}
        </Button>
      </div>
    </form>
  );
}

function TaskRow({ t, actual, onEdit, onStatus, today }: { t: LearningTask; actual: number; onEdit: () => void; onStatus: (s: TaskStatus) => void; today: string }) {
  const overdue = t.status !== 'Done' && t.dueOn && t.dueOn < today;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:items-center">
      <input
        type="checkbox"
        aria-label={`Mark “${t.title}” done`}
        checked={t.status === 'Done'}
        onChange={(e) => onStatus(e.target.checked ? 'Done' : 'To do')}
        className="h-5 w-5 shrink-0 accent-[var(--accent)]"
      />
      <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
        <p className={cx('font-medium', t.status === 'Done' && 'text-muted line-through')}>
          {t.isMilestone && <span className="mr-1.5 text-accent">◆</span>}
          {t.title}
        </p>
        <p className="text-sm text-muted">
          {formatMinutes(actual)} of {formatMinutes(t.plannedMin)} planned
          {t.dueOn ? ` · due ${formatDate(t.dueOn)}` : ''}
        </p>
      </button>
      <div className="flex items-center gap-2">
        {overdue && <Badge tone="due">Overdue</Badge>}
        {t.resourceUrl && (
          <ExternalLink href={t.resourceUrl} className="text-sm">
            Resource
          </ExternalLink>
        )}
        <Select aria-label="Task status" value={t.status} onChange={(e) => onStatus(e.target.value as TaskStatus)} className="min-h-9 w-28 text-sm">
          {TASK_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}

export default function Learning() {
  const { db, repo } = useData();
  const today = useToday();
  const goals = useLiveQuery(() => db.goals.toArray(), [db]);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [db]);
  const linked = useLiveQuery(async () => (await db.timeEntries.toArray()).filter((e) => e.link?.kind === 'learningTask'), [db]);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [goalForm, setGoalForm] = useState<Partial<LearningGoal> | null>(null);
  const [taskForm, setTaskForm] = useState<(Partial<LearningTask> & { goalId: string }) | null>(null);
  const [deleting, setDeleting] = useState<LearningGoal | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [deletingTask, setDeletingTask] = useState<LearningTask | null>(null);

  const actualByTask = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of linked ?? []) m.set(e.link!.id, (m.get(e.link!.id) ?? 0) + e.durationMin);
    return m;
  }, [linked]);

  if (!goals || !tasks) return <p className="text-muted">Loading learning plans…</p>;
  const visible = goals.filter((g) => showArchived || !g.archived);
  const setStatus = (t: LearningTask, s: TaskStatus) => repo.update<LearningTask>('tasks', t.id, { status: s, completedOn: s === 'Done' ? (t.completedOn ?? today) : null });

  return (
    <>
      <PageHeader
        title="Learning"
        description="Goals broken into study tasks and milestones, with planned versus actual time."
        actions={
          <>
            <Segmented label="View" value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }]} />
            <Button variant="primary" onClick={() => setGoalForm({})}>
              New goal
            </Button>
          </>
        }
      />
      {visible.length === 0 ? (
        <EmptyState title="No learning goals yet" action={<Button variant="primary" onClick={() => setGoalForm({})}>Create a goal</Button>}>
          Pick an area such as React and Next.js or DSA. You can start from a suggested plan and edit it.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {visible.map((g) => {
            const gt = tasks.filter((t) => t.goalId === g.id).sort((a, b) => a.order - b.order);
            const p = goalProgress(gt);
            const planned = gt.reduce((a, t) => a + t.plannedMin, 0);
            const actual = gt.reduce((a, t) => a + (actualByTask.get(t.id) ?? 0), 0);
            return (
              <section key={g.id} aria-labelledby={`g-${g.id}`} className={cx(g.archived && 'opacity-60')}>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-muted">{g.category}</p>
                    <h2 id={`g-${g.id}`} className="text-xl font-semibold">
                      {g.title}
                    </h2>
                    {g.description && <p className="mt-1 max-w-2xl text-sm text-muted">{g.description}</p>}
                    <p className="mt-2 text-sm">
                      <span className="font-semibold tabular">{p.percent}%</span> done ({p.done} of {p.total}) · {formatMinutes(actual)} of {formatMinutes(planned)} planned
                      {g.targetDate ? ` · target ${formatDate(g.targetDate)}` : ''}
                    </p>
                    <div className="mt-2 h-1.5 max-w-md rounded-full bg-sunken" aria-hidden="true">
                      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${p.percent}%` }} />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <Button size="sm" onClick={() => setTaskForm({ goalId: g.id })}>
                      Add task
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setGoalForm(g)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => repo.update<LearningGoal>('goals', g.id, { archived: !g.archived })}>
                      {g.archived ? 'Restore' : 'Archive'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(g)}>
                      Delete
                    </Button>
                  </div>
                </div>
                {gt.length === 0 ? (
                  <p className="text-sm text-muted">No tasks yet. Add the first step toward this goal.</p>
                ) : view === 'list' ? (
                  <div className="flex flex-col gap-2">
                    {gt.map((t) => (
                      <TaskRow key={t.id} t={t} today={today} actual={actualByTask.get(t.id) ?? 0} onEdit={() => setTaskForm(t)} onStatus={(s) => setStatus(t, s)} />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    {TASK_STATUSES.map((s) => (
                      <div key={s} className="rounded-xl bg-sunken p-3">
                        <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
                          {s} <span className="tabular text-muted">{gt.filter((t) => t.status === s).length}</span>
                        </h3>
                        <div className="flex flex-col gap-2">
                          {gt
                            .filter((t) => t.status === s)
                            .map((t) => (
                              <div key={t.id} className="rounded-lg border border-line bg-surface p-3">
                                <button className="text-left text-sm font-medium" onClick={() => setTaskForm(t)}>
                                  {t.isMilestone && <span className="mr-1 text-accent">◆</span>}
                                  {t.title}
                                </button>
                                <div className="mt-2 flex gap-1">
                                  {TASK_STATUSES.filter((x) => x !== s).map((x) => (
                                    <Button key={x} size="sm" variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => setStatus(t, x)}>
                                      Move to {x}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {goals.some((g) => g.archived) && (
        <label className="mt-6 flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived goals
        </label>
      )}
      <Explain summary="How are completion and actual time calculated?">
        Completion is done tasks divided by all tasks in the goal; milestones count as tasks. Actual time adds up time entries linked to each task on the Time page. Start the timer with a task linked to track it.
      </Explain>
      <Modal open={!!goalForm} onClose={() => setGoalForm(null)} title={goalForm?.id ? 'Edit goal' : 'New learning goal'}>
        {goalForm && <GoalForm goal={goalForm} onDone={() => setGoalForm(null)} />}
      </Modal>
      <Modal
        open={!!taskForm}
        onClose={() => setTaskForm(null)}
        title={taskForm?.id ? 'Edit task' : 'Add task'}
        footer={
          taskForm?.id && (
            <Button
              variant="danger"
              onClick={() => {
                setDeletingTask(taskForm as LearningTask);
                setTaskForm(null);
              }}
            >
              Delete task
            </Button>
          )
        }
      >
        {taskForm && <TaskForm key={taskForm.id ?? 'new'} task={taskForm} onDone={() => setTaskForm(null)} />}
      </Modal>
      <Confirm
        open={!!deletingTask}
        title="Delete this task?"
        body={<>“{deletingTask?.title}” will be removed. Linked time entries stay.</>}
        confirmLabel="Delete task"
        onCancel={() => setDeletingTask(null)}
        onConfirm={async () => {
          if (deletingTask) await repo.remove('tasks', deletingTask.id);
          setDeletingTask(null);
        }}
      />
      <Confirm
        open={!!deleting}
        title="Delete this goal?"
        body={<>“{deleting?.title}” and all of its tasks will be removed. Time entries stay. Archive it instead if you might want it later.</>}
        confirmLabel="Delete goal and tasks"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) {
            await db.transaction('rw', db.goals, db.tasks, async () => {
              await db.tasks.where('goalId').equals(deleting.id).delete();
              await db.goals.delete(deleting.id);
            });
          }
          setDeleting(null);
        }}
      />
    </>
  );
}
