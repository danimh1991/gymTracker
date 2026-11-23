import { z } from "zod";
import { SPORT_KEYS } from "../domain/sports";
const positive = z.number().finite().min(0).max(2000).nullable();
const dayKey = z.enum(["A", "B", "C", "D", "E", "F", "G"]);
const muscleGroup = z.enum([
  "vertical_pull", "horizontal_pull", "chest", "vertical_push",
  "lateral_rear_delts", "biceps", "triceps", "quads",
  "posterior_chain", "core", "calves", "forearms_grip",
]);
const trainingLocation = z.enum(["gym", "calisthenics_park", "home", "outdoors", "hotel", "custom"]);
const sessionModality = z.enum(["general", "hypertrophy", "calisthenics", "strength", "muscular_endurance", "functional_mobility"]);
const muscleFocus = z.enum(["automatic", "full_body", "upper_body", "lower_body", "push", "pull", "back", "chest", "shoulders", "arms", "biceps", "triceps", "quads", "posterior_chain", "calves", "core"]);
const locationOverride = z.object({
  available: z.array(z.string().trim().min(1).max(80)).max(40),
  unavailable: z.array(z.string().trim().min(1).max(80)).max(40),
  excludedExerciseIds: z.array(z.string().min(1)).max(120),
});
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)));
export const planExercise = z
  .object({
    exerciseId: z.string().min(1),
    sets: z.number().int().min(1).max(30),
    repMin: z.number().int().min(0).max(1000),
    repMax: z.number().int().min(0).max(1000),
    rir: z.string().min(1).max(20),
    optional: z.number().int().min(0).max(1),
    notes: z.string().max(2000),
    priority: z.string().max(40),
    order: z.number().int().min(1).max(40).optional(),
    targetGroup: muscleGroup.optional(),
    restSeconds: z.number().int().min(30).max(600).optional(),
    suggestedLoad: z.object({
      kind: z.enum(["bodyweight", "added_weight", "assistance", "external", "calibration"]),
      valueKg: z.number().finite().min(0).max(2000).nullable(),
      confidence: z.enum(["low", "medium", "high"]),
    }).optional(),
    reason: z.string().max(500).optional(),
    alternatives: z.array(z.string().min(1)).max(4).optional(),
    estimatedSeconds: z.number().int().min(30).max(3600).optional(),
  })
  .refine(
    (v) => v.repMax >= v.repMin,
    "El máximo debe ser igual o mayor que el mínimo.",
  );
export const exerciseInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  shortName: z.string().trim().min(1).max(80),
  type: z.enum(["calisthenics", "gym", "mobility", "skill"]),
  movementPattern: z.string().min(1).max(50),
  primaryMuscles: z.string().max(200),
  secondaryMuscles: z.string().max(200),
  equipment: z.string().max(120),
  metricType: z.enum(["reps", "time"]),
  bodyweightExercise: z.number().int().min(0).max(1),
  supportsAssistance: z.number().int().min(0).max(1),
  supportsAddedWeight: z.number().int().min(0).max(1),
  defaultRepMin: z.number().int().min(0).max(1000),
  defaultRepMax: z.number().int().min(0).max(1000),
  defaultRIR: z.string().max(20),
  notes: z.string().max(2000),
  enabled: z.number().int().min(0).max(1),
});
export const setInput = z
  .object({
    workoutExerciseId: z.string().min(1),
    setNumber: z.number().int().min(1).max(30),
    reps: z.number().int().min(0).max(1000).nullable(),
    weight: positive,
    addedWeight: positive,
    assistanceWeight: positive,
    RIR: z.number().int().min(0).max(3).nullable(),
    durationSeconds: z.number().finite().min(0).max(86400).nullable(),
    notes: z.string().max(2000).default(""),
  })
  .refine(
    (s) => !((s.addedWeight ?? 0) > 0 && (s.assistanceWeight ?? 0) > 0),
    "No puedes combinar lastre y asistencia.",
  );
