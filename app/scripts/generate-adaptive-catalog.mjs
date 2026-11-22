import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const catalogPath = fileURLToPath(new URL("../catalog/adaptive-v2.json", import.meta.url));
const migrationPath = fileURLToPath(new URL("../drizzle/0009_adaptive_1_1.sql", import.meta.url));
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

if (catalog.snapshotType !== "authoritative_full_snapshot" || catalog.exercises?.length !== 104)
  throw new Error("El catálogo no es el snapshot autoritativo de 104 ejercicios.");
const ids = new Set(catalog.exercises.map((exercise) => exercise.id));
if (ids.size !== catalog.exercises.length) throw new Error("El catálogo contiene IDs duplicados.");

const q = (value) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const n = (value) => Number(value) || 0;
const metadata = (exercise) => JSON.stringify({
  stimulus: exercise.stimulus,
  muscleTargets: exercise.muscleTargets,
  exerciseFamily: exercise.exerciseFamily,
  preference: exercise.preference,
  fatigueCost: exercise.fatigueCost,
  planningStatus: exercise.planningStatus,
  autoSelectable: exercise.autoSelectable,
  referenceExercise: exercise.referenceExercise,
  loadConvention: exercise.loadConvention,
  defaultRestSeconds: exercise.defaultRestSeconds,
  prescriptionUnit: exercise.prescriptionUnit,
  unilateralPerSide: exercise.unilateralPerSide,
  autoSuggestRequiresEquipmentMatch: exercise.autoSuggestRequiresEquipmentMatch,
  selectionNotes: exercise.selectionNotes ?? "",
});

const lines = [
  "-- Generated from catalog/adaptive-v2.json. Do not edit by hand.",
  "CREATE TABLE IF NOT EXISTS exerciseAdaptiveMetadata (",
  "  exerciseId text PRIMARY KEY NOT NULL REFERENCES exercises(id),",
  "  catalogVersion text NOT NULL,",
  "  metadataJson text NOT NULL,",
  "  updatedAt text NOT NULL",
  ");",
  "CREATE TABLE IF NOT EXISTS exerciseAliases (",
  "  aliasId text PRIMARY KEY NOT NULL,",
  "  canonicalExerciseId text NOT NULL REFERENCES exercises(id),",
  "  policy text NOT NULL",
  ");",
  "UPDATE exercises SET enabled=0;",
];

for (const exercise of catalog.exercises) {
  const enabled = exercise.planningStatus === "legacy_only" ? 0 : n(exercise.enabled);
  const values = [
    q(exercise.id), q(exercise.name), q(exercise.shortName), q(exercise.type),
    q(exercise.movementPattern), q(exercise.primaryMuscles), q(exercise.secondaryMuscles),
    q(exercise.equipment), q(exercise.metricType), n(exercise.bodyweightExercise),
    n(exercise.supportsAssistance), n(exercise.supportsAddedWeight), n(exercise.defaultRepMin),
    n(exercise.defaultRepMax), q(exercise.defaultRIR), q(exercise.notes ?? ""), enabled, q(exercise.ownerId),
  ];
  lines.push(
    `INSERT INTO exercises (id,name,shortName,type,movementPattern,primaryMuscles,secondaryMuscles,equipment,metricType,bodyweightExercise,supportsAssistance,supportsAddedWeight,defaultRepMin,defaultRepMax,defaultRIR,notes,enabled,ownerId) VALUES (${values.join(",")}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,shortName=excluded.shortName,type=excluded.type,movementPattern=excluded.movementPattern,primaryMuscles=excluded.primaryMuscles,secondaryMuscles=excluded.secondaryMuscles,equipment=excluded.equipment,metricType=excluded.metricType,bodyweightExercise=excluded.bodyweightExercise,supportsAssistance=excluded.supportsAssistance,supportsAddedWeight=excluded.supportsAddedWeight,defaultRepMin=excluded.defaultRepMin,defaultRepMax=excluded.defaultRepMax,defaultRIR=excluded.defaultRIR,notes=excluded.notes,enabled=excluded.enabled;`,
    `INSERT INTO exerciseAdaptiveMetadata (exerciseId,catalogVersion,metadataJson,updatedAt) VALUES (${q(exercise.id)},${q(catalog.catalogVersion)},${q(metadata(exercise))},${q(catalog.createdAt)}) ON CONFLICT(exerciseId) DO UPDATE SET catalogVersion=excluded.catalogVersion,metadataJson=excluded.metadataJson,updatedAt=excluded.updatedAt;`,
  );
}
for (const alias of catalog.legacyAliases ?? [])
  lines.push(`INSERT INTO exerciseAliases (aliasId,canonicalExerciseId,policy) VALUES (${q(alias.id)},${q(alias.canonicalExerciseId)},${q(alias.policy)}) ON CONFLICT(aliasId) DO UPDATE SET canonicalExerciseId=excluded.canonicalExerciseId,policy=excluded.policy;`);

writeFileSync(migrationPath, `${lines.join("\n")}\n`);
console.log(`Generated ${migrationPath} from ${catalogPath} (${catalog.exercises.length} exercises).`);
