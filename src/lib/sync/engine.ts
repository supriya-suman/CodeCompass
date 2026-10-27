import { SYNC_TABLES, type CompassDB, type SyncTable } from '../db';
import { markRemote, type TombstoneStore } from './tracking';

/** One record as stored in the cloud. `data` is null for deletions. */
export interface RemoteDoc {
  table: SyncTable;
  id: string;
  data: Record<string, unknown> | null;
  updatedAt: string;
  deleted: boolean;
  /** Server commit time in ms; set by the remote on read. */
  serverMs?: number;
}

/**
 * Cloud storage for exactly one account. Implementations must scope every
 * read and write to that account (Firestore: users/{uid}/records), and the
 * server must enforce the same scope (see firestore.rules).
 */
export interface RemoteStore {
  push(docs: RemoteDoc[]): Promise<void>;
  /** Stream docs changed at or after `sinceMs`. Returns an unsubscribe function. */
  subscribe(sinceMs: number, onDocs: (docs: RemoteDoc[]) => void, onError: (e: Error) => void): () => void;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastSyncedAt: string | null;
  error: string | null;
  initialPullDone: boolean;
}

const CURSOR = 'pullCursorMs';
const LAST = 'lastSyncedAt';

const stripLocal = (r: Record<string, unknown>) => {
  const { _dirty, ...rest } = r;
  void _dirty;
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
};

