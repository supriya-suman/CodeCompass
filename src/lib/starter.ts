import type { LearningCategory } from './types';

// Original starter content. Resources point to official documentation rather
// than copying any proprietary problem list or course.

export const DSA_TOPICS = [
  'Arrays',
  'Strings',
  'Hashing',
  'Two Pointers',
  'Sliding Window',
  'Binary Search',
  'Stack',
  'Queue',
  'Linked List',
  'Recursion',
  'Backtracking',
  'Trees',
  'Binary Search Tree',
  'Heap',
  'Graphs',
  'Greedy',
  'Dynamic Programming',
  'Trie',
  'Bit Manipulation',
  'Math'
];

export interface StarterTask {
  title: string;
  plannedMin: number;
  resourceUrl?: string;
  isMilestone?: boolean;
}

export const STARTER_PLANS: Record<LearningCategory, { title: string; description: string; tasks: StarterTask[] }> = {
  'JavaScript and TypeScript': {
    title: 'Sharpen JS and TS fundamentals',
    description: 'Revisit the runtime model and the type system at interview depth.',
    tasks: [
      { title: 'Explain the event loop, microtasks and macrotasks with an example', plannedMin: 60, resourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop' },
      { title: 'Closures, scope and this-binding: write 5 small puzzles and solve them', plannedMin: 90 },
      { title: 'Implement debounce, throttle and a Promise.all polyfill', plannedMin: 90 },
      { title: 'TypeScript generics, conditional and mapped types', plannedMin: 120, resourceUrl: 'https://www.typescriptlang.org/docs/handbook/2/types-from-types.html' },
      { title: 'Milestone: type a small typed event-emitter library end to end', plannedMin: 120, isMilestone: true }
    ]
  },
  'React and Next.js': {
    title: 'Modern React and Next.js',
    description: 'Rendering model, server components and data fetching patterns.',
    tasks: [
      { title: 'Reconciliation, keys and when components re-render', plannedMin: 60, resourceUrl: 'https://react.dev/learn/preserving-and-resetting-state' },
      { title: 'Hooks deep dive: effects, refs, useSyncExternalStore', plannedMin: 90, resourceUrl: 'https://react.dev/reference/react' },
      { title: 'Server and client components, streaming and Suspense', plannedMin: 120, resourceUrl: 'https://nextjs.org/docs' },
      { title: 'Caching and revalidation in the App Router', plannedMin: 90 },
      { title: 'Milestone: build a small app with a server action and optimistic UI', plannedMin: 180, isMilestone: true }
    ]
  },
  'Angular and RxJS': {
    title: 'Angular with signals and RxJS',
    description: 'Current Angular patterns and reactive streams.',
    tasks: [
      { title: 'Standalone components, DI and control flow syntax', plannedMin: 90, resourceUrl: 'https://angular.dev/overview' },
      { title: 'Signals: computed, effect and interop with observables', plannedMin: 90, resourceUrl: 'https://angular.dev/guide/signals' },
      { title: 'RxJS higher-order mapping: switchMap vs mergeMap vs concatMap vs exhaustMap', plannedMin: 60, resourceUrl: 'https://rxjs.dev/guide/overview' },
      { title: 'Change detection strategies and zoneless mode', plannedMin: 60 }
    ]
  },
  'HTML, CSS, accessibility, and performance': {
    title: 'Platform quality: a11y and performance',
    description: 'Semantic markup, modern CSS, WCAG and Core Web Vitals.',
    tasks: [
      { title: 'Audit a page for keyboard and screen-reader access', plannedMin: 60, resourceUrl: 'https://www.w3.org/WAI/ARIA/apg/' },
      { title: 'Modern CSS: container queries, :has(), cascade layers', plannedMin: 90, resourceUrl: 'https://developer.mozilla.org/en-US/docs/Web/CSS' },
      { title: 'Core Web Vitals: measure and fix LCP, INP, CLS', plannedMin: 90, resourceUrl: 'https://web.dev/articles/vitals' },
      { title: 'Milestone: take one real page from failing to passing Lighthouse a11y', plannedMin: 120, isMilestone: true }
    ]
  },
  Testing: {
    title: 'Testing strategy for frontend',
    description: 'Unit, component, and end-to-end tests that are worth their cost.',
    tasks: [
      { title: 'Write component tests that query by role, not implementation', plannedMin: 60, resourceUrl: 'https://testing-library.com/docs/queries/about' },
      { title: 'Mock network at the boundary (MSW or equivalent)', plannedMin: 60 },
      { title: 'One end-to-end happy path with Playwright', plannedMin: 90, resourceUrl: 'https://playwright.dev/docs/intro' }
    ]
  },
  'Frontend architecture and system design': {
    title: 'Frontend system design practice',
    description: 'Practise structured answers for senior-level design rounds.',
    tasks: [
      { title: 'Design an autocomplete: API, caching, debouncing, a11y', plannedMin: 60 },
      { title: 'Design a news feed with infinite scroll and offline support', plannedMin: 60 },
      { title: 'Micro-frontends: when they help and what they cost', plannedMin: 60 },
      { title: 'Design system architecture: tokens, theming, versioning', plannedMin: 60 },
      { title: 'Milestone: record yourself answering one design prompt in 45 minutes', plannedMin: 60, isMilestone: true }
    ]
  },
  DSA: {
    title: 'DSA foundations sweep',
    description: 'Cover every core topic at least once, then revise on schedule.',
    tasks: [
      { title: 'Arrays, hashing and two pointers: 8 problems', plannedMin: 240 },
      { title: 'Sliding window and binary search: 6 problems', plannedMin: 180 },
      { title: 'Trees and graphs traversal: 8 problems', plannedMin: 240 },
      { title: 'Dynamic programming patterns: 8 problems', plannedMin: 300 },
      { title: 'Milestone: one timed mock with two mediums in 60 minutes', plannedMin: 60, isMilestone: true }
    ]
  },
  'AI integration in frontend applications': {
    title: 'AI features in frontend apps',
    description: 'Streaming UIs, tool use and safe handling of model output.',
    tasks: [
      { title: 'Stream a model response into the UI with cancellation', plannedMin: 90 },
      { title: 'Keep API keys server-side: proxy through a serverless function', plannedMin: 60 },
      { title: 'Render model output safely (no raw HTML) and handle errors', plannedMin: 60 },
      { title: 'Milestone: ship a small feature with structured output and evals', plannedMin: 180, isMilestone: true }
    ]
  }
};
