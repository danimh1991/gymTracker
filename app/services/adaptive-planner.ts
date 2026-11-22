import { z } from "zod";
import type {
  AdaptiveConstraints, AdaptiveContext, AdaptiveNeed, Exercise,
  MuscleGroup, PlanExercise, Snapshot, TrainerSettings, WorkoutSet,
} from "../domain/types";

export const ADAPTIVE_RULES_VERSION = "adaptive-1.1";
export const ADAPTIVE_CATALOG_VERSION = "adaptive-2.0-full-2026-11-22";
export const MUSCLE_GROUPS: MuscleGroup[] = [
  "vertical_pull", "horizontal_pull", "chest", "vertical_push",
  "lateral_rear_delts", "biceps", "triceps", "quads",
  "posterior_chain", "core", "calves", "forearms_grip",
];
export const DEFAULT_PRIORITIES: Record<MuscleGroup, number> = {
  vertical_pull: 5, horizontal_pull: 4, chest: 4, vertical_push: 3,
  lateral_rear_delts: 4, biceps: 4, triceps: 4, quads: 3,
  posterior_chain: 3, core: 2, calves: 2, forearms_grip: 2,
};
const WEEKLY_TARGETS: Record<MuscleGroup, number> = {
  vertical_pull: 5, horizontal_pull: 5, chest: 6, vertical_push: 3,
  lateral_rear_delts: 4, biceps: 4, triceps: 4, quads: 5,
  posterior_chain: 5, core: 3, calves: 3, forearms_grip: 2,
};

export function defaultTrainerSettings(trainingDays = 3): TrainerSettings {
  return {
    trainingDays, adaptiveEnabled: 1, defaultDurationMinutes: 50,
    includeWarmupInDuration: 0, generalWarmupMinutes: 7,
    usualFrequency: 2, variationLevel: 2, priorities: { ...DEFAULT_PRIORITIES },
    exercisePreferences: {}, availableEquipment: [], equipmentConfigured: 0,
  };
}

