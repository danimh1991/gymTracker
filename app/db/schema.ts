import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
const owner = () => text("ownerId").notNull();
export const exercises = sqliteTable("exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("shortName").notNull(),
  type: text("type").notNull(),
  movementPattern: text("movementPattern").notNull(),
  primaryMuscles: text("primaryMuscles").notNull(),
  secondaryMuscles: text("secondaryMuscles").notNull(),
  equipment: text("equipment").notNull(),
  metricType: text("metricType").notNull(),
  bodyweightExercise: integer("bodyweightExercise").notNull(),
  supportsAssistance: integer("supportsAssistance").notNull(),
  supportsAddedWeight: integer("supportsAddedWeight").notNull(),
  defaultRepMin: integer("defaultRepMin").notNull(),
  defaultRepMax: integer("defaultRepMax").notNull(),
  defaultRIR: text("defaultRIR").notNull(),
  notes: text("notes").notNull(),
  enabled: integer("enabled").notNull(),
  ownerId: text("ownerId"),
});
export const exerciseOverrides = sqliteTable(
  "exerciseOverrides",
  {
    id: text("id").primaryKey(),
    ownerId: owner(),
    exerciseId: text("exerciseId")
      .notNull()
      .references(() => exercises.id),
    data: text("data").notNull(),
  },
  (t) => [
    uniqueIndex("exercise_override_owner_exercise").on(t.ownerId, t.exerciseId),
  ],
);
export const workoutTemplates = sqliteTable(
  "workoutTemplates",
  {
    id: text("id").primaryKey(),
    ownerId: owner(),
    dayId: text("dayId").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    createdAt: text("createdAt").notNull(),
  },
  (t) => [index("templates_owner_day").on(t.ownerId, t.dayId)],
);
export const templateExercises = sqliteTable(
  "templateExercises",
  {
    id: text("id").primaryKey(),
    templateId: text("templateId")
      .notNull()
      .references(() => workoutTemplates.id),
    exerciseId: text("exerciseId")
      .notNull()
      .references(() => exercises.id),
    position: integer("position").notNull(),
    sets: integer("sets").notNull(),
    repMin: integer("repMin").notNull(),
    repMax: integer("repMax").notNull(),
    rir: text("rir").notNull(),
    optional: integer("optional").notNull(),
    notes: text("notes").notNull(),
    priority: text("priority").notNull(),
  },
  (t) => [index("template_exercises_template").on(t.templateId)],
);
export const routines = sqliteTable("routines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const userSettings = sqliteTable("userSettings", {
  ownerId: text("ownerId").primaryKey(),
  trainingDays: integer("trainingDays").notNull().default(3),
});
export const externalActivities = sqliteTable(
  "externalActivities",
  {
    id: text("id").primaryKey(),
    ownerId: owner(),
    sport: text("sport").notNull(),
    date: text("date").notNull(),
    durationMinutes: integer("durationMinutes").notNull(),
    distanceKm: real("distanceKm"),
    laps: integer("laps"),
    elevationGainM: integer("elevationGainM"),
    intensity: text("intensity").notNull(),
    notes: text("notes").notNull(),
    createdAt: text("createdAt").notNull(),
  },
  (table) => [
    index("external_activities_owner_date").on(table.ownerId, table.date),
  ],
);
export const days = sqliteTable("days", {
  id: text("id").primaryKey(),
  routineId: text("routineId")
    .notNull()
    .references(() => routines.id),
  title: text("title").notNull(),
  position: integer("position").notNull(),
});
export const routineExercises = sqliteTable("routineExercises", {
  id: text("id").primaryKey(),
  dayId: text("dayId")
    .notNull()
    .references(() => days.id),
  exerciseId: text("exerciseId")
    .notNull()
    .references(() => exercises.id),
  position: integer("position").notNull(),
  sets: integer("sets").notNull(),
  repMin: integer("repMin").notNull(),
  repMax: integer("repMax").notNull(),
  rir: text("rir").notNull(),
  optional: integer("optional").notNull(),
  notes: text("notes").notNull(),
  priority: text("priority").notNull(),
});
export const workouts = sqliteTable(
  "workouts",
  {
    id: text("id").primaryKey(),
    ownerId: owner(),
    dayId: text("dayId")
      .notNull()
      .references(() => days.id),
    status: text("status").notNull(),
    startedAt: text("startedAt").notNull(),
    finishedAt: text("finishedAt"),
    bodyweight: real("bodyweight"),
    notes: text("notes").notNull(),
    templateName: text("templateName").notNull().default(""),
  },
  (t) => [
    uniqueIndex("one_active_per_owner")
      .on(t.ownerId)
      .where(sql`${t.status} = 'active'`),
    index("workouts_owner_date").on(t.ownerId, t.startedAt),
  ],
);
export const workoutExercises = sqliteTable(
  "workoutExercises",
  {
    id: text("id").primaryKey(),
    workoutId: text("workoutId")
      .notNull()
      .references(() => workouts.id),
    dayId: text("dayId").notNull(),
    exerciseId: text("exerciseId")
      .notNull()
      .references(() => exercises.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    sets: integer("sets").notNull(),
    repMin: integer("repMin").notNull(),
    repMax: integer("repMax").notNull(),
    rir: text("rir").notNull(),
    optional: integer("optional").notNull(),
    notes: text("notes").notNull(),
    priority: text("priority").notNull(),
    metricType: text("metricType").notNull(),
    bodyweightExercise: integer("bodyweightExercise").notNull(),
    supportsAssistance: integer("supportsAssistance").notNull(),
    supportsAddedWeight: integer("supportsAddedWeight").notNull(),
    variant: text("variant").notNull(),
  },
  (t) => [index("we_workout").on(t.workoutId)],
);
export const workoutSets = sqliteTable(
  "workoutSets",
  {
    id: text("id").primaryKey(),
    workoutId: text("workoutId")
      .notNull()
      .references(() => workouts.id),
    workoutExerciseId: text("workoutExerciseId")
      .notNull()
      .references(() => workoutExercises.id),
    exerciseId: text("exerciseId")
      .notNull()
      .references(() => exercises.id),
    setNumber: integer("setNumber").notNull(),
    reps: integer("reps"),
    weight: real("weight"),
    bodyweight: real("bodyweight"),
    assistanceWeight: real("assistanceWeight"),
    addedWeight: real("addedWeight"),
    RIR: integer("RIR"),
    RPE: real("RPE"),
    durationSeconds: real("durationSeconds"),
    distance: real("distance"),
    notes: text("notes").notNull(),
    completed: integer("completed").notNull(),
    timestamp: text("timestamp").notNull(),
  },
  (t) => [
    uniqueIndex("unique_set").on(t.workoutExerciseId, t.setNumber),
    index("sets_workout").on(t.workoutId),
  ],
);
export const bodyWeights = sqliteTable(
  "bodyWeights",
  {
    id: text("id").primaryKey(),
    ownerId: owner(),
    date: text("date").notNull(),
    weightKg: real("weightKg").notNull(),
  },
  (t) => [index("weight_owner_date").on(t.ownerId, t.date)],
);
export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  ownerId: owner(),
  name: text("name").notNull(),
  exerciseId: text("exerciseId").notNull(),
  metric: text("metric").notNull(),
  target: real("target").notNull(),
});
export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const skillProgressions = sqliteTable("skillProgressions", {
  id: text("id").primaryKey(),
  skillId: text("skillId")
    .notNull()
    .references(() => skills.id),
  name: text("name").notNull(),
  level: integer("level").notNull(),
});
export const skillLogs = sqliteTable("skillLogs", {
  id: text("id").primaryKey(),
  ownerId: owner(),
  progressionId: text("progressionId")
    .notNull()
    .references(() => skillProgressions.id),
  date: text("date").notNull(),
  reps: integer("reps"),
  durationSeconds: real("durationSeconds"),
  notes: text("notes").notNull(),
});
export const personalRecords = sqliteTable("personalRecords", {
  id: text("id").primaryKey(),
  ownerId: owner(),
  exerciseId: text("exerciseId")
    .notNull()
    .references(() => exercises.id),
  setId: text("setId").references(() => workoutSets.id),
  metric: text("metric").notNull(),
  value: real("value").notNull(),
  achievedAt: text("achievedAt").notNull(),
});
