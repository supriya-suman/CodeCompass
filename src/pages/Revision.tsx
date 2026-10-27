import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { useData, useToday } from '../app/data';
import { Badge, Button, EmptyState, ExternalLink, Explain, PageHeader, Panel } from '../components/ui';
import { applyRevision, revisionQueue, sanitizeIntervals, type RevisionOutcome } from '../lib/revision';
import { addDays, diffDays, formatDate } from '../lib/time';
import type { Question } from '../lib/types';

export default function Revision() {
  const { db, repo, settings } = useData();
  const today = useToday();
  const all = useLiveQuery(() => db.questions.where('nextRevisionOn').belowOrEqual(addDays(today, 7)).toArray(), [db, today]);
  const intervals = sanitizeIntervals(settings.revisionIntervals);

  if (!all) return <p className="text-muted">Loading revision queue…</p>;
  const due = revisionQueue(all, today);
  const soon = all.filter((q) => q.nextRevisionOn! > today && q.status !== 'Not Started').sort((a, b) => (a.nextRevisionOn! < b.nextRevisionOn! ? -1 : 1));

  async function mark(q: Question, outcome: RevisionOutcome) {
    await repo.update<Question>('questions', q.id, applyRevision(q, outcome, today, intervals));
  }

  return (
    <>
      <PageHeader
        title="Revision"
        description={`Problems come back after ${intervals.join(', ')} days. Change the intervals in Settings.`}
        actions={
          <Link to="/settings#revision" className="text-sm font-semibold text-accent underline">
            Edit intervals
          </Link>
        }
      />
      <div className="grid gap-6 [&>*]:min-w-0 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="due-h">
          <h2 id="due-h" className="mb-3 text-lg font-semibold">
            Due now <span className="tabular text-muted">({due.length})</span>
          </h2>
          {due.length === 0 ? (
            <EmptyState title="Nothing to revise today">
              Solved questions are scheduled automatically.{' '}
              <Link to="/questions" className="text-accent underline">
                Log a question
              </Link>{' '}
              to start the cycle.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {due.map((q) => {
                const late = diffDays(today, q.nextRevisionOn!);
                return (
                  <li key={q.id} className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{q.title}</p>
                        <p className="text-sm text-muted">
                          {[q.platform, q.topic, q.difficulty].filter(Boolean).join(' · ')} · stage {q.revisionStage + 1} of {intervals.length}
                        </p>
                      </div>
                      <Badge tone={late > 0 ? 'due' : 'accent'}>{late > 0 ? `${late} day${late === 1 ? '' : 's'} overdue` : 'Due today'}</Badge>
                    </div>
                    {q.mistakes && <p className="mt-2 rounded-lg bg-sunken p-2 text-sm">Last time: {q.mistakes}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {q.url && (
                        <ExternalLink href={q.url} className="mr-auto text-sm">
                          Open problem
                        </ExternalLink>
                      )}
                      <Button size="sm" onClick={() => mark(q, 'forgot')}>
                        Forgot it
                      </Button>
                      <Button size="sm" onClick={() => mark(q, 'shaky')}>
                        Shaky
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => mark(q, 'confident')}>
                        Solved confidently
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <Panel title="Coming up this week">
          {soon.length === 0 ? (
            <p className="text-sm text-muted">No revisions scheduled in the next 7 days.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {soon.map((q) => (
                <li key={q.id} className="flex justify-between gap-3">
                  <span className="truncate">{q.title}</span>
                  <span className="shrink-0 text-muted">{formatDate(q.nextRevisionOn)}</span>
                </li>
              ))}
            </ul>
          )}
          <Explain summary="How scheduling works">
            Solved confidently moves to the next interval. Shaky repeats the current interval. Forgot it restarts at {intervals[0]} day{intervals[0] === 1 ? '' : 's'} and marks the question Needs Revision. After the last stage, it keeps coming back every {intervals.at(-1)} days.
          </Explain>
        </Panel>
      </div>
    </>
  );
}
