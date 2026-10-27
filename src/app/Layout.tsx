import { useLiveQuery } from 'dexie-react-hooks';
import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cx } from '../components/ui';
import { diffDays, formatClock, todayIn } from '../lib/time';
import { elapsedMs } from '../lib/timer';
import { BRAND } from './brand';
import { useData } from './data';
import { useAccount } from './account';
import { useAppUsage } from './useAppUsage';
import { UpdatePrompt, useOnline } from './pwa';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  phase?: string;
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Today',
    items: [
      { to: '/', label: 'Overview', icon: 'compass' },
      { to: '/activity', label: 'Activity', icon: 'grid' }
    ]
  },
  {
    title: 'Practice',
    items: [
      { to: '/questions', label: 'Questions', icon: 'list' },
      { to: '/revision', label: 'Revision', icon: 'repeat' },
      { to: '/time', label: 'Time', icon: 'clock' }
    ]
  },
  {
    title: 'Plan',
    items: [
      { to: '/learning', label: 'Learning', icon: 'map' },
      { to: '/assessments', label: 'Interviews & tests', icon: 'calendar' }
    ]
  },
  {
    title: 'Career',
    items: [
      { to: '/profiles', label: 'Coding profiles', icon: 'link' },
      { to: '/discover', label: 'Discover', icon: 'radar', phase: 'Soon' },
      { to: '/research', label: 'Research', icon: 'book', phase: 'Soon' },
      { to: '/portfolio', label: 'Portfolio', icon: 'star', phase: 'Soon' }
    ]
  }
];

const MOBILE: NavItem[] = [
  { to: '/', label: 'Overview', icon: 'compass' },
  { to: '/questions', label: 'Questions', icon: 'list' },
  { to: '/time', label: 'Time', icon: 'clock' },
  { to: '/learning', label: 'Learning', icon: 'map' }
];

const PATHS: Record<string, string> = {
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  repeat: 'M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
  calendar: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  radar: 'M12 12 19 5M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 1 2-2h13',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  grid: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z'
};

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cx('h-5 w-5 shrink-0', className)} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

function useTheme() {
  const { settings } = useData();
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121a24' : '#eef2f5');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);
}

function NavItemLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        cx('flex min-h-10 items-center gap-3 rounded-lg px-3 text-[15px]', isActive ? 'bg-accent-soft font-semibold text-accent' : 'text-ink hover:bg-sunken')
      }
    >
      <Icon name={item.icon} />
      <span className="flex-1">{item.label}</span>
      {item.phase && <span className="text-xs text-muted">{item.phase}</span>}
    </NavLink>
  );
}

function TimerPill() {
  const { db } = useData();
  const t = useLiveQuery(() => db.activeTimer.get('active'), [db]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!t?.runningSince) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [t?.runningSince]);
  if (!t) return null;
  return (
    <NavLink to="/time" className="tabular inline-flex min-h-9 items-center gap-2 rounded-full bg-accent-soft px-3 text-sm font-semibold text-accent">
      <span className={cx('h-2 w-2 rounded-full', t.runningSince ? 'bg-accent' : 'bg-muted')} aria-hidden="true" />
      {t.runningSince ? '' : 'Paused · '}
      {formatClock(elapsedMs(t, new Date()))}
      <span className="sr-only"> timer for {t.category}</span>
    </NavLink>
  );
}

