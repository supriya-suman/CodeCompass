import type { CompassDB } from './db';
import { newId, nowIso } from './id';
import type { BaseRecord } from './types';

/**
 * All writes go through this layer. It stamps ids and timestamps so a future
 * sync adapter can be added here (e.g. a change log or remote push) without
 * touching any page component. Reads use Dexie live queries directly.
 */
type CollectionName = 'questions' | 'timeEntries' | 'goals' | 'tasks' | 'assessments' | 'profiles';

export function createRepo(db: CompassDB) {
  const table = (name: CollectionName) => db.table(name);
  return {
    async create<T extends BaseRecord>(name: CollectionName, data: Omit<T, keyof BaseRecord>): Promise<T> {
      const now = nowIso();
      const rec = { ...data, id: newId(), createdAt: now, updatedAt: now } as T;
      await table(name).add(rec);
      return rec;
    },
    async update<T extends BaseRecord>(name: CollectionName, id: string, patch: Partial<T>) {
      await table(name).update(id, { ...patch, updatedAt: nowIso() });
    },
    async remove(name: CollectionName, id: string) {
      await table(name).delete(id);
    },
    async bulkAdd<T extends BaseRecord>(name: CollectionName, rows: T[]) {
      await table(name).bulkAdd(rows);
    }
  };
}

export type Repo = ReturnType<typeof createRepo>;
