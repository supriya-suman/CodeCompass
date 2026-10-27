import { useEffect, useState } from 'react';
import { Button, Modal } from '../components/ui';
import { BACKUP_TABLES, dbHasRecords, destroyDb, LOCAL_DB_NAME, openDb, userDbName } from '../lib/db';
import { useAccount } from './account';

/**
 * Data saved before accounts existed sits in a device-only database. On a
 * shared computer it may belong to someone else, so it is never merged
 * automatically: the signed-in person must say it is theirs.
 */
const dismissKey = (uid: string) => `codecompass.legacyDismissed.${uid}`;

export function LegacyDataPrompt() {
  const { uid } = useAccount();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!uid) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(dismissKey(uid)) === '1';
    } catch {
      /* ignore */
    }
    if (dismissed) return;
    dbHasRecords(LOCAL_DB_NAME).then(async (has) => {
      if (!has) return;
      const legacy = openDb(LOCAL_DB_NAME);
      const c: Record<string, number> = {};
      for (const t of ['questions', 'timeEntries', 'goals', 'tasks', 'assessments', 'profiles'] as const) c[t] = await legacy.table(t).count();
      setCounts(c);
    });
  }, [uid]);

  if (!uid || (!counts && !done)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(uid), '1');
    } catch {
      /* ignore */
    }
    setCounts(null);
  };

  async function move() {
    if (!uid) return;
    setBusy(true);
    const legacy = openDb(LOCAL_DB_NAME);
    const target = openDb(userDbName(uid));
    let n = 0;
    for (const t of BACKUP_TABLES) {
      const rows = await legacy.table(t).toArray();
      if (t === 'settings' && (await target.settings.count()) > 0) continue;
      if (t === 'activeTimer' && (await target.activeTimer.count()) > 0) continue;
      const existing = new Set((await target.table(t).toCollection().primaryKeys()) as string[]);
      const fresh = rows.filter((r) => !existing.has(r.id));
      await target.table(t).bulkPut(fresh);
      n += fresh.length;
    }
    await destroyDb(LOCAL_DB_NAME);
    setBusy(false);
    setCounts(null);
    setDone(`Moved ${n} records into your account. They will sync to your other devices.`);
  }

  const summary = counts
    ? [
        counts.questions && `${counts.questions} questions`,
        counts.timeEntries && `${counts.timeEntries} time entries`,
        counts.goals && `${counts.goals} learning goals`,
        counts.assessments && `${counts.assessments} interviews and tests`,
        counts.profiles && `${counts.profiles} profiles`
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <Modal
      open
      onClose={done ? () => setDone('') : dismiss}
      title={done ? 'Data moved' : 'Data found on this device'}
      footer={
        done ? (
          <Button variant="primary" onClick={() => setDone('')}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={dismiss}>It’s not mine</Button>
            <Button variant="primary" disabled={busy} onClick={move}>
              {busy ? 'Moving…' : 'Yes, move it into my account'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm">{done}</p>
      ) : (
        <div className="space-y-2 text-sm">
          <p>This browser has records saved before sign-in was added: {summary}.</p>
          <p className="text-muted">
            If this computer is shared, these may belong to someone else. Only move them if they are yours. If you choose “It’s not mine”, they stay on this device, untouched, for whoever they belong to.
          </p>
        </div>
      )}
    </Modal>
  );
}
