import { lazy, Suspense, useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AccountProvider, useAccount } from './app/account';
import { DataProvider } from './app/data';
import { Layout } from './app/Layout';
import { LegacyDataPrompt } from './app/LegacyDataPrompt';
import { LOCAL_DB_NAME, userDbName } from './lib/db';
import { NotFound } from './pages/NotFound';

// Route-level code splitting: each page is its own chunk.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Questions = lazy(() => import('./pages/Questions'));
const Revision = lazy(() => import('./pages/Revision'));
const TimePage = lazy(() => import('./pages/Time'));
const Learning = lazy(() => import('./pages/Learning'));
const Assessments = lazy(() => import('./pages/Assessments'));
const Profiles = lazy(() => import('./pages/Profiles'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Upcoming = lazy(() => import('./pages/Upcoming'));
const SignIn = lazy(() => import('./pages/SignIn'));
const Activity = lazy(() => import('./pages/Activity'));

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/activity', element: <Activity /> },
      { path: '/questions', element: <Questions /> },
      { path: '/revision', element: <Revision /> },
      { path: '/time', element: <TimePage /> },
      { path: '/learning', element: <Learning /> },
      { path: '/assessments', element: <Assessments /> },
      { path: '/profiles', element: <Profiles /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/discover', element: <Upcoming area="discover" /> },
      { path: '/research', element: <Upcoming area="research" /> },
      { path: '/portfolio', element: <Upcoming area="portfolio" /> },
      { path: '*', element: <NotFound /> }
    ]
  }
]);

const Splash = () => (
  <div className="flex min-h-dvh items-center justify-center text-muted" role="status">
    Loading…
  </div>
);

function Gate() {
  const { status, uid } = useAccount();
  const [guestDemo, setGuestDemo] = useState(false);

  if (status === 'loading') return <Splash />;

  if (status === 'unconfigured') {
    // Accounts not set up for this build: data stays in this browser only.
    return (
      <DataProvider realDbName={LOCAL_DB_NAME} scope="local">
        <RouterProvider router={router} />
      </DataProvider>
    );
  }

  if (status === 'signedOut') {
    if (!guestDemo) {
      return (
        <Suspense fallback={<Splash />}>
          <SignIn onExploreDemo={() => setGuestDemo(true)} />
        </Suspense>
      );
    }
    return (
      <DataProvider realDbName={null} scope="guest" onExitGuest={() => setGuestDemo(false)}>
        <RouterProvider router={router} />
      </DataProvider>
    );
  }

  // Signed in: this account's own database. `key` remounts everything when
  // the account changes so no state from a previous person survives.
  return (
    <DataProvider key={uid} realDbName={userDbName(uid!)} scope={uid!}>
      <RouterProvider router={router} />
      <LegacyDataPrompt />
    </DataProvider>
  );
}

export function App() {
  return (
    <AccountProvider>
      <Gate />
    </AccountProvider>
  );
}
