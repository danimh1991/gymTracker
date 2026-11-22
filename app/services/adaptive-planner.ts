import { z } from "zod";
import type {
  AdaptiveConstraints,
  AdaptiveContext,
  AdaptiveNeed,
  Exercise,
  MuscleGroup,
  PlanExercise,
  Snapshot,
  TrainerSettings,
} from "../domain/types";
import { previousSets } from "./training";

export const ADAPTIVE_RULES_VERSION = "adaptive-1.0";

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "vertical_pull", "horizontal_pull", "chest", "vertical_push",
  "lateral_rear_delts", "biceps", "triceps", "quadriceps",
  "posterior_chain", "core", "calves",
];

export const DEFAULT_PRIORITIES: Record<MuscleGroup, number> = {
  vertical_pull: 5,
  horizontal_pull: 4,
  chest: 4,
  vertical_push: 3,
  lateral_rear_delts: 4,
  biceps: 4,
  triceps: 4,
  quadriceps: 3,
  posterior_chain: 3,
  core: 2,
  calves: 2,
};

const TARGET_DIRECT_SETS_10D: Record<MuscleGroup, number> = {
  vertical_pull: 7,
  horizontal_pull: 6,
  chest: 7,
  vertical_push: 4,
  lateral_rear_delts: 4,
  biceps: 5,
  triceps: 4,
  quadriceps: 5,
  posterior_chain: 5,
  core: 4,
  calves: 3,
};

export function defaultTrainerSettings(trainingDays = 3): TrainerSettings {
  return {
    trainingDays,
    adaptiveEnabled: 1,
    defaultDurationMinutes: 50,
    usualFrequency: 2,
    variationLevel: 2,
    priorities: { ...DEFAULT_PRIORITIES },
    exercisePreferences: {
      pullup: 5,
      dip: 5,
      handstand: 1,
      bulgarian: 2,
      rdl: 2,
    },
    availableEquipment: [],
  };
}

type Stimulus = { primary: MuscleGroup[]; secondary: MuscleGroup[]; fatigue: number };

export function exerciseStimulus(exercise: Exercise): Stimulus {
  const pattern = exercise.movementPattern.toLowerCase();
  const name = `${exercise.name} ${exercise.primaryMuscles}`.toLowerCase();
  const primary = new Set<MuscleGroup>();
  const secondary = new Set<MuscleGroup>();
  if (pattern.includes("vertical_pull") || /dominada|jalón/.test(name)) {
    primary.add("vertical_pull"); secondary.add("biceps");
  }
  if (pattern.includes("horizontal_pull") || /remo/.test(name)) {
    primary.add("horizontal_pull"); secondary.add("biceps");
  }
  if (pattern.includes("horizontal_push") || /press.*pecho|flexion/.test(name)) {
    primary.add("chest"); secondary.add("triceps");
  }
  if (pattern.includes("vertical_push") || /press.*hombro|fondos|pike/.test(name)) {
    if (/fondos/.test(name)) primary.add("chest");
    else primary.add("vertical_push");
    secondary.add("triceps");
  }
  if (/lateral|posterior|face pull|pájaro/.test(name)) primary.add("lateral_rear_delts");
  if (/curl|bíceps|biceps/.test(name)) primary.add("biceps");
  if (/tríceps|triceps|extensi[oó]n.*codo/.test(name)) primary.add("triceps");
  if (/leg press|prensa|cu[aá]driceps|extension.*pierna/.test(name) || /unilateral_leg|squat|knee_dominant/.test(pattern))
    primary.add("quadriceps");
  if (/hinge|hamstring|leg_curl/.test(pattern) || /rumano|femoral|isquio|hip thrust/.test(name))
    primary.add("posterior_chain");
  if (/core/.test(pattern) || /abdominal|plancha|hollow|pallof|l-sit/.test(name)) primary.add("core");
  if (/gemelo|calf/.test(name)) primary.add("calves");
  if (!primary.size) primary.add(pattern.includes("pull") ? "horizontal_pull" : "core");
  const fatigue = /b[uú]lgara|rumano|deadlift|sentadilla/.test(name) ? 3 : /dominada|fondos|press|remo/.test(name) ? 2 : 1;
  return { primary: [...primary], secondary: [...secondary].filter((g) => !primary.has(g)), fatigue };
}