/** Structured catalog metadata is the only source of training stimulus. */
export function exerciseStimulus(exercise: Exercise) {
  const contributions = Array.isArray(exercise.stimulus) ? exercise.stimulus : [];
  return {
    contributions,
    primary: contributions.filter((item) => item.direct).map((item) => item.group),
    secondary: contributions.filter((item) => !item.direct).map((item) => item.group),
    fatigue: exercise.fatigueCost || 3,
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 100) / 100;

export function buildAdaptiveContext(data: Snapshot, now = new Date()): AdaptiveContext {
  const nowMs = now.getTime(), cutoff10 = nowMs - 10 * 86400000;
  const cutoff28 = nowMs - 28 * 86400000, cutoff72 = nowMs - 72 * 3600000;
  const completed = data.workouts.filter((workout) => workout.status === "completed" && Date.parse(workout.startedAt) <= nowMs);
  const exercises = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  const rowsByWorkout = new Map<string, typeof data.workoutExercises>();
  for (const row of data.workoutExercises) {
    const rows = rowsByWorkout.get(row.workoutId) ?? [];
    rows.push(row); rowsByWorkout.set(row.workoutId, rows);
  }
  const setsByRow = new Map<string, WorkoutSet[]>();
  for (const set of data.sets.filter((item) => item.completed)) {
    const sets = setsByRow.get(set.workoutExerciseId) ?? [];
    sets.push(set); setsByRow.set(set.workoutExerciseId, sets);
  }
  const frequencyScale = clamp((data.settings.usualFrequency || 2) / 2.5, 0.75, 1.15);
  const needs: AdaptiveNeed[] = MUSCLE_GROUPS.map((group) => {
    let directSets10d = 0, indirectSets10d = 0, indirectStimulus10d = 0;
    let latest = 0, fatigue72h = 0, exposureCount28d = 0;
    for (const workout of completed) {
      const when = Date.parse(workout.startedAt); let exposed = false;
      for (const row of rowsByWorkout.get(workout.id) ?? []) {
        const exercise = exercises.get(row.exerciseId);
        const contribution = exercise?.stimulus.find((item) => item.group === group);
        if (!exercise || !contribution) continue;
        const sets = setsByRow.get(row.id) ?? [];
        if (!sets.length) continue;
        exposed = true; latest = Math.max(latest, when);
        if (when >= cutoff10) {
          if (contribution.direct) directSets10d += sets.length * contribution.weight;
          else { indirectSets10d += sets.length; indirectStimulus10d += sets.length * contribution.weight; }
        }
        if (when >= cutoff72) {
          const decay = 1 - Math.max(0, (nowMs - when) / 3600000) / 72;
          for (const set of sets) {
            const effort = set.RPE != null ? clamp(set.RPE / 10, 0.5, 1)
              : set.RIR != null ? clamp(1 - set.RIR * 0.12, 0.55, 1) : 0.7;
            fatigue72h += contribution.weight * effort * exercise.fatigueCost * decay;
          }
        }
      }
      if (exposed && when >= cutoff28) exposureCount28d += 1;
    }
    const priority = data.settings.priorities[group] ?? DEFAULT_PRIORITIES[group];
    const targetSets10d = WEEKLY_TARGETS[group] * (10 / 7) * frequencyScale;
    const deficitRatio = clamp((targetSets10d - directSets10d - indirectStimulus10d * 0.35) / targetSets10d, 0, 1);
    const excessRatio = clamp((directSets10d - targetSets10d) / targetSets10d, 0, 2);
    const daysSinceExposure = latest ? Math.floor((nowMs - latest) / 86400000) : null;
    const recovery = clamp(1 - fatigue72h / 18, 0, 1);
    // Need is driven by the missing stimulus. Priority and readiness may scale that
    // need, but never manufacture urgency for an already-covered muscle group.
    const volumeDeficit = Math.pow(deficitRatio, 1.25) * 52;
    const overdueBase = daysSinceExposure === null ? 6 : clamp((daysSinceExposure - 4) * 1.5, 0, 12);
    const components = {
      volumeDeficit,
      overdue: overdueBase * (0.2 + deficitRatio * 0.8),
      priorityMultiplier: 0.82 + priority * 0.075,
      recoveryMultiplier: 0.25 + recovery * 0.75,
      recentMultiplier: daysSinceExposure === 0 ? 0.2 : daysSinceExposure === 1 ? 0.45 : daysSinceExposure === 2 ? 0.72 : 1,
      excessMultiplier: 1 / (1 + excessRatio * 3),
    };
    const score = clamp((components.volumeDeficit + components.overdue) * components.priorityMultiplier
      * components.recoveryMultiplier * components.recentMultiplier * components.excessMultiplier, 0, 75);
    return {
      group, score: round(score), priority, directSets10d: round(directSets10d), indirectSets10d,
      daysSinceExposure, recovery: round(recovery), targetSets10d: round(targetSets10d),
      excessRatio: round(excessRatio), indirectStimulus10d: round(indirectStimulus10d),
      fatigue72h: round(fatigue72h), exposureCount28d,
      components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value)])) as AdaptiveNeed["components"],
    };
  }).sort((a, b) => b.score - a.score);
  const recent10 = completed.filter((workout) => Date.parse(workout.startedAt) >= cutoff10);
  return {
    generatedAt: now.toISOString(), recentWorkoutCount: recent10.length,
    completedSets10d: recent10.reduce((total, workout) => total + data.sets.filter((set) => set.workoutId === workout.id && set.completed).length, 0),
    needs, rulesVersion: ADAPTIVE_RULES_VERSION, catalogVersion: ADAPTIVE_CATALOG_VERSION,
    equipmentState: data.settings.availableEquipment.length ? "configured" : "unknown",
  };
}

function normalizeEquipment(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\s*\/\s*/g, " ").replace(/\b(de|opcionales?|especificar)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}
export function equipmentMatches(exercise: Exercise, constraints: AdaptiveConstraints) {
  if (!exercise.autoSuggestRequiresEquipmentMatch) return true;
  if (!constraints.equipment.length) return false;
  const required = normalizeEquipment(exercise.equipment);
  return constraints.equipment.map(normalizeEquipment).some((item) => required.includes(item) || item.includes(required));
}

function comparablePerformance(data: Snapshot, exerciseId: string) {
  const recent = data.workoutExercises.filter((row) => row.exerciseId === exerciseId)
    .map((row) => ({ row, workout: data.workouts.find((workout) => workout.id === row.workoutId) }))
    .filter((item) => item.workout?.status === "completed")
    .sort((a, b) => Date.parse(b.workout!.startedAt) - Date.parse(a.workout!.startedAt)).slice(0, 3);
  const sessions = recent.map(({ row }) => data.sets
    .filter((set) => set.workoutExerciseId === row.id && set.completed)
    .sort((a, b) => a.setNumber - b.setNumber)).filter((sets) => sets.length);
  return { latest: sessions[0] ?? [], all: sessions.flat(), sessionCount: sessions.length };
}

