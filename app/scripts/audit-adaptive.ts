import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { Exercise, Snapshot, WorkoutExercise, WorkoutSet } from "../domain/types";
import {
  ADAPTIVE_RULES_VERSION,
  buildAdaptiveContext,
  defaultTrainerSettings,
  deterministicPlan,
  exerciseStimulus,
  MUSCLE_GROUPS,
  summarizePlanTime,
} from "../services/adaptive-planner";

const backupPath = process.env.AUDIT_D1_BACKUP;
if (!backupPath) throw new Error("AUDIT_D1_BACKUP es obligatorio.");

const sqlite = new DatabaseSync(":memory:");
const dump = readFileSync(backupPath, "utf8").replace(
  "PRAGMA defer_foreign_keys=TRUE;",
  "PRAGMA foreign_keys=OFF;",
);
sqlite.exec(dump);
sqlite.exec(readFileSync(new URL("../drizzle/0009_adaptive_1_1.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../drizzle/0010_adaptive_time_budget.sql", import.meta.url), "utf8").replaceAll("--> statement-breakpoint", ""));
sqlite.exec(readFileSync(new URL("../drizzle/0011_equipment_profile.sql", import.meta.url), "utf8").replaceAll("--> statement-breakpoint", ""));

const rows = <T>(table: string) => sqlite.prepare(`SELECT * FROM ${table}`).all() as T[];
const ownerId = "danieta-gymtracker:real";
const exercises = sqlite.prepare(`SELECT e.*,m.metadataJson FROM exercises e
  JOIN exerciseAdaptiveMetadata m ON m.exerciseId=e.id`).all().map((row) => {
    const value = row as Record<string, unknown>;
    return { ...value, ...JSON.parse(String(value.metadataJson)) } as unknown as Exercise;
  });
const storedSettings = sqlite.prepare("SELECT * FROM userSettings WHERE ownerId=?").get(ownerId) as Record<string, unknown> | undefined;
const settings = defaultTrainerSettings(Number(storedSettings?.trainingDays ?? 3));
settings.defaultDurationMinutes = Number(storedSettings?.defaultDurationMinutes ?? settings.defaultDurationMinutes);
settings.includeWarmupInDuration = Number(storedSettings?.includeWarmupInDuration ?? settings.includeWarmupInDuration);
settings.generalWarmupMinutes = Number(storedSettings?.generalWarmupMinutes ?? settings.generalWarmupMinutes);
settings.equipmentProfile = storedSettings?.equipmentProfile === "custom" ? "custom" : "full_gym";
settings.excludedExerciseIds = JSON.parse(String(storedSettings?.excludedExerciseIds ?? "[]"));
settings.usualFrequency = Number(storedSettings?.usualFrequency ?? settings.usualFrequency);
settings.variationLevel = Number(storedSettings?.variationLevel ?? settings.variationLevel);
settings.priorities = { ...settings.priorities, ...JSON.parse(String(storedSettings?.priorities ?? "{}")) };
settings.exercisePreferences = JSON.parse(String(storedSettings?.exercisePreferences ?? "{}"));
settings.availableEquipment = JSON.parse(String(storedSettings?.availableEquipment ?? "[]"));
if (!settings.availableEquipment.length) settings.availableEquipment = [...new Set(exercises.map((exercise) => exercise.equipment))];
settings.equipmentConfigured = settings.availableEquipment.length ? 1 : 0;
const data = {
  users: [],
  activeUserId: "danieta-gymtracker",
  settings,
  routines: [],
  skills: [],
  skillProgressions: [],
  skillLogs: [],
  personalRecords: [],
  exercises,
  days: rows("days"),
  routine: rows("routineExercises"),
  workouts: rows<Record<string, unknown>>("workouts")
    .filter((row) => row.ownerId === ownerId)
    .map((row) => ({
      ...row,
      sessionType: row.dayId === "G" ? "legacy" : row.isFreeDay ? "manual" : "template",
      proposalId: null,
    })),
  workoutExercises: rows<WorkoutExercise>("workoutExercises"),
  sets: rows<WorkoutSet>("workoutSets"),
  bodyWeights: rows("bodyWeights"),
  goals: rows("goals"),
  templates: rows("workoutTemplates"),
  templateExercises: rows("templateExercises"),
  externalActivities: rows("externalActivities"),
  adaptiveProposals: [],
} as unknown as Snapshot;

const reportedCaseGeneratedAt = "2026-11-22T20:56:14.206Z";
const reportedCaseContext = buildAdaptiveContext(data, new Date(reportedCaseGeneratedAt));
const reportedCasePlan = deterministicPlan(data, {
  durationMinutes: 45, energy: "normal", blockedExerciseIds: settings.excludedExerciseIds,
  equipment: settings.availableEquipment, equipmentProfile: settings.equipmentProfile,
}, reportedCaseContext);
const reportedCaseTiming = summarizePlanTime(data, {
  durationMinutes: 45, energy: "normal", blockedExerciseIds: settings.excludedExerciseIds,
  equipment: settings.availableEquipment, equipmentProfile: settings.equipmentProfile,
}, reportedCasePlan);

