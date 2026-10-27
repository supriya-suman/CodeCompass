// Timezone-aware date helpers built on Intl only (no date library).
// Calendar dates are 'YYYY-MM-DD' strings interpreted in the user's timezone.

const pad = (n: number) => String(n).padStart(2, '0');

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date of an instant in a timezone. */
export function dateInTz(instant: Date | string, timeZone: string): string {
  const p = parts(new Date(instant), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dateInTz(now, timeZone);
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (IST = +330). */
export function offsetMinutes(timeZone: string, instant: Date): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/**
 * Convert a wall-clock 'YYYY-MM-DDTHH:mm' in `timeZone` to a UTC instant.
 * Two passes handle DST transitions; for a skipped local time the result
 * lands just after the gap, for a repeated one it picks the earlier instant.
 */
export function zonedToUtc(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error(`Invalid local date-time: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let off = offsetMinutes(timeZone, new Date(guess));
  let result = guess - off * 60000;
  const off2 = offsetMinutes(timeZone, new Date(result));
  if (off2 !== off) {
    off = off2;
    result = guess - off * 60000;
  }
  return new Date(result);
}

/** Instant → wall-clock 'YYYY-MM-DDTHH:mm' in a timezone (for <input type=datetime-local>). */
export function utcToZonedLocal(instant: Date | string, timeZone: string): string {
  const p = parts(new Date(instant), timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function diffDays(a: string, b: string): number {
  const toMs = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toMs(a) - toMs(b)) / 86400000);
}

/** Monday of the ISO week containing `date`. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  return addDays(date, -((dow + 6) % 7));
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

export function formatInstant(instant: Date | string, timeZone: string, withZone = false): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    ...(withZone ? { timeZoneName: 'short' } : {})
  }).format(new Date(instant));
}

export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

// Browsers (notably Chrome) still report some legacy ICU names, e.g.
// "Asia/Calcutta". Show the current IANA names instead.
const MODERN_ZONE: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires'
};

/** Timezones for pickers; always includes `ensure` (e.g. the saved value). */
export function listTimeZones(ensure: string[] = []): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  const raw = intl.supportedValuesOf?.('timeZone') ?? [];
  const base = raw.length ? raw : ['UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];
  const set = new Set([...base.map((z) => MODERN_ZONE[z] ?? z), 'Asia/Kolkata', ...ensure.filter(Boolean)]);
  return [...set].sort();
}
