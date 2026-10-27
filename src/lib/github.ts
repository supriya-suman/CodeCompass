import type { CompassDB } from './db';

// Verified integration: GitHub REST API, public endpoints, unauthenticated.
// Called from the browser (api.github.com allows CORS). Unauthenticated calls
// are limited to 60/hour per IP, so results are cached for 15 minutes.
// Docs: https://docs.github.com/en/rest/users/users#get-a-user
//       https://docs.github.com/en/rest/activity/events#list-public-events-for-a-user

export const GITHUB_CACHE_MS = 15 * 60 * 1000;

export interface GithubUser {
  login: string;
  name: string | null;
  html_url: string;
  public_repos: number;
  followers: number;
}

export interface GithubEvent {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: { commits?: unknown[]; action?: string; ref_type?: string };
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  fork: boolean;
}

export interface GithubSnapshot {
  user: GithubUser;
  events: GithubEvent[];
  repos: GithubRepo[];
}

export const isValidGithubUsername = (u: string) => /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(u);

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) throw new Error('GitHub user not found.');
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    const when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'later';
    throw new Error(`GitHub rate limit reached. Try again after ${when}.`);
  }
  if (!res.ok) throw new Error(`GitHub returned ${res.status}.`);
  return res.json() as Promise<T>;
}

export function githubCacheKey(username: string) {
  return `github:${username.toLowerCase()}`;
}

/** Returns cached data when fresh; otherwise fetches, caches and returns. */
export async function refreshGithub(db: CompassDB, username: string, force = false): Promise<GithubSnapshot> {
  if (!isValidGithubUsername(username)) throw new Error('That is not a valid GitHub username.');
  const key = githubCacheKey(username);
  const cached = await db.integrationCache.get(key);
  if (!force && cached?.data && !cached.error && Date.now() - new Date(cached.fetchedAt).getTime() < GITHUB_CACHE_MS) {
    return cached.data as GithubSnapshot;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('You are offline. Showing the last saved GitHub data.');
  try {
    const u = encodeURIComponent(username);
    const [user, events, repos] = await Promise.all([
      getJson<GithubUser>(`https://api.github.com/users/${u}`),
      getJson<GithubEvent[]>(`https://api.github.com/users/${u}/events/public?per_page=30`),
      getJson<GithubRepo[]>(`https://api.github.com/users/${u}/repos?sort=pushed&per_page=12&type=owner`)
    ]);
    const data: GithubSnapshot = { user, events, repos };
    await db.integrationCache.put({ key, fetchedAt: new Date().toISOString(), data, error: null });
    return data;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not reach GitHub.';
    // Keep the last good data, record the error alongside it.
    await db.integrationCache.put({
      key,
      fetchedAt: cached?.fetchedAt ?? new Date(0).toISOString(),
      data: cached?.data ?? null,
      error: message
    });
    throw new Error(message);
  }
}

export function describeEvent(e: GithubEvent): string {
  switch (e.type) {
    case 'PushEvent':
      return `Pushed ${e.payload.commits?.length ?? ''} commit${(e.payload.commits?.length ?? 0) === 1 ? '' : 's'}`.replace('  ', ' ');
    case 'PullRequestEvent':
      return `${e.payload.action ?? 'Updated'} a pull request`;
    case 'IssuesEvent':
      return `${e.payload.action ?? 'Updated'} an issue`;
    case 'CreateEvent':
      return `Created ${e.payload.ref_type ?? 'something'}`;
    case 'WatchEvent':
      return 'Starred';
    case 'ForkEvent':
      return 'Forked';
    default:
      return e.type.replace(/Event$/, '');
  }
}
