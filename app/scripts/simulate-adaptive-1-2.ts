import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { D1TrainingRepository } from "../repositories/d1TrainingRepository";
import type { MuscleGroup } from "../domain/types";
import {
  applySessionObjective,
  buildAdaptiveContext,
  deterministicPlan,
  explainRemainingTime,
  resolveEquipmentForLocation,
  summarizePlanTime,
} from "../services/adaptive-planner";

const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort())
  sql.exec(readFileSync(`drizzle/${file}`, "utf8"));

class Statement {
  values: unknown[] = [];
  constructor(readonly text: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  all() { return Promise.resolve({ results: sql.prepare(this.text).all(...(this.values as never[])), success: true }); }
  first() { return Promise.resolve(sql.prepare(this.text).get(...(this.values as never[])) ?? null); }
  run() { return Promise.resolve({ meta: sql.prepare(this.text).run(...(this.values as never[])), success: true }); }
  execute() {
    const statement = sql.prepare(this.text);
    return statement.columns().length
      ? { results: statement.all(...(this.values as never[])), success: true }
      : { results: [], meta: statement.run(...(this.values as never[])), success: true };
  }
}
const db = {
  prepare: (text: string) => new Statement(text),
  batch: async (statements: Statement[]) => {
    sql.exec("BEGIN");
    try { const result = statements.map((statement) => statement.execute()); sql.exec("COMMIT"); return result; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  },
} as unknown as D1Database;

const data = await new D1TrainingRepository(db, "adaptive-1-2-simulation:real").snapshot();
const scenarios = [
  { name: "gimnasio_general", location: "gym", modality: "general", muscleFocus: "automatic", durationMinutes: 45 },
  { name: "parque_calistenia_traccion", location: "calisthenics_park", modality: "calisthenics", muscleFocus: "pull", durationMinutes: 45 },
  { name: "casa_resistencia_cuerpo_completo", location: "home", modality: "muscular_endurance", muscleFocus: "full_body", durationMinutes: 30 },
  { name: "hotel_funcional_core", location: "hotel", modality: "functional_mobility", muscleFocus: "core", durationMinutes: 30 },
  { name: "gimnasio_hipertrofia_espalda", location: "gym", modality: "hypertrophy", muscleFocus: "back", durationMinutes: 60 },
  { name: "gimnasio_fuerza_tren_superior", location: "gym", modality: "strength", muscleFocus: "upper_body", durationMinutes: 60 },
] as const;

const output: Array<Record<string, unknown>> = [];
for (const scenario of scenarios) {
  const equipment = resolveEquipmentForLocation(data.settings, scenario.location);
  const constraints = { ...scenario, energy: "normal" as const, blockedExerciseIds: [], equipment: equipment.available,
    unavailableEquipment: equipment.unavailable, equipmentProfile: equipment.equipmentProfile,
    equipmentProfileVersion: equipment.version };
  const context = applySessionObjective(buildAdaptiveContext(data, new Date("2026-11-23T10:00:00.000Z")), constraints);
  const plan = deterministicPlan(data, constraints, context);
  const timing = summarizePlanTime(data, constraints, plan);
  output.push({ scenario: scenario.name, durationMinutes: scenario.durationMinutes,
    estimatedMinutes: Math.round(timing.plannedMainSeconds / 6) / 10, remainingMinutes: Math.round(timing.remainingSeconds / 6) / 10,
    explanation: explainRemainingTime(data, plan, context, constraints),
    exercises: plan.map((row) => ({ name: data.exercises.find((exercise) => exercise.id === row.exerciseId)?.name,
      target: row.targetGroup, sets: row.sets, reps: [row.repMin, row.repMax], restSeconds: row.restSeconds })) });
}

const reportedScores: Partial<Record<MuscleGroup, number>> = {
  calves: 56.3, lateral_rear_delts: 10.8, forearms_grip: 6.6, vertical_push: 5.5,
};
const gym = resolveEquipmentForLocation(data.settings, "gym");
const reportedConstraints = { durationMinutes: 45 as const, energy: "normal" as const, blockedExerciseIds: [],
  equipment: gym.available, unavailableEquipment: gym.unavailable, equipmentProfile: gym.equipmentProfile,
  location: "gym" as const, modality: "general" as const, muscleFocus: "automatic" as const };
const reportedContext = buildAdaptiveContext(data, new Date("2026-11-23T10:00:00.000Z"));
reportedContext.needs = reportedContext.needs.map((need) => ({ ...need, score: reportedScores[need.group] ?? 0, recovery: 1 }));
const reportedPlan = deterministicPlan(data, reportedConstraints, applySessionObjective(reportedContext, reportedConstraints));
output.push({ scenario: "regresion_gemelos_56_3", calfExercises: reportedPlan.filter((row) => row.targetGroup === "calves").length,
  calfSets: reportedPlan.filter((row) => row.targetGroup === "calves").reduce((sum, row) => sum + row.sets, 0),
  exercises: reportedPlan.map((row) => ({ name: data.exercises.find((exercise) => exercise.id === row.exerciseId)?.name,
    target: row.targetGroup, sets: row.sets })) });

console.log(JSON.stringify(output, null, 2));
sql.close();
