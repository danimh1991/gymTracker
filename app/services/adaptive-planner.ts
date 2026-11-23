import { z } from "zod";
import type {
  AdaptiveConstraints, AdaptiveContext, AdaptiveNeed, Exercise,
  MuscleFocus, MuscleGroup, PlanExercise, SessionModality, Snapshot,
  TrainerSettings, TrainingLocation, WorkoutSet,
} from "../domain/types";

export const ADAPTIVE_RULES_VERSION = "adaptive-1.2";
export const ADAPTIVE_CATALOG_VERSION = "adaptive-2.0-full-2026-11-22";
export const EQUIPMENT_PROFILE_VERSION = "locations-1.0-2026-11-23";
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
    equipmentProfile: "full_gym", excludedExerciseIds: [],
    defaultTrainingLocation: "gym", locationEquipmentOverrides: {}, customEquipmentProfiles: [],
    usualFrequency: 2, variationLevel: 2, priorities: { ...DEFAULT_PRIORITIES },
    exercisePreferences: {}, availableEquipment: [], equipmentConfigured: 0,
  };
}

export const LOCATION_EQUIPMENT: Record<Exclude<TrainingLocation, "custom">, string[]> = {
  gym: ["Mancuernas", "Barras y discos", "Bancos", "Poleas", "Máquinas", "Máquinas de pecho", "Máquinas de espalda y remos", "Máquinas de hombros", "Máquinas habituales de piernas", "Prensa de piernas", "Jalón", "Barra de dominadas", "Paralelas", "Suelo"],
  calisthenics_park: ["Peso corporal", "Barra de dominadas", "Paralelas", "Barra baja", "Suelo", "Estructuras de apoyo"],
  home: ["Peso corporal", "Suelo", "Espacio doméstico", "Carga doméstica segura"],
  outdoors: ["Peso corporal", "Suelo", "Espacio libre"],
  hotel: ["Peso corporal", "Suelo", "Espacio limitado"],
};

export function resolveEquipmentForLocation(settings: TrainerSettings, location: TrainingLocation, customProfileId?: string | null) {
  if (location === "custom") {
    const profile = settings.customEquipmentProfiles.find((item) => item.id === customProfileId) ?? settings.customEquipmentProfiles[0];
    return {
      name: profile?.name ?? "Personalizado", available: profile?.available ?? [], unavailable: profile?.unavailable ?? [],
      availableExerciseIds: profile?.availableExerciseIds ?? [], excludedExerciseIds: profile?.excludedExerciseIds ?? [], exercisePreferences: profile?.exercisePreferences ?? {},
      equipmentProfile: "custom" as const, profileId: profile?.id ?? null, version: EQUIPMENT_PROFILE_VERSION,
    };
  }
  const override = settings.locationEquipmentOverrides[location];
  return {
    name: location, available: [...new Set([...LOCATION_EQUIPMENT[location], ...(override?.available ?? [])])],
    unavailable: override?.unavailable ?? [], availableExerciseIds: override?.availableExerciseIds ?? [], excludedExerciseIds: override?.excludedExerciseIds ?? [],
    exercisePreferences: {}, equipmentProfile: location === "gym" ? "full_gym" as const : "custom" as const,
    profileId: location, version: EQUIPMENT_PROFILE_VERSION,
  };
}

const FOCUS_GROUPS: Record<MuscleFocus, MuscleGroup[]> = {
  automatic: [], full_body: MUSCLE_GROUPS, upper_body: ["vertical_pull", "horizontal_pull", "chest", "vertical_push", "lateral_rear_delts", "biceps", "triceps", "forearms_grip"],
  lower_body: ["quads", "posterior_chain", "calves"], push: ["chest", "vertical_push", "lateral_rear_delts", "triceps"],
  pull: ["vertical_pull", "horizontal_pull", "biceps", "forearms_grip"], back: ["vertical_pull", "horizontal_pull"], chest: ["chest"],
  shoulders: ["vertical_push", "lateral_rear_delts"], arms: ["biceps", "triceps", "forearms_grip"], biceps: ["biceps"], triceps: ["triceps"],
  quads: ["quads"], posterior_chain: ["posterior_chain"], calves: ["calves"], core: ["core"],
};

