import { z } from "zod";
const positive = z.number().finite().min(0).max(2000).nullable();
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
  z.object({ action: z.literal("start"), dayId: z.enum(["A", "B", "C"]) }),
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
]);
export type Command = z.infer<typeof commandSchema>;
