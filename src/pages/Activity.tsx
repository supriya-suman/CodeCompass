import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, useToday } from '../app/data';
import { useEngagement } from '../app/useEngagement';
import { ActivityMap, areaVar, MapLegend } from '../components/ActivityMap';
import { Badge, Explain, PageHeader, Panel, cx } from '../components/ui';
import { AREA_LABEL, AREAS, LEVEL_THRESHOLDS, POINTS, summarise, type Area, type EngagementFilter } from '../lib/engagement';
import { addDays, formatDate, formatMinutes } from '../lib/time';
import { PLATFORMS } from '../lib/types';

const WEEKDAY = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const hours = (pts: number) => (pts >= 60 ? `${Math.round(pts / 6) / 10}h` : `${Math.round(pts)}m`);

function Chip({ active, onClick, children, swatch }: { active: boolean; onClick: () => void; children: React.ReactNode; swatch?: Area }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx('inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm', active ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink hover:bg-sunken')}
    >
      {swatch && <span className="amap-swatch-4 h-2.5 w-2.5 rounded-full" style={areaVar(swatch)} />}
      {children}
    </button>
  );
}

export default function Activity() {
  const { settings, mode } = useData();
  const today = useToday();
  const [range, setRange] = useState<string>('last');
  const [filter, setFilter] = useState<EngagementFilter>({ kind: 'all' });
  const [selected, setSelected] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    if (range === 'last') return { from: addDays(today, -364), to: today };
    return { from: `${range}-01-01`, to: range === today.slice(0, 4) ? today : `${range}-12-31` };
  }, [range, today]);

  const { days, raw } = useEngagement(from, to, filter);
  const summary = useMemo(() => (days ? summarise(days, today) : null), [days, today]);
  const years = useMemo(() => {
    const y = Number(today.slice(0, 4));
    return [y, y - 1, y - 2].map(String);
  }, [today]);
  const platformsInUse = useMemo(() => {
    const set = new Set(raw?.questions.map((q) => q.platform) ?? []);
    return PLATFORMS.filter((p) => set.has(p));
  }, [raw]);

  const color: Area | 'byArea' = filter.kind === 'all' ? 'byArea' : filter.kind === 'area' ? filter.area : filter.platform === 'GitHub' ? 'projects' : 'coding';
  const day = selected && days ? days.find((d) => d.date === selected) : null;
  const totalArea = summary ? Object.values(summary.byArea).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHeader
        title="Activity"
        description="Every day as one square: darker means more focus, and the colour shows what you spent the day on."
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Period</span>
            <select value={range} onChange={(e) => { setRange(e.target.value); setSelected(null); }} className="min-h-10 rounded-lg border border-line bg-surface px-2">
              <option value="last">Last 12 months</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" role="group" aria-label="Show activity for">
        <Chip active={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>
          Everything
        </Chip>
        {AREAS.map((a) => (
          <Chip key={a} swatch={a} active={filter.kind === 'area' && filter.area === a} onClick={() => setFilter({ kind: 'area', area: a })}>
            {AREA_LABEL[a]}
          </Chip>
        ))}
        {[...platformsInUse, 'GitHub' as const].map((p) => (
          <Chip key={p} active={filter.kind === 'platform' && filter.platform === p} onClick={() => setFilter({ kind: 'platform', platform: p })}>
            {p}
          </Chip>
        ))}
      </div>

      <Panel>
        {!days || !summary ? (
          <p className="text-muted">Loading activity…</p>
        ) : (
          <>
            <p className="mb-3 text-sm">
              <span className="font-display text-xl font-semibold tabular">{summary.activeDays}</span> active days
              <span className="text-muted"> · {hours(summary.totalPoints)} of focus {range === 'last' ? 'in the last 12 months' : `in ${range}`}</span>
            </p>
            <ActivityMap days={days} from={from} to={to} color={color} selected={selected} onSelect={setSelected} />
            <div className="mt-3">
              <MapLegend color={color} />
            </div>
            {summary.activeDays === 0 && (
              <p className="mt-4 text-sm text-muted">
                Nothing recorded for this view yet. Time a session on the <Link to="/time" className="text-accent underline">Time</Link> page, log a solved problem, or connect GitHub in{' '}
                <Link to="/profiles" className="text-accent underline">Coding profiles</Link>.
              </p>
            )}
          </>
        )}
      </Panel>

      {summary && days && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr] [&>*]:min-w-0">
          <Panel title={day ? formatDate(day.date) : 'Pick a day'}>
            {!day ? (
              <p className="text-sm text-muted">Tap or click a square to see what you did that day.</p>
            ) : day.points === 0 ? (
              <p className="text-sm text-muted">No recorded activity on this day.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <p>
                  <span className="font-display text-2xl font-semibold tabular">{hours(day.points)}</span> <span className="text-muted">of focus</span>
                  {day.top && <Badge className="ml-2">Mostly {AREA_LABEL[day.top]}</Badge>}
                </p>
                <ul className="space-y-1.5">
                  {AREAS.filter((a) => day.byArea[a] > 0).map((a) => (
                    <li key={a} className="flex items-center gap-2">
                      <span className="amap-swatch-4 h-2.5 w-2.5 rounded-full" style={areaVar(a)} />
                      <span className="flex-1">{AREA_LABEL[a]}</span>
                      <span className="tabular text-muted">{hours(day.byArea[a])}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-muted">
                  {[
                    day.minutesLogged && `${formatMinutes(day.minutesLogged)} logged`,
                    day.solved && `${day.solved} problem${day.solved === 1 ? '' : 's'} solved`,
                    day.tasksDone && `${day.tasksDone} learning task${day.tasksDone === 1 ? '' : 's'} done`,
                    day.githubEvents && `${day.githubEvents} GitHub event${day.githubEvents === 1 ? '' : 's'}`,
                    day.appMinutes && `${formatMinutes(day.appMinutes)} in CodeCompass`
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Your rhythm">
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Current streak</dt>
                <dd className="font-display text-2xl font-semibold tabular">{summary.currentStreak}d</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Longest streak</dt>
                <dd className="font-display text-2xl font-semibold tabular">{summary.longestStreak}d</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Best day</dt>
                <dd className="font-medium">{summary.bestDay ? `${hours(summary.bestDay.points)}, ${formatDate(summary.bestDay.date)}` : '—'}</dd>
              </div>
            </dl>
            {summary.busiestWeekday !== null && <p className="mt-3 text-sm text-muted">You do the most on {WEEKDAY[summary.busiestWeekday]}.</p>}
            {totalArea > 0 && filter.kind === 'all' && (
              <div className="mt-4">
                <div className="flex h-3 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                  {AREAS.filter((a) => summary.byArea[a] > 0).map((a) => (
                    <div key={a} className="amap-swatch-4" style={{ ...areaVar(a), width: `${(summary.byArea[a] / totalArea) * 100}%` }} />
                  ))}
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {AREAS.filter((a) => summary.byArea[a] > 0)
                    .sort((a, b) => summary.byArea[b] - summary.byArea[a])
                    .map((a) => (
                      <li key={a} className="flex items-center gap-2">
                        <span className="amap-swatch-4 h-2.5 w-2.5 rounded-full" style={areaVar(a)} />
                        <span className="flex-1">{AREA_LABEL[a]}</span>
                        <span className="tabular text-muted">
                          {Math.round((summary.byArea[a] / totalArea) * 100)}% · {hours(summary.byArea[a])}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>
      )}

      <Explain summary="How is activity measured?">
        <p>Each day adds up “focus minutes”: logged time counts minute for minute, a solved problem counts {POINTS.solved}, a finished learning task {POINTS.taskDone}, each public GitHub event {POINTS.githubEvent}, and active time inside CodeCompass minute for minute.</p>
        <p className="mt-2">
          Shades are fixed so a square always means the same: lightest under {LEVEL_THRESHOLDS[1]} minutes, then up to {LEVEL_THRESHOLDS[2]}, up to {LEVEL_THRESHOLDS[3]}, and darkest above two hours. In “Everything”, the colour is the area that took the most time that day.
        </p>
        <p className="mt-2">
          A platform view (e.g. LeetCode) counts problems solved on it and timer sessions linked to its problems. GitHub shows only your latest public events, which GitHub lists for about the last 90 days.
        </p>
        <p className="mt-2">
          {mode === 'demo'
            ? 'Time in CodeCompass is shown from sample data in demo mode.'
            : settings.trackAppUsage
              ? 'Time in CodeCompass counts only while the app is open, visible and you have interacted in the last two minutes. It stays in your account. Turn it off in Settings.'
              : 'Time in CodeCompass is switched off in Settings.'}{' '}
          A website can’t see time spent in other apps or tabs.
        </p>
      </Explain>
    </>
  );
}
