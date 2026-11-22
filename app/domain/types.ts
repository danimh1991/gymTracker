import type { SportKey } from "./sports";
export type DayKey = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type Metric = "reps" | "time";
export type LoadDecision = "increase" | "maintain";
export type ActivityIntensity = "easy" | "moderate" | "hard";
export type SessionType = "legacy" | "template" | "adaptive" | "manual";
export type MuscleGroup =
  | "vertical_pull"
  | "horizontal_pull"
  | "chest"
  | "vertical_push"
  | "lateral_rear_delts"
  | "biceps"
  | "triceps"
  | "quads"
  | "posterior_chain"
  | "core"
  | "calves"
  | "forearms_grip";
export type PlanningStatus = "active" | "manual_only" | "legacy_only";
export interface ExerciseStimulus {
  group: MuscleGroup;
  weight: number;
  direct: boolean;
}
export interface TrainerSettings {
  trainingDays: number;
  adaptiveEnabled: number;
  defaultDurationMinutes: number;
  usualFrequency: number;
  variationLevel: number;
  priorities: Record<MuscleGroup, number>;
  exercisePreferences: Record<string, number>;
  availableEquipment: string[];
  equipmentConfigured: number;
}
export interface UserProfile {
  id: string;
  name: string;
  createdAt: string;
}
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
  stimulus: ExerciseStimulus[];
  muscleTargets: { primary: string[]; secondary: string[] };
  exerciseFamily: string;
  preference: number;
  fatigueCost: number;
  planningStatus: PlanningStatus;
  autoSelectable: boolean;
  referenceExercise: boolean;
  loadConvention: string;
  defaultRestSeconds: number;
  prescriptionUnit: "repetitions" | "seconds";
  unilateralPerSide: boolean;
  autoSuggestRequiresEquipmentMatch: boolean;
  selectionNotes?: string;
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
  order?: number;
  targetGroup?: MuscleGroup;
  restSeconds?: number;
  suggestedLoad?: {
    kind: "bodyweight" | "added_weight" | "assistance" | "external" | "calibration";
    valueKg: number | null;
    confidence: "low" | "medium" | "high";
  };
  reason?: string;
  alternatives?: string[];
  estimatedSeconds?: number;
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
  isFreeDay: number;
  sessionType: SessionType;
  proposalId: string | null;
}
export interface AdaptiveProposal {
  id: string;
  status: "proposed" | "accepted" | "superseded";
  createdAt: string;
  updatedAt: string;
  constraints: AdaptiveConstraints;
  context: AdaptiveContext;
  originalPlan: PlanExercise[];
  currentPlan: PlanExercise[];
  rationale: string[];
  rulesVersion: string;
  source: "llm" | "fallback";
  latencyMs: number | null;
  errorCode: string | null;
}
export interface AdaptiveConstraints {
  durationMinutes: 30 | 45 | 50 | 60 | 75;
  energy: "low" | "normal" | "high";
  blockedExerciseIds: string[];
  equipment: string[];
}
export interface AdaptiveNeed {
  group: MuscleGroup;
  score: number;
  priority: number;
  directSets10d: number;
  indirectSets10d: number;
  daysSinceExposure: number | null;
  recovery: number;
  targetSets10d: number;
  excessRatio: number;
  indirectStimulus10d: number;
  fatigue72h: number;
  exposureCount28d: number;
  components: {
    structural: number;
    deficit: number;
    overdue: number;
    readiness: number;
    excessPenalty: number;
    recentPenalty: number;
  };
}
export interface AdaptiveContext {
  generatedAt: string;
  recentWorkoutCount: number;
  completedSets10d: number;
  needs: AdaptiveNeed[];
  rulesVersion: string;
  catalogVersion: string;
  rulesHash?: string;
  equipmentState: "configured" | "unknown";
}
export interface WorkoutExercise extends RoutineExercise {
  workoutId: string;
  name: string;
  metricType: Metric;
  bodyweightExercise: number;
  supportsAssistance: number;
  supportsAddedWeight: number;
  variant: string;
  nextLoadAction: LoadDecision | null;
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
  users: UserProfile[];
  activeUserId: string;
  settings: TrainerSettings;
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
  adaptiveProposals: AdaptiveProposal[];
}