function prescribe(data: Snapshot, exercise: Exercise, energy: AdaptiveConstraints["energy"]) {
  const previous = comparablePerformance(data, exercise.id);
  const reps = previous.all.map((set) => set.reps).filter((value): value is number => value != null);
  let repMin = exercise.defaultRepMin, repMax = exercise.defaultRepMax;
  if (reps.length) { repMin = Math.max(1, Math.min(...reps)); repMax = Math.max(repMin, Math.max(...reps)); if (repMin === repMax) repMax += 2; }
  const latest = previous.latest[0];
  const load = latest?.assistanceWeight != null && latest.assistanceWeight > 0
    ? { kind: "assistance" as const, valueKg: latest.assistanceWeight }
    : latest?.addedWeight != null && latest.addedWeight > 0
      ? { kind: "added_weight" as const, valueKg: latest.addedWeight }
      : latest?.weight != null ? { kind: "external" as const, valueKg: latest.weight }
        : exercise.bodyweightExercise ? { kind: "bodyweight" as const, valueKg: null }
          : { kind: "calibration" as const, valueKg: null };
  return {
    repMin, repMax, rir: exercise.metricType === "time" ? "Técnica" : energy === "low" ? "3" : exercise.fatigueCost >= 3 ? "2–3" : "1–2",
    suggestedLoad: { ...load, confidence: previous.sessionCount >= 3 ? "high" as const : previous.sessionCount ? "medium" as const : "low" as const },
    notes: exercise.metricType === "time"
      ? "Detén la serie cuando pierdas la posición o la respiración controlada; el tiempo es un techo técnico, no un objetivo a cualquier precio."
      : previous.sessionCount ? "Mantén la carga comparable y progresa en repeticiones; aumenta solo al dominar el rango con el RIR previsto."
        : "Calibra una carga técnica conservadora; no hay historial comparable suficiente.",
    previousSetCount: previous.latest.length,
  };
}

function estimateExerciseSeconds(exercise: Exercise, sets: number, prescribedMax = exercise.defaultRepMax) {
  const work = exercise.metricType === "time" ? prescribedMax : 35;
  // Technical ramp-up sets remain attached to demanding exercises. They are not
  // hypertrophy sets and are distinct from the optional general warm-up.
  const rampUp = exercise.fatigueCost >= 4 ? 180 : exercise.fatigueCost >= 3 ? 90 : 0;
  const efforts = sets * (exercise.unilateralPerSide ? 2 : 1);
  const transitionAndSetup = 75;
  return Math.round(transitionAndSetup + rampUp + efforts * work + Math.max(0, efforts - 1) * exercise.defaultRestSeconds);
}

export function adaptiveTimeBudget(data: Snapshot, constraints: AdaptiveConstraints) {
  const totalSeconds = constraints.durationMinutes * 60;
  const generalWarmupSeconds = data.settings.includeWarmupInDuration
    ? clamp(data.settings.generalWarmupMinutes, 0, constraints.durationMinutes) * 60 : 0;
  return { totalSeconds, generalWarmupSeconds, mainSessionSeconds: totalSeconds - generalWarmupSeconds };
}

