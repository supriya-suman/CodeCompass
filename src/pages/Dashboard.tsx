import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData, useToday } from '../app/data';
import { BearingDial, WeekColumns } from '../components/charts';
import { Badge, Button, EmptyState, Explain, Panel } from '../components/ui';
import { describeEvent, githubCacheKey, type GithubSnapshot } from '../lib/github';
import { revisionQueue } from '../lib/revision';
import { codingStreak, CODING_CATEGORIES, goalProgress, solvedSummary, STUDY_CATEGORIES, topicCoverage, weekDays } from '../lib/stats';
import { DSA_TOPICS } from '../lib/starter';
import { addDays, dateInTz, formatDate, formatInstant, formatMinutes, weekStart } from '../lib/time';
import { assessmentInstant } from '../lib/assessments';
import { ActivityPreview } from '../components/ActivityPreview';

function ActionRow({ to, label, detail, tone }: { to: string; label: string; detail?: string; tone?: 'due' | 'accent' }) {
  return (
    <li>
      <Link to={to} className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 hover:bg-sunken">
        <span className={tone === 'due' ? 'h-2 w-2 shrink-0 rounded-full bg-due' : 'h-2 w-2 shrink-0 rounded-full bg-accent'} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{label}</span>
          {detail && <span className="block truncate text-sm text-muted">{detail}</span>}
        </span>
      </Link>
    </li>
  );
}

