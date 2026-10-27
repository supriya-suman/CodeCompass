import { formatMinutes } from '../lib/time';

/**
 * Horizontal bars with a target tick. Every chart ships its own text
 * equivalent (visually hidden table) so screen readers get the numbers.
 */
export function CategoryBars({ rows, caption }: { rows: { label: string; actual: number; target?: number }[]; caption: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.target ?? 0)));
  return (
    <figure>
      <ul className="flex flex-col gap-3" aria-hidden="true">
        {rows.map((r) => {
          const pct = (r.actual / max) * 100;
          const tpct = r.target ? (r.target / max) * 100 : null;
          return (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{r.label}</span>
                <span className="tabular shrink-0 text-muted">
                  {formatMinutes(r.actual)}
                  {r.target ? ` of ${formatMinutes(r.target)}` : ''}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-sunken">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
                {tpct !== null && <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink/60" style={{ left: `calc(${tpct}% - 1px)` }} />}
              </div>
            </li>
          );
        })}
      </ul>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>Category</th>
            <th>Actual</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{formatMinutes(r.actual)}</td>
              <td>{r.target ? formatMinutes(r.target) : 'none'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Seven-day column strip (Mon–Sun). */
export function WeekColumns({ days, caption }: { days: { date: string; label: string; coding: number; study: number }[]; caption: string }) {
  const max = Math.max(30, ...days.map((d) => d.coding + d.study));
  return (
    <figure>
      <div className="flex h-28 items-end gap-2" aria-hidden="true">
        {days.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full max-w-8 flex-col-reverse overflow-hidden rounded-md bg-sunken" style={{ height: '88px' }}>
              <div className="bg-accent" style={{ height: `${(d.coding / max) * 100}%` }} />
              <div className="bg-accent/40" style={{ height: `${(d.study / max) * 100}%` }} />
            </div>
            <span className="text-[11px] text-muted">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Coding
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent/40" /> Study
        </span>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th>{d.label}</th>
              <td>Coding {formatMinutes(d.coding)}</td>
              <td>Study {formatMinutes(d.study)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/**
 * The bearing dial: progress of this week's logged effort against the total
 * weekly target. 0° is north; the needle points to the current share.
 */
export function BearingDial({ actual, target }: { actual: number; target: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const ratio = target > 0 ? Math.min(1, actual / target) : 0;
  const angle = ratio * 360;
  const ticks = Array.from({ length: 28 }, (_, i) => i);
  return (
    <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label={target ? `${Math.round(ratio * 100)} percent of weekly target logged` : 'No weekly target set'}>
      <g transform="translate(70 70)">
        {ticks.map((i) => {
          const a = (i / 28) * Math.PI * 2;
          const long = i % 7 === 0;
          return (
            <line
              key={i}
              x1={Math.sin(a) * (long ? 62 : 64)}
              y1={-Math.cos(a) * (long ? 62 : 64)}
              x2={Math.sin(a) * 68}
              y2={-Math.cos(a) * 68}
              stroke="var(--line)"
              strokeWidth={long ? 2 : 1}
            />
          );
        })}
        <circle r={r} fill="none" stroke="var(--sunken)" strokeWidth="9" />
        <circle
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          transform="rotate(-90)"
          className="dial-sweep"
        />
        <g transform={`rotate(${angle})`}>
          <path d="M0 -38 L5 0 L0 6 L-5 0 Z" fill="var(--ink)" />
        </g>
        <circle r="3" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