export function deterministicPlan(data: Snapshot, constraints: AdaptiveConstraints, context = buildAdaptiveContext(data)) {
  const blocked = new Set(constraints.blockedExerciseIds);
  const eligible = data.exercises.filter((exercise) => exercise.enabled && exercise.autoSelectable
    && exercise.planningStatus === "active" && !blocked.has(exercise.id)
    && exercise.stimulus.length > 0 && equipmentMatches(exercise, constraints));
  const need = new Map(context.needs.map((item) => [item.group, item.score]));
  const completed = data.workouts.filter((workout) => workout.status === "completed")
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const recentIds = new Set(completed.slice(0, 3).flatMap((workout) =>
    data.workoutExercises.filter((row) => row.workoutId === workout.id).map((row) => row.exerciseId)));
  const recentCounts = new Map<string, number>();
  for (const workout of completed.slice(0, 3))
    for (const row of data.workoutExercises.filter((item) => item.workoutId === workout.id))
      recentCounts.set(row.exerciseId, (recentCounts.get(row.exerciseId) ?? 0) + 1);
  const selected: { exercise: Exercise; plan: PlanExercise }[] = [];
  const maxSeconds = adaptiveTimeBudget(data, constraints).mainSessionSeconds; let usedSeconds = 0;
  while (selected.length < (constraints.durationMinutes <= 30 ? 4 : 7)) {
    const candidates = eligible.filter((exercise) => !selected.some((item) => item.exercise.id === exercise.id)).map((exercise) => {
      const direct = exercise.stimulus.filter((item) => item.direct);
      const strongest = [...direct].sort((a, b) => (need.get(b.group) ?? 0) * b.weight - (need.get(a.group) ?? 0) * a.weight)[0];
      const directCoverage = direct.reduce((sum, item) => sum + (need.get(item.group) ?? 0) * item.weight, 0);
      const secondaryCoverage = exercise.stimulus.filter((item) => !item.direct)
        .reduce((sum, item) => sum + (need.get(item.group) ?? 0) * item.weight * 0.12, 0);
      const preference = data.settings.exercisePreferences[exercise.id] ?? exercise.preference;
      const seen = recentIds.has(exercise.id);
      const continuity = data.settings.variationLevel === 1 ? (seen ? 4 : -0.5)
        : data.settings.variationLevel === 2 ? (seen ? 1.5 : 0.5) : (seen ? -1 : 2);
      const repetitionPenalty = Math.max(0, (recentCounts.get(exercise.id) ?? 0) - 1) * 7;
      const familyRepeat = selected.some((item) => item.exercise.exerciseFamily === exercise.exerciseFamily) ? 18 : 0;
      const directGroupRepeat = exercise.stimulus.some((stimulus) => stimulus.direct && selected.some((item) =>
        item.exercise.stimulus.some((selectedStimulus) => selectedStimulus.direct && selectedStimulus.group === stimulus.group))) ? 8 : 0;
      const fatiguePenalty = exercise.fatigueCost * (constraints.energy === "low" ? 5 : 1.5);
      return { exercise, strongest, utility: directCoverage / 8 + secondaryCoverage / 10 + (preference - 3) * 0.8
        + continuity + (exercise.referenceExercise && strongest && (need.get(strongest.group) ?? 0) >= 8 ? 2 : 0)
        - familyRepeat - directGroupRepeat - fatiguePenalty - repetitionPenalty };
    }).sort((a, b) => b.utility - a.utility);
    if (!candidates.some((candidate) => candidate.strongest && (need.get(candidate.strongest.group) ?? 0) >= 6)) break;
    let added = false;
    for (const candidate of candidates) {
      const prescription = prescribe(data, candidate.exercise, constraints.energy);
      const strongest = candidate.strongest;
      if (!strongest || (need.get(strongest.group) ?? 0) < 6) continue;
      const sets = constraints.energy === "low" ? 2 : candidate.exercise.referenceExercise && prescription.previousSetCount >= 3
        ? clamp(prescription.previousSetCount, 3, 4) : (need.get(strongest.group) ?? 0) >= 45 ? 3 : 2;
      const estimatedSeconds = estimateExerciseSeconds(candidate.exercise, sets, prescription.repMax);
      if (usedSeconds + estimatedSeconds > maxSeconds) continue;
      const alternatives = candidates.filter((item) => item.exercise.id !== candidate.exercise.id
        && item.exercise.stimulus.some((stimulus) => stimulus.direct && stimulus.group === strongest.group)).slice(0, 3).map((item) => item.exercise.id);
      const secondary = candidate.exercise.stimulus.filter((item) => !item.direct && (need.get(item.group) ?? 0) >= 6)
        .map((item) => item.group);
      const sideNote = candidate.exercise.unilateralPerSide ? " Series y descansos contabilizados por lado." : "";
      selected.push({ exercise: candidate.exercise, plan: {
        exerciseId: candidate.exercise.id, sets, repMin: prescription.repMin, repMax: prescription.repMax,
        rir: prescription.rir, optional: selected.length >= 4 ? 1 : 0, notes: prescription.notes + sideNote,
        priority: (need.get(strongest.group) ?? 0) >= 45 ? "Prioritario" : "Cobertura",
        targetGroup: strongest.group, restSeconds: candidate.exercise.defaultRestSeconds,
        suggestedLoad: prescription.suggestedLoad,
        reason: `Estímulo principal: ${strongest.group} (necesidad ${round(need.get(strongest.group) ?? 0)}).${secondary.length ? ` Secundario: ${secondary.join(", ")}.` : ""}`,
        alternatives, estimatedSeconds, unilateralPerSide: candidate.exercise.unilateralPerSide,
      }});
      usedSeconds += estimatedSeconds;
      for (const stimulus of candidate.exercise.stimulus)
        need.set(stimulus.group, Math.max(0, (need.get(stimulus.group) ?? 0) - sets * stimulus.weight * (stimulus.direct ? 14 : 4)));
      added = true; break;
    }
    if (!added) break;
  }
  return selected.sort((a, b) => orderScore(b.exercise, b.plan, context) - orderScore(a.exercise, a.plan, context))
    .map((item, index) => ({ ...item.plan, order: index + 1 }));
}

