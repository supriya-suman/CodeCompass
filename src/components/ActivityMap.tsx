import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { AREA_LABEL, AREAS, level, weekColumns, type Area, type DayEngagement } from '../lib/engagement';
import { addDays, formatDate, formatMinutes } from '../lib/time';

const CELL = 12;
const GAP = 3;
const LEFT = 26;
const TOP = 16;
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

export const areaVar = (a: Area): CSSProperties => ({ ['--cell' as string]: `var(--area-${a})` });

export function describeDay(d: DayEngagement): string {
  if (d.points === 0) return `${formatDate(d.date)}: no recorded activity`;
  const parts = [
    d.minutesLogged && `${formatMinutes(d.minutesLogged)} logged`,
    d.solved && `${d.solved} solved`,
    d.tasksDone && `${d.tasksDone} task${d.tasksDone === 1 ? '' : 's'} done`,
    d.githubEvents && `${d.githubEvents} GitHub event${d.githubEvents === 1 ? '' : 's'}`,
    d.appMinutes && `${formatMinutes(d.appMinutes)} in app`
  ].filter(Boolean);
  return `${formatDate(d.date)}: ${parts.join(', ')}${d.top ? `. Mostly ${AREA_LABEL[d.top]}` : ''}`;
}

/**
 * GitHub-style calendar grid. In "area" colour mode each square takes the
 * hue of that day's main area; with a single colour it shows intensity only.
 * Arrow keys move between days; Enter/Space selects.
 */
export function ActivityMap({
  days,
  from,
  to,
  color,
  selected,
  onSelect,
  compact
}: {
  days: DayEngagement[];
  from: string;
  to: string;
  color: Area | 'byArea';
  selected: string | null;
  onSelect: (date: string) => void;
  compact?: boolean;
}) {
  const cols = useMemo(() => weekColumns(days, from, to), [days, from, to]);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const scroller = useRef<HTMLDivElement>(null);
  const cell = compact ? 10 : CELL;
  const gap = compact ? 2 : GAP;
  const width = LEFT + cols.length * (cell + gap);
  const height = TOP + 7 * (cell + gap);

  // Show the most recent weeks first on narrow screens.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [cols.length]);

  const months = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    let last = '';
    cols.forEach((col, i) => {
      const first = col.find(Boolean);
      if (!first) return;
      const m = first.date.slice(0, 7);
      if (m !== last && Number(first.date.slice(8)) <= 7) {
        out.push({ x: LEFT + i * (cell + gap), label: new Date(first.date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }) });
        last = m;
      }
    });
    return out;
  }, [cols, cell, gap]);

  function onKey(e: React.KeyboardEvent) {
    const step: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7, Home: -10000, End: 10000 };
    if (!(e.key in step)) return;
    e.preventDefault();
    const base = selected ?? to;
    let next = addDays(base, step[e.key]);
    if (next < from) next = from;
    if (next > to) next = to;
    onSelect(next);
  }

  const sel = selected ? byDate.get(selected) : undefined;
  return (
    <div>
      <div ref={scroller} className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
        <svg
          width={width}
          height={height}
          role="grid"
          aria-label="Daily activity. Use arrow keys to move between days."
          tabIndex={0}
          onKeyDown={onKey}
          className="block rounded-md"
        >
          {months.map((m) => (
            <text key={m.x} x={m.x} y={10} fontSize="10" fill="var(--muted)">
              {m.label}
            </text>
          ))}
          {!compact &&
            WEEKDAYS.map((w, i) =>
              w ? (
                <text key={w} x={0} y={TOP + i * (cell + gap) + cell - 2} fontSize="10" fill="var(--muted)">
                  {w}
                </text>
              ) : null
            )}
          {cols.map((col, ci) =>
            col.map((d, ri) => {
              if (!d) return null;
              const lv = level(d.points);
              const hue: Area = color === 'byArea' ? (d.top ?? 'coding') : color;
              const isSel = d.date === selected;
              return (
                <rect
                  key={d.date}
                  x={LEFT + ci * (cell + gap)}
                  y={TOP + ri * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={2.5}
                  className={`amap-${lv} cursor-pointer`}
                  style={areaVar(hue)}
                  stroke={isSel ? 'var(--ink)' : 'none'}
                  strokeWidth={isSel ? 1.5 : 0}
                  onClick={() => onSelect(d.date)}
                  role="gridcell"
                  aria-selected={isSel}
                >
                  <title>{describeDay(d)}</title>
                </rect>
              );
            })
          )}
        </svg>
      </div>
      <p className="sr-only" aria-live="polite">
        {sel ? describeDay(sel) : ''}
      </p>
    </div>
  );
}

export function MapLegend({ color }: { color: Area | 'byArea' }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
      <span className="inline-flex items-center gap-1" aria-label="Intensity scale from less to more">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`amap-swatch-${l} h-2.5 w-2.5 rounded-[3px]`} style={areaVar(color === 'byArea' ? 'coding' : color)} />
        ))}
        More
      </span>
      {color === 'byArea' &&
        AREAS.map((a) => (
          <span key={a} className="inline-flex items-center gap-1.5">
            <span className="amap-swatch-4 h-2.5 w-2.5 rounded-[3px]" style={areaVar(a)} />
            {AREA_LABEL[a]}
          </span>
        ))}
    </div>
  );
}