export class SyncEngine {
  private status: SyncStatus = { state: 'idle', pending: 0, lastSyncedAt: null, error: null, initialPullDone: false };
  private listeners = new Set<(s: SyncStatus) => void>();
  private unsub: (() => void) | null = null;
  private pushing: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private db: CompassDB,
    private remote: RemoteStore,
    private tombstones: TombstoneStore,
    private isOnline: () => boolean = () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    private pushTimeoutMs = 15_000
  ) {}

  onStatus(fn: (s: SyncStatus) => void) {
    this.listeners.add(fn);
    fn(this.status);
    return () => void this.listeners.delete(fn);
  }
  getStatus() {
    return this.status;
  }
  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((l) => l(this.status));
  }

  async start() {
    this.stopped = false;
    const last = (await this.db.syncMeta.get(LAST))?.value as string | undefined;
    this.set({ lastSyncedAt: last ?? null, pending: await this.countPending() });
    const since = ((await this.db.syncMeta.get(CURSOR))?.value as number | undefined) ?? 0;
    this.unsub = this.remote.subscribe(
      since,
      (docs) => {
        this.applyRemote(docs)
          .then(() => this.set({ initialPullDone: true, error: null, state: this.status.state === 'error' ? 'idle' : this.status.state }))
          .catch((e) => this.set({ state: 'error', error: String(e?.message ?? e) }));
      },
      (e) => this.set({ state: this.isOnline() ? 'error' : 'offline', error: e.message })
    );
    // Don't block start-up on the network; uploads continue in the background.
    void this.pushNow();
  }

  stop() {
    this.stopped = true;
    this.unsub?.();
    this.unsub = null;
    if (this.timer) clearTimeout(this.timer);
  }

  /** Called after any local change; batches writes for a moment before uploading. */
  schedulePush(delayMs = 1500) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.pushNow(), delayMs);
    void this.countPending().then((pending) => this.set({ pending }));
  }

  async countPending() {
    let n = this.tombstones.list().length;
    for (const t of SYNC_TABLES) n += await this.db.table(t).filter((r) => r._dirty === 1).count();
    return n;
  }

  /** Upload all pending changes. Safe to call repeatedly; runs one upload at a time. */
  pushNow(): Promise<void> {
    if (this.pushing) {
      this.again = true;
      return this.pushing;
    }
    this.pushing = this.doPush().finally(() => {
      this.pushing = null;
      if (this.again && !this.stopped) {
        this.again = false;
        void this.pushNow();
      }
    });
    return this.pushing;
  }

  private async doPush() {
    if (!this.isOnline()) {
      this.set({ state: 'offline', pending: await this.countPending() });
      return;
    }
    const dirty: { table: SyncTable; rec: Record<string, unknown> }[] = [];
    for (const t of SYNC_TABLES) {
      for (const rec of await this.db.table(t).filter((r) => r._dirty === 1).toArray()) dirty.push({ table: t, rec });
    }
    const tombs = this.tombstones.list();
    if (!dirty.length && !tombs.length) {
      this.set({ state: 'idle', pending: 0 });
      return;
    }
    this.set({ state: 'syncing' });

    // One doc per record; when a record has both a pending delete and a newer
    // re-creation (fixed ids such as the active timer), the latest wins.
    const byKey = new Map<string, RemoteDoc>();
    const put = (d: RemoteDoc) => {
      const k = `${d.table}__${d.id}`;
      const prev = byKey.get(k);
      if (!prev || prev.updatedAt <= d.updatedAt) byKey.set(k, d);
    };
    for (const t of tombs) put({ table: t.table, id: t.id, data: null, updatedAt: t.at, deleted: true });
    for (const { table, rec } of dirty) put({ table, id: String(rec.id), data: stripLocal(rec), updatedAt: String(rec.updatedAt), deleted: false });

    try {
      // Firestore waits indefinitely on a dead connection; give up after a
      // while so the app can report it and retry later. Nothing is lost:
      // records stay marked until an upload is confirmed.
      await Promise.race([
        this.remote.push([...byKey.values()]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('The cloud didn’t respond in time.')), this.pushTimeoutMs))
      ]);
    } catch (e) {
      this.set({ state: this.isOnline() ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e), pending: await this.countPending() });
      return;
    }

    // Clear flags only for versions that were actually uploaded; anything
    // edited during the upload stays dirty and goes in the next round.
    await this.db.transaction('rw', SYNC_TABLES.map((t) => this.db.table(t)), async (tx) => {
      markRemote(tx);
      for (const { table, rec } of dirty) {
        const cur = await tx.table(table).get(rec.id as string);
        if (cur && cur.updatedAt === rec.updatedAt) await tx.table(table).update(rec.id as string, { _dirty: 0 });
      }
    });
    for (const t of tombs) this.tombstones.remove(t.table, t.id, t.at);
    const now = new Date().toISOString();
    await this.db.syncMeta.put({ key: LAST, value: now });
    this.set({ state: 'idle', error: null, lastSyncedAt: now, pending: await this.countPending() });
  }

  /** Apply cloud changes. Local unsynced edits that are newer are kept (last write wins). */
  async applyRemote(docs: RemoteDoc[]) {
    if (!docs.length) return;
    const pendingDeletes = new Map(this.tombstones.list().map((t) => [`${t.table}__${t.id}`, t.at]));
    let maxMs = ((await this.db.syncMeta.get(CURSOR))?.value as number | undefined) ?? 0;
    await this.db.transaction('rw', [...SYNC_TABLES.map((t) => this.db.table(t)), this.db.syncMeta], async (tx) => {
      markRemote(tx);
      for (const d of docs) {
        if (!(SYNC_TABLES as readonly string[]).includes(d.table)) continue;
        if (d.serverMs && d.serverMs > maxMs) maxMs = d.serverMs;
        const table = tx.table(d.table);
        const local = await table.get(d.id);
        const localNewer = local && local._dirty === 1 && String(local.updatedAt) >= d.updatedAt;
        const deletedLater = (pendingDeletes.get(`${d.table}__${d.id}`) ?? '') > d.updatedAt;
        if (localNewer || deletedLater) continue;
        if (d.deleted) {
          if (local) await table.delete(d.id);
        } else if (d.data) {
          await table.put({ ...d.data, _dirty: 0 });
        }
      }
      await tx.table('syncMeta').put({ key: CURSOR, value: maxMs });
    });
  }
}