function orderScore(exercise: Exercise, plan: PlanExercise, context: AdaptiveContext) {
  const need = context.needs.find((item) => item.group === plan.targetGroup)?.score ?? 0;
  const isolation = ["elbow_flexion", "elbow_extension", "shoulder_abduction", "rear_delt_isolation", "calf_raise"].includes(exercise.movementPattern);
  return need * 0.55 + (exercise.referenceExercise ? 28 : 0) + (isolation ? -12 : 8) + exercise.fatigueCost * 2;
}

const loadSchema = z.object({ kind: z.enum(["bodyweight", "added_weight", "assistance", "external", "calibration"]),
  valueKg: z.number().finite().min(0).max(1000).nullable(), confidence: z.enum(["low", "medium", "high"]) });
const llmExerciseSchema = z.object({
  exerciseId: z.string().min(1), order: z.number().int().min(1).max(12),
  targetGroup: z.enum(MUSCLE_GROUPS as [MuscleGroup, ...MuscleGroup[]]), sets: z.number().int().min(1).max(5),
  repMin: z.number().int().min(0).max(1000), repMax: z.number().int().min(0).max(1000),
  rir: z.string().min(1).max(20), optional: z.number().int().min(0).max(1), notes: z.string().max(500),
  priority: z.string().max(40), restSeconds: z.number().int().min(30).max(600), suggestedLoad: loadSchema,
  reason: z.string().min(1).max(300), alternatives: z.array(z.string()).max(4), estimatedSeconds: z.number().int().min(30).max(3600),
  unilateralPerSide: z.boolean().optional(),
}).refine((value) => value.repMax >= value.repMin, "Rango de repeticiones invertido.");
export const llmAdaptivePlanSchema = z.object({ schemaVersion: z.literal("adaptive-session-1.1"),
  exercises: z.array(llmExerciseSchema).min(1).max(8), rationale: z.array(z.string().max(300)).min(1).max(8) });

