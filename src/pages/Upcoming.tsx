import { Link } from 'react-router-dom';
import { PageHeader, Panel } from '../components/ui';

// Honest placeholder for areas planned in later build phases. No actions here
// pretend to work; the page explains what is coming and what to use meanwhile.

const AREAS = {
  discover: {
    title: 'Discover',
    description: 'Contests, hackathons, conferences, meetups and calls for papers matched to your skills and location.',
    planned: [
      'Live coding-contest listings from a documented public source (Codeforces contest API first), cached and labelled with source and fetch time.',
      'Manual entry and import for conferences, hackathons and CFPs, with fields left as “Not provided” unless you enter them.',
      'Transparent match rules using your skills, Delhi NCR location preference, dates and online-only setting — each card explains why it matched.',
      'Save, dismiss and “mark as applied” after you finish the organizer’s own process. Nothing is ever submitted for you.'
    ],
    meanwhile: { to: '/assessments', label: 'Track interviews and tests' }
  },
  research: {
    title: 'Research',
    description: 'A reading list, calls for papers and your own paper ideas in one place.',
    planned: [
      'Paper reading list with DOI, authors, tags, reading status and notes.',
      'Metadata lookup through the official arXiv and Crossref APIs, showing source and retrieval date.',
      'Calls for papers and submission deadlines kept separate from actual submissions.',
      'Your own paper ideas with milestones and submission status.'
    ],
    meanwhile: { to: '/learning', label: 'Plan study goals' }
  },
  portfolio: {
    title: 'Portfolio',
    description: 'Projects, achievements and a shareable portfolio you publish yourself.',
    planned: [
      'Featured projects from your GitHub repositories, plus screenshots, stack and live links.',
      'Certificates, awards and contest results.',
      'Choose exactly which fields are public, preview them, then export a standalone static site.',
      'Step-by-step instructions to publish that export with GitHub and Vercel. Private notes and results stay excluded by default.'
    ],
    meanwhile: { to: '/profiles', label: 'Connect GitHub activity' }
  }
} as const;

export default function Upcoming({ area }: { area: keyof typeof AREAS }) {
  const a = AREAS[area];
  return (
    <>
      <PageHeader title={a.title} description={a.description} />
      <Panel title="Not built yet">
        <p className="text-sm text-muted">This area is planned for the next build phase. Nothing on this page stores or fetches data yet. It will include:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {a.planned.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          Meanwhile:{' '}
          <Link to={a.meanwhile.to} className="font-semibold text-accent underline">
            {a.meanwhile.label}
          </Link>
        </p>
      </Panel>
    </>
  );
}
