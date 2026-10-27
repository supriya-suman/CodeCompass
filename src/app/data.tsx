import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEMO_DB_NAME, openDb, readMode, writeMode, type CompassDB, type DataMode } from '../lib/db';
import { createRepo, type Repo } from '../lib/repo';
import { DEFAULT_SETTINGS, type Settings } from '../lib/types';

interface DataCtx {
  mode: DataMode;
  /** False for a signed-out visitor exploring demo data: there is no personal database. */
  canUseRealData: boolean;
  db: CompassDB;
  repo: Repo;
  settings: Settings;
  settingsLoaded: boolean;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  setMode: (m: DataMode) => Promise<void>;
  resetDemo: () => Promise<void>;
  /** Signed-out demo visitors: go back to the sign-in screen. */
  exitGuest?: () => void;
}

const Ctx = createContext<DataCtx | null>(null);

/**
 * `realDbName` is the personal database for this scope: the signed-in
 * account's own database, or the device-only database when accounts are not
 * configured. `null` means a signed-out visitor who may only view demo data.
 */
export function DataProvider({ realDbName, scope, onExitGuest, children }: { realDbName: string | null; scope: string; onExitGuest?: () => void; children: ReactNode }) {
  const [modePref, setModeState] = useState<DataMode>(() => readMode(scope));
  const mode: DataMode = realDbName ? modePref : 'demo';
  const db = useMemo(() => openDb(mode === 'demo' || !realDbName ? DEMO_DB_NAME : realDbName), [mode, realDbName]);
  const repo = useMemo(() => createRepo(db), [db]);
  const stored = useLiveQuery(async () => (await db.settings.get('settings')) ?? null, [db]);
  const settingsLoaded = stored !== undefined;
  const settings = useMemo<Settings>(() => ({ ...DEFAULT_SETTINGS, ...(stored ?? {}) }), [stored]);

  // Demo database is seeded on first entry.
  useEffect(() => {
    if (mode !== 'demo') return;
    db.settings.count().then(async (n) => {
      if (n === 0) (await import('../lib/demo')).seedDemo(db);
    });
  }, [db, mode]);

  const saveSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const current = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS;
      await db.settings.put({ ...DEFAULT_SETTINGS, ...current, ...patch, id: 'settings' });
    },
    [db]
  );

  const setMode = useCallback(
    async (m: DataMode) => {
      writeMode(scope, m);
      setModeState(m);
    },
    [scope]
  );

  const resetDemo = useCallback(async () => {
    await (await import('../lib/demo')).seedDemo(openDb(DEMO_DB_NAME));
  }, []);

  const value = useMemo(
    () => ({ mode, canUseRealData: !!realDbName, db, repo, settings, settingsLoaded, saveSettings, setMode, resetDemo, exitGuest: onExitGuest }),
    [mode, realDbName, db, repo, settings, settingsLoaded, saveSettings, setMode, resetDemo, onExitGuest]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData must be used inside DataProvider');
  return v;
}

/** Today's calendar date in the user's timezone; refreshes each minute. */
export function useToday() {
  const { settings } = useData();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const tz = settings.timezone;
  return useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now), [now, tz]);
}
