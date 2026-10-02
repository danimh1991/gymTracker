import type { Snapshot } from "../domain/types";
export function workoutBackup(data: Snapshot) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts: data.workouts
      .filter((workout) => workout.status === "completed")
      .map((workout) => ({
        sourceId: workout.id,
        dayId: workout.dayId,
        startedAt: workout.startedAt,
        finishedAt: workout.finishedAt,
        bodyweight: workout.bodyweight,
        notes: workout.notes,
        templateName: workout.templateName,
        exercises: data.workoutExercises
          .filter((exercise) => exercise.workoutId === workout.id)
          .sort((a, b) => a.position - b.position)
          .map((exercise) => ({
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            sets: exercise.sets,
            repMin: exercise.repMin,
            repMax: exercise.repMax,
            rir: exercise.rir,
            optional: exercise.optional,
            notes: exercise.notes,
            priority: exercise.priority,
            metricType: exercise.metricType,
            bodyweightExercise: exercise.bodyweightExercise,
            supportsAssistance: exercise.supportsAssistance,
            supportsAddedWeight: exercise.supportsAddedWeight,
            variant: exercise.variant,
            setsDone: data.sets
              .filter((set) => set.workoutExerciseId === exercise.id)
              .sort((a, b) => a.setNumber - b.setNumber)
              .map(
                ({
                  setNumber,
                  reps,
                  weight,
                  bodyweight,
                  assistanceWeight,
                  addedWeight,
                  RIR,
                  RPE,
                  durationSeconds,
                  distance,
                  notes,
                  timestamp,
                }) => ({
                  setNumber,
                  reps,
                  weight,
                  bodyweight,
                  assistanceWeight,
                  addedWeight,
                  RIR,
                  RPE,
                  durationSeconds,
                  distance,
                  notes,
                  timestamp,
                }),
              ),
          })),
      })),
  };
}

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(rows: object[]): string {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const cell = (value: unknown) => {
    let s = value === null || value === undefined ? "" : String(value);
    if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return (
    "\ufeff" +
    [
      columns.map(cell).join(","),
      ...rows.map((row) =>
        columns.map((k) => cell((row as Record<string, unknown>)[k])).join(","),
      ),
    ].join("\r\n")
  );
}
export function exportData(
  data: Snapshot,
  kind: "json" | "workouts" | "sets",
  demo: boolean,
) {
  const text =
    kind === "json"
      ? JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            space: demo ? "demo" : "real",
            ...data,
          },
          null,
          2,
        )
      : csv(kind === "workouts" ? data.workouts : data.sets);
  const blob = new Blob([text], {
      type: kind === "json" ? "application/json" : "text/csv;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `gym-tracker-${demo ? "demo-" : ""}${kind}-${new Date().toISOString().slice(0, 10)}.${kind === "json" ? "json" : "csv"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
