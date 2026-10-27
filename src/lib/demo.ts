import type { CompassDB } from './db';
import { newId } from './id';
import { STARTER_PLANS } from './starter';
import { addDays, todayIn, zonedToUtc } from './time';
import type { AppUsageDay, Assessment, Difficulty, LearningGoal, LearningTask, Question, TimeCategory, TimeEntry } from './types';
import { DEFAULT_SETTINGS } from './types';

// Demo data lives only in the separate demo database. Company names are
// deliberately fictional so they can't be mistaken for real records.

const TZ = 'Asia/Kolkata';

export async function seedDemo(db: CompassDB, now = new Date()) {
  const today = todayIn(TZ, now);
  const iso = now.toISOString();
  const base = { createdAt: iso, updatedAt: iso };

  const qs: [string, string, string, Difficulty, number, string | null][] = [
    ['Two Sum', 'https://leetcode.com/problems/two-sum/', 'Arrays', 'Easy', -9, 'Hashing'],
    ['Longest Substring Without Repeating Characters', 'https://leetcode.com/problems/longest-substring-without-repeating-characters/', 'Sliding Window', 'Medium', -8, null],
    ['Valid Parentheses', 'https://leetcode.com/problems/valid-parentheses/', 'Stack', 'Easy', -7, null],
    ['Binary Search', 'https://leetcode.com/problems/binary-search/', 'Binary Search', 'Easy', -6, null],
    ['Number of Islands', 'https://leetcode.com/problems/number-of-islands/', 'Graphs', 'Medium', -4, 'BFS/DFS'],
    ['Coin Change', 'https://leetcode.com/problems/coin-change/', 'Dynamic Programming', 'Medium', -3, '1D DP'],
    ['Merge k Sorted Lists', 'https://leetcode.com/problems/merge-k-sorted-lists/', 'Heap', 'Hard', -2, null],
    ['Maximum Depth of Binary Tree', 'https://leetcode.com/problems/maximum-depth-of-binary-tree/', 'Trees', 'Easy', -1, null],
    ['Watermelon', 'https://codeforces.com/problemset/problem/4/A', 'Math', 'Easy', 0, null]
  ];
  const questions: Question[] = qs.map(([title, url, topic, difficulty, offset, sub], i) => {
    const solvedOn = addDays(today, offset);
    return {
      ...base,
      id: newId(),
      title,
      url,
      platform: url.includes('codeforces') ? 'Codeforces' : 'LeetCode',
      topic,
      subtopic: sub ?? '',
      difficulty,
      status: i === 6 ? 'Needs Revision' : 'Solved',
      attemptedOn: solvedOn,
      solvedOn,
      timeSpentMin: 15 + i * 6,
      approach: 'Demo note: describe the core idea in one or two lines.',
      notes: '',
      code: '',
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(1)',
      mistakes: i === 6 ? 'Forgot to handle empty lists.' : '',
      nextRevisionOn: addDays(solvedOn, i % 2 ? 1 : 3),
      revisionStage: 0,
      companyTags: [],
      sheet: 'Demo sheet'
    };
  });
  questions.push({
    ...questions[0],
    id: newId(),
    title: 'Trapping Rain Water',
    url: 'https://leetcode.com/problems/trapping-rain-water/',
    topic: 'Two Pointers',
    difficulty: 'Hard',
    status: 'In Progress',
    solvedOn: null,
    nextRevisionOn: null
  });

  const plan = STARTER_PLANS['React and Next.js'];
  const goal: LearningGoal = {
    ...base,
    id: newId(),
    title: plan.title,
    category: 'React and Next.js',
    description: plan.description,
    targetDate: addDays(today, 21),
    archived: false
  };
  const tasks: LearningTask[] = plan.tasks.map((t, i) => ({
    ...base,
    id: newId(),
    goalId: goal.id,
    title: t.title,
    status: i < 2 ? 'Done' : i === 2 ? 'Doing' : 'To do',
    isMilestone: !!t.isMilestone,
    dueOn: addDays(today, i * 3 - 2),
    plannedMin: t.plannedMin,
    resourceUrl: t.resourceUrl ?? '',
    completionNotes: i < 2 ? 'Demo completion note.' : '',
    completedOn: i < 2 ? addDays(today, i - 4) : null,
    order: i
  }));

  const cats: TimeCategory[] = ['Coding practice', 'Frontend learning', 'Interview preparation', 'Project development'];
  const timeEntries: TimeEntry[] = [];
  for (let d = -9; d <= 0; d++) {
    const day = addDays(today, d);
    cats.forEach((c, ci) => {
      if ((d + ci) % 3 === 0) return;
      const start = zonedToUtc(`${day}T${String(19 + ci).padStart(2, '0')}:00`, TZ);
      const mins = 25 + ((d * 7 + ci * 13) % 4 + 4) * 10;
      timeEntries.push({
        ...base,
        id: newId(),
        category: c,
        start: start.toISOString(),
        end: new Date(start.getTime() + mins * 60000).toISOString(),
        durationMin: mins,
        note: 'Demo session',
        link: null,
        source: 'manual'
      });
    });
  }

  const mkA = (company: string, title: string, dayOffset: number, status: Assessment['status'], stage: string): Assessment => ({
    ...base,
    id: newId(),
    company,
    title,
    platform: 'Video call',
    link: '',
    stage,
    scheduledLocal: `${addDays(today, dayOffset)}T11:00`,
    timezone: TZ,
    durationMin: 60,
    status,
    checklist: [
      { id: newId(), text: 'Review frontend system design notes', done: dayOffset < 0 },
      { id: newId(), text: 'Two timed medium problems', done: false }
    ],
    topics: ['React', 'System design'],
    result: '',
    followUpOn: dayOffset < 0 ? addDays(today, -1) : null,
    notes: '',
    relatedTaskIds: []
  });
  const assessments = [
    mkA('Demo Co. (fictional)', 'Senior Frontend Engineer — technical round', 2, 'Scheduled', 'Round 1'),
    mkA('Sample Labs (fictional)', 'Online assessment', 5, 'Scheduled', 'OA'),
    mkA('Example Systems (fictional)', 'Hiring manager chat', -3, 'Completed', 'HM')
  ];

  // A year of lighter history so the activity map has something to show.
  // Deterministic pattern: busier weekdays, quiet stretches, a few big days.
  const history: TimeEntry[] = [];
  const appUsage: AppUsageDay[] = [];
  const histCats: TimeCategory[] = ['Coding practice', 'Frontend learning', 'Interview preparation', 'Project development', 'Contests'];
  for (let d = -364; d < -9; d++) {
    const day = addDays(today, d);
    const wave = Math.sin(d / 9) + Math.sin(d / 23);
    if (wave < -0.6 || (d * 7) % 11 === 0) continue;
    const n = wave > 1 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const c = histCats[Math.abs(Math.floor(d / 6) + k) % histCats.length];
      const mins = 20 + Math.round((wave + 2) * 25) + ((d * 13 + k * 7) % 4) * 10;
      const start = zonedToUtc(`${day}T${String(8 + k * 10).padStart(2, '0')}:30`, TZ);
      history.push({ ...base, id: newId(), category: c, start: start.toISOString(), end: new Date(start.getTime() + mins * 60000).toISOString(), durationMin: mins, note: 'Demo session', link: null, source: 'manual' });
    }
  }
  for (let d = -120; d <= 0; d++) {
    if ((d * 5) % 7 === 0) continue;
    appUsage.push({ ...base, id: `${addDays(today, d)}__demo`, minutes: 5 + Math.abs((d * 17) % 25) });
  }

  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.settings.put({ ...DEFAULT_SETTINGS, displayName: 'Demo user' });
    await db.questions.bulkAdd(questions);
    await db.goals.add(goal);
    await db.tasks.bulkAdd(tasks);
    await db.timeEntries.bulkAdd([...timeEntries, ...history]);
    await db.appUsage.bulkAdd(appUsage);
    await db.assessments.bulkAdd(assessments);
    await db.profiles.add({ ...base, id: newId(), platform: 'LeetCode', label: 'Demo profile', username: 'demo-user', url: 'https://leetcode.com/' });
  });
}