export function focusGroups(focus: MuscleFocus = "automatic") { return FOCUS_GROUPS[focus]; }

export function applySessionObjective(context: AdaptiveContext, constraints: AdaptiveConstraints) {
  const modality = constraints.modality ?? "general";
  const focus = constraints.muscleFocus ?? "automatic";
  const focused = new Set(focusGroups(focus));
  const specialized = focus !== "automatic" && focus !== "full_body";
  const warnings = specialized ? context.needs.filter((need) => focused.has(need.group) && (need.recovery < 0.5 || need.daysSinceExposure === 0))
    .map((need) => `${need.group}: recuperación limitada (${Math.round(need.recovery * 100)} %); se reducirá o pospondrá el trabajo exigente.`) : [];
  return { ...context, warnings, needs: context.needs.map((need) => {
    let multiplier = specialized ? (focused.has(need.group) ? 1.65 : 0.78) : 1;
    if (modality === "functional_mobility" && ["core", "posterior_chain", "lateral_rear_delts"].includes(need.group)) multiplier *= 1.15;
    if (modality === "calisthenics" && ["vertical_pull", "chest", "vertical_push", "core"].includes(need.group)) multiplier *= 1.12;
    return { ...need, baseScore: need.score, objectiveMultiplier: round(multiplier), score: round(clamp(need.score * multiplier, 0, 75)) };
  }).sort((a, b) => b.score - a.score) };
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
    equipmentState: data.settings.equipmentProfile === "full_gym" || data.settings.availableEquipment.length ? "configured" : "unknown",
  };
}

