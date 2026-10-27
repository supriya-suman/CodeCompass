import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { buildEngagement, type EngagementFilter } from '../lib/engagement';
import { githubCacheKey, type GithubSnapshot } from '../lib/github';
import { addDays } from '../lib/time';
import { useData } from './data';

/** Loads everything the activity map needs for [from, to] and builds the days. */
export function useEngagement(from: string, to: string, filter: EngagementFilter) {
  const { db, settings } = useData();
  const raw = useLiveQuery(async () => {
    const [questions, entries, tasks, appUsage, gh] = await Promise.all([
      db.questions.toArray(),
      db.timeEntries.where('start').between(addDays(from, -1), addDays(to, 1) + 'T23:59:59').toArray(),
      db.tasks.where('status').equals('Done').toArray(),
      db.appUsage.where('id').between(from, to + '￿').toArray(),
      db.profiles.where('platform').equals('GitHub').toArray()
    ]);
    const githubEventDates: string[] = [];
    for (const p of gh) {
      const c = await db.integrationCache.get(githubCacheKey(p.username));
      for (const e of (c?.data as GithubSnapshot | null)?.events ?? []) githubEventDates.push(e.created_at);
    }
    return { questions, entries, tasks, appUsage, githubEventDates };
  }, [db, from, to]);
  const days = useMemo(() => (raw ? buildEngagement(raw, from, to, settings.timezone, filter) : null), [raw, from, to, settings.timezone, filter]);
  return { days, raw };
}
