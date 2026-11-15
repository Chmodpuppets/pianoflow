import type { Grade } from './scoring';

/**
 * A guided learning path: ordered stages of lessons, each tied to a bundled song
 * with a recommended hand/speed setup and a grade goal. Completion is derived from
 * the player's existing per-song best result — no extra persistence is required.
 */

export type LessonHands = 'left' | 'right' | 'both';

export interface LessonGoal {
  kind: 'grade';
  grade: Grade;
}

export interface Lesson {
  id: string;
  songId: string;
  hands: LessonHands;
  /** Playback speed multiplier suggested for this lesson (e.g. 0.75). */
  speed: number;
  goal: LessonGoal;
  /** i18n key for the one-line coaching tip shown on the lesson card. */
  tipKey: string;
}

export interface Stage {
  id: string;
  titleKey: string;
  descKey: string;
  lessons: Lesson[];
}

const g = (grade: Grade): LessonGoal => ({ kind: 'grade', grade });

/** The default PianoFlow curriculum: four stages covering all twelve bundled songs. */
export const CURRICULUM: Stage[] = [
  {
    id: 'first-steps',
    titleKey: 'learn.stage.first-steps.title',
    descKey: 'learn.stage.first-steps.desc',
    lessons: [
      { id: 'l1', songId: 'twinkle', hands: 'right', speed: 0.75, goal: g('C'), tipKey: 'learn.tip.l1' },
      { id: 'l2', songId: 'london-bridge', hands: 'right', speed: 0.75, goal: g('C'), tipKey: 'learn.tip.l2' },
      { id: 'l3', songId: 'happy-birthday', hands: 'right', speed: 1, goal: g('C'), tipKey: 'learn.tip.l3' },
    ],
  },
  {
    id: 'finding-feet',
    titleKey: 'learn.stage.finding-feet.title',
    descKey: 'learn.stage.finding-feet.desc',
    lessons: [
      { id: 'l4', songId: 'ode-to-joy', hands: 'both', speed: 0.75, goal: g('C'), tipKey: 'learn.tip.l4' },
      { id: 'l5', songId: 'amazing-grace', hands: 'right', speed: 0.75, goal: g('B'), tipKey: 'learn.tip.l5' },
      { id: 'l6', songId: 'when-the-saints', hands: 'right', speed: 1, goal: g('B'), tipKey: 'learn.tip.l6' },
    ],
  },
  {
    id: 'expression',
    titleKey: 'learn.stage.expression.title',
    descKey: 'learn.stage.expression.desc',
    lessons: [
      { id: 'l7', songId: 'greensleeves', hands: 'right', speed: 0.75, goal: g('B'), tipKey: 'learn.tip.l7' },
      { id: 'l8', songId: 'scarborough-fair', hands: 'both', speed: 0.75, goal: g('B'), tipKey: 'learn.tip.l8' },
      { id: 'l9', songId: 'minuet-in-g', hands: 'both', speed: 1, goal: g('B'), tipKey: 'learn.tip.l9' },
    ],
  },
  {
    id: 'classical-mastery',
    titleKey: 'learn.stage.classical-mastery.title',
    descKey: 'learn.stage.classical-mastery.desc',
    lessons: [
      { id: 'l10', songId: 'canon-in-d', hands: 'both', speed: 0.75, goal: g('A'), tipKey: 'learn.tip.l10' },
      { id: 'l11', songId: 'fur-elise', hands: 'right', speed: 0.75, goal: g('A'), tipKey: 'learn.tip.l11' },
      { id: 'l12', songId: 'prelude-in-c', hands: 'both', speed: 1, goal: g('S'), tipKey: 'learn.tip.l12' },
    ],
  },
];

export type LessonStatus = 'locked' | 'available' | 'completed';

/** The subset of a stored SongRecord the curriculum needs to judge a goal. */
export interface CurriculumRecord {
  bestGrade: Grade;
  bestAccuracy: number;
  plays: number;
}

export interface LessonProgress {
  lesson: Lesson;
  status: LessonStatus;
  bestGrade: Grade | null;
  bestAccuracy: number;
  goalMet: boolean;
}

export interface StageProgress {
  stage: Stage;
  lessons: LessonProgress[];
  completed: number;
  total: number;
  status: 'locked' | 'active' | 'complete';
}

export interface CurriculumSummary {
  total: number;
  completed: number;
  /** id of the first available (next) lesson, or null when everything is done. */
  currentId: string | null;
  pct: number;
}

const GRADE_RANK: Record<Grade, number> = { D: 0, C: 1, B: 2, A: 3, S: 4 };

/** Whether a stored best result satisfies a lesson goal. Never-played => false. */
export function goalMet(goal: LessonGoal, rec: CurriculumRecord | undefined): boolean {
  if (!rec || rec.plays <= 0) return false;
  return GRADE_RANK[rec.bestGrade] >= GRADE_RANK[goal.grade];
}

export function flattenLessons(stages: Stage[]): Lesson[] {
  return stages.flatMap((s) => s.lessons);
}

type RecordSource = ReadonlyMap<string, CurriculumRecord> | Record<string, CurriculumRecord>;

function lookup(records: RecordSource, id: string): CurriculumRecord | undefined {
  if (records instanceof Map) return records.get(id);
  return (records as Record<string, CurriculumRecord>)[id];
}

/**
 * Compute lesson statuses along a single linear path: a lesson is completed when
 * its goal is met by the song's best result; otherwise it is available only if the
 * previous lesson is completed (the first lesson is always available), else locked.
 */
export function buildCurriculumProgress(stages: Stage[], records: RecordSource): LessonProgress[] {
  let prevCompleted = true;
  return flattenLessons(stages).map((lesson) => {
    const rec = lookup(records, lesson.songId);
    const met = goalMet(lesson.goal, rec);
    const status: LessonStatus = met ? 'completed' : prevCompleted ? 'available' : 'locked';
    prevCompleted = met;
    return {
      lesson,
      status,
      bestGrade: rec && rec.plays > 0 ? rec.bestGrade : null,
      bestAccuracy: rec && rec.plays > 0 ? rec.bestAccuracy : -1,
      goalMet: met,
    };
  });
}

/** Group lesson progress by stage, deriving each stage's locked/active/complete state. */
export function buildStageProgress(stages: Stage[], records: RecordSource): StageProgress[] {
  const flat = buildCurriculumProgress(stages, records);
  const byLesson = new Map(flat.map((p) => [p.lesson.id, p]));
  return stages.map((stage) => {
    const lessons = stage.lessons.map((l) => byLesson.get(l.id)!);
    const completed = lessons.filter((p) => p.status === 'completed').length;
    const total = lessons.length;
    const status: StageProgress['status'] =
      completed === total ? 'complete' : lessons.every((p) => p.status === 'locked') ? 'locked' : 'active';
    return { stage, lessons, completed, total, status };
  });
}

export function curriculumSummary(stages: Stage[], records: RecordSource): CurriculumSummary {
  const flat = buildCurriculumProgress(stages, records);
  const total = flat.length;
  const completed = flat.filter((p) => p.status === 'completed').length;
  const current = flat.find((p) => p.status === 'available');
  return { total, completed, currentId: current ? current.lesson.id : null, pct: total ? completed / total : 0 };
}