function normalizeEquipment(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\s*\/\s*/g, " ").replace(/\b(de|opcionales?|especificar)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

const SPECIFIC_MACHINE_CAPABILITIES = new Set(["assisted_pullup_machine", "assisted_dip_machine", "calf_machine",
  "leg_curl_machine", "leg_extension_machine", "hip_thrust_machine", "smith_machine", "chest_machine",
  "back_machine", "shoulder_machine", "leg_machine"]);

function equipmentCapabilities(value: string) {
  const normalized = normalizeEquipment(value);
  const capabilities = new Set<string>();
  if (/peso corporal|cuerpo/.test(normalized)) capabilities.add("bodyweight");
  if (/mancuern|kettlebell/.test(normalized)) capabilities.add("dumbbell");
  if (/barra dominadas|barra alta/.test(normalized)) capabilities.add("pullup_bar");
  if (/paralelas/.test(normalized)) capabilities.add("dip_bars");
  if (/barra baja|anillas/.test(normalized)) capabilities.add("low_bar");
  if (/barra(?! dominadas| alta| baja)|ez|discos/.test(normalized)) capabilities.add("barbell");
  if (/banco/.test(normalized)) capabilities.add("bench");
  if (/polea|cable|cuerda/.test(normalized)) capabilities.add("cable");
  if (/prensa/.test(normalized)) capabilities.add("leg_press");
  if (/dominadas asistidas/.test(normalized)) capabilities.add("assisted_pullup_machine");
  if (/fondos asistidos/.test(normalized)) capabilities.add("assisted_dip_machine");
  if (/maquina de gemelos|gemelos sentado/.test(normalized)) capabilities.add("calf_machine");
  if (/curl femoral/.test(normalized)) capabilities.add("leg_curl_machine");
  if (/extension cuadriceps/.test(normalized)) capabilities.add("leg_extension_machine");
  if (/hip thrust/.test(normalized)) capabilities.add("hip_thrust_machine");
  if (/smith/.test(normalized)) capabilities.add("smith_machine");
  if (/pec deck|maquinas? de pecho/.test(normalized)) capabilities.add("chest_machine");
  if (/maquinas? de espalda|remos/.test(normalized)) capabilities.add("back_machine");
  if (/maquinas? de hombros/.test(normalized)) capabilities.add("shoulder_machine");
  if (/maquinas? habituales de piernas/.test(normalized)) {
    capabilities.add("leg_machine");
    capabilities.add("leg_extension_machine");
  }
  if (/gimnasio/.test(normalized)) capabilities.add("gym_general");
  if (/mochila|casa|carga domestica/.test(normalized)) capabilities.add("home_load");
  if (/maquina/.test(normalized) && ![...capabilities].some((capability) => SPECIFIC_MACHINE_CAPABILITIES.has(capability)))
    capabilities.add("machine");
  return capabilities;
}

export function equipmentMatches(exercise: Exercise, constraints: AdaptiveConstraints) {
  if (constraints.availableExerciseIds?.includes(exercise.id)) return true;
  const required = equipmentCapabilities(exercise.equipment);
  if (/^pullup/.test(exercise.id) && !required.has("assisted_pullup_machine")) required.add("pullup_bar");
  if (exercise.id === "dip") required.add("dip_bars");
  if (exercise.id === "row") required.add("low_bar");
  const structuralRequired = [...required].filter((capability) => capability !== "bodyweight");
  if (!exercise.autoSuggestRequiresEquipmentMatch && !structuralRequired.length) return true;
  const available = new Set(constraints.equipment.flatMap((item) => [...equipmentCapabilities(item)]));
  const unavailable = new Set((constraints.unavailableEquipment ?? []).flatMap((item) => [...equipmentCapabilities(item)]));
  for (const capability of unavailable) available.delete(capability);
  if (unavailable.has("machine"))
    for (const capability of SPECIFIC_MACHINE_CAPABILITIES) available.delete(capability);
  if (required.has("bodyweight") && !structuralRequired.length) return true;
  const specificRequired = [...required].filter((capability) => SPECIFIC_MACHINE_CAPABILITIES.has(capability));
  const nonMachineAlternative = [...required].filter((capability) => capability !== "machine" && !SPECIFIC_MACHINE_CAPABILITIES.has(capability));
  if (specificRequired.length)
    return specificRequired.some((capability) => available.has(capability))
      || nonMachineAlternative.some((capability) => available.has(capability));
  if (required.has("gym_general")) return ["gym_general", "dumbbell", "barbell", "bench", "cable", "machine", "leg_press"]
    .some((capability) => available.has(capability));
  const capabilitiesToMatch = structuralRequired.length ? structuralRequired : [...required];
  return capabilitiesToMatch.some((capability) => available.has(capability));
}

function comparablePerformance(data: Snapshot, exerciseId: string, location: TrainingLocation = "gym") {
  const recent = data.workoutExercises.filter((row) => row.exerciseId === exerciseId)
    .map((row) => ({ row, workout: data.workouts.find((workout) => workout.id === row.workoutId) }))
    .filter((item) => item.workout?.status === "completed")
    .filter((item) => item.workout?.trainingLocation === location || (location === "gym" && !item.workout?.trainingLocation))
    .sort((a, b) => Date.parse(b.workout!.startedAt) - Date.parse(a.workout!.startedAt)).slice(0, 3);
  const sessions = recent.map(({ row }) => data.sets
    .filter((set) => set.workoutExerciseId === row.id && set.completed)
    .sort((a, b) => a.setNumber - b.setNumber)).filter((sets) => sets.length);
  return { latest: sessions[0] ?? [], all: sessions.flat(), sessionCount: sessions.length };
}

function prescribe(data: Snapshot, exercise: Exercise, constraints: AdaptiveConstraints) {
  const previous = comparablePerformance(data, exercise.id, constraints.location ?? "gym");
  const reps = previous.all.map((set) => set.reps).filter((value): value is number => value != null);
  let repMin = exercise.defaultRepMin, repMax = exercise.defaultRepMax;
  if (reps.length) { repMin = Math.max(1, Math.min(...reps)); repMax = Math.max(repMin, Math.max(...reps)); if (repMin === repMax) repMax += 2; }
  if (constraints.modality === "strength" && exercise.metricType === "reps") { repMin = Math.min(repMin, 3); repMax = Math.min(6, Math.max(repMin, repMax)); }
  if (constraints.modality === "muscular_endurance" && exercise.metricType === "reps") { repMin = Math.max(12, repMin); repMax = Math.max(15, repMax); }
  const latest = previous.latest[0];
  const load = latest?.assistanceWeight != null && latest.assistanceWeight > 0
    ? { kind: "assistance" as const, valueKg: latest.assistanceWeight }
    : latest?.addedWeight != null && latest.addedWeight > 0
      ? { kind: "added_weight" as const, valueKg: latest.addedWeight }
      : latest?.weight != null ? { kind: "external" as const, valueKg: latest.weight }
        : exercise.bodyweightExercise ? { kind: "bodyweight" as const, valueKg: null }
          : { kind: "calibration" as const, valueKg: null };
  return {
    repMin, repMax, rir: exercise.metricType === "time" ? "Técnica" : constraints.energy === "low" || constraints.modality === "functional_mobility" ? "3" : exercise.fatigueCost >= 3 ? "2–3" : "1–2",
    restSeconds: constraints.modality === "strength" ? Math.max(180, exercise.defaultRestSeconds)
      : constraints.modality === "muscular_endurance" ? Math.min(90, exercise.defaultRestSeconds) : exercise.defaultRestSeconds,
    suggestedLoad: { ...load, confidence: previous.sessionCount >= 3 ? "high" as const : previous.sessionCount ? "medium" as const : "low" as const },
    notes: exercise.metricType === "time"
      ? "Detén la serie cuando pierdas la posición o la respiración controlada; el tiempo es un techo técnico, no un objetivo a cualquier precio."
      : previous.sessionCount ? "Mantén la carga comparable y progresa en repeticiones; aumenta solo al dominar el rango con el RIR previsto."
        : "Calibra una carga técnica conservadora; no hay historial comparable suficiente.",
    previousSetCount: previous.latest.length,
  };
}

function estimateExerciseTiming(exercise: Exercise, sets: number, prescribedMax = exercise.defaultRepMax, restPerEffort = exercise.defaultRestSeconds) {
  const work = exercise.metricType === "time" ? prescribedMax : 35;
  // Technical ramp-up sets remain attached to demanding exercises. They are not
  // hypertrophy sets and are distinct from the optional general warm-up.
  const rampUp = exercise.fatigueCost >= 4 ? 180 : exercise.fatigueCost >= 3 ? 90 : 0;
  const efforts = sets * (exercise.unilateralPerSide ? 2 : 1);
  const transitionAndSetup = 75;
  const timing = {
    workSeconds: Math.round(efforts * work),
    restSeconds: Math.round(Math.max(0, efforts - 1) * restPerEffort),
    transitionSeconds: transitionAndSetup,
    rampUpSeconds: rampUp,
  };
  return { ...timing, totalSeconds: timing.workSeconds + timing.restSeconds + timing.transitionSeconds + timing.rampUpSeconds };
}

export function adaptiveTimeBudget(data: Snapshot, constraints: AdaptiveConstraints) {
  const totalSeconds = constraints.durationMinutes * 60;
  const generalWarmupSeconds = data.settings.includeWarmupInDuration
    ? clamp(data.settings.generalWarmupMinutes, 0, constraints.durationMinutes) * 60 : 0;
  return { totalSeconds, generalWarmupSeconds, mainSessionSeconds: totalSeconds - generalWarmupSeconds };
}

export function summarizePlanTime(data: Snapshot, constraints: AdaptiveConstraints, plan: PlanExercise[]) {
  const budget = adaptiveTimeBudget(data, constraints);
  const components = plan.reduce((sum, row) => ({
    workSeconds: sum.workSeconds + (row.timing?.workSeconds ?? 0),
    restSeconds: sum.restSeconds + (row.timing?.restSeconds ?? 0),
    transitionSeconds: sum.transitionSeconds + (row.timing?.transitionSeconds ?? 0),
    rampUpSeconds: sum.rampUpSeconds + (row.timing?.rampUpSeconds ?? 0),
  }), { workSeconds: 0, restSeconds: 0, transitionSeconds: 0, rampUpSeconds: 0 });
  const plannedMainSeconds = Object.values(components).reduce((sum, value) => sum + value, 0);
  return { ...budget, ...components, plannedMainSeconds,
    plannedTotalSeconds: plannedMainSeconds + budget.generalWarmupSeconds,
    remainingSeconds: Math.max(0, budget.mainSessionSeconds - plannedMainSeconds) };
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
  const plannedDirectSets = new Map<MuscleGroup, number>();
  const focused = new Set(focusGroups(constraints.muscleFocus ?? "automatic"));
  const specialized = (constraints.muscleFocus ?? "automatic") !== "automatic" && (constraints.muscleFocus ?? "automatic") !== "full_body";
  const usefulSetLimit = new Map(context.needs.map((item) => {
    const deficit = Math.max(0, item.targetSets10d - item.directSets10d - item.indirectStimulus10d * 0.35);
    const base = Math.max(2, Math.round(deficit));
    const specializedLimit = specialized && focused.has(item.group) ? Math.max(4, Math.min(10, Math.ceil(deficit * 1.45))) : base;
    return [item.group, specializedLimit] as const;
  }));
  const maxSeconds = adaptiveTimeBudget(data, constraints).mainSessionSeconds; let usedSeconds = 0;
  const maxExercises = constraints.durationMinutes <= 30 ? 4 : constraints.durationMinutes <= 50 ? 6 : constraints.durationMinutes <= 60 ? 7 : 8;
  while (selected.length < maxExercises) {
    const candidates = eligible.filter((exercise) => !selected.some((item) => item.exercise.id === exercise.id)).map((exercise) => {
      const direct = exercise.stimulus.filter((item) => item.direct);
      const marginalNeed = (group: MuscleGroup) => {
        const planned = plannedDirectSets.get(group) ?? 0, limit = usefulSetLimit.get(group) ?? 2;
        return (need.get(group) ?? 0) * Math.max(0, 1 - Math.pow(planned / Math.max(1, limit), 1.35));
      };
      const strongest = [...direct].sort((a, b) => marginalNeed(b.group) * b.weight - marginalNeed(a.group) * a.weight)[0];
      const directCoverage = direct.reduce((sum, item) => sum + marginalNeed(item.group) * item.weight, 0);
      const secondaryCoverage = exercise.stimulus.filter((item) => !item.direct)
        .reduce((sum, item) => sum + (need.get(item.group) ?? 0) * item.weight * 0.12, 0);
      const preference = data.settings.exercisePreferences[exercise.id] ?? exercise.preference;
      const seen = recentIds.has(exercise.id);
      const continuity = data.settings.variationLevel === 1 ? (seen ? 4 : -0.5)
        : data.settings.variationLevel === 2 ? (seen ? 1.5 : 0.5) : (seen ? -1 : 2);
      const repetitionPenalty = Math.max(0, (recentCounts.get(exercise.id) ?? 0) - 1) * 7;
      const familyCount = selected.filter((item) => item.exercise.exerciseFamily === exercise.exerciseFamily).length;
      const groupCount = strongest ? selected.filter((item) => item.plan.targetGroup === strongest.group).length : 0;
      const familyRepeat = familyCount ? 18 * Math.pow(familyCount, 1.35) : 0;
      const directGroupRepeat = groupCount ? (specialized && strongest && focused.has(strongest.group) ? 4 : 12) * Math.pow(groupCount, 1.35) : 0;
      const fatiguePenalty = exercise.fatigueCost * (constraints.energy === "low" ? 5 : 1.5);
      const modalityBonus = constraints.modality === "calisthenics" ? (exercise.bodyweightExercise ? 8 : -3)
        : constraints.modality === "strength" ? (exercise.referenceExercise ? 7 : exercise.fatigueCost >= 3 ? 2 : -2)
          : constraints.modality === "functional_mobility" ? (exercise.fatigueCost <= 2 ? 5 : -4) : 0;
      return { exercise, strongest, utility: directCoverage / 8 + secondaryCoverage / 10 + (preference - 3) * 0.8
        + continuity + (exercise.referenceExercise && strongest && (need.get(strongest.group) ?? 0) >= 8 ? 2 : 0)
        + modalityBonus - familyRepeat - directGroupRepeat - fatiguePenalty - repetitionPenalty };
    }).sort((a, b) => b.utility - a.utility);
    const usefulThreshold = specialized ? 2 : usedSeconds < maxSeconds * 0.7 ? 4 : 6;
    if (!candidates.some((candidate) => candidate.strongest && (need.get(candidate.strongest.group) ?? 0) >= usefulThreshold)) break;
    let added = false;
    for (const candidate of candidates) {
      const prescription = prescribe(data, candidate.exercise, constraints);
      const strongest = candidate.strongest;
      if (!strongest || (need.get(strongest.group) ?? 0) < usefulThreshold) continue;
      const targetNeed = need.get(strongest.group) ?? 0;
      const desiredSets = constraints.energy === "low" ? 2 : candidate.exercise.referenceExercise && prescription.previousSetCount >= 3
        ? clamp(prescription.previousSetCount, 3, 4) : targetNeed >= 10 ? 3 : 2;
      const remainingUsefulSets = Math.max(0, (usefulSetLimit.get(strongest.group) ?? 2) - (plannedDirectSets.get(strongest.group) ?? 0));
      if (remainingUsefulSets <= 0) continue;
      if ((plannedDirectSets.get(strongest.group) ?? 0) > 0 && remainingUsefulSets < 2 && !specialized) continue;
      const sets = Math.max(1, Math.min(desiredSets, Math.ceil(remainingUsefulSets)));
      const timing = estimateExerciseTiming(candidate.exercise, sets, prescription.repMax, prescription.restSeconds);
      const estimatedSeconds = timing.totalSeconds;
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
        targetGroup: strongest.group, restSeconds: prescription.restSeconds,
        suggestedLoad: prescription.suggestedLoad,
        reason: `Estímulo principal: ${strongest.group} (necesidad ${round(need.get(strongest.group) ?? 0)}).${secondary.length ? ` Secundario: ${secondary.join(", ")}.` : ""}`,
        alternatives, estimatedSeconds, timing, unilateralPerSide: candidate.exercise.unilateralPerSide,
      }});
      usedSeconds += estimatedSeconds;
      plannedDirectSets.set(strongest.group, (plannedDirectSets.get(strongest.group) ?? 0) + sets * strongest.weight);
      for (const stimulus of candidate.exercise.stimulus)
        need.set(stimulus.group, Math.max(0, (need.get(stimulus.group) ?? 0) - sets * stimulus.weight * (stimulus.direct ? 14 : 4)));
      added = true; break;
    }
    if (!added) break;
  }
  return selected.sort((a, b) => orderScore(b.exercise, b.plan, context, constraints) - orderScore(a.exercise, a.plan, context, constraints))
    .map((item, index) => ({ ...item.plan, order: index + 1 }));
}

