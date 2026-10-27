// Typed domain models. Every record carries id + timestamps so backups and
// future cloud sync can reconcile changes without schema rewrites.

export type ID = string;

export interface BaseRecord {
  id: ID;
  createdAt: string; // ISO instant
  updatedAt: string; // ISO instant
  /** Sync bookkeeping: 1 when changed locally and not yet uploaded. */
  _dirty?: 0 | 1;
}

export const PLATFORMS = [
  'LeetCode',
  'GeeksforGeeks',
  'Codeforces',
  'CodeChef',
  'HackerRank',
  'AtCoder',
  'Other'
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const QUESTION_STATUSES = ['Not Started', 'In Progress', 'Solved', 'Needs Revision'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export interface Question extends BaseRecord {
  title: string;
  url: string;
  platform: Platform;
  topic: string;
  subtopic: string;
  difficulty: Difficulty;
  status: QuestionStatus;
  attemptedOn: string | null; // YYYY-MM-DD in user tz
  solvedOn: string | null; // YYYY-MM-DD
  timeSpentMin: number;
  approach: string;
  notes: string;
  code: string;
  timeComplexity: string;
  spaceComplexity: string;
  mistakes: string;
  nextRevisionOn: string | null; // YYYY-MM-DD
  revisionStage: number; // index into revision intervals
  companyTags: string[];
  sheet: string;
}

export const TIME_CATEGORIES = [
  'Coding practice',
  'Frontend learning',
  'Project development',
  'Research and paper reading',
  'Interview preparation',
  'Assessments',
  'Contests',
  'Conferences and workshops'
] as const;
export type TimeCategory = (typeof TIME_CATEGORIES)[number];

export type LinkKind = 'question' | 'learningTask' | 'assessment' | 'project' | 'event';
export interface EntityLink {
  kind: LinkKind;
  id: ID;
  label: string;
}

export interface TimeEntry extends BaseRecord {
  category: TimeCategory;
  start: string; // ISO instant
  end: string; // ISO instant
  durationMin: number;
  note: string;
  link: EntityLink | null;
  source: 'timer' | 'manual';
}

/** Single active timer row (id = 'active'). Elapsed time is derived from timestamps. */
export interface ActiveTimer {
  id: 'active';
  category: TimeCategory;
  note: string;
  link: EntityLink | null;
  startedAt: string; // first start, ISO
  accumulatedMs: number; // time from completed running segments
  runningSince: string | null; // ISO when current segment began; null when paused
}

export const LEARNING_CATEGORIES = [
  'JavaScript and TypeScript',
  'React and Next.js',
  'Angular and RxJS',
  'HTML, CSS, accessibility, and performance',
  'Testing',
  'Frontend architecture and system design',
  'DSA',
  'AI integration in frontend applications'
] as const;
export type LearningCategory = (typeof LEARNING_CATEGORIES)[number];

export const TASK_STATUSES = ['To do', 'Doing', 'Done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface LearningGoal extends BaseRecord {
  title: string;
  category: LearningCategory;
  description: string;
  targetDate: string | null;
  archived: boolean;
}

export interface LearningTask extends BaseRecord {
  goalId: ID;
  title: string;
  status: TaskStatus;
  isMilestone: boolean;
  dueOn: string | null;
  plannedMin: number;
  resourceUrl: string;
  completionNotes: string;
  completedOn: string | null;
  order: number;
}

export const ASSESSMENT_STATUSES = [
  'Planned',
  'Applied',
  'Scheduled',
  'Completed',
  'Passed',
  'Rejected',
  'Cancelled'
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export interface ChecklistItem {
  id: ID;
  text: string;
  done: boolean;
}

export interface Assessment extends BaseRecord {
  company: string;
  title: string;
  platform: string;
  link: string;
  stage: string;
  /** Wall-clock local date-time 'YYYY-MM-DDTHH:mm' in `timezone`. */
  scheduledLocal: string | null;
  timezone: string;
  durationMin: number;
  status: AssessmentStatus;
  checklist: ChecklistItem[];
  topics: string[];
  result: string;
  followUpOn: string | null;
  notes: string;
  relatedTaskIds: ID[];
}

export const PROFILE_PLATFORMS = [
  'GitHub',
  'LinkedIn',
  'LeetCode',
  'GeeksforGeeks',
  'Codeforces',
  'CodeChef',
  'HackerRank',
  'AtCoder',
  'Custom'
] as const;
export type ProfilePlatform = (typeof PROFILE_PLATFORMS)[number];

export interface CodingProfile extends BaseRecord {
  platform: ProfilePlatform;
  label: string;
  username: string;
  url: string;
}

/** Cached responses from verified integrations. Not included in backups. */
export interface IntegrationCache {
  key: string;
  fetchedAt: string;
  data: unknown;
  error: string | null;
}

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  id: 'settings';
  displayName: string;
  timezone: string;
  city: string;
  region: string;
  country: string;
  theme: ThemePref;
  revisionIntervals: number[]; // days
  weeklyTargetsMin: Partial<Record<TimeCategory, number>>;
  lastBackupAt: string | null;
  backupReminderDays: number;
  /** Count active minutes spent inside CodeCompass for the activity map. */
  trackAppUsage: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  displayName: '',
  timezone: 'Asia/Kolkata',
  city: 'Gurugram',
  region: 'Haryana',
  country: 'India',
  theme: 'system',
  revisionIntervals: [1, 3, 7, 14, 30],
  weeklyTargetsMin: {
    'Coding practice': 300,
    'Frontend learning': 180,
    'Interview preparation': 120
  },
  lastBackupAt: null,
  backupReminderDays: 14,
  trackAppUsage: true
};

/**
 * Active minutes spent in CodeCompass on one calendar day on one device.
 * id = 'YYYY-MM-DD__<deviceId>' so two devices never overwrite each other.
 */
export interface AppUsageDay extends BaseRecord {
  minutes: number;
}
