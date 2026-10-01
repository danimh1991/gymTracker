import type { SportKey } from "./sports";
export type DayKey = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type Metric = "reps" | "time";
export type ActivityIntensity = "easy" | "moderate" | "hard";
export interface Exercise {
  id: string;
  name: string;
  shortName: string;
  type: string;
  movementPattern: string;
  primaryMuscles: string;
  secondaryMuscles: string;
  equipment: string;
  metricType: Metric;
  bodyweightExercise: number;
  supportsAssistance: number;
  supportsAddedWeight: number;
  defaultRepMin: number;
  defaultRepMax: number;
  defaultRIR: string;
  notes: string;
  enabled: number;
  ownerId?: string | null;
}
export interface Template {
  id: string;
  dayId: DayKey;
  name: string;
  description: string;
  createdAt: string;
}
export interface TemplateExercise extends RoutineExercise {
  templateId: string;
}
export interface PlanExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  rir: string;
  optional: number;
  notes: string;
  priority: string;
}
export interface RoutineDay {
  id: DayKey;
  title: string;
  position: number;
}
export interface RoutineExercise {
  id: string;
  dayId: DayKey;
  exerciseId: string;
  position: number;
  sets: number;
  repMin: number;
  repMax: number;
  rir: string;
  optional: number;
  notes: string;
  priority: string;
}
export interface Workout {
  id: string;
  dayId: DayKey;
  status: "active" | "completed" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  bodyweight: number | null;
  notes: string;
  templateName: string;
}
export interface WorkoutExercise extends RoutineExercise {
  workoutId: string;
  name: string;
  metricType: Metric;
  bodyweightExercise: number;
  supportsAssistance: number;
  supportsAddedWeight: number;
  variant: string;
}
export interface WorkoutSet {
  id: string;
  workoutId: string;
  workoutExerciseId: string;
  exerciseId: string;
  setNumber: number;
  reps: number | null;
  weight: number | null;
  bodyweight: number | null;
  assistanceWeight: number | null;
  addedWeight: number | null;
  RIR: number | null;
  RPE: number | null;
  durationSeconds: number | null;
  distance: number | null;
  notes: string;
  completed: number;
  timestamp: string;
}
export interface BodyWeight {
  id: string;
  date: string;
  weightKg: number;
}
export interface Goal {
  id: string;
  name: string;
  exerciseId: string;
  metric: string;
  target: number;
}
export interface ExternalActivity {
  id: string;
  sport: SportKey;
  date: string;
  durationMinutes: number;
  distanceKm: number | null;
  laps: number | null;
  elevationGainM: number | null;
  intensity: ActivityIntensity;
  notes: string;
  createdAt: string;
}
export interface Snapshot {
  settings: {
    trainingDays: number;
  };
  routines: { id: string; name: string }[];
  skills: { id: string; name: string }[];
  skillProgressions: {
    id: string;
    skillId: string;
    name: string;
    level: number;
  }[];
  skillLogs: {
    id: string;
    progressionId: string;
    date: string;
    reps: number | null;
    durationSeconds: number | null;
    notes: string;
  }[];
  personalRecords: {
    id: string;
    exerciseId: string;
    setId: string | null;
    metric: string;
    value: number;
    achievedAt: string;
  }[];
  exercises: Exercise[];
  days: RoutineDay[];
  routine: RoutineExercise[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  sets: WorkoutSet[];
  bodyWeights: BodyWeight[];
  goals: Goal[];
  templates: Template[];
  templateExercises: TemplateExercise[];
  externalActivities: ExternalActivity[];
}
