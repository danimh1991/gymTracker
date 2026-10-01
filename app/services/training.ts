import type {
  DayKey,
  Snapshot,
  Workout,
  WorkoutSet,
  RoutineExercise,
} from "../domain/types";
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
export function previousSets(
  data: Snapshot,
  exerciseId: string,
  before = new Date().toISOString(),
  dayId?: DayKey,
): WorkoutSet[] {
  const workout = completedWorkouts(data).find(
    (w) =>
      w.startedAt < before &&
      (!dayId || w.dayId === dayId) &&
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
