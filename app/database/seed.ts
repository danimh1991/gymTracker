import type {
  Exercise,
  RoutineDay,
  RoutineExercise,
  DayKey,
} from "../domain/types";
function exercise(
  id: string,
  name: string,
  pattern: string,
  bw = true,
  notes = "",
  metric: "reps" | "time" = "reps",
  assisted = false,
): Exercise {
  return {
    id,
    name,
    shortName: name,
    type: bw ? "calisthenics" : "gym",
    movementPattern: pattern,
    primaryMuscles:
      id === "curl"
        ? "Bíceps"
        : pattern === "hinge"
          ? "Isquios / glúteos"
          : pattern === "skill"
            ? "Deltoides / tríceps / core"
            : pattern.includes("pull")
              ? "Dorsal / bíceps"
              : pattern.includes("push")
                ? "Pecho / tríceps / deltoides"
                : pattern.includes("core")
                  ? "Core"
                  : "Pierna / glúteos",
    secondaryMuscles: "",
    equipment: bw ? "Peso corporal" : "Gimnasio",
    metricType: metric,
    bodyweightExercise: +bw,
    supportsAssistance: +assisted,
    supportsAddedWeight: +(bw && !assisted && metric === "reps"),
    defaultRepMin: 8,
    defaultRepMax: 12,
    defaultRIR: "1–2",
    notes,
    enabled: 1,
  };
}
export const initialExercises: Exercise[] = [
  exercise(
    "pullup",
    "Dominadas pronas",
    "vertical_pull",
    true,
    "Evitar impulso. Pasar la barbilla claramente por encima.",
  ),
  exercise("pullup-close", "Dominadas agarre cerrado", "vertical_pull"),
  exercise("chinup", "Dominadas supinas", "vertical_pull"),
  exercise(
    "pullup-assisted",
    "Dominadas asistidas pronas",
    "vertical_pull",
    true,
    "Asistencia real en kg. Priorizar volumen de calidad.",
    "reps",
    true,
  ),
  exercise(
    "pullup-assisted-close",
    "Dominadas asistidas agarre cerrado",
    "vertical_pull",
    true,
    "",
    "reps",
    true,
  ),
  exercise(
    "dip",
    "Fondos en paralelas",
    "vertical_push",
    true,
    "Descenso controlado. No perder posición escapular.",
  ),
  exercise("row", "Remo invertido", "horizontal_pull"),
  exercise("pushup", "Flexiones", "horizontal_push"),
  exercise(
    "bulgarian",
    "Sentadilla búlgara",
    "unilateral_leg",
    false,
    "Repeticiones por pierna.",
  ),
  exercise(
    "knee",
    "Elevaciones de rodillas colgado",
    "core_flexion",
    true,
    "Progresar hacia elevaciones de piernas y L-sit.",
  ),
  exercise("pike", "Pike push-up", "vertical_push"),
  exercise(
    "pulldown",
    "Jalón al pecho",
    "vertical_pull",
    false,
    "Accesorio para mejorar dominadas.",
  ),
  exercise("seated-row", "Remo sentado", "horizontal_pull", false),
  exercise(
    "rdl",
    "Peso muerto rumano",
    "hinge",
    false,
    "Mantener espalda neutra.",
  ),
  exercise(
    "hollow",
    "Hollow body hold",
    "core_anti_extension",
    true,
    "Mantener la zona lumbar en contacto con el suelo.",
    "time",
  ),
  exercise("pushup-hard", "Flexiones difíciles", "horizontal_push"),
  exercise(
    "handstand",
    "Handstand / pike técnico",
    "skill",
    true,
    "Priorizar control y técnica.",
    "time",
  ),
  exercise(
    "lunge",
    "Zancadas / progresión de pistol squat",
    "unilateral_leg",
    true,
    "Repeticiones por pierna.",
  ),
  exercise(
    "leg",
    "Elevaciones de piernas colgado",
    "core_flexion",
    true,
    "Objetivo futuro: L-sit.",
  ),
  exercise("curl", "Curl de bíceps", "horizontal_pull", false),
  exercise("lsit", "L-sit", "core_anti_extension", true, "", "time"),
];
export const initialDays: RoutineDay[] = [
  { id: "A", title: "Dominada + fondos", position: 0 },
  { id: "B", title: "Empuje vertical + espalda", position: 1 },
  { id: "C", title: "Dominadas volumen + habilidad", position: 2 },
  { id: "D", title: "Entrenamiento D", position: 3 },
  { id: "E", title: "Entrenamiento E", position: 4 },
  { id: "F", title: "Entrenamiento F", position: 5 },
  { id: "G", title: "Entrenamiento G", position: 6 },
];
type Item = [string, number, number, number, string?, boolean?];
const prescriptions: Partial<Record<DayKey, Item[]>> = {
  A: [
    ["pullup", 4, 2, 3],
    ["dip", 3, 5, 10],
    ["row", 3, 8, 12],
    ["pushup", 3, 8, 15],
    ["bulgarian", 3, 8, 12, "2"],
    ["knee", 3, 8, 15],
  ],
  B: [
    ["pike", 4, 5, 10],
    ["pulldown", 3, 8, 12],
    ["dip", 3, 6, 10],
    ["seated-row", 3, 8, 12],
    ["rdl", 3, 8, 10, "2"],
    ["hollow", 3, 20, 40],
  ],
  C: [
    ["pullup-assisted", 3, 6, 10],
    ["pushup-hard", 3, 6, 12],
    ["row", 3, 8, 15],
    ["handstand", 3, 5, 10, "Técnica"],
    ["lunge", 3, 8, 12, "2"],
    ["leg", 3, 6, 12],
    ["curl", 2, 8, 12, "1–2", true],
  ],
};
export const initialRoutine: RoutineExercise[] = initialDays.flatMap((d) =>
  (prescriptions[d.id] ?? []).map(
    (
      [exerciseId, sets, repMin, repMax, rir = "1–2", optional = false],
      position,
    ) => ({
      id: `${d.id}-${position}`,
      dayId: d.id,
      exerciseId,
      position,
      sets,
      repMin,
      repMax,
      rir,
      optional: +optional,
      notes:
        exerciseId === "pike"
          ? "3–4 series; empezamos con 4."
          : exerciseId === "handstand"
            ? "3 series técnicas. Elige repeticiones para pike o segundos para handstand."
            : "",
      priority: position < 2 ? "Principal" : "Accesorio",
    }),
  ),
);
export const initialSkills = [
  "Dominada estricta",
  "Dominada explosiva",
  "Chest-to-bar",
  "Muscle-up",
  "Dip",
  "L-sit",
  "Handstand",
  "Handstand push-up",
  "Pistol squat",
  "Front lever",
  "Back lever",
];
export const initialGoals = [
  {
    id: "pullups",
    name: "Dominadas estrictas",
    exerciseId: "pullup",
    metric: "reps",
    target: 10,
  },
  {
    id: "dips",
    name: "Fondos estrictos",
    exerciseId: "dip",
    metric: "reps",
    target: 15,
  },
  {
    id: "lsit",
    name: "L-sit",
    exerciseId: "lsit",
    metric: "durationSeconds",
    target: 20,
  },
  {
    id: "handstand",
    name: "Handstand libre",
    exerciseId: "handstand",
    metric: "durationSeconds",
    target: 20,
  },
];
