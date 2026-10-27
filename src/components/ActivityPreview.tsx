import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToday } from '../app/data';
import { useEngagement } from '../app/useEngagement';
import { summarise } from '../lib/engagement';
import { addDays } from '../lib/time';
import { ActivityMap, describeDay, MapLegend } from './ActivityMap';

const ALL = { kind: 'all' } as const;

/** Last ~6 months of the activity map, for the overview. */
export function ActivityPreview() {
  const today = useToday();
  const from = addDays(today, -181);
  const { days } = useEngagement(from, today, ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const summary = useMemo(() => (days ? summarise(days, today) : null), [days, today]);
  if (!days || !summary) return null;
  const sel = selected ? days.find((d) => d.date === selected) : null;
  return (
    <section aria-labelledby="act-h" className="mt-6 rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="act-h" className="text-base font-semibold">
          Activity <span className="font-normal text-muted">· {summary.activeDays} active days in 6 months · {summary.currentStreak}-day streak</span>
        </h2>
        <Link to="/activity" className="text-sm text-accent underline">
          Full year and filters
        </Link>
      </div>
      <ActivityMap days={days} from={from} to={today} color="byArea" selected={selected} onSelect={setSelected} compact />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <MapLegend color="byArea" />
      </div>
      {sel && <p className="mt-2 text-sm">{describeDay(sel)}</p>}
    </section>
  );
}
