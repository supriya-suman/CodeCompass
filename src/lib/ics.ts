import { zonedToUtc } from './time';
import type { Assessment } from './types';

// Minimal RFC 5545 calendar export. Times are written in UTC (Z) so every
// calendar app places them correctly regardless of its own timezone.

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Fold lines longer than 75 octets as required by RFC 5545. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ' ' + rest.slice(74);
  }
  out.push(rest);
  return out.join('\r\n');
}

export function assessmentToEvent(a: Assessment, now: Date = new Date()): string[] | null {
  if (!a.scheduledLocal) return null;
  const start = zonedToUtc(a.scheduledLocal, a.timezone);
  const end = new Date(start.getTime() + Math.max(15, a.durationMin || 60) * 60000);
  const summary = [a.company, a.title].filter(Boolean).join(' — ');
  const desc = [a.stage && `Stage: ${a.stage}`, a.platform && `Platform: ${a.platform}`, a.link && `Link: ${a.link}`]
    .filter(Boolean)
    .join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:${a.id}@codecompass.local`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(summary || 'Assessment')}`,
    ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
    ...(/^https?:\/\//i.test(a.link) ? [`URL:${a.link}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT30M',
    `DESCRIPTION:${esc(summary || 'Assessment')}`,
    'END:VALARM',
    'END:VEVENT'
  ];
}

export function buildCalendar(items: Assessment[], now: Date = new Date()): string {
  const events = items.flatMap((a) => assessmentToEvent(a, now) ?? []);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CodeCompass//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR']
    .map(fold)
    .join('\r\n');
}
