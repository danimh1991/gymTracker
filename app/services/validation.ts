import { z } from "zod";
const positive = z.number().finite().min(0).max(2000).nullable();
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
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    dayId: z.enum(["A", "B", "C"]),
    templateName: z.string().min(1).max(100),
    exercises: z.array(planExercise).min(1).max(40),
  }),
  z.object({ action: z.literal("saveSet"), set: setInput }),
  z.object({
    action: z.literal("finish"),
    workoutId: z.string(),
    notes: z.string().max(4000).default(""),
  }),
  z.object({ action: z.literal("cancel"), workoutId: z.string() }),
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
    dayId: z.enum(["A", "B", "C"]),
    name: z.string().trim().min(2).max(100),
    description: z.string().max(500),
    exercises: z.array(planExercise).min(1).max(40),
  }),
  z.object({
    action: z.literal("importTemplates"),
    templates: z
      .array(
        z.object({
          dayId: z.enum(["A", "B", "C"]),
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
    action: z.literal("importExercises"),
    exercises: z.array(exerciseInput).min(1).max(500),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