const importedSet = z.object({
  setNumber: z.number().int().min(1).max(30),
  reps: z.number().int().min(0).max(1000).nullable(),
  weight: positive,
  bodyweight: positive.optional(),
  assistanceWeight: positive,
  addedWeight: positive,
  RIR: z.number().int().min(0).max(3).nullable(),
  RPE: z.number().finite().min(0).max(10).nullable().optional(),
  durationSeconds: z.number().finite().min(0).max(86400).nullable(),
  distance: positive.optional(),
  notes: z.string().max(2000).default(""),
  timestamp: z.string().datetime().optional(),
});
const importedWorkoutExercise = planExercise.and(
  z.object({
    name: z.string().trim().min(1).max(120),
    metricType: z.enum(["reps", "time"]),
    bodyweightExercise: z.number().int().min(0).max(1),
    supportsAssistance: z.number().int().min(0).max(1),
    supportsAddedWeight: z.number().int().min(0).max(1),
    variant: z.string().max(100).default(""),
    setsDone: z.array(importedSet).max(30),
  }),
);
const importedWorkout = z.object({
  sourceId: z.string().max(200).optional(),
  dayId: dayKey,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  bodyweight: positive,
  notes: z.string().max(4000).default(""),
  templateName: z.string().max(100).default("Sesión importada"),
  isFreeDay: z.number().int().min(0).max(1).default(0),
  sessionType: z.enum(["legacy", "template", "adaptive", "manual"]).optional(),
  trainingLocation: trainingLocation.nullable().optional(),
  sessionModality: sessionModality.nullable().optional(),
  muscleFocus: muscleFocus.nullable().optional(),
  equipmentProfileVersion: z.string().max(80).nullable().optional(),
  exercises: z.array(importedWorkoutExercise).min(1).max(40),
});
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("addUser"),
    name: z.string().trim().min(2).max(60),
  }),
  z.object({
    action: z.literal("deleteUser"),
    userId: z.string().min(1).max(100),
  }),
  z.object({
    action: z.literal("start"),
    dayId: dayKey,
    templateName: z.string().min(1).max(100),
    exercises: z.array(planExercise).min(1).max(40),
    isFreeDay: z.boolean().optional(),
    sessionType: z.enum(["template", "adaptive", "manual"]).optional(),
    proposalId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("saveAdaptiveProposal"),
    proposal: z.object({
      id: z.string().uuid(),
      constraintsJson: z.string().max(10000),
      contextJson: z.string().max(50000),
      originalPlanJson: z.string().max(50000),
      currentPlanJson: z.string().max(50000),
      rationaleJson: z.string().max(20000),
      rulesVersion: z.string().max(40),
      source: z.enum(["llm", "fallback"]),
      latencyMs: z.number().int().min(0).max(120000).nullable(),
      errorCode: z.string().max(100).nullable(),
    }),
  }),
  z.object({
    action: z.literal("updateAdaptiveProposal"),
    proposalId: z.string().uuid(),
    plan: z.array(planExercise).min(1).max(20),
  }),
  z.object({
    action: z.literal("setTrainerSettings"),
    settings: z.object({
      defaultDurationMinutes: z.number().int().min(30).max(75),
      includeWarmupInDuration: z.number().int().min(0).max(1),
      generalWarmupMinutes: z.number().int().min(0).max(20),
      equipmentProfile: z.enum(["full_gym", "custom"]),
      excludedExerciseIds: z.array(z.string().min(1)).max(120),
      defaultTrainingLocation: trainingLocation,
      locationEquipmentOverrides: z.record(z.string(), locationOverride),
      customEquipmentProfiles: z.array(locationOverride.extend({
        id: z.string().min(1).max(100), name: z.string().trim().min(1).max(80),
        baseLocation: z.enum(["gym", "calisthenics_park", "home", "outdoors", "hotel"]),
        exercisePreferences: z.record(z.string(), z.number().int().min(1).max(5)),
      })).max(20),
      usualFrequency: z.number().int().min(1).max(7),
      variationLevel: z.number().int().min(1).max(3),
      priorities: z.record(muscleGroup, z.number().int().min(1).max(5)),
      exercisePreferences: z.record(z.string(), z.number().int().min(1).max(5)),
      availableEquipment: z.array(z.string().trim().min(1).max(80)).max(30),
    }),
  }),
  z.object({ action: z.literal("saveSet"), set: setInput }),
  z.object({
    action: z.literal("setExerciseLoadDecision"),
    workoutExerciseId: z.string().min(1),
    decision: z.enum(["increase", "maintain"]),
  }),
  z.object({
    action: z.literal("deleteSet"),
    setId: z.string().min(1),
  }),
  z.object({
    action: z.literal("setWorkoutBodyweight"),
    workoutId: z.string().min(1),
    weightKg: z.number().finite().min(20).max(400),
  }),
  z.object({
    action: z.literal("finish"),
    workoutId: z.string(),
    notes: z.string().max(4000).default(""),
    name: z.string().trim().min(1).max(100).optional(),
  }),
  z.object({ action: z.literal("cancel"), workoutId: z.string() }),
  z.object({
    action: z.literal("updateWorkoutDate"),
    workoutId: z.string().min(1),
    date: dateKey,
  }),
  z.object({
    action: z.literal("deleteWorkout"),
    workoutId: z.string().min(1),
  }),
  z.object({
    action: z.literal("bodyWeight"),
    weightKg: z.number().finite().min(20).max(400),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => !Number.isNaN(Date.parse(v))),
  }),
  z.object({
    action: z.literal("variant"),
    workoutExerciseId: z.string(),
    variant: z.string().max(100),
    metricType: z.enum(["reps", "time"]),
  }),
  z.object({ action: z.literal("resetDemo") }),
  z.object({
    action: z.literal("updateWorkoutExercise"),
    workoutExerciseId: z.string(),
    exercise: planExercise,
  }),
  z.object({
    action: z.literal("addWorkoutExercise"),
    workoutId: z.string(),
    exercise: planExercise,
  }),
  z.object({
    action: z.literal("removeWorkoutExercise"),
    workoutExerciseId: z.string(),
  }),
  z.object({
    action: z.literal("saveTemplate"),
    id: z.string().optional(),
    dayId: dayKey,
    name: z.string().trim().min(2).max(100),
    description: z.string().max(500),
    exercises: z.array(planExercise).min(1).max(40),
  }),
  z.object({
    action: z.literal("importTemplates"),
    templates: z
      .array(
        z.object({
          dayId: dayKey,
          name: z.string().trim().min(2).max(100),
          description: z.string().max(500).default(""),
          exercises: z.array(planExercise).min(1).max(40),
        }),
      )
      .min(1)
      .max(100),
  }),
  z.object({ action: z.literal("addExercise"), exercise: exerciseInput }),
  z.object({
    action: z.literal("deleteExercise"),
    exerciseId: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("updateExercise"),
    exerciseId: z.string().min(1),
    exercise: exerciseInput.omit({ id: true }),
  }),
  z.object({
    action: z.literal("deleteTemplate"),
    templateId: z.string().min(1),
  }),
  z.object({
    action: z.literal("setTrainingDays"),
    trainingDays: z.number().int().min(1).max(7),
  }),
  z.object({
    action: z.literal("addExternalActivity"),
    activity: z.object({
      sport: z.enum(SPORT_KEYS),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((value) => !Number.isNaN(Date.parse(value))),
      durationMinutes: z.number().int().min(1).max(1440),
      distanceKm: z.number().finite().positive().max(1000).nullable(),
      laps: z.number().int().positive().max(10000).nullable(),
      elevationGainM: z.number().int().min(0).max(20000).nullable(),
      intensity: z.enum(["easy", "moderate", "hard"]),
      notes: z.string().max(2000),
    }),
  }),
  z.object({
    action: z.literal("deleteExternalActivity"),
    activityId: z.string().min(1),
  }),
  z.object({
    action: z.literal("importExercises"),
    exercises: z.array(exerciseInput).min(1).max(500),
  }),
  z.object({
    action: z.literal("importWorkouts"),
    workouts: z.array(importedWorkout).min(1).max(500),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