export function buildAdaptiveContext(data: Snapshot, now = new Date()): AdaptiveContext {
  const cutoff10 = now.getTime() - 10 * 86400000;
  const cutoff3 = now.getTime() - 72 * 3600000;
  const completed = data.workouts.filter((w) => w.status === "completed" && Date.parse(w.startedAt) <= now.getTime());
  const recent10 = completed.filter((w) => Date.parse(w.startedAt) >= cutoff10);
  const needs: AdaptiveNeed[] = MUSCLE_GROUPS.map((group) => {
    let directSets10d = 0;
    let indirectSets10d = 0;
    let latest = 0;
    let hardRecentSets = 0;
    for (const workout of completed) {
      const when = Date.parse(workout.startedAt);
      for (const row of data.workoutExercises.filter((e) => e.workoutId === workout.id)) {
        const exercise = data.exercises.find((e) => e.id === row.exerciseId);
        if (!exercise) continue;
        const stimulus = exerciseStimulus(exercise);
        if (!stimulus.primary.includes(group) && !stimulus.secondary.includes(group)) continue;
        const sets = data.sets.filter((s) => s.workoutExerciseId === row.id && s.completed);
        if (sets.length) latest = Math.max(latest, when);
        if (when >= cutoff10) {
          if (stimulus.primary.includes(group)) directSets10d += sets.length;
          if (stimulus.secondary.includes(group)) indirectSets10d += sets.length;
        }
        if (when >= cutoff3 && stimulus.primary.includes(group))
          hardRecentSets += sets.filter((s) => s.RIR !== null && s.RIR <= 1).length;
      }
    }
    const priority = data.settings.priorities[group] ?? DEFAULT_PRIORITIES[group];
    const target = TARGET_DIRECT_SETS_10D[group];
    const effectiveSets = directSets10d + indirectSets10d * 0.35;
    const deficit = Math.max(0, target - effectiveSets) / target;
    const daysSinceExposure = latest ? Math.floor((now.getTime() - latest) / 86400000) : null;
    const overdue = daysSinceExposure === null ? 2.5 : Math.min(2.5, Math.max(0, daysSinceExposure - 4) * 0.35);
    const recovery = Math.max(0, 1 - hardRecentSets * 0.13);
    const score = priority * 1.15 + deficit * 4 + overdue + recovery - hardRecentSets * 0.25;
    return { group, score: Math.round(score * 100) / 100, priority, directSets10d, indirectSets10d, daysSinceExposure, recovery: Math.round(recovery * 100) / 100 };
  }).sort((a, b) => b.score - a.score);
  return {
    generatedAt: now.toISOString(),
    recentWorkoutCount: recent10.length,
    completedSets10d: recent10.reduce((total, workout) => total + data.sets.filter((s) => s.workoutId === workout.id && s.completed).length, 0),
    needs,
  };
}

function setBudget(constraints: AdaptiveConstraints) {
  const base = constraints.durationMinutes <= 30 ? 9 : constraints.durationMinutes <= 45 ? 13 : constraints.durationMinutes <= 50 ? 15 : constraints.durationMinutes <= 60 ? 17 : 20;
  return constraints.energy === "low" ? base - 3 : constraints.energy === "high" ? base + 1 : base;
}