function orderScore(exercise: Exercise, plan: PlanExercise, context: AdaptiveContext, constraints?: AdaptiveConstraints) {
  const needRow = context.needs.find((item) => item.group === plan.targetGroup), need = needRow?.score ?? 0;
  const isolation = ["elbow_flexion", "elbow_extension", "shoulder_abduction", "rear_delt_isolation", "calf_raise"].includes(exercise.movementPattern);
  const focused = focusGroups(constraints?.muscleFocus ?? "automatic").includes(plan.targetGroup!);
  return need * 0.25 + (needRow?.priority ?? 3) * 5 + (exercise.referenceExercise ? 28 : 0)
    + (focused ? 18 : 0) + (isolation ? -15 : 8) + exercise.fatigueCost * 2;
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
export const llmAdaptivePlanSchema = z.object({ schemaVersion: z.literal("adaptive-session-1.2"),
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
    const timing = estimateExerciseTiming(exercise, row.sets, row.repMax, row.restSeconds);
    const estimatedSeconds = timing.totalSeconds;
    seconds += estimatedSeconds;
    return { ...row, estimatedSeconds, timing, unilateralPerSide: exercise.unilateralPerSide };
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
  const selectedFocus = new Set(focusGroups(constraints.muscleFocus ?? "automatic"));
  const isSpecialized = selectedFocus.size > 0 && constraints.muscleFocus !== "full_body";
  if (uncoveredHigh && uncoveredHigh.score >= 12) {
    const displaced = parsed.exercises.find((row) => {
      const selectedNeed = context.needs.find((need) => need.group === row.targetGroup)?.score ?? 0;
      return selectedNeed < 8 && uncoveredHigh.score - selectedNeed >= 8 && !(isSpecialized && selectedFocus.has(row.targetGroup));
    });
    if (displaced) throw new Error(`La propuesta desplaza ${uncoveredHigh.group} por ${displaced.targetGroup} sin necesidad suficiente.`);
  }
  const mainGroups = new Set<MuscleGroup>(["vertical_pull", "horizontal_pull", "chest", "vertical_push", "quads", "posterior_chain"]);
  const uncoveredMain = context.needs.find((need) => mainGroups.has(need.group) && eligibleDirectGroups.has(need.group)
    && !selectedGroups.has(need.group) && need.score >= 12);
  const isolationPatterns = new Set(["elbow_flexion", "elbow_extension", "shoulder_abduction", "rear_delt_isolation", "calf_raise", "forearm_grip"]);
  const isolationCount = canonicalExercises.filter((row) => isolationPatterns.has(catalog.get(row.exerciseId)!.movementPattern)).length;
  if (!isSpecialized && uncoveredMain && isolationCount > canonicalExercises.length / 2)
    throw new Error(`La propuesta concentra accesorios mientras deja pendiente ${uncoveredMain.group}.`);
  const recoverableFocused = context.needs.filter((need) => selectedFocus.has(need.group) && need.score >= 2 && eligibleDirectGroups.has(need.group));
  if (isSpecialized && recoverableFocused.length && !canonicalExercises.some((row) => selectedFocus.has(row.targetGroup)))
    throw new Error("La propuesta no contiene trabajo directo para el enfoque muscular elegido.");
  if (constraints.muscleFocus === "arms" && constraints.modality === "hypertrophy") {
    for (const group of ["biceps", "triceps"] as MuscleGroup[])
      if (context.needs.some((need) => need.group === group && need.score >= 2) && eligibleDirectGroups.has(group) && !selectedGroups.has(group))
        throw new Error("Hipertrofia de brazos requiere trabajo directo recuperable de bíceps y tríceps.");
  }
  if (constraints.modality === "calisthenics" && canonicalExercises.filter((row) => catalog.get(row.exerciseId)!.bodyweightExercise).length < Math.ceil(canonicalExercises.length / 2))
    throw new Error("La propuesta de calistenia no prioriza suficientemente ejercicios de peso corporal.");
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
    if (prematureIsolation && !isSpecialized) throw new Error("El orden relega un movimiento de referencia sin una prioridad suficiente que lo justifique.");
  }
  return { ...parsed, exercises: canonicalExercises.sort((a, b) => a.order - b.order) };
}

export function repairUnderfilledPlan(
  data: Snapshot,
  plan: Array<PlanExercise & { order: number }>,
  deterministicReference: Array<PlanExercise & { order: number }>,
  constraints: AdaptiveConstraints,
  context: AdaptiveContext,
) {
  const budget = adaptiveTimeBudget(data, constraints).mainSessionSeconds;
  const seconds = (rows: PlanExercise[]) => rows.reduce((sum, row) => sum + (row.estimatedSeconds ?? 0), 0);
  const referenceSeconds = seconds(deterministicReference);
  let used = seconds(plan);
  if (used >= budget * 0.68 || used >= referenceSeconds * 0.9) return { plan, repaired: false };
  const combined = [...plan];
  for (const row of deterministicReference) {
    if (combined.some((item) => item.exerciseId === row.exerciseId)) continue;
    if (used + (row.estimatedSeconds ?? 0) > budget) continue;
    combined.push(row);
    used += row.estimatedSeconds ?? 0;
    if (used >= budget * 0.68 || used >= referenceSeconds * 0.9) break;
  }
  const catalog = new Map(data.exercises.map((exercise) => [exercise.id, exercise]));
  const ordered: Array<PlanExercise & { order: number }> = combined.sort((a, b) => orderScore(catalog.get(b.exerciseId)!, b, context, constraints)
    - orderScore(catalog.get(a.exerciseId)!, a, context, constraints)).map((row, index) => ({ ...row, order: index + 1 }));
  return { plan: ordered, repaired: ordered.length > plan.length };
}

export function buildEquipmentAudit(data: Snapshot, context: AdaptiveContext, constraints: AdaptiveConstraints) {
  const relevant = new Set(context.needs.filter((need) => need.score >= 4).slice(0, 6).map((need) => need.group));
  const blocked = new Set(constraints.blockedExerciseIds);
  return data.exercises.flatMap((exercise) => exercise.stimulus.filter((stimulus) => stimulus.direct && relevant.has(stimulus.group))
    .map((stimulus) => {
      const reason = blocked.has(exercise.id) ? "blocked" as const
        : !exercise.enabled ? "disabled" as const
          : exercise.planningStatus === "manual_only" ? "manual_only" as const
            : exercise.planningStatus === "legacy_only" ? "legacy_only" as const
              : !exercise.autoSelectable ? "not_auto_selectable" as const
              : !equipmentMatches(exercise, constraints) ? "equipment" as const : "eligible" as const;
      return { exerciseId: exercise.id, name: exercise.name, group: stimulus.group,
        equipment: exercise.equipment, eligible: reason === "eligible", reason };
    })).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name, "es"));
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

export function explainRemainingTime(data: Snapshot, plan: PlanExercise[], context: AdaptiveContext, constraints: AdaptiveConstraints) {
  const timing = summarizePlanTime(data, constraints, plan);
  if (timing.remainingSeconds < Math.max(480, timing.mainSessionSeconds * 0.2)) return null;
  const audit = buildDecisionAudit(data, plan, context, constraints);
  const minutes = Math.round(timing.remainingSeconds / 60);
  if (audit.uncoveredNeeds.some((item) => item.reason === "recovery"))
    return `Quedan aproximadamente ${minutes} min sin programar: la recuperación limita el trabajo pendiente y no se añade volumen de relleno.`;
  if (audit.uncoveredNeeds.length && audit.uncoveredNeeds.every((item) => item.reason === "equipment" || item.reason === "no_candidate"))
    return `Quedan aproximadamente ${minutes} min sin programar: no hay candidatos directos compatibles con el equipamiento para las necesidades restantes.`;
  return `Quedan aproximadamente ${minutes} min sin programar: el volumen útil y la diversidad razonable ya están cubiertos; añadir más series tendría una utilidad marginal baja o sería redundante.`;
}
