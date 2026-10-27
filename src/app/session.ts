import { openDb, userDbName, type CompassDB } from '../lib/db';
import { SyncEngine } from '../lib/sync/engine';
import { installTracking, TombstoneStore, tombstoneKey } from '../lib/sync/tracking';

/**
 * One session per signed-in account: its own database, change tracking,
 * delete queue and sync engine. Created before any page can write, and fully
 * torn down on sign-out so nothing carries over to the next person.
 */
export interface Session {
  uid: string;
  dbName: string;
  db: CompassDB;
  tombstones: TombstoneStore;
  engine: SyncEngine;
  dispose: () => void;
}

const sessions = new Map<string, Session>();

export async function openSession(uid: string): Promise<Session> {
  const existing = sessions.get(uid);
  if (existing) return existing;
  const [{ getFirebase }, { FirestoreRemote }] = await Promise.all([import('../lib/cloud/firebase'), import('../lib/sync/firestoreRemote')]);
  const { fs } = await getFirebase();
  const dbName = userDbName(uid);
  const db = openDb(dbName);
  const tombstones = new TombstoneStore(tombstoneKey(uid));
  const engine = new SyncEngine(db, new FirestoreRemote(fs, uid), tombstones);
  const uninstall = installTracking(db, tombstones, () => engine.schedulePush());
  const onOnline = () => void engine.pushNow();
  const onHide = () => document.visibilityState === 'hidden' && void engine.pushNow();
  const interval = setInterval(() => void engine.pushNow(), 60_000);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onHide);
  const session: Session = {
    uid,
    dbName,
    db,
    tombstones,
    engine,
    dispose() {
      engine.stop();
      uninstall();
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onHide);
      sessions.delete(uid);
    }
  };
  sessions.set(uid, session);
  await engine.start();
  return session;
}

export function getSession(uid: string) {
  return sessions.get(uid);
}
