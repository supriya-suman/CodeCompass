import Dexie, { type EntityTable } from 'dexie';
import type {
  ActiveTimer,
  Assessment,
  CodingProfile,
  IntegrationCache,
  LearningGoal,
  LearningTask,
  Question,
  Settings,
  TimeEntry,
  AppUsageDay
} from './types';

/**
 * Every account gets its own physically separate IndexedDB database, so two
 * people signing in on the same browser (e.g. a shared laptop) never see or
 * merge each other's records. Demo data has its own database too.
 *
 *   codecompass-u-<firebase uid>  one per signed-in account
 *   codecompass-demo              sample data, no personal records
 *   codecompass                   "this device only" mode (accounts not configured),
 *                                 and data saved before accounts existed
 */
export const LOCAL_DB_NAME = 'codecompass';
export const DEMO_DB_NAME = 'codecompass-demo';
export const userDbName = (uid: string) => `codecompass-u-${uid}`;

/** Current schema version. Bump together with a new `this.version(n)` block. */
export const SCHEMA_VERSION = 3;

export interface SyncMeta {
  key: string;
  value: unknown;
}

export class CompassDB extends Dexie {
  questions!: EntityTable<Question, 'id'>;
  timeEntries!: EntityTable<TimeEntry, 'id'>;
  activeTimer!: EntityTable<ActiveTimer, 'id'>;
  goals!: EntityTable<LearningGoal, 'id'>;
  tasks!: EntityTable<LearningTask, 'id'>;
  assessments!: EntityTable<Assessment, 'id'>;
  profiles!: EntityTable<CodingProfile, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  integrationCache!: EntityTable<IntegrationCache, 'key'>;
  syncMeta!: EntityTable<SyncMeta, 'key'>;
  appUsage!: EntityTable<AppUsageDay, 'id'>;

  constructor(name: string) {
    super(name);
    // Versioned migrations. Never edit a shipped version; add a new one.
    this.version(1).stores({
      questions: 'id, status, platform, topic, difficulty, nextRevisionOn, solvedOn, updatedAt',
      timeEntries: 'id, category, start, end',
      activeTimer: 'id',
      goals: 'id, category, archived',
      tasks: 'id, goalId, status, dueOn',
      assessments: 'id, status, scheduledLocal, followUpOn',
      profiles: 'id, platform',
      settings: 'id',
      integrationCache: 'key'
    });
    // v2: sync bookkeeping (pull cursor, last sync time). Records gain an
    // optional `_dirty` flag, which needs no index change.
    this.version(2).stores({ syncMeta: 'key' });
    // v3: minutes active in the app per day, for the activity map.
    this.version(3).stores({ appUsage: 'id' });
  }
}

/** Tables included in backups (integration cache is re-fetchable, so excluded). */
export const BACKUP_TABLES = [
  'questions',
  'timeEntries',
  'activeTimer',
  'goals',
  'tasks',
  'assessments',
  'profiles',
  'settings',
  'appUsage'
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Tables synced to the signed-in account's cloud storage. */
export const SYNC_TABLES = BACKUP_TABLES;
export type SyncTable = BackupTable;

export type DataMode = 'real' | 'demo';

const modeKey = (scope: string) => `codecompass.mode.${scope}`;

export function readMode(scope: string): DataMode {
  try {
    return localStorage.getItem(modeKey(scope)) === 'demo' ? 'demo' : 'real';
  } catch {
    return 'real';
  }
}

export function writeMode(scope: string, mode: DataMode) {
  try {
    localStorage.setItem(modeKey(scope), mode);
  } catch {
    /* storage blocked; mode falls back to real on next load */
  }
}

const instances = new Map<string, CompassDB>();
export function openDb(name: string): CompassDB {
  let db = instances.get(name);
  if (!db) {
    db = new CompassDB(name);
    instances.set(name, db);
  }
  return db;
}

/** Close and permanently remove a local database (used on sign-out from a shared device). */
export async function destroyDb(name: string) {
  const db = instances.get(name);
  if (db) {
    db.close();
    instances.delete(name);
  }
  await Dexie.delete(name);
}

export async function dbHasRecords(name: string): Promise<boolean> {
  if (!(await Dexie.exists(name))) return false;
  const db = openDb(name);
  for (const t of ['questions', 'timeEntries', 'goals', 'tasks', 'assessments', 'profiles'] as const) {
    if ((await db.table(t).count()) > 0) return true;
  }
  return false;
}
