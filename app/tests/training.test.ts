import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { D1TrainingRepository } from "../repositories/d1TrainingRepository";
import {
  getNextRoutineDay,
  evaluatePullupProgression,
  evaluateDoubleProgression,
  evaluateDipProgression,
  detectPersonalRecord,
  historicalExercise,
  stats,
} from "../services/training";
import { commandSchema } from "../services/validation";
import { csv } from "../services/export";
import type { WorkoutSet } from "../domain/types";
function sets(reps: number[], rir = 1): WorkoutSet[] {
  return reps.map((r, i) => ({
    id: String(i),
    workoutId: "w",
    workoutExerciseId: "e",
    exerciseId: "pullup",
    setNumber: i + 1,
    reps: r,
    weight: null,
    bodyweight: null,
    assistanceWeight: null,
    addedWeight: null,
    RIR: rir,
    RPE: null,
    durationSeconds: null,
    distance: null,
    notes: "",
    completed: 1,
    timestamp: new Date().toISOString(),
  }));
}
test("secuencia A → B → C → A y primera sesión A", () => {
  assert.equal(getNextRoutineDay(), "A");
  assert.equal(getNextRoutineDay("A"), "B");
  assert.equal(getNextRoutineDay("B"), "C");
  assert.equal(getNextRoutineDay("C"), "A");
  assert.equal(getNextRoutineDay("C", ["A", "B", "C", "D"]), "D");
  assert.equal(getNextRoutineDay("D", ["A", "B", "C", "D"]), "A");
});
test("dominadas estrictas 4×3, luego 4×4; no basta un parcial", () => {
  assert.match(
    evaluatePullupProgression(sets([3, 3, 3, 3]))!,
    /4 repeticiones/,
  );
  assert.equal(evaluatePullupProgression(sets([3, 3, 3, 2])), null);
  assert.equal(evaluatePullupProgression(sets([3, 3, 3])), null);
  assert.match(
    evaluatePullupProgression(sets([4, 4, 4, 4]), 4)!,
    /5 repeticiones/,
  );
  const assisted = sets([3, 3, 3, 3]);
  assisted[0].assistanceWeight = 1;
  assert.equal(evaluatePullupProgression(assisted), null);
});
test("doble progresión exige todas las series, 3×10 y 3×12", () => {
  assert.ok(
    evaluateDoubleProgression(sets([10, 10, 10]), { sets: 3, repMax: 10 }),
  );
  assert.ok(
    evaluateDoubleProgression(sets([12, 12, 12]), { sets: 3, repMax: 12 }),
  );
  assert.ok(
    !evaluateDoubleProgression(sets([12, 12, 11]), { sets: 3, repMax: 12 }),
  );
  assert.ok(
    !evaluateDoubleProgression(sets([12, 12]), { sets: 3, repMax: 12 }),
  );
});
test("fondos considera RIR 1–2 y no recomienda lastre al fallo", () => {
  assert.ok(evaluateDipProgression(sets([10, 10, 10], 2)));
  assert.equal(evaluateDipProgression(sets([10, 10, 10], 0)), null);
});
test("récord supera marca, empate no es récord", () => {
  assert.ok(detectPersonalRecord([3, 4], 5));
  assert.ok(!detectPersonalRecord([3, 4], 4));
  assert.ok(!detectPersonalRecord([], 0));
});
test("convención histórica de 1 kg exclusivamente en conversión histórica", () => {
  assert.deepEqual(historicalExercise("Dominadas asistidas", 1), {
    exerciseId: "pullup-close",
    assistanceWeight: 0,
  });
  assert.deepEqual(historicalExercise("Dominadas asistidas", 14), {
    exerciseId: "pullup-assisted",
    assistanceWeight: 14,
  });
  assert.equal(historicalExercise("Dominadas pronas", 1).exerciseId, null);
});
test("RIR vacío no se confunde con fallo y CSV neutraliza fórmulas", () => {
  const s = sets([3, 3]);
  s[0].RIR = null;
  s[1].RIR = 0;
  assert.equal(stats(s).failure, 50);
  assert.equal(stats(s).unknownRIR, 1);
  assert.match(csv([{ notes: '=HYPERLINK("x")' }]), /'=HYPERLINK/);
});
test("validación rechaza cargas negativas y asistencia con lastre", () => {
  const s = { ...sets([3])[0], workoutExerciseId: "e" };
  assert.ok(
    !commandSchema.safeParse({ action: "saveSet", set: { ...s, weight: -1 } })
      .success,
  );
  assert.ok(
    !commandSchema.safeParse({
      action: "saveSet",
      set: { ...s, addedWeight: 5, assistanceWeight: 1 },
    }).success,
  );
});

// Real SQLite execution of the same prepared SQL used by D1; batch rolls back atomically.
function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync(`drizzle/${file}`, "utf8"));
  class Statement {
    values: unknown[] = [];
    constructor(readonly text: string) {}
    bind(...values: unknown[]) {
      this.values = values;
      return this;
    }
    all() {
      return Promise.resolve({
        results: sql.prepare(this.text).all(...(this.values as never[])),
        success: true,
      });
    }
    first() {
      return Promise.resolve(
        sql.prepare(this.text).get(...(this.values as never[])) ?? null,
      );
    }
    run() {
      return Promise.resolve({
        meta: sql.prepare(this.text).run(...(this.values as never[])),
        success: true,
      });
    }
    execute() {
      const stmt = sql.prepare(this.text);
      return stmt.columns().length
        ? { results: stmt.all(...(this.values as never[])), success: true }
        : {
            results: [],
            meta: stmt.run(...(this.values as never[])),
            success: true,
          };
    }
  }
  const db = {
    prepare: (s: string) => new Statement(s),
    batch: async (statements: Statement[]) => {
      sql.exec("BEGIN");
      try {
        const result = statements.map((s) => s.execute());
        sql.exec("COMMIT");
        return result;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  return { db, sql };
}
test("persistencia: inicio idempotente, series sin duplicar, snapshot, cierre y aislamiento", async () => {
  const { db, sql } = database(),
    repo = new D1TrainingRepository(db, "alice:real");
  let d = await repo.snapshot();
  assert.equal(d.routine.length, 19);
  assert.equal(d.goals.length, 4);
  assert.equal(d.workouts.length, 0);
  await repo.execute({
    action: "bodyWeight",
    date: "2026-01-01",
    weightKg: 73.5,
  });
  const planA = d.templateExercises
    .filter(
      (e) => e.templateId === d.templates.find((t) => t.dayId === "A")!.id,
    )
    .map(
      ({
        exerciseId,
        sets,
        repMin,
        repMax,
        rir,
        optional,
        notes,
        priority,
      }) => ({
        exerciseId,
        sets,
        repMin,
        repMax,
        rir,
        optional,
        notes,
        priority,
      }),
    );
  await repo.execute({
    action: "start",
    dayId: "A",
    templateName: "Base A",
    exercises: planA,
  });
  await repo.execute({
    action: "start",
    dayId: "B",
    templateName: "Ignorada",
    exercises: planA,
  });
  d = await repo.snapshot();
  assert.equal(d.workouts.length, 1);
  assert.equal(d.workouts[0].bodyweight, 73.5);
  const w = d.workouts[0],
    e = d.workoutExercises[0];
  await assert.rejects(
    () => repo.execute({ action: "finish", workoutId: w.id, notes: "" }),
    /al menos/,
  );
  const value = {
    workoutExerciseId: e.id,
    setNumber: 1,
    reps: 3,
    weight: null,
    addedWeight: 0,
    assistanceWeight: null,
    RIR: 1,
    durationSeconds: null,
    notes: "",
  };
  await repo.execute({ action: "saveSet", set: value });
  await repo.execute({ action: "saveSet", set: { ...value, reps: 2 } });
  const reloaded = new D1TrainingRepository(db, "alice:real");
  d = await reloaded.snapshot();
  assert.equal(d.sets.length, 1);
  assert.equal(d.sets[0].reps, 2);
  assert.equal(d.sets[0].bodyweight, 73.5);
  assert.equal(d.workouts[0].status, "active");
  const other = new D1TrainingRepository(db, "bob:real");
  assert.equal((await other.snapshot()).workouts.length, 0);
  await assert.rejects(
    () => other.execute({ action: "saveSet", set: value }),
    /no encontrado/,
  );
  await reloaded.execute({
    action: "finish",
    workoutId: w.id,
    notes: "Completado parcial",
  });
  await reloaded.execute({ action: "finish", workoutId: w.id, notes: "retry" });
  d = await repo.snapshot();
  assert.equal(d.workouts[0].status, "completed");
  assert.equal(d.workouts[0].notes, "Completado parcial");
  assert.equal(getNextRoutineDay(d.workouts[0].dayId), "B");
  await assert.rejects(
    () => repo.execute({ action: "saveSet", set: value }),
    /ya no está activa/,
  );
  d = await repo.snapshot();
  const planC = d.templateExercises
    .filter(
      (e) => e.templateId === d.templates.find((t) => t.dayId === "C")!.id,
    )
    .map(
      ({
        exerciseId,
        sets,
        repMin,
        repMax,
        rir,
        optional,
        notes,
        priority,
      }) => ({
        exerciseId,
        sets,
        repMin,
        repMax,
        rir,
        optional,
        notes,
        priority,
      }),
    );
  await repo.execute({
    action: "start",
    dayId: "C",
    templateName: "Base C",
    exercises: planC,
  });
  d = await repo.snapshot();
  const c = d.workouts.find((w) => w.status === "active")!,
    assisted = d.workoutExercises.find(
      (e) => e.workoutId === c.id && e.exerciseId === "pullup-assisted",
    )!;
  await repo.execute({
    action: "saveSet",
    set: {
      ...value,
      workoutExerciseId: assisted.id,
      addedWeight: null,
      assistanceWeight: 1,
    },
  });
  d = await repo.snapshot();
  assert.equal(
    d.sets.find((s) => s.workoutId === c.id)?.exerciseId,
    "pullup-assisted",
  );
  assert.equal(d.sets.find((s) => s.workoutId === c.id)?.assistanceWeight, 1);
  await repo.execute({ action: "cancel", workoutId: c.id });
  assert.equal(
    (await repo.snapshot()).workouts.filter((w) => w.status === "completed")
      .length,
    1,
  );
  await assert.rejects(() => repo.execute({ action: "resetDemo" }), /Solo/);
  sql.close();
});
test("demo reiniciable y aislada del espacio real", async () => {
  const { db, sql } = database(),
    demo = new D1TrainingRepository(db, "alice:demo", true);
  await demo.execute({ action: "resetDemo" });
  let d = await demo.snapshot();
  assert.equal(d.workouts.length, 3);
  assert.equal(d.sets.length, 58);
  await demo.execute({ action: "resetDemo" });
  d = await demo.snapshot();
  assert.equal(d.workouts.length, 3);
  assert.equal(
    (await new D1TrainingRepository(db, "alice:real").snapshot()).workouts
      .length,
    0,
  );
  sql.close();
});
test("plantillas, ejercicios propios y edición de sesión quedan persistidos", async () => {
  const { db, sql } = database(),
    repo = new D1TrainingRepository(db, "templates:real");
  let d = await repo.snapshot();
  await repo.execute({
    action: "addExercise",
    exercise: {
      id: "custom-press",
      name: "Press personalizado",
      shortName: "Press",
      type: "gym",
      movementPattern: "vertical_push",
      primaryMuscles: "Hombro",
      secondaryMuscles: "Tríceps",
      equipment: "Mancuernas",
      metricType: "reps",
      bodyweightExercise: 0,
      supportsAssistance: 0,
      supportsAddedWeight: 0,
      defaultRepMin: 6,
      defaultRepMax: 10,
      defaultRIR: "2",
      notes: "",
      enabled: 1,
    },
  });
  const plan = [
    {
      exerciseId: "custom-press",
      sets: 4,
      repMin: 6,
      repMax: 10,
      rir: "2",
      optional: 0,
      notes: "Alternativa",
      priority: "Principal",
    },
  ];
  await repo.execute({
    action: "saveTemplate",
    dayId: "A",
    name: "A · Hombro",
    description: "Variante",
    exercises: plan,
  });
  d = await repo.snapshot();
  assert.ok(d.exercises.some((e) => e.id === "custom-press"));
  assert.ok(d.templates.some((t) => t.name === "A · Hombro"));
  await repo.execute({
    action: "start",
    dayId: "A",
    templateName: "A · Hombro",
    exercises: plan,
  });
  d = await repo.snapshot();
  const w = d.workouts[0],
    we = d.workoutExercises[0];
  assert.equal(w.templateName, "A · Hombro");
  assert.equal(we.sets, 4);
  await repo.execute({
    action: "updateWorkoutExercise",
    workoutExerciseId: we.id,
    exercise: { ...plan[0], sets: 5, repMax: 12 },
  });
  await repo.execute({
    action: "addWorkoutExercise",
    workoutId: w.id,
    exercise: { ...plan[0], sets: 2 },
  });
  d = await repo.snapshot();
  assert.equal(
    d.workoutExercises.filter((e) => e.workoutId === w.id).length,
    2,
  );
  assert.equal(d.workoutExercises.find((e) => e.id === we.id)?.repMax, 12);
  await repo.execute({
    action: "removeWorkoutExercise",
    workoutExerciseId: d.workoutExercises.find(
      (e) => e.workoutId === w.id && e.id !== we.id,
    )!.id,
  });
  assert.equal(
    (await repo.snapshot()).workoutExercises.filter((e) => e.workoutId === w.id)
      .length,
    1,
  );
  sql.close();
});
test("los días configurables y el borrado de plantillas son persistentes", async () => {
  const { db, sql } = database(),
    repo = new D1TrainingRepository(db, "days:real");
  let data = await repo.snapshot();
  assert.equal(data.settings.trainingDays, 3);
  assert.deepEqual(
    data.days.map((day) => day.id),
    ["A", "B", "C"],
  );
  await assert.rejects(
    () =>
      repo.execute({
        action: "start",
        dayId: "D",
        templateName: "No disponible",
        exercises: [
          {
            exerciseId: "pushup",
            sets: 3,
            repMin: 8,
            repMax: 12,
            rir: "2",
            optional: 0,
            notes: "",
            priority: "Principal",
          },
        ],
      }),
    /no está activo/,
  );
  await repo.execute({ action: "setTrainingDays", trainingDays: 4 });
  data = await repo.snapshot();
  assert.equal(data.settings.trainingDays, 4);
  assert.deepEqual(
    data.days.map((day) => day.id),
    ["A", "B", "C", "D"],
  );
  await repo.execute({
    action: "saveTemplate",
    dayId: "D",
    name: "D · Personal",
    description: "Cuarto día",
    exercises: [
      {
        exerciseId: "pushup",
        sets: 3,
        repMin: 8,
        repMax: 12,
        rir: "2",
        optional: 0,
        notes: "",
        priority: "Principal",
      },
    ],
  });
  data = await repo.snapshot();
  const template = data.templates.find((row) => row.name === "D · Personal")!;
  assert.ok(template);
  await repo.execute({ action: "setTrainingDays", trainingDays: 3 });
  data = await repo.snapshot();
  assert.equal(data.days.length, 3);
  assert.ok(data.templates.some((row) => row.id === template.id));
  await repo.execute({ action: "deleteTemplate", templateId: template.id });
  assert.ok(
    !(await repo.snapshot()).templates.some((row) => row.id === template.id),
  );
  sql.close();
});
test("los deportes externos validan sus métricas, se aíslan y se pueden borrar", async () => {
  const { db, sql } = database(),
    repo = new D1TrainingRepository(db, "sports:real"),
    other = new D1TrainingRepository(db, "other:real");
  await assert.rejects(
    () =>
      repo.execute({
        action: "addExternalActivity",
        activity: {
          sport: "swimming",
          date: "2026-09-30",
          durationMinutes: 40,
          distanceKm: null,
          laps: null,
          elevationGainM: null,
          intensity: "moderate",
          notes: "",
        },
      }),
    /número de largos/,
  );
  await repo.execute({
    action: "addExternalActivity",
    activity: {
      sport: "running",
      date: "2026-09-30",
      durationMinutes: 32,
      distanceKm: 5.25,
      laps: null,
      elevationGainM: null,
      intensity: "hard",
      notes: "Parque",
    },
  });
  let data = await repo.snapshot();
  assert.equal(data.externalActivities.length, 1);
  assert.equal(data.externalActivities[0].distanceKm, 5.25);
  assert.equal(data.externalActivities[0].notes, "Parque");
  assert.equal((await other.snapshot()).externalActivities.length, 0);
  await assert.rejects(
    () =>
      other.execute({
        action: "deleteExternalActivity",
        activityId: data.externalActivities[0].id,
      }),
    /no encontrada/,
  );
  await repo.execute({
    action: "deleteExternalActivity",
    activityId: data.externalActivities[0].id,
  });
  data = await repo.snapshot();
  assert.equal(data.externalActivities.length, 0);
  sql.close();
});
