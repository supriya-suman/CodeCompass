import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useData } from '../app/data';
import { authErrorMessage, useAccount } from '../app/account';
import { useInstall } from '../app/pwa';
import { Button, Confirm, Field, Input, Modal, PageHeader, Panel, Segmented, Select } from '../components/ui';
import { buildBackup, restoreBackup, validateBackup, type BackupValidation } from '../lib/backup';
import { BACKUP_TABLES } from '../lib/db';
import { downloadText } from '../lib/id';
import { sanitizeIntervals } from '../lib/revision';
import { formatInstant, isValidTimeZone, listTimeZones, todayIn } from '../lib/time';
import { TIME_CATEGORIES, type ThemePref, type TimeCategory } from '../lib/types';

function useHashScroll() {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);
}

function InstallGuide() {
  const { canPrompt, installed, platform, prompt } = useInstall();
  return (
    <Panel title="Install the app">
      {installed ? (
        <p className="text-sm">You're using the installed app.</p>
      ) : canPrompt ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm">Your browser can install CodeCompass as an app with its own window and icon.</p>
          <Button variant="primary" onClick={prompt}>
            Install app
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">This browser doesn’t offer a one-click install here. Use the steps for your device:</p>
      )}
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div className={platform === 'ios' ? 'rounded-lg bg-accent-soft p-3' : 'p-3'}>
          <dt className="font-semibold">iPhone and iPad</dt>
          <dd className="mt-1 text-muted">Open this site in Safari, tap Share, then Add to Home Screen. (On iOS 16.4+ other browsers may also offer it in their share menu.)</dd>
        </div>
        <div className={platform === 'android' ? 'rounded-lg bg-accent-soft p-3' : 'p-3'}>
          <dt className="font-semibold">Android</dt>
          <dd className="mt-1 text-muted">In Chrome, open the ⋮ menu and choose Install app or Add to Home screen.</dd>
        </div>
        <div className={platform === 'desktop' ? 'rounded-lg bg-accent-soft p-3' : 'p-3'}>
          <dt className="font-semibold">Desktop</dt>
          <dd className="mt-1 text-muted">In Chrome or Edge, use the install icon in the address bar. Safari on macOS: File → Add to Dock. Firefox desktop doesn’t install web apps.</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-muted">
        This is a web app, not an App Store or Play Store app. Installed or not, your data stays in this browser on this device; it doesn’t sync to your other devices. Use a backup file to move it.
      </p>
    </Panel>
  );
}