export function validateAdaptivePlan(data: Snapshot, value: unknown, constraints: AdaptiveConstraints, context = buildAdaptiveContext(data)) {
  const parsed = llmAdaptivePlanSchema.parse(value), catalog = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  const blocked = new Set(constraints.blockedExerciseIds); let seconds = 0;
  const canonicalExercises = parsed.exercises.map((row) => {
    const exercise = catalog.get(row.exerciseId);
    if (!exercise || !exercise.enabled || !exercise.autoSelectable || exercise.planningStatus !== "active" || blocked.has(row.exerciseId))
      throw new Error("El proveedor devolvió ejercicios no disponibles para selección automática.");
    if (!equipmentMatches(exercise, constraints)) throw new Error("El proveedor ignoró las restricciones de equipamiento.");
    if (!exercise.stimulus.some((stimulus) => stimulus.direct && stimulus.group === row.targetGroup))
      throw new Error("La justificación principal no corresponde a un estímulo directo del ejercicio.");
    if (row.alternatives.some((id) => {
      const alternative = catalog.get(id);
      return !alternative || !alternative.enabled || alternative.planningStatus !== "active"
        || !alternative.stimulus.some((stimulus) => stimulus.direct && stimulus.group === row.targetGroup);
    })) throw new Error("Las alternativas no cubren directamente el mismo objetivo.");
    if (exercise.metricType === "time" && exercise.prescriptionUnit !== "seconds") throw new Error("La unidad de prescripción no coincide con el ejercicio.");
    const estimatedSeconds = estimateExerciseSeconds(exercise, row.sets, row.repMax);
    seconds += estimatedSeconds;
    return { ...row, estimatedSeconds, unilateralPerSide: exercise.unilateralPerSide };
  });
  if (seconds > adaptiveTimeBudget(data, constraints).mainSessionSeconds) throw new Error("La propuesta no cabe en el tiempo disponible.");
  const orders = parsed.exercises.map((row) => row.order);
  if (new Set(orders).size !== orders.length) throw new Error("El orden de ejercicios está duplicado.");
  const selectedGroups = new Set(parsed.exercises.map((row) => row.targetGroup));
  const eligibleDirectGroups = new Set(data.exercises.filter((exercise) => exercise.enabled && exercise.autoSelectable
    && exercise.planningStatus === "active" && !blocked.has(exercise.id) && equipmentMatches(exercise, constraints))
    .flatMap((exercise) => exercise.stimulus.filter((stimulus) => stimulus.direct).map((stimulus) => stimulus.group)));
  const uncoveredHigh = context.needs.filter((need) => eligibleDirectGroups.has(need.group) && !selectedGroups.has(need.group))
    .sort((a, b) => b.score - a.score)[0];
  if (uncoveredHigh && uncoveredHigh.score >= 12) {
    const displaced = parsed.exercises.find((row) => {
      const selectedNeed = context.needs.find((need) => need.group === row.targetGroup)?.score ?? 0;
      return selectedNeed < 8 && uncoveredHigh.score - selectedNeed >= 8;
    });
    if (displaced) throw new Error(`La propuesta desplaza ${uncoveredHigh.group} por ${displaced.targetGroup} sin necesidad suficiente.`);
  }
  for (const referenceRow of canonicalExercises) {
    const reference = catalog.get(referenceRow.exerciseId)!;
    if (!reference.referenceExercise) continue;
    const referenceNeed = context.needs.find((need) => need.group === referenceRow.targetGroup)?.score ?? 0;
    const prematureIsolation = canonicalExercises.find((row) => {
      if (row.order >= referenceRow.order) return false;
      const exercise = catalog.get(row.exerciseId)!;
      const isolation = ["elbow_flexion", "elbow_extension", "shoulder_abduction", "rear_delt_isolation", "calf_raise"].includes(exercise.movementPattern);
      const isolationNeed = context.needs.find((need) => need.group === row.targetGroup)?.score ?? 0;
      return isolation && isolationNeed < referenceNeed + 20;
    });
    if (prematureIsolation) throw new Error("El orden relega un movimiento de referencia sin una prioridad suficiente que lo justifique.");
  }
  return { ...parsed, exercises: canonicalExercises.sort((a, b) => a.order - b.order) };
}

export function buildDecisionAudit(data: Snapshot, plan: PlanExercise[], context: AdaptiveContext, constraints: AdaptiveConstraints): NonNullable<AdaptiveContext["decisionAudit"]> {
  const blocked = new Set(constraints.blockedExerciseIds);
  const eligible = data.exercises.filter((exercise) => exercise.enabled && exercise.autoSelectable
    && exercise.planningStatus === "active" && !blocked.has(exercise.id) && equipmentMatches(exercise, constraints));
  const selectedGroups = new Set(plan.map((row) => row.targetGroup).filter(Boolean));
  return {
    exercises: plan.flatMap((row) => {
      if (!row.targetGroup) return [];
      const exercise = data.exercises.find((item) => item.id === row.exerciseId);
      return [{ exerciseId: row.exerciseId, targetGroup: row.targetGroup,
        targetNeed: round(context.needs.find((need) => need.group === row.targetGroup)?.score ?? 0),
        direct: Boolean(exercise?.stimulus.some((stimulus) => stimulus.direct && stimulus.group === row.targetGroup)),
        alternatives: row.alternatives ?? [] }];
    }),
    uncoveredNeeds: context.needs.filter((need) => need.score >= 6 && !selectedGroups.has(need.group)).map((need) => {
      const candidates = eligible.filter((exercise) => exercise.stimulus.some((stimulus) => stimulus.direct && stimulus.group === need.group));
      const hasAny = data.exercises.some((exercise) => exercise.enabled && exercise.autoSelectable && exercise.planningStatus === "active"
        && exercise.stimulus.some((stimulus) => stimulus.direct && stimulus.group === need.group));
      const reason = !hasAny ? "no_candidate" as const : !candidates.length ? "equipment" as const
        : need.recovery < 0.45 ? "recovery" as const
          : plan.reduce((sum, row) => sum + (row.estimatedSeconds ?? 0), 0) >= adaptiveTimeBudget(data, constraints).mainSessionSeconds * 0.9
            ? "time" as const : "lower_priority" as const;
      return { group: need.group, score: need.score, reason };
    }),
  };
}