export default function Dashboard() {
  const { db, settings, mode, setMode } = useData();
  const tz = settings.timezone;
  const today = useToday();
  const from = weekStart(today);
  const to = addDays(from, 6);

  const data = useLiveQuery(async () => {
    const [questions, entries, tasks, goals, assessments, timer, gh] = await Promise.all([
      db.questions.toArray(),
      db.timeEntries.where('start').above(addDays(from, -60)).toArray(),
      db.tasks.toArray(),
      db.goals.filter((g) => !g.archived).toArray(),
      db.assessments.toArray(),
      db.activeTimer.get('active'),
      db.profiles.where('platform').equals('GitHub').first()
    ]);
    const ghCache = gh ? await db.integrationCache.get(githubCacheKey(gh.username)) : undefined;
    return { questions, entries, tasks, goals, assessments, timer, gh, ghCache };
  }, [db, from]);

  const derived = useMemo(() => {
    if (!data) return null;
    const { questions, entries, tasks, assessments } = data;
    const weekEntries = entries.filter((e) => {
      const d = dateInTz(e.start, tz);
      return d >= from && d <= to;
    });
    const weekTotal = weekEntries.reduce((a, e) => a + e.durationMin, 0);
    const coding = weekEntries.filter((e) => CODING_CATEGORIES.includes(e.category)).reduce((a, e) => a + e.durationMin, 0);
    const study = weekEntries.filter((e) => STUDY_CATEGORIES.includes(e.category)).reduce((a, e) => a + e.durationMin, 0);
    const target = Object.values(settings.weeklyTargetsMin).reduce((a, b) => a + (b ?? 0), 0);
    const days = weekDays(from).map((d) => {
      const dayE = weekEntries.filter((e) => dateInTz(e.start, tz) === d);
      return {
        date: d,
        label: new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
        coding: dayE.filter((e) => CODING_CATEGORIES.includes(e.category)).reduce((a, e) => a + e.durationMin, 0),
        study: dayE.filter((e) => STUDY_CATEGORIES.includes(e.category)).reduce((a, e) => a + e.durationMin, 0)
      };
    });
    const now = Date.now();
    const upcoming = assessments
      .map((a) => ({ a, at: assessmentInstant(a) }))
      .filter((r) => ['Planned', 'Applied', 'Scheduled'].includes(r.a.status) && r.at && r.at.getTime() >= now)
      .sort((x, y) => x.at!.getTime() - y.at!.getTime());
    const followUps = assessments.filter((a) => a.followUpOn && a.followUpOn <= today && !['Passed', 'Rejected', 'Cancelled'].includes(a.status));
    const dueTasks = tasks.filter((t) => t.status !== 'Done' && t.dueOn && t.dueOn <= today).sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : 1));
    return {
      weekTotal,
      coding,
      study,
      target,
      days,
      upcoming,
      followUps,
      dueTasks,
      revision: revisionQueue(questions, today),
      solved: solvedSummary(questions, from, today),
      coverage: topicCoverage(questions, DSA_TOPICS),
      streak: codingStreak(questions, entries, today, tz)
    };
  }, [data, from, to, today, tz, settings.weeklyTargetsMin]);

  if (!data || !derived) return <p className="text-muted">Loading overview…</p>;
  const isEmpty = !data.questions.length && !data.entries.length && !data.tasks.length && !data.assessments.length;
  const greeting = new Intl.DateTimeFormat('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  if (isEmpty) {
    return (
      <>
        <h1 className="text-2xl font-semibold sm:text-[28px]">{settings.displayName ? `Welcome, ${settings.displayName}` : 'Welcome to CodeCompass'}</h1>
        <p className="mt-1 text-muted">{greeting}</p>
        <div className="mt-8">
          <EmptyState
            title="Set your first bearing"
            action={
              <>
                <Link to="/questions" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-medium text-accent-ink">
                  Log a question
                </Link>
                <Link to="/learning" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 font-medium">
                  Create a learning goal
                </Link>
                {mode === 'real' && <Button onClick={() => setMode('demo')}>Explore demo data</Button>}
              </>
            }
          >
            Everything on this page is calculated from what you record. Log a solved problem, time a study session, or add an upcoming interview to begin.
          </EmptyState>
        </div>
      </>
    );
  }

  const ratio = derived.target ? Math.round((derived.weekTotal / derived.target) * 100) : null;
  const gh = data.ghCache?.data as GithubSnapshot | null | undefined;

  return (
    <>
      <p className="text-sm text-muted">{greeting}</p>
      <h1 className="text-2xl font-semibold sm:text-[28px]">{settings.displayName ? `Good to see you, ${settings.displayName}` : 'Your week so far'}</h1>

      <section aria-label="This week" className="mt-6 flex flex-col gap-6 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
        <BearingDial actual={derived.weekTotal} target={derived.target} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-3xl font-semibold tabular">
            {formatMinutes(derived.weekTotal)}
            {derived.target > 0 && <span className="text-lg font-medium text-muted"> of {formatMinutes(derived.target)} planned</span>}
          </p>
          <p className="mt-1 text-muted">
            {ratio !== null ? `${ratio}% of this week’s target` : 'No weekly targets set'} · {formatMinutes(derived.coding)} coding · {formatMinutes(derived.study)} study ·{' '}
            {derived.streak > 0 ? `${derived.streak}-day coding streak` : 'no active streak'}
          </p>
          <div className="mt-4 max-w-md">
            <WeekColumns days={derived.days} caption="Coding and study minutes per day this week" />
          </div>
        </div>
      </section>

      <ActivityPreview />

      <div className="mt-6 grid gap-6 [&>*]:min-w-0 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Next actions">
          <ul className="-mx-3 flex flex-col">
            {data.timer && <ActionRow to="/time" label={`Timer ${data.timer.runningSince ? 'running' : 'paused'}: ${data.timer.category}`} detail="Stop it when you finish to save the session" />}
            {derived.revision.length > 0 && (
              <ActionRow to="/revision" tone="due" label={`${derived.revision.length} question${derived.revision.length === 1 ? '' : 's'} to revise`} detail={derived.revision.slice(0, 3).map((q) => q.title).join(', ')} />
            )}
            {derived.dueTasks.slice(0, 4).map((t) => (
              <ActionRow key={t.id} to="/learning" tone={t.dueOn! < today ? 'due' : 'accent'} label={t.title} detail={t.dueOn! < today ? `Overdue since ${formatDate(t.dueOn)}` : 'Due today'} />
            ))}
            {derived.upcoming
              .filter((r) => r.at!.getTime() - Date.now() < 7 * 86400000)
              .map((r) => (
                <ActionRow key={r.a.id} to="/assessments" label={`Prepare: ${[r.a.company, r.a.title].filter(Boolean).join(' — ')}`} detail={`${formatInstant(r.at!, tz)} · prep ${r.a.checklist.filter((c) => c.done).length}/${r.a.checklist.length}`} />
              ))}
            {derived.followUps.map((a) => (
              <ActionRow key={a.id} to="/assessments" tone="due" label={`Follow up with ${a.company || a.title}`} detail={`Planned for ${formatDate(a.followUpOn)}`} />
            ))}
          </ul>
          {!data.timer && !derived.revision.length && !derived.dueTasks.length && !derived.followUps.length && !derived.upcoming.length && (
            <p className="text-sm text-muted">Nothing due today. Pick a task from your learning plan or start a timed session.</p>
          )}
        </Panel>

        <Panel title="Problem solving" action={<Link to="/questions" className="text-sm text-accent underline">All questions</Link>}>
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-muted">Solved</dt>
              <dd className="font-display text-2xl font-semibold tabular">{derived.solved.total}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">This week</dt>
              <dd className="font-display text-2xl font-semibold tabular">{derived.solved.thisWeek}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Topics covered</dt>
              <dd className="font-display text-2xl font-semibold tabular">
                {derived.coverage.covered}
                <span className="text-base text-muted">/{derived.coverage.total}</span>
              </dd>
            </div>
          </dl>
          <p className="mt-3 flex flex-wrap gap-2 text-sm">
            <Badge tone="ok">Easy {derived.solved.byDifficulty.Easy}</Badge>
            <Badge tone="accent">Medium {derived.solved.byDifficulty.Medium}</Badge>
            <Badge tone="danger">Hard {derived.solved.byDifficulty.Hard}</Badge>
          </p>
          <Explain summary="How are these calculated?">
            <p>
              Solved counts unique problems with status Solved or Needs Revision. The same problem logged twice (same link, or same platform and title) counts once
              {derived.solved.duplicatesIgnored ? ` — ${derived.solved.duplicatesIgnored} duplicate ignored` : ''}. “This week” uses the solved date, Monday to Sunday in {tz}.
            </p>
            <p className="mt-2">
              The coding streak counts consecutive days with a solved problem or at least one minute of coding, contest or assessment time. Today only extends it; an empty today doesn’t break it until tomorrow.
            </p>
            <p className="mt-2">The dial shows this week’s logged time against the sum of your weekly targets in Settings.</p>
          </Explain>
        </Panel>

        <Panel title="Upcoming interviews & tests" action={<Link to="/assessments" className="text-sm text-accent underline">Manage</Link>}>
          {derived.upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nothing scheduled.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {derived.upcoming.slice(0, 5).map((r) => (
                <li key={r.a.id} className="flex justify-between gap-3">
                  <span className="truncate font-medium">{[r.a.company, r.a.title].filter(Boolean).join(' — ')}</span>
                  <span className="shrink-0 text-muted">{formatInstant(r.at!, tz)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Learning goals" action={<Link to="/learning" className="text-sm text-accent underline">Open plans</Link>}>
          {data.goals.length === 0 ? (
            <p className="text-sm text-muted">No active goals.</p>
          ) : (
            <ul className="space-y-3">
              {data.goals.slice(0, 5).map((g) => {
                const p = goalProgress(data.tasks.filter((t) => t.goalId === g.id));
                return (
                  <li key={g.id}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{g.title}</span>
                      <span className="tabular shrink-0 text-muted">
                        {p.done}/{p.total}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-sunken" role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.title} progress`}>
                      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${p.percent}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="GitHub activity" action={<Link to="/profiles" className="text-sm text-accent underline">{data.gh ? 'Refresh' : 'Connect'}</Link>}>
          {!data.gh ? (
            <p className="text-sm text-muted">Add your GitHub username in Coding profiles to see recent public activity here.</p>
          ) : !gh ? (
            <p className="text-sm text-muted">Not fetched yet. Open Coding profiles and fetch public data.</p>
          ) : gh.events.length === 0 ? (
            <p className="text-sm text-muted">No recent public activity for {gh.user.login}.</p>
          ) : (
            <>
              <ul className="space-y-1.5 text-sm">
                {gh.events.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="truncate">
                      {describeEvent(e)} · {e.repo.name}
                    </span>
                    <span className="shrink-0 text-muted">{formatDate(dateInTz(e.created_at, tz))}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">From GitHub, fetched {formatInstant(data.ghCache!.fetchedAt, tz)}.</p>
            </>
          )}
        </Panel>

        <Panel title="Contests & events">
          <p className="text-sm text-muted">
            Saved contests, events and application deadlines will appear here once the Discover area is built in the next phase. Until then, track dated items in{' '}
            <Link to="/assessments" className="text-accent underline">
              Interviews & tests
            </Link>
            .
          </p>
        </Panel>
      </div>
    </>
  );
}