/** Small sync status line, shown only for signed-in accounts. */
export function SyncBadge() {
  const { status, sync } = useAccount();
  const { mode } = useData();
  if (status !== 'signedIn' || !sync || mode === 'demo') return null;
  const label =
    sync.state === 'syncing'
      ? 'Syncing…'
      : sync.state === 'offline'
        ? sync.pending
          ? `Offline · ${sync.pending} change${sync.pending === 1 ? '' : 's'} saved on this device`
          : 'Offline'
        : sync.state === 'error'
          ? 'Sync problem — will retry'
          : sync.pending
            ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to sync`
            : 'Synced';
  const dot = sync.state === 'error' ? 'bg-danger' : sync.state === 'offline' || sync.pending ? 'bg-due' : 'bg-ok';
  return (
    <NavLink to="/settings#account" className="inline-flex min-h-9 items-center gap-2 rounded-full px-2 text-xs text-muted hover:bg-sunken" title={sync.error ?? undefined}>
      <span className={cx('h-2 w-2 rounded-full', dot)} aria-hidden="true" />
      <span role="status">{label}</span>
    </NavLink>
  );
}

function Banners() {
  const { mode, settings, db, setMode, canUseRealData, exitGuest } = useData();
  const { status } = useAccount();
  const online = useOnline();
  const recordCount = useLiveQuery(async () => (await db.questions.count()) + (await db.timeEntries.count()) + (await db.assessments.count()), [db]);
  const today = todayIn(settings.timezone);
  // Signed-in accounts are kept in the cloud; the reminder is for device-only data.
  const needsBackup =
    status === 'unconfigured' &&
    mode === 'real' &&
    (recordCount ?? 0) > 0 &&
    (!settings.lastBackupAt || diffDays(today, todayIn(settings.timezone, new Date(settings.lastBackupAt))) >= settings.backupReminderDays);
  return (
    <>
      {mode === 'demo' && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-due-soft px-4 py-2 text-center text-sm text-due">
          <strong>Demo mode.</strong> You are viewing sample data stored separately from your records.
          {canUseRealData ? (
            <button className="font-semibold underline" onClick={() => setMode('real')}>
              Switch to my data
            </button>
          ) : (
            <button className="font-semibold underline" onClick={exitGuest}>
              Sign in to use your own data
            </button>
          )}
        </div>
      )}
      {!online && (
        <div role="status" className="bg-sunken px-4 py-2 text-center text-sm text-muted">
          You're offline. Your saved records work as usual; live data like GitHub activity will refresh when you reconnect.
        </div>
      )}
      {needsBackup && (
        <div className="border-b border-line bg-surface px-4 py-2 text-center text-sm">
          Your records live only in this browser.{' '}
          <NavLink to="/settings#backup" className="font-semibold text-accent underline">
            Download a backup
          </NavLink>{' '}
          {settings.lastBackupAt ? `— last one was ${diffDays(today, todayIn(settings.timezone, new Date(settings.lastBackupAt)))} days ago.` : 'to keep them safe.'}
        </div>
      )}
    </>
  );
}

export function Layout() {
  useTheme();
  useAppUsage();
  const [moreOpen, setMoreOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setMoreOpen(false), [loc.pathname]);
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="safe-top sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="font-display text-xl font-semibold">{BRAND.name}</span>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-4">
              <p className="px-3 pb-1 text-xs font-medium text-muted">{g.title}</p>
              <div className="flex flex-col gap-0.5">
                {g.items.map((i) => (
                  <NavItemLink key={i.to} item={i} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <div className="px-1 pb-1">
            <SyncBadge />
          </div>
          <NavItemLink item={{ to: '/settings', label: 'Settings & data', icon: 'gear' }} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Banners />
        <header className="safe-top sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-2 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-7 w-7" />
            <span className="font-display text-lg font-semibold">{BRAND.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="hidden sm:inline">
              <SyncBadge />
            </span>
            <TimerPill />
          </div>
        </header>
        <div className="hidden justify-end px-8 pt-4 lg:flex">
          <TimerPill />
        </div>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 outline-none sm:px-6 lg:px-8 lg:pb-12">
          <Suspense fallback={<p className="text-muted">Loading…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface lg:hidden">
        <div className="mx-auto flex max-w-lg">
          {MOBILE.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === '/'}
              className={({ isActive }) => cx('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'font-semibold text-accent' : 'text-muted')}
            >
              <Icon name={i.icon} />
              {i.label}
            </NavLink>
          ))}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="more-sheet"
            onClick={() => setMoreOpen((o) => !o)}
            className={cx('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', moreOpen ? 'font-semibold text-accent' : 'text-muted')}
          >
            <Icon name="more" />
            More
          </button>
        </div>
      </nav>
      {moreOpen && (
        <>
          <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setMoreOpen(false)} />
          <div id="more-sheet" className="sheet-in fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-3 lg:hidden">
            {GROUPS.flatMap((g) => g.items)
              .filter((i) => !MOBILE.some((m) => m.to === i.to))
              .concat([{ to: '/settings', label: 'Settings & data', icon: 'gear' }])
              .map((i) => (
                <NavItemLink key={i.to} item={i} />
              ))}
          </div>
        </>
      )}
      <UpdatePrompt />
    </div>
  );
}
