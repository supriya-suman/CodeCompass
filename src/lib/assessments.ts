import { isValidTimeZone, zonedToUtc } from './time';
import type { Assessment } from './types';

/** UTC instant of an assessment, or null when unscheduled or invalid. */
export function assessmentInstant(a: Pick<Assessment, 'scheduledLocal' | 'timezone'>): Date | null {
  if (!a.scheduledLocal || !isValidTimeZone(a.timezone)) return null;
  try {
    return zonedToUtc(a.scheduledLocal, a.timezone);
  } catch {
    return null;
  }
}