export function deterministicPlan(data: Snapshot, constraints: AdaptiveConstraints, context = buildAdaptiveContext(data)) {
  const blocked = new Set(constraints.blockedExerciseIds);
  const enabled = data.exercises.filter((e) => e.enabled && !blocked.has(e.id));
  const lastTwoIds = data.workouts.filter((w) => w.status === "completed").slice(0, 2).flatMap((w) => data.workoutExercises.filter((e) => e.workoutId === w.id).map((e) => e.exerciseId));
  const selected: PlanExercise[] = [];
  let remaining = setBudget(constraints);
  for (const need of context.needs) {
    if (remaining < 2) break;
    const candidates = enabled
      .filter((e) => exerciseStimulus(e).primary.includes(need.group))
      .filter((e) => !selected.some((row) => row.exerciseId === e.id))
      .sort((a, b) => candidateScore(data, b, need.group, lastTwoIds) - candidateScore(data, a, need.group, lastTwoIds));
    const exercise = candidates[0];
    if (!exercise) continue;
    const stimulus = exerciseStimulus(exercise);
    if (constraints.energy === "low" && stimulus.fatigue >= 3 && candidates[1]) continue;
    const sets = Math.min(need.priority >= 4 ? 3 : 2, remaining);
    const previous = previousSets(data, exercise.id);
    const progression = progressionNote(previous, exercise);
    selected.push({
      exerciseId: exercise.id,
      sets,
      repMin: exercise.defaultRepMin,
      repMax: exercise.defaultRepMax,
      rir: constraints.energy === "low" ? "2–3" : "1–2",
      optional: remaining <= 3 ? 1 : 0,
      notes: progression,
      priority: need.priority >= 4 ? "Prioritario" : "Cobertura",
    });
    remaining -= sets;
  }
  return selected.slice(0, constraints.durationMinutes <= 30 ? 5 : 7);
}

function candidateScore(data: Snapshot, exercise: Exercise, group: MuscleGroup, recent: string[]) {
  const preference = data.settings.exercisePreferences[exercise.id] ?? 3;
  const continuity = recent.includes(exercise.id) ? (data.settings.variationLevel === 1 ? 2 : 0.7) : 0;
  const reference = ["pullup", "dip"].includes(exercise.id) ? 2 : 0;
  const fatigue = exerciseStimulus(exercise).fatigue;
  const lowPreference = ["handstand"].includes(exercise.id) ? -3 : 0;
  return preference + continuity + reference - fatigue * 0.2 + lowPreference + (group === "vertical_pull" && exercise.id === "pullup" ? 1 : 0);
}

function progressionNote(previous: ReturnType<typeof previousSets>, exercise: Exercise) {
  if (!previous.length) return "Establece una referencia técnica sin forzar la carga.";
  const reps = previous.map((s) => s.reps).filter((v): v is number => v !== null);
  const comfortable = previous.every((s) => s.RIR === null || s.RIR >= 1);
  if (reps.length === previous.length && Math.min(...reps) >= exercise.defaultRepMax && comfortable)
    return "Progresión disponible: sube el mínimo incremento o usa una variante ligeramente más difícil.";
  return "Mantén la última carga y mejora repeticiones o técnica dentro del rango.";
}

export const llmAdaptivePlanSchema = z.object({
  exercises: z.array(z.object({
    exerciseId: z.string().min(1),
    sets: z.number().int().min(1).max(5),
    repMin: z.number().int().min(0).max(1000),
    repMax: z.number().int().min(0).max(1000),
    rir: z.string().min(1).max(20),
    optional: z.number().int().min(0).max(1),
    notes: z.string().max(500),
    priority: z.string().max(40),
  })).min(1).max(8),
  rationale: z.array(z.string().max(300)).min(1).max(8),
});

export function validateAdaptivePlan(data: Snapshot, value: unknown, constraints: AdaptiveConstraints) {
  const parsed = llmAdaptivePlanSchema.parse(value);
  const catalog = new Set(data.exercises.filter((e) => e.enabled).map((e) => e.id));
  const blocked = new Set(constraints.blockedExerciseIds);
  if (parsed.exercises.some((e) => !catalog.has(e.exerciseId) || blocked.has(e.exerciseId)))
    throw new Error("El proveedor devolvió ejercicios no disponibles.");
  const budget = setBudget(constraints) + 2;
  if (parsed.exercises.reduce((n, e) => n + e.sets, 0) > budget)
    throw new Error("La propuesta no cabe en el tiempo disponible.");
  return parsed;
}
