import type {
  DayKey,
  LoadDecision,
  Snapshot,
  Workout,
  WorkoutSet,
  RoutineExercise,
} from "../domain/types";

export function previousLoadDecision(
  data: Snapshot,
  exerciseId: string,
  before = new Date().toISOString(),
): LoadDecision | null {
  const previousWorkout = completedWorkouts(data).find(
    (workout) =>
      workout.startedAt < before &&
      data.workoutExercises.some(
        (exercise) =>
          exercise.workoutId === workout.id &&
          exercise.exerciseId === exerciseId &&
          exercise.nextLoadAction,
      ),
  );
  return (
    data.workoutExercises.find(
      (exercise) =>
        exercise.workoutId === previousWorkout?.id &&
        exercise.exerciseId === exerciseId &&
        exercise.nextLoadAction,
    )?.nextLoadAction ?? null
  );
}
export function getNextRoutineDay(
  last?: DayKey | null,
  days: DayKey[] = ["A", "B", "C"],
): DayKey {
  if (!days.length) return "A";
  return days[(days.indexOf(last as DayKey) + 1) % days.length] ?? "A";
}
export function completedWorkouts(data: Snapshot): Workout[] {
  return data.workouts
    .filter((w) => w.status === "completed")
    .sort((a, b) =>
      (b.finishedAt ?? b.startedAt).localeCompare(a.finishedAt ?? a.startedAt),
    );
}
export function completedRoutineWorkouts(data: Snapshot): Workout[] {
  return completedWorkouts(data).filter((workout) => !workout.isFreeDay);
}
export function previousSets(
  data: Snapshot,
  exerciseId: string,
  before = new Date().toISOString(),
): WorkoutSet[] {
  const workout = completedWorkouts(data).find(
    (w) =>
      w.startedAt < before &&
      data.sets.some(
        (s) =>
          s.workoutId === w.id && s.exerciseId === exerciseId && s.completed,
      ),
  );
  return workout
    ? data.sets
        .filter(
          (s) =>
            s.workoutId === workout.id &&
            s.exerciseId === exerciseId &&
            s.completed,
        )
        .sort((a, b) => a.setNumber - b.setNumber)
    : [];
}
export function evaluateDoubleProgression(
  sets: WorkoutSet[],
  target: Pick<RoutineExercise, "sets" | "repMax">,
  metric: "reps" | "durationSeconds" = "reps",
): boolean {
  const done = sets.filter((s) => s.completed);
  return (
    done.length === target.sets &&
    done.every((s) => (s[metric] ?? -1) >= target.repMax)
  );
}
export function evaluatePullupProgression(
  sets: WorkoutSet[],
  target = 3,
): string | null {
  return sets.every(
    (s) => !(s.assistanceWeight ?? 0) && !(s.addedWeight ?? 0),
  ) && evaluateDoubleProgression(sets, { sets: 4, repMax: target })
    ? `Has completado 4 × ${target}. Puedes comenzar a introducir series de ${target + 1} repeticiones.`
    : null;
}
export function evaluateDipProgression(sets: WorkoutSet[]): string | null {
  return evaluateDoubleProgression(sets, { sets: 3, repMax: 10 }) &&
    sets.every(
      (s) =>
        s.RIR !== null &&
        s.RIR >= 1 &&
        s.RIR <= 2 &&
        !(s.addedWeight ?? 0) &&
        !(s.assistanceWeight ?? 0),
    )
    ? "Si mantuviste una técnica correcta, puedes empezar a introducir fondos lastrados."
    : null;
}
export function detectPersonalRecord(
  previous: number[],
  current: number,
): boolean {
  return current > 0 && current > Math.max(0, ...previous);
}
export function stats(sets: WorkoutSet[]) {
  const done = sets.filter((s) => s.completed);
  return {
    sets: done.length,
    reps: done.reduce((n, s) => n + (s.reps ?? 0), 0),
    failure: done.length
      ? Math.round((done.filter((s) => s.RIR === 0).length / done.length) * 100)
      : 0,
    unknownRIR: done.filter((s) => s.RIR === null).length,
  };
}

/**
 * Load that the athlete actually moves. For calisthenics this includes body
 * weight and accounts for added weight or assistance; for gym exercises it is
 * the recorded external load.
 */
export function effectiveLoad(set: WorkoutSet): number | null {
  const hasBodyweightLoad =
    set.bodyweight !== null ||
    set.addedWeight !== null ||
    set.assistanceWeight !== null;
  if (hasBodyweightLoad) {
    const load =
      (set.bodyweight ?? 0) +
      (set.addedWeight ?? 0) -
      (set.assistanceWeight ?? 0);
    return load > 0 ? load : null;
  }
  return set.weight !== null && set.weight > 0 ? set.weight : null;
}

/**
 * RIR-adjusted Epley estimate. `reps + RIR` approximates how many repetitions
 * the athlete could have completed at that load, making submaximal sets more
 * comparable without rewarding training to failure.
 */
export function estimatedOneRepMax(set: WorkoutSet): number | null {
  const load = effectiveLoad(set);
  if (!load || !set.reps || set.reps <= 0) return null;
  const potentialReps = set.reps + Math.max(0, set.RIR ?? 0);
  return load * (1 + potentialReps / 30);
}
export function loadLabel(s: WorkoutSet, bw = true) {
  if (!bw) return `${s.weight ?? 0} kg`;
  if (s.assistanceWeight) return `BW − ${s.assistanceWeight} kg`;
  if (s.addedWeight) return `BW + ${s.addedWeight} kg`;
  return "BW";
}
export function historicalExercise(
  name: string,
  weight: number,
): { exerciseId: string | null; assistanceWeight: number | null } {
  const normalized = name.trim().toLocaleLowerCase("es");
  if (normalized === "dominadas asistidas")
    return weight === 1
      ? { exerciseId: "pullup-close", assistanceWeight: 0 }
      : { exerciseId: "pullup-assisted", assistanceWeight: weight };
  return { exerciseId: null, assistanceWeight: null };
}
