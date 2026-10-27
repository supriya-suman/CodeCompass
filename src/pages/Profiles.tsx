import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../app/data';
import { useOnline } from '../app/pwa';
import { Badge, Button, Confirm, EmptyState, ExternalLink, Field, Input, Modal, PageHeader, Panel, Select } from '../components/ui';
import { describeEvent, githubCacheKey, refreshGithub, type GithubSnapshot } from '../lib/github';
import { formatInstant } from '../lib/time';
import { PROFILE_PLATFORMS, type CodingProfile, type ProfilePlatform } from '../lib/types';

/** What each platform actually supports in this build. Kept honest and in one place. */
export const SUPPORT: Record<ProfilePlatform, { level: 'automatic' | 'manual'; note: string }> = {
  GitHub: { level: 'automatic', note: 'Public profile, repositories and recent public activity through the official GitHub REST API. No token needed; limited to 60 requests per hour, so results are cached for 15 minutes.' },
  LinkedIn: { level: 'manual', note: 'Link only. CodeCompass doesn’t sign in to LinkedIn or read your LinkedIn data, and never asks for your LinkedIn password. LinkedIn’s sign-in only shares name and email, not your profile, so it isn’t used.' },
  LeetCode: { level: 'manual', note: 'No official public API. Save your profile link and log problems manually or by CSV import.' },
  GeeksforGeeks: { level: 'manual', note: 'No official public API. Save your profile link and log problems manually or by CSV import.' },
  Codeforces: { level: 'manual', note: 'Has an official public API. Automatic import of your submissions is planned for the next phase; for now, log manually or by CSV.' },
  CodeChef: { level: 'manual', note: 'Official API access requires an approved developer account. Log manually or by CSV.' },
  HackerRank: { level: 'manual', note: 'No public API for personal progress. Log manually or by CSV.' },
  AtCoder: { level: 'manual', note: 'No official public API. Log manually or by CSV.' },
  Custom: { level: 'manual', note: 'Any other platform: save the link and log manually.' }
};

