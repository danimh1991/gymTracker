import type { Exercise, PlanExercise } from "../domain/types";

export interface ImportedTemplate {
  exercises: PlanExercise[];
  [key: string]: unknown;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

function alias(value: string) {
  return normalized(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function reconcileTemplateExercises<T extends ImportedTemplate>(
  templates: T[],
  importedExercises: Exercise[],
  library: Exercise[],
) {
  const libraryIds = new Set(library.map((exercise) => exercise.id));
  const libraryByName = new Map(
    library.map((exercise) => [normalized(exercise.name), exercise.id]),
  );
  const libraryByAlias = new Map(
    library.flatMap((exercise) => [
      [alias(exercise.name), exercise.id],
      [alias(exercise.shortName), exercise.id],
    ]),
  );
  const importedById = new Map(
    importedExercises.map((exercise) => [exercise.id, exercise]),
  );
  const missing = new Set<string>();

  const reconciled: T[] = templates.map((template) => ({
    ...template,
    exercises: template.exercises.map((exercise) => {
      if (libraryIds.has(exercise.exerciseId)) return exercise;
      const imported = importedById.get(exercise.exerciseId);
      const replacement = imported
        ? libraryByName.get(normalized(imported.name))
        : libraryByAlias.get(alias(exercise.exerciseId));
      if (!replacement) {
        missing.add(exercise.exerciseId);
        return exercise;
      }
      return { ...exercise, exerciseId: replacement };
    }),
  }));

  return { templates: reconciled, missing: [...missing].sort() };
}