const enabled = exercises.filter((exercise) => exercise.enabled);
const catalog = enabled
  .map((exercise) => {
    const stimulus = exerciseStimulus(exercise);
    const alternatives = enabled
      .filter((candidate) =>
        candidate.id !== exercise.id &&
        exerciseStimulus(candidate).primary.some((group) => stimulus.primary.includes(group)),
      )
      .map((candidate) => candidate.id);
    return {
      id: exercise.id,
      name: exercise.name,
      storedPrimaryMuscles: exercise.primaryMuscles,
      storedSecondaryMuscles: exercise.secondaryMuscles,
      plannerPrimaryGroups: stimulus.primary,
      plannerSecondaryGroups: stimulus.secondary,
      movementPattern: exercise.movementPattern,
      equipment: exercise.equipment,
      metricType: exercise.metricType,
      configuredPreference: settings.exercisePreferences[exercise.id] ?? 3,
      referenceExerciseBoost: ["pullup", "dip"].includes(exercise.id) ? 2 : 0,
      specialAdjustment:
        exercise.id === "pullup"
          ? { verticalPullBoost: 1 }
          : exercise.id === "handstand"
            ? { fixedPenalty: -3 }
            : {},
      fatigueCost: stimulus.fatigue,
      repRange: [exercise.defaultRepMin, exercise.defaultRepMax],
      defaultRir: exercise.defaultRIR,
      alternatives,
      enabled: Boolean(exercise.enabled),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

const simulationDates = [
  "2026-11-24T10:00:00.000Z",
  "2026-11-27T10:00:00.000Z",
  "2026-12-01T10:00:00.000Z",
  "2026-12-03T10:00:00.000Z",
  "2026-12-06T10:00:00.000Z",
  "2026-12-10T10:00:00.000Z",
];
const scenarios = [
  "completed",
  "partial",
  "fatigue-omission",
  "low-energy",
  "restricted-equipment",
  "after-inactivity",
] as const;

type SimulatedExecution = {
  exerciseId: string;
  plannedSets: number;
  completedSets: number;
  syntheticRepsOrSeconds: number[];
  syntheticRir: number[];
  omissionReason?: string;
};

const simulations: Array<Record<string, unknown>> = [];
const simulatedSetIds = new Set<string>();

for (const [sessionIndex, generatedAt] of simulationDates.entries()) {
  const contextBefore = buildAdaptiveContext(data, new Date(generatedAt));
  const plan = deterministicPlan(
    data,
    {
      durationMinutes: 50,
      energy: sessionIndex === 3 ? "low" : "normal",
      blockedExerciseIds: [],
      equipment: sessionIndex === 4
        ? ["Peso corporal", "Barra de dominadas", "Paralelas"]
        : settings.availableEquipment,
      equipmentProfile: sessionIndex === 4 ? "custom" : settings.equipmentProfile,
    },
    contextBefore,
  );
  const scenario = scenarios[sessionIndex];
  const workoutId = `simulation-workout-${sessionIndex + 1}`;
  const execution: SimulatedExecution[] = [];
  const fatigueCandidate = plan
    .map((item) => ({ item, fatigue: exerciseStimulus(exercises.find((e) => e.id === item.exerciseId)!).fatigue }))
    .sort((a, b) => b.fatigue - a.fatigue)[0]?.item.exerciseId;

  data.workouts.unshift({
    id: workoutId,
    dayId: "A",
    status: "completed",
    startedAt: generatedAt,
    finishedAt: new Date(Date.parse(generatedAt) + 50 * 60000).toISOString(),
    bodyweight: null,
    notes: `SIMULACIÓN AISLADA: ${scenario}`,
    templateName: "Simulación adaptativa",
    isFreeDay: 0,
    sessionType: "adaptive",
    proposalId: null,
  });

  for (const [position, item] of plan.entries()) {
    const exercise = exercises.find((candidate) => candidate.id === item.exerciseId)!;
    const workoutExerciseId = `${workoutId}:${position}`;
    data.workoutExercises.push({
      ...item,
      id: workoutExerciseId,
      workoutId,
      dayId: "A",
      position,
      name: exercise.name,
      metricType: exercise.metricType,
      bodyweightExercise: exercise.bodyweightExercise,
      supportsAssistance: exercise.supportsAssistance,
      supportsAddedWeight: exercise.supportsAddedWeight,
      variant: "",
      nextLoadAction: null,
    });

    let completedSets = item.sets;
    let omissionReason: string | undefined;
    if (scenario === "partial" && position >= Math.ceil(plan.length / 2)) {
      completedSets = position === Math.ceil(plan.length / 2) ? 1 : 0;
      omissionReason = "Fin de tiempo (simulado)";
    }
    if (scenario === "fatigue-omission" && item.exerciseId === fatigueCandidate) {
      completedSets = 0;
      omissionReason = "Omitido por fatiga declarada (simulado)";
    }

    const previous = data.sets
      .filter((set) =>
        !simulatedSetIds.has(set.id) && set.exerciseId === item.exerciseId && set.completed,
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const observed = previous
      .map((set) => exercise.metricType === "time" ? set.durationSeconds : set.reps)
      .filter((value): value is number => value !== null && value !== undefined && value > 0);
    const baseline = observed.length
      ? Math.round(observed.slice(0, 4).reduce((sum, value) => sum + value, 0) / Math.min(4, observed.length))
      : item.repMin;
    const results: number[] = [];
    const rirs: number[] = [];
    for (let setNumber = 1; setNumber <= completedSets; setNumber++) {
      const result = Math.max(1, baseline - Math.floor((setNumber - 1) / 2));
      const id = `${workoutExerciseId}:set:${setNumber}`;
      const set = {
        id,
        workoutId,
        workoutExerciseId,
        exerciseId: item.exerciseId,
        setNumber,
        reps: exercise.metricType === "reps" ? result : null,
        weight: null,
        bodyweight: exercise.bodyweightExercise ? 86 : null,
        assistanceWeight: null,
        addedWeight: null,
        RIR: setNumber === completedSets ? 1 : 2,
        RPE: null,
        durationSeconds: exercise.metricType === "time" ? result : null,
        distance: null,
        notes: "Resultado sintético para auditoría",
        completed: 1,
        timestamp: new Date(Date.parse(generatedAt) + (position * 8 + setNumber) * 60000).toISOString(),
      } satisfies WorkoutSet;
      data.sets.push(set);
      simulatedSetIds.add(id);
      results.push(result);
      rirs.push(set.RIR);
    }
    execution.push({
      exerciseId: item.exerciseId,
      plannedSets: item.sets,
      completedSets,
      syntheticRepsOrSeconds: results,
      syntheticRir: rirs,
      ...(omissionReason ? { omissionReason } : {}),
    });
  }

  const contextAfter = buildAdaptiveContext(data, new Date(Date.parse(generatedAt) + 51 * 60000));
  simulations.push({
    session: sessionIndex + 1,
    generatedAt,
    restDaysBefore: sessionIndex === 0 ? 2 : [3, 4, 2, 3, 4][sessionIndex - 1],
    scenario,
    constraints: {
      durationMinutes: 50,
      energy: sessionIndex === 3 ? "low" : "normal",
      equipment: sessionIndex === 4 ? "restringido" : "gimnasio configurado",
    },
    balanceBefore: contextBefore.needs,
    plan: plan.map((item, order) => ({
      ...item,
      order: item.order ?? order + 1,
      plannerStimulus: exerciseStimulus(exercises.find((exercise) => exercise.id === item.exerciseId)!),
    })),
    execution,
    balanceAfter: contextAfter.needs,
    pendingPriorities: contextAfter.needs.slice(0, 5).map((need) => need.group),
  });
}

const accumulated = Object.fromEntries(
  MUSCLE_GROUPS.map((group) => [group, { directSets: 0, indirectSets: 0, exposures: 0 }]),
) as Record<string, { directSets: number; indirectSets: number; exposures: number }>;

for (const simulation of simulations) {
  const exposed = new Set<string>();
  for (const result of simulation.execution as SimulatedExecution[]) {
    if (!result.completedSets) continue;
    const exercise = exercises.find((item) => item.id === result.exerciseId)!;
    const stimulus = exerciseStimulus(exercise);
    for (const group of stimulus.primary) {
      accumulated[group].directSets += result.completedSets;
      exposed.add(group);
    }
    for (const group of stimulus.secondary) {
      accumulated[group].indirectSets += result.completedSets;
      exposed.add(group);
    }
  }
  for (const group of exposed) accumulated[group].exposures += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  source: {
    database: "copia SQL anterior a la migración adaptativa",
    workoutCount: data.workouts.length - simulations.length,
    setCount: data.sets.length - simulatedSetIds.size,
    enabledExerciseCount: enabled.length,
    productionHistoryMutated: false,
  },
  rulesVersion: ADAPTIVE_RULES_VERSION,
  effectiveSettings: settings,
  reportedCase: {
    generatedAt: reportedCaseGeneratedAt,
    priorities: reportedCaseContext.needs,
    plan: reportedCasePlan,
    timing: reportedCaseTiming,
  },
  catalog,
  simulations,
  accumulated,
};
const output = JSON.stringify(report, null, 2);
if (process.env.AUDIT_OUTPUT) writeFileSync(process.env.AUDIT_OUTPUT, `${output}\n`);
console.log(output);