function GithubPanel({ profile }: { profile: CodingProfile }) {
  const { db, settings } = useData();
  const online = useOnline();
  const cache = useLiveQuery(() => db.integrationCache.get(githubCacheKey(profile.username)), [db, profile.username]);
  const [loading, setLoading] = useState(false);
  const data = cache?.data as GithubSnapshot | null | undefined;

  async function refresh(force: boolean) {
    setLoading(true);
    try {
      await refreshGithub(db, profile.username, force);
    } catch {
      /* error is stored in the cache row and shown below */
    } finally {
      setLoading(false);
    }
  }

  const lastOk = data && cache && new Date(cache.fetchedAt).getTime() > 0 ? cache.fetchedAt : null;
  return (
    <div className="mt-3 rounded-lg bg-sunken p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted">
          Source: GitHub REST API · {lastOk ? `last refreshed ${formatInstant(lastOk, settings.timezone)}` : 'not fetched yet'}
        </span>
        <Button size="sm" className="ml-auto" disabled={loading || !online} onClick={() => refresh(true)}>
          {loading ? 'Refreshing…' : online ? (data ? 'Refresh now' : 'Fetch public data') : 'Offline'}
        </Button>
      </div>
      {cache?.error && (
        <p role="alert" className="mt-2 text-danger">
          {cache.error}
          {data ? ' Showing the last data that loaded.' : ''}
        </p>
      )}
      {data && (
        <div className="mt-3 space-y-3">
          <p>
            <strong>{data.user.name || data.user.login}</strong> · {data.user.public_repos} public repos · {data.user.followers} followers
          </p>
          {data.events.length === 0 ? (
            <p className="text-muted">No recent public activity.</p>
          ) : (
            <ul className="space-y-1">
              {data.events.slice(0, 6).map((e) => (
                <li key={e.id} className="flex justify-between gap-3">
                  <span className="truncate">
                    {describeEvent(e)} in {e.repo.name}
                  </span>
                  <span className="shrink-0 text-muted">{formatInstant(e.created_at, settings.timezone)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function Profiles() {
  const { db, repo } = useData();
  const profiles = useLiveQuery(() => db.profiles.toArray(), [db]);
  const [editing, setEditing] = useState<Partial<CodingProfile> | null>(null);
  const [deleting, setDeleting] = useState<CodingProfile | null>(null);
  const [error, setError] = useState('');

  async function save() {
    if (!editing) return;
    const p = { platform: (editing.platform ?? 'GitHub') as ProfilePlatform, label: (editing.label ?? '').trim(), username: (editing.username ?? '').trim(), url: (editing.url ?? '').trim() };
    if (!p.username && !p.url) return setError('Add a username or a profile link.');
    if (p.url && !/^https?:\/\//i.test(p.url)) return setError('Profile link must start with https://');
    if (p.platform === 'GitHub' && !/^[a-zA-Z0-9-]{1,39}$/.test(p.username)) return setError('Enter your GitHub username (letters, numbers and hyphens).');
    if (p.platform === 'GitHub' && !p.url) p.url = `https://github.com/${p.username}`;
    if (editing.id) await repo.update<CodingProfile>('profiles', editing.id, p);
    else await repo.create<CodingProfile>('profiles', p);
    setEditing(null);
    setError('');
  }

  return (
    <>
      <PageHeader
        title="Coding profiles"
        description="Your profiles across platforms, and exactly what each one can sync. Never enter platform passwords here."
        actions={
          <Button variant="primary" onClick={() => setEditing({ platform: 'GitHub' })}>
            Add profile
          </Button>
        }
      />
      {!profiles ? (
        <p className="text-muted">Loading…</p>
      ) : profiles.length === 0 ? (
        <EmptyState title="No profiles saved" action={<Button variant="primary" onClick={() => setEditing({ platform: 'GitHub' })}>Add GitHub</Button>}>
          Start with GitHub to see your public activity on the overview.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {profiles.map((p) => (
            <li key={p.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{p.label || p.platform}</p>
                  <p className="truncate text-sm text-muted">
                    {p.platform}
                    {p.username ? ` · ${p.username}` : ''}
                  </p>
                </div>
                <Badge tone={SUPPORT[p.platform].level === 'automatic' ? 'ok' : 'neutral'}>{SUPPORT[p.platform].level === 'automatic' ? 'Automatic: public data' : 'Link saved · manual logging'}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {p.url && (
                  <ExternalLink href={p.url} className="mr-auto text-sm">
                    Open profile
                  </ExternalLink>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}>
                  Remove
                </Button>
              </div>
              {p.platform === 'GitHub' && p.username && <GithubPanel profile={p} />}
              {SUPPORT[p.platform].level === 'manual' && (
                <p className="mt-3 text-sm text-muted">
                  {SUPPORT[p.platform].note}{' '}
                  <Link to="/questions" className="text-accent underline">
                    Go to questions
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Panel title="What each platform supports" className="mt-8">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2 pr-4 font-medium">Platform</th>
                <th className="py-2 pr-4 font-medium">In this version</th>
                <th className="py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PROFILE_PLATFORMS.map((p) => (
                <tr key={p}>
                  <td className="py-2 pr-4 font-medium">{p}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={SUPPORT[p].level === 'automatic' ? 'ok' : 'neutral'}>{SUPPORT[p].level === 'automatic' ? 'Automatic' : 'Manual / CSV'}</Badge>
                  </td>
                  <td className="py-2 text-muted">{SUPPORT[p].note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={!!editing} onClose={() => { setEditing(null); setError(''); }} title={editing?.id ? 'Edit profile' : 'Add profile'}>
        {editing && (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <Field label="Platform">
              {(id) => (
                <Select id={id} value={editing.platform} onChange={(e) => setEditing({ ...editing, platform: e.target.value as ProfilePlatform })}>
                  {PROFILE_PLATFORMS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Username">{(id) => <Input id={id} autoComplete="off" value={editing.username ?? ''} onChange={(e) => setEditing({ ...editing, username: e.target.value })} />}</Field>
            <Field label="Profile link" hint={editing.platform === 'GitHub' ? 'Filled in from the username if left blank.' : undefined}>
              {(id) => <Input id={id} type="url" placeholder="https://" value={editing.url ?? ''} onChange={(e) => setEditing({ ...editing, url: e.target.value })} />}
            </Field>
            {editing.platform === 'Custom' && <Field label="Name">{(id) => <Input id={id} value={editing.label ?? ''} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />}</Field>}
            <p className="text-sm text-muted">{SUPPORT[(editing.platform ?? 'GitHub') as ProfilePlatform].note}</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" variant="primary">
                Save profile
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Confirm
        open={!!deleting}
        title="Remove this profile?"
        body="The saved link is removed. Questions you logged are not affected."
        confirmLabel="Remove profile"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) {
            await repo.remove('profiles', deleting.id);
            if (deleting.platform === 'GitHub') await db.integrationCache.delete(githubCacheKey(deleting.username));
          }
          setDeleting(null);
        }}
      />
    </>
  );
}
