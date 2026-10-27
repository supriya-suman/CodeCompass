import { BACKUP_TABLES, SCHEMA_VERSION, type BackupTable, type CompassDB } from './db';

export interface BackupFile {
  app: 'codecompass';
  schemaVersion: number;
  exportedAt: string;
  mode: 'real' | 'demo';
  tables: Record<BackupTable, unknown[]>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string';

/** Minimal required-field checks per table. Extra fields are tolerated. */
const REQUIRED: Record<BackupTable, (r: Record<string, unknown>) => string | null> = {
  questions: (r) => (str(r.id) && str(r.title) && str(r.status) && str(r.platform) ? null : 'needs id, title, status, platform'),
  timeEntries: (r) =>
    str(r.id) && str(r.start) && str(r.end) && typeof r.durationMin === 'number' && str(r.category)
      ? null
      : 'needs id, start, end, durationMin, category',
  activeTimer: (r) => (r.id === 'active' && str(r.startedAt) && typeof r.accumulatedMs === 'number' ? null : 'invalid active timer'),
  goals: (r) => (str(r.id) && str(r.title) && str(r.category) ? null : 'needs id, title, category'),
  tasks: (r) => (str(r.id) && str(r.goalId) && str(r.title) && str(r.status) ? null : 'needs id, goalId, title, status'),
  assessments: (r) => (str(r.id) && str(r.status) && str(r.timezone) ? null : 'needs id, status, timezone'),
  profiles: (r) => (str(r.id) && str(r.platform) ? null : 'needs id, platform'),
  settings: (r) => (r.id === 'settings' && str(r.timezone) ? null : 'invalid settings'),
  appUsage: (r) => (str(r.id) && /^\d{4}-\d{2}-\d{2}(__[\w-]+)?$/.test(String(r.id)) && typeof r.minutes === 'number' ? null : 'needs a date id and minutes')
};

export async function buildBackup(db: CompassDB, mode: 'real' | 'demo', now = new Date()): Promise<BackupFile> {
  const tables = {} as Record<BackupTable, unknown[]>;
  for (const t of BACKUP_TABLES) {
    // Drop sync bookkeeping so a backup restores cleanly into any account.
    tables[t] = (await db.table(t).toArray()).map(({ _dirty, ...r }) => (void _dirty, r));
  }
  return { app: 'codecompass', schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), mode, tables };
}

export interface BackupValidation {
  ok: boolean;
  errors: string[];
  counts: Partial<Record<BackupTable, number>>;
  data?: BackupFile;
}

export function validateBackup(raw: unknown): BackupValidation {
  const errors: string[] = [];
  const counts: Partial<Record<BackupTable, number>> = {};
  if (!isObj(raw) || raw.app !== 'codecompass') return { ok: false, errors: ['This is not a CodeCompass backup file.'], counts };
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion < 1) errors.push('Missing schema version.');
  else if (raw.schemaVersion > SCHEMA_VERSION)
    errors.push(`Backup was made by a newer version (schema ${raw.schemaVersion}). Update the app before restoring.`);
  if (!isObj(raw.tables)) return { ok: false, errors: [...errors, 'Backup has no tables.'], counts };

  for (const key of Object.keys(raw.tables)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(key)) errors.push(`Unknown table "${key}" was found and will not be restored.`);
  }
  const tables = {} as Record<BackupTable, unknown[]>;
  for (const t of BACKUP_TABLES) {
    const rows = (raw.tables as Record<string, unknown>)[t] ?? [];
    if (!Array.isArray(rows)) {
      errors.push(`Table "${t}" is not a list.`);
      continue;
    }
    const ids = new Set<string>();
    rows.forEach((r, i) => {
      if (!isObj(r)) return errors.push(`${t} #${i + 1}: not an object.`);
      const msg = REQUIRED[t](r);
      if (msg) errors.push(`${t} #${i + 1}: ${msg}.`);
      if (ids.has(String(r.id))) errors.push(`${t} #${i + 1}: duplicate id.`);
      ids.add(String(r.id));
    });
    counts[t] = rows.length;
    tables[t] = rows;
  }
  // Unknown-table notices are warnings; everything else blocks the restore.
  const blocking = errors.filter((e) => !e.startsWith('Unknown table'));
  return {
    ok: blocking.length === 0,
    errors,
    counts,
    data: blocking.length ? undefined : { ...(raw as unknown as BackupFile), tables }
  };
}

/**
 * Restore a validated backup. 'replace' clears each table first;
 * 'merge' keeps existing records and adds only ids that are not present.
 * Runs in a single transaction: either everything is written or nothing is.
 */
export async function restoreBackup(db: CompassDB, data: BackupFile, strategy: 'replace' | 'merge') {
  let added = 0;
  let skipped = 0;
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) {
      const table = db.table(t);
      const rows = data.tables[t] as { id: string }[];
      if (strategy === 'replace') {
        await table.clear();
        await table.bulkPut(rows);
        added += rows.length;
      } else {
        const existing = new Set((await table.toCollection().primaryKeys()) as string[]);
        const fresh = rows.filter((r) => !existing.has(r.id));
        skipped += rows.length - fresh.length;
        await table.bulkPut(fresh);
        added += fresh.length;
      }
    }
  });
  return { added, skipped };
}