function AccountPanel() {
  const { status, identity, sync, signOut, deleteAccount } = useAccount();
  const { settings } = useData();
  const [signingOut, setSigningOut] = useState(false);
  const [removeLocal, setRemoveLocal] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'unconfigured') {
    return (
      <Panel title="Account">
        <div id="account" className="scroll-mt-24" />
        <p className="text-sm">Accounts aren’t set up for this copy of the app, so your data is saved only in this browser on this device.</p>
        <p className="mt-2 text-sm text-muted">
          To let anyone create an account and sync between devices, the person deploying the app adds a free Firebase project and email settings (see SETUP-ACCOUNTS.md in the source). Until then, download backups regularly.
        </p>
      </Panel>
    );
  }
  if (status !== 'signedIn') {
    return (
      <Panel title="Account">
        <div id="account" className="scroll-mt-24" />
        <p className="text-sm text-muted">You’re not signed in. You are viewing demo data only.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Account">
      <div id="account" className="scroll-mt-24" />
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Signed in with</dt>
          <dd className="font-medium tabular break-all">{identity}</dd>
        </div>
        <div>
          <dt className="text-muted">Sync</dt>
          <dd className="font-medium">
            {sync?.state === 'syncing' ? 'Syncing…' : sync?.state === 'offline' ? 'Offline — changes are saved here and sync when you reconnect' : sync?.state === 'error' ? `Problem: ${sync.error ?? 'unknown'} (retrying)` : sync?.pending ? `${sync.pending} waiting` : 'Up to date'}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Last synced</dt>
          <dd className="font-medium">{sync?.lastSyncedAt ? formatInstant(sync.lastSyncedAt, settings.timezone) : 'Not yet'}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-muted">
        Your records are stored in your private cloud space, reachable only after signing in to this account, and copied into this browser for offline use. Other people who sign in on this device get their own separate space.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => { setError(''); setSigningOut(true); }}>Sign out</Button>
        <Button variant="danger" onClick={() => { setError(''); setDeleting(true); }}>Delete account</Button>
      </div>

      <Modal
        open={signingOut}
        onClose={() => setSigningOut(false)}
        title="Sign out"
        footer={
          <>
            <Button onClick={() => setSigningOut(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await signOut({ removeLocalData: removeLocal });
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Signing out…' : 'Sign out'}
            </Button>
          </>
        }
      >
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={removeLocal} onChange={(e) => setRemoveLocal(e.target.checked)} />
          <span>
            Also remove my data from this browser
            <span className="block text-muted">Recommended on shared computers. Your data stays safe in your account and comes back when you sign in again.</span>
          </span>
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      </Modal>

      <Modal
        open={deleting}
        onClose={() => { setDeleting(false); setConfirmText(''); }}
        title="Delete your account?"
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={confirmText !== 'DELETE' || busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await deleteAccount();
                } catch (e) {
                  setError(authErrorMessage(e));
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Deleting…' : 'Delete account and data'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          All your records are permanently deleted from the cloud and from this browser, and your sign-in is removed. Other devices lose access. Download a backup first if you might want the data later.
        </p>
        <p className="mt-2 text-sm text-muted">For your security this only works within a few minutes of signing in. If it asks, sign out, sign in again and retry.</p>
        <Field label="Type DELETE to confirm" className="mt-4">
          {(id) => <Input id={id} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />}
        </Field>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      </Modal>
    </Panel>
  );
}

function BackupPanel() {
  const { db, mode, settings, saveSettings } = useData();
  const { status } = useAccount();
  const fileRef = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState<BackupValidation | null>(null);
  const [strategy, setStrategy] = useState<'merge' | 'replace'>('merge');
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => e.usage !== undefined && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used`)).catch(() => undefined);
  }, []);

  async function download() {
    const data = await buildBackup(db, mode);
    downloadText(`codecompass-${mode === 'demo' ? 'demo-' : ''}backup-${todayIn(settings.timezone)}.json`, JSON.stringify(data, null, 2), 'application/json');
    if (mode === 'real') await saveSettings({ lastBackupAt: new Date().toISOString() });
    setMessage('Backup downloaded. Keep it somewhere safe, such as cloud storage.');
  }

  async function onFile(f: File) {
    setMessage('');
    if (f.size > 50_000_000) return setVal({ ok: false, errors: ['File is larger than 50 MB.'], counts: {} });
    try {
      setVal(validateBackup(JSON.parse(await f.text())));
    } catch {
      setVal({ ok: false, errors: ['This file is not valid JSON.'], counts: {} });
    }
  }

  async function restore() {
    if (!val?.data) return;
    const r = await restoreBackup(db, val.data, strategy);
    setConfirm(false);
    setVal(null);
    if (fileRef.current) fileRef.current.value = '';
    setMessage(strategy === 'replace' ? `Restored ${r.added} records. Previous data in this mode was replaced.` : `Added ${r.added} records, skipped ${r.skipped} that already existed.`);
  }

  return (
    <Panel title="Backup and restore">
      <div id="backup" className="scroll-mt-24" />
      <p className="text-sm text-muted">
        {status === 'signedIn' && mode === 'real'
          ? 'Your records sync to your account automatically. A backup file is an extra copy you control — useful before big changes or to keep an offline archive.'
          : `Your records are stored only in this browser (${mode === 'demo' ? 'demo database' : 'your personal database'}). Clearing site data, using private browsing, or the browser freeing space can erase them.`}{' '}
        Backups contain every record except cached GitHub data, and never contain passwords or keys.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={download}>
          Download backup
        </Button>
        <span className="text-sm text-muted">{settings.lastBackupAt ? `Last backup ${formatInstant(settings.lastBackupAt, settings.timezone)}` : mode === 'real' ? 'No backup yet' : ''}</span>
      </div>
      <div className="mt-6">
        <label htmlFor="restore-file" className="text-sm font-medium">
          Restore from a backup file
        </label>
        <input
          id="restore-file"
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="mt-1.5 block w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-sunken file:px-4 file:font-medium"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </div>
      {val && (
        <div className="mt-4 rounded-lg border border-line p-3 text-sm" role="status">
          {val.ok ? (
            <>
              <p className="font-medium">Backup is valid. It contains:</p>
              <p className="mt-1 text-muted">
                {BACKUP_TABLES.filter((t) => val.counts[t]).map((t) => `${val.counts[t]} ${t}`).join(', ') || 'no records'}
                {val.data?.exportedAt ? ` · exported ${formatInstant(val.data.exportedAt, settings.timezone)}` : ''}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Segmented label="Restore mode" value={strategy} onChange={setStrategy} options={[{ value: 'merge', label: 'Add missing records' }, { value: 'replace', label: 'Replace everything' }]} />
                <Button variant={strategy === 'replace' ? 'danger' : 'primary'} onClick={() => setConfirm(true)}>
                  Restore
                </Button>
              </div>
            </>
          ) : (
            <p className="font-medium text-danger">This backup can’t be restored.</p>
          )}
          {val.errors.length > 0 && (
            <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-danger">
              {val.errors.slice(0, 30).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="mt-4 rounded-lg bg-ok-soft p-3 text-sm text-ok">
          {message}
        </p>
      )}
      <div className="mt-6 border-t border-line pt-4 text-sm">
        <p className="font-medium">Storage on this device</p>
        <p className="mt-1 text-muted">
          {persisted === true ? 'This browser has agreed to keep your data unless you clear it yourself.' : 'The browser may clear this data under storage pressure.'} {usage}
        </p>
        {persisted === false && (
          <Button
            size="sm"
            className="mt-2"
            onClick={async () => {
              const ok = await navigator.storage.persist();
              setPersisted(ok);
              setMessage(ok ? 'Persistent storage granted.' : 'The browser declined persistent storage. Installing the app often helps; keep downloading backups.');
            }}
          >
            Ask browser to keep my data
          </Button>
        )}
      </div>
      <Confirm
        open={confirm}
        title={strategy === 'replace' ? 'Replace all data?' : 'Add records from this backup?'}
        body={strategy === 'replace' ? 'Everything currently stored in this mode will be deleted and replaced by the backup. Download a backup of the current data first if you might need it.' : 'Records from the backup that are not already here will be added. Existing records are left unchanged.'}
        confirmLabel={strategy === 'replace' ? 'Replace everything' : 'Add records'}
        onCancel={() => setConfirm(false)}
        onConfirm={restore}
      />
    </Panel>
  );
}

export default function SettingsPage() {
  useHashScroll();
  const { settings, saveSettings, mode, setMode, resetDemo, db, canUseRealData, exitGuest } = useData();
  const { status } = useAccount();
  const zones = useMemo(() => listTimeZones([settings.timezone]), [settings.timezone]);
  const [intervals, setIntervals] = useState(settings.revisionIntervals.join(', '));
  const [saved, setSaved] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [wipeText, setWipeText] = useState('');

  useEffect(() => setIntervals(settings.revisionIntervals.join(', ')), [settings.revisionIntervals]);
  const flash = (m: string) => {
    setSaved(m);
    setTimeout(() => setSaved(''), 2500);
  };

  return (
    <>
      <PageHeader title="Settings & data" description="Preferences, your data, and installing the app." />
      <p role="status" aria-live="polite" className="sr-only">
        {saved}
      </p>
      <div className="flex flex-col gap-6">
        <AccountPanel />
        <Panel title="You">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name">{(id) => <Input id={id} defaultValue={settings.displayName} key={settings.displayName} onBlur={(e) => saveSettings({ displayName: e.target.value.trim() }).then(() => flash('Name saved'))} />}</Field>
            <Field label="Timezone" hint="Used for “today”, streaks, deadlines and calendar times.">
              {(id) => (
                <Select id={id} value={settings.timezone} onChange={(e) => isValidTimeZone(e.target.value) && saveSettings({ timezone: e.target.value }).then(() => flash('Timezone saved'))}>
                  {zones.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="City">{(id) => <Input id={id} defaultValue={settings.city} key={`c${settings.city}`} onBlur={(e) => saveSettings({ city: e.target.value.trim() })} />}</Field>
            <Field label="State or region">{(id) => <Input id={id} defaultValue={settings.region} key={`r${settings.region}`} onBlur={(e) => saveSettings({ region: e.target.value.trim() })} />}</Field>
            <Field label="Country">{(id) => <Input id={id} defaultValue={settings.country} key={`n${settings.country}`} onBlur={(e) => saveSettings({ country: e.target.value.trim() })} />}</Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Theme</span>
              <Segmented<ThemePref>
                label="Theme"
                value={settings.theme}
                onChange={(t) => saveSettings({ theme: t })}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' }
                ]}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Activity map">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={settings.trackAppUsage} onChange={(e) => saveSettings({ trackAppUsage: e.target.checked })} />
            <span>
              Count my active time in CodeCompass
              <span className="block text-muted">Adds “Time in CodeCompass” to the activity map. Counts only while the app is open and you’ve used it in the last two minutes, and stays private to your account. It can’t see other apps.</span>
            </span>
          </label>
        </Panel>

        <Panel title="Revision and targets">
          <div id="revision" className="scroll-mt-24" />
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const iv = sanitizeIntervals(intervals.split(/[,\s]+/).map(Number));
              saveSettings({ revisionIntervals: iv }).then(() => flash('Intervals saved'));
              setIntervals(iv.join(', '));
            }}
          >
            <Field label="Revision intervals in days" hint="Each solved problem returns after these gaps, e.g. 1, 3, 7, 14, 30." className="min-w-64 flex-1">
              {(id) => <Input id={id} value={intervals} onChange={(e) => setIntervals(e.target.value)} />}
            </Field>
            <Button type="submit">Save intervals</Button>
          </form>
          <h3 className="mt-6 text-sm font-semibold">Weekly targets (minutes)</h3>
          <p className="text-sm text-muted">Shown as planned effort against actual time. Leave blank for no target.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TIME_CATEGORIES.map((c) => (
              <Field key={c} label={c}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    max={10080}
                    defaultValue={settings.weeklyTargetsMin[c] ?? ''}
                    key={`${c}${settings.weeklyTargetsMin[c] ?? ''}`}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      const next = { ...settings.weeklyTargetsMin } as Partial<Record<TimeCategory, number>>;
                      if (v > 0) next[c] = Math.min(10080, Math.round(v));
                      else delete next[c];
                      saveSettings({ weeklyTargetsMin: next });
                    }}
                  />
                )}
              </Field>
            ))}
          </div>
        </Panel>

        <BackupPanel />

        <Panel title="Demo mode">
          <p className="text-sm text-muted">Demo mode shows sample records from a separate database. Your own records are untouched, and the two are never mixed in backups or stats.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {mode === 'real' ? (
              <Button onClick={() => setMode('demo')}>Explore demo data</Button>
            ) : (
              <>
                {canUseRealData ? (
                  <Button variant="primary" onClick={() => setMode('real')}>
                    Switch to my data
                  </Button>
                ) : (
                  <Button variant="primary" onClick={exitGuest}>
                    Sign in to use your own data
                  </Button>
                )}
                <Button onClick={() => setConfirmReset(true)}>Reset demo data</Button>
              </>
            )}
          </div>
        </Panel>

        <InstallGuide />

        <Panel title="Privacy">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>No analytics, tracking or telemetry.</li>
            <li>No account. Nothing is uploaded; the only network calls are to GitHub when you refresh a connected profile, and to Google Fonts for typefaces.</li>
            <li>Imported files and notes are displayed as plain text, never as HTML.</li>
          </ul>
          <div className="mt-4 border-t border-line pt-4">
            <Button variant="danger" onClick={() => setWipe(true)}>
              Delete all {mode === 'demo' ? 'demo' : 'my'} data
            </Button>
          </div>
        </Panel>
      </div>

      <Confirm
        open={confirmReset}
        title="Reset demo data?"
        body="Demo records go back to their original sample state. Your own data is not affected."
        confirmLabel="Reset demo"
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          await resetDemo();
          setConfirmReset(false);
        }}
      />
      <Modal
        open={wipe}
        onClose={() => {
          setWipe(false);
          setWipeText('');
        }}
        title="Delete all data in this browser?"
        footer={
          <>
            <Button onClick={() => setWipe(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={wipeText !== 'DELETE'}
              onClick={async () => {
                await db.transaction('rw', db.tables, async () => Promise.all(db.tables.map((t) => t.clear())));
                setWipe(false);
                setWipeText('');
              }}
            >
              Delete everything
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Every question, time entry, goal, interview and setting in {mode === 'demo' ? 'demo mode' : 'your personal data'} will be permanently removed
          {status === 'signedIn' && mode === 'real' ? ' from this browser and from your account on every device' : ' from this browser'}. This can’t be undone without a backup.
        </p>
        <Field label="Type DELETE to confirm" className="mt-4">
          {(id) => <Input id={id} value={wipeText} onChange={(e) => setWipeText(e.target.value)} autoComplete="off" />}
        </Field>
      </Modal>
    </>
  );
}
