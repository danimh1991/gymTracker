import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { D1TrainingRepository } from "../repositories/d1TrainingRepository";
import {
  completedRoutineWorkouts,
  completedWorkouts,
  getNextRoutineDay,
  evaluatePullupProgression,
  evaluateDoubleProgression,
  evaluateDipProgression,
  detectPersonalRecord,
  historicalExercise,
  previousLoadDecision,
  previousSets,
  stats,
  effectiveLoad,
  estimatedOneRepMax,
} from "../services/training";
import { commandSchema } from "../services/validation";
import { csv, workoutBackup } from "../services/export";
import type { WorkoutSet } from "../domain/types";
import {
  MAX_TRAINING_REQUEST_BYTES,
  readTrainingRequest,
  RequestTooLargeError,
} from "../services/request";
import { reconcileTemplateExercises } from "../services/template-import";
import { initialExercises } from "../database/seed";
import { LlmWorkerClient } from "../integrations/llm/client";
import {
  ADAPTIVE_RULES_VERSION,
  adaptiveTimeBudget,
  buildAdaptiveContext,
  buildEquipmentAudit,
  deterministicPlan,
  equipmentMatches,
  exerciseStimulus,
  repairUnderfilledPlan,
  summarizePlanTime,
  validateAdaptivePlan,
} from "../services/adaptive-planner";
import {
  knowledgeKey,
  LLM_MANIFEST_KEY,
} from "../integrations/llm/knowledge-store";
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
test("el cliente LLM distingue una integración no configurada", async () => {
  const status = await new LlmWorkerClient({}).status();
  assert.deepEqual(status, {
    configured: false,
    reachable: false,
    transport: "none",
  });
});
test("el cliente LLM comprueba el worker mediante el transporte inyectado", async () => {
  let received: Request | undefined;
  const client = new LlmWorkerClient({
    transportKind: "service-binding",
    transport: {
      async fetch(request) {
        received = request;
        return Response.json({ ok: true });
      },
    },
  });
  const status = await client.status();
  assert.equal(status.configured, true);
  assert.equal(status.reachable, true);
  assert.equal(status.transport, "service-binding");
  assert.equal(status.statusCode, 200);
  assert.equal(new URL(received!.url).pathname, "/health");
});
test("las claves R2 del LLM quedan aisladas bajo un prefijo versionado", () => {
  assert.equal(
    knowledgeKey("catalog/exercises.json"),
    "gym-tracker/v1/catalog/exercises.json",
  );
  assert.equal(LLM_MANIFEST_KEY, "gym-tracker/v1/manifest.json");
  assert.throws(() => knowledgeKey("../private.json"));
  assert.throws(() => knowledgeKey(""));
});
test("la fuerza estimada combina carga, repeticiones y RIR", () => {
  const set = {
    ...sets([8], 2)[0],
    bodyweight: 75,
    addedWeight: 10,
  };
  assert.equal(effectiveLoad(set), 85);
  assert.equal(estimatedOneRepMax(set), 85 * (1 + 10 / 30));
});
test("la carga efectiva descuenta asistencia y admite peso externo", () => {
  const assisted = {
    ...sets([6])[0],
    bodyweight: 75,
    assistanceWeight: 20,
  };
  const weighted = { ...sets([10])[0], weight: 40 };
  assert.equal(effectiveLoad(assisted), 55);
  assert.equal(effectiveLoad(weighted), 40);
});
test("las importaciones admiten cuerpos grandes con un límite de 10 MiB", async () => {
  assert.equal(MAX_TRAINING_REQUEST_BYTES, 10 * 1024 * 1024);
  const payload = { action: "importExercises", data: "x".repeat(27 * 1024) };
  assert.deepEqual(
    await readTrainingRequest(
      new Request("https://example.test/api/training", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    ),
    payload,
  );
});
test("el límite se aplica aunque falte content-length", async () => {
  await assert.rejects(
    () =>
      readTrainingRequest(
        new Request("https://example.test/api/training", {
          method: "POST",
          body: JSON.stringify({ data: "x".repeat(100) }),
        }),
        50,
      ),
    RequestTooLargeError,
  );
});
test("las plantillas reconcilian ejercicios importados por nombre", () => {
  const imported = {
    ...initialExercises[0],
    id: "plank",
    name: "Plancha",
    shortName: "Plancha",
  };
  const existing = {
    ...imported,
    id: "custom-plancha",
  };
  const template = {
    dayId: "A",
    name: "Core",
    description: "",
    exercises: [
      {
        exerciseId: "plank",
        sets: 3,
        repMin: 30,
        repMax: 60,
        rir: "2",
        optional: 0,
        notes: "",
        priority: "Principal",
      },
    ],
  };
  const result = reconcileTemplateExercises([template], [imported], [existing]);
  assert.deepEqual(result.missing, []);
  assert.equal(result.templates[0].exercises[0].exerciseId, "custom-plancha");
});

test("las plantillas informan todos los ejercicios que faltan", () => {
  const template = {
    exercises: [
      { exerciseId: "plank" },
      { exerciseId: "muscle-up" },
      { exerciseId: "plank" },
    ],
  } as never;
  const result = reconcileTemplateExercises([template], [], []);
  assert.deepEqual(result.missing, ["muscle-up", "plank"]);
});
test("las plantillas antiguas resuelven IDs equivalentes al nombre", () => {
  const existing = {
    ...initialExercises[0],
    id: "custom-plank",
    name: "Plank",
    shortName: "Plank",
  };
  const template = {
    exercises: [
      {
        exerciseId: "plank",
        sets: 3,
        repMin: 30,
        repMax: 60,
        rir: "2",
        optional: 0,
        notes: "",
        priority: "Principal",
      },
    ],
  };
  const result = reconcileTemplateExercises([template], [], [existing]);
  assert.deepEqual(result.missing, []);
  assert.equal(result.templates[0].exercises[0].exerciseId, "custom-plank");
});
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
test("el último registro de un ejercicio no depende del día de rutina", () => {
  const older = sets([8]);
  older[0].workoutId = "old";
  const newer = sets([10]);
  newer[0].workoutId = "new";
  const data = {
    workouts: [
      {
        id: "old",
        dayId: "A",
        status: "completed",
        startedAt: "2026-01-01T10:00:00.000Z",
        finishedAt: "2026-01-01T11:00:00.000Z",
      },
      {
        id: "new",
        dayId: "B",
        status: "completed",
        startedAt: "2026-02-01T10:00:00.000Z",
        finishedAt: "2026-02-01T11:00:00.000Z",
      },
    ],
    sets: [...older, ...newer],
  } as unknown as Parameters<typeof previousSets>[0];
  assert.equal(
    previousSets(data, "pullup", "2026-03-01T10:00:00.000Z")[0].reps,
    10,
  );
});

// Real SQLite execution of the same prepared SQL used by D1; batch rolls back atomically.
function database(maxMigration = Number.POSITIVE_INFINITY) {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => Number(f.slice(0, 4)) <= maxMigration)
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
  assert.equal(d.workouts[0].bodyweight, null);
  const w = d.workouts[0],
    e = d.workoutExercises[0];
  await repo.execute({
    action: "setWorkoutBodyweight",
    workoutId: w.id,
    weightKg: 73.5,
  });
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
  const saved = await repo.snapshot();
  await repo.execute({ action: "deleteSet", setId: saved.sets[0].id });
  assert.equal((await repo.snapshot()).sets.length, 0);
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
  assert.equal(
    d.templateExercises.find(
      (exercise) =>
        exercise.templateId ===
        d.templates.find((template) => template.name === "A · Hombro")?.id,
    )?.repMax,
    10,
    "editar la sesión no debe modificar la plantilla",
  );
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
test("la decisión de carga se guarda al completar el ejercicio y reaparece después", async () => {
  const { db, sql } = database(),
    repo = new D1TrainingRepository(db, "load:real"),
    plan = {
      exerciseId: "pushup",
      sets: 1,
      repMin: 8,
      repMax: 12,
      rir: "2",
      optional: 0,
      notes: "",
      priority: "Principal",
    };
  await repo.execute({
    action: "start",
    dayId: "A",
    templateName: "Carga",
    exercises: [plan],
  });
  let data = await repo.snapshot();
  const workout = data.workouts[0],
    exercise = data.workoutExercises[0];
  await assert.rejects(
    () =>
      repo.execute({
        action: "setExerciseLoadDecision",
        workoutExerciseId: exercise.id,
        decision: "increase",
      }),
    /Completa todas las series/,
  );
  await repo.execute({
    action: "saveSet",
    set: {
      workoutExerciseId: exercise.id,
      setNumber: 1,
      reps: 12,
      weight: null,
      addedWeight: null,
      assistanceWeight: null,
      RIR: 2,
      durationSeconds: null,
      notes: "",
    },
  });
  await repo.execute({
    action: "setExerciseLoadDecision",
    workoutExerciseId: exercise.id,
    decision: "increase",
  });
  await repo.execute({ action: "finish", workoutId: workout.id, notes: "" });
  sql
    .prepare("UPDATE workouts SET startedAt=? WHERE id=?")
    .run("2026-01-01T10:00:00.000Z", workout.id);
  data = await repo.snapshot();
  assert.equal(data.workoutExercises[0].nextLoadAction, "increase");
  assert.equal(
    previousLoadDecision(data, "pushup", "2026-02-01T10:00:00.000Z"),
    "increase",
  );
  sql.close();
});
test("un día libre conserva el progreso sin avanzar ni guardar la rutina", async () => {
  const { db, sql } = database(),
    repo = new D1TrainingRepository(db, "free:real"),
    plan = (exerciseId: string) => ({
      exerciseId,
      sets: 1,
      repMin: 8,
      repMax: 12,
      rir: "2",
      optional: 0,
      notes: "",
      priority: "Libre",
    });
  await repo.execute({
    action: "start",
    dayId: "A",
    templateName: "Día A",
    exercises: [plan("pushup")],
  });
  let data = await repo.snapshot();
  let workout = data.workouts.find((item) => item.status === "active")!;
  let exercise = data.workoutExercises.find(
    (item) => item.workoutId === workout.id,
  )!;
  await repo.execute({
    action: "saveSet",
    set: {
      workoutExerciseId: exercise.id,
      setNumber: 1,
      reps: 12,
      weight: null,
      assistanceWeight: null,
      addedWeight: null,
      RIR: 2,
      durationSeconds: null,
      notes: "",
    },
  });
  await repo.execute({ action: "finish", workoutId: workout.id, notes: "" });
  const templateCount = (await repo.snapshot()).templates.length;
  await repo.execute({
    action: "start",
    dayId: "B",
    templateName: "Día libre",
    exercises: [plan("pullup")],
    isFreeDay: true,
  });
  data = await repo.snapshot();
  workout = data.workouts.find((item) => item.status === "active")!;
  exercise = data.workoutExercises.find(
    (item) => item.workoutId === workout.id,
  )!;
  assert.equal(workout.isFreeDay, 1);
  await repo.execute({
    action: "saveSet",
    set: {
      workoutExerciseId: exercise.id,
      setNumber: 1,
      reps: 8,
      weight: null,
      assistanceWeight: null,
      addedWeight: null,
      RIR: 2,
      durationSeconds: null,
      notes: "",
    },
  });
  await repo.execute({
    action: "finish",
    workoutId: workout.id,
    notes: "",
    name: "Día full abdominales",
  });
  data = await repo.snapshot();
  assert.equal(completedWorkouts(data).length, 2);
  assert.equal(completedRoutineWorkouts(data).length, 1);
  assert.equal(completedRoutineWorkouts(data)[0].dayId, "A");
  assert.equal(getNextRoutineDay(completedRoutineWorkouts(data)[0].dayId), "B");
  assert.equal(
    data.workouts.find((item) => item.id === workout.id)?.templateName,
    "Día full abdominales",
  );
  assert.equal(previousSets(data, "pullup", "9999-01-01").length, 1);
  assert.equal(data.templates.length, templateCount);
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
test("las sesiones se importan sin duplicados y permiten cambiar fecha y borrar", async () => {
  const { db, sql } = database();
  const source = new D1TrainingRepository(db, "backup-source:demo", true);
  await source.execute({ action: "resetDemo" });
  const backup = workoutBackup(await source.snapshot());
  const target = new D1TrainingRepository(db, "backup-target:real");
  await target.execute({ action: "importWorkouts", workouts: backup.workouts });
  await target.execute({ action: "importWorkouts", workouts: backup.workouts });
  let data = await target.snapshot();
  assert.equal(data.workouts.length, 3);
  const workout = data.workouts[0];
  await target.execute({
    action: "updateWorkoutDate",
    workoutId: workout.id,
    date: "2020-01-02",
  });
  data = await target.snapshot();
  assert.equal(
    data.workouts.find((row) => row.id === workout.id)?.startedAt.slice(0, 10),
    "2020-01-02",
  );
  await target.execute({ action: "deleteWorkout", workoutId: workout.id });
  data = await target.snapshot();
  assert.equal(data.workouts.length, 2);
  assert.ok(!data.sets.some((set) => set.workoutId === workout.id));
  sql.close();
});
test("las importaciones de plantillas y ejercicios omiten duplicados naturales", async () => {
  const { db, sql } = database();
  const repo = new D1TrainingRepository(db, "dedupe:real");
  let data = await repo.snapshot();
  const initialTemplates = data.templates.length;
  const template = {
    dayId: "A" as const,
    name: "Plantilla sin duplicados",
    description: "Importada",
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
  };
  await repo.execute({ action: "importTemplates", templates: [template] });
  await repo.execute({ action: "importTemplates", templates: [template] });
  data = await repo.snapshot();
  assert.equal(data.templates.length, initialTemplates + 1);
  const exercise = {
    id: "first-natural-id",
    name: "Ejercicio natural único",
    shortName: "Natural",
    type: "gym" as const,
    movementPattern: "push",
    primaryMuscles: "Pecho",
    secondaryMuscles: "",
    equipment: "Máquina",
    metricType: "reps" as const,
    bodyweightExercise: 0,
    supportsAssistance: 0,
    supportsAddedWeight: 0,
    defaultRepMin: 8,
    defaultRepMax: 12,
    defaultRIR: "2",
    notes: "",
    enabled: 1,
  };
  await repo.execute({ action: "importExercises", exercises: [exercise] });
  await repo.execute({
    action: "importExercises",
    exercises: [{ ...exercise, id: "second-natural-id" }],
  });
  data = await repo.snapshot();
  assert.equal(
    data.exercises.filter((row) => row.name === exercise.name).length,
    1,
  );
  sql.close();
});
test("eliminar un ejercicio lo quita del catálogo sin romper la sesión activa", async () => {
  const { db, sql } = database();
  const repo = new D1TrainingRepository(db, "delete-exercise:real");
  const exercise = {
    ...initialExercises[0],
    id: "exercise-to-delete",
    name: "Ejercicio eliminable",
    shortName: "Eliminable",
    type: "calisthenics" as const,
  };
  await repo.execute({ action: "addExercise", exercise });
  const plan = {
    exerciseId: exercise.id,
    sets: 1,
    repMin: 1,
    repMax: 5,
    rir: "2",
    optional: 0,
    notes: "",
    priority: "Principal",
  };
  await repo.execute({
    action: "saveTemplate",
    dayId: "A",
    name: "Plantilla eliminable",
    description: "",
    exercises: [plan],
  });
  await repo.execute({
    action: "start",
    dayId: "A",
    templateName: "Plantilla eliminable",
    exercises: [plan],
  });

  await repo.execute({
    action: "deleteExercise",
    exerciseId: exercise.id,
  });
  let data = await repo.snapshot();
  assert.equal(
    data.exercises.find((row) => row.id === exercise.id)?.enabled,
    0,
  );
  assert.ok(
    !data.templateExercises.some((row) => row.exerciseId === exercise.id),
  );
  assert.ok(!data.templates.some((row) => row.name === "Plantilla eliminable"));
  assert.ok(
    data.workoutExercises.some((row) => row.exerciseId === exercise.id),
  );

  await repo.execute({ action: "importExercises", exercises: [exercise] });
  data = await repo.snapshot();
  assert.equal(
    data.exercises.find((row) => row.id === exercise.id)?.enabled,
    1,
  );
  sql.close();
});
test("importar un ID nuevo no reactiva otro ejercicio eliminado con el mismo nombre", async () => {
  const { db, sql } = database();
  const repo = new D1TrainingRepository(db, "replace-exercise-id:real");
  const obsolete = {
    ...initialExercises[0],
    id: "custom-old-plank-id",
    name: "Plancha Abdominal",
    shortName: "Plancha Abdominal",
    type: "calisthenics" as const,
  };
  const canonical = { ...obsolete, id: "plank" };
  await repo.execute({ action: "addExercise", exercise: obsolete });
  await repo.execute({
    action: "deleteExercise",
    exerciseId: obsolete.id,
  });
  await repo.execute({ action: "importExercises", exercises: [canonical] });

  const data = await repo.snapshot();
  assert.equal(
    data.exercises.find((row) => row.id === obsolete.id)?.enabled,
    0,
  );
  assert.equal(
    data.exercises.find((row) => row.id === canonical.id)?.enabled,
    1,
  );
  assert.deepEqual(
    data.exercises
      .filter((row) => row.name === canonical.name && row.enabled)
      .map((row) => row.id),
    ["plank"],
  );
  sql.close();
});
test("los ejercicios de biblioteca se comparten entre usuarios", async () => {
  const { db, sql } = database();
  const alice = new D1TrainingRepository(db, "exercise-editor:alice");
  const bob = new D1TrainingRepository(db, "exercise-editor:bob");
  let data = await alice.snapshot();
  const original = data.exercises.find((exercise) => exercise.id === "pushup")!;
  await alice.execute({
    action: "updateExercise",
    exerciseId: original.id,
    exercise: {
      ...original,
      type: original.type as "calisthenics" | "gym" | "mobility" | "skill",
      name: "Flexiones personalizadas",
      defaultRepMin: 10,
      defaultRepMax: 15,
    },
  });
  data = await alice.snapshot();
  assert.equal(
    data.exercises.find((exercise) => exercise.id === "pushup")?.name,
    "Flexiones personalizadas",
  );
  assert.equal(
    data.exercises.find((exercise) => exercise.id === "pushup")?.defaultRepMax,
    15,
  );
  assert.equal(
    (await bob.snapshot()).exercises.find(
      (exercise) => exercise.id === "pushup",
    )?.name,
    "Flexiones personalizadas",
  );
  await alice.execute({
    action: "start",
    dayId: "A",
    templateName: "Edición individual",
    exercises: [
      {
        exerciseId: "pushup",
        sets: 3,
        repMin: 10,
        repMax: 15,
        rir: "2",
        optional: 0,
        notes: "",
        priority: "Principal",
      },
    ],
  });
  data = await alice.snapshot();
  assert.equal(data.workoutExercises[0].name, "Flexiones personalizadas");
  sql.close();
});
test("los perfiles locales comparten catálogo pero aíslan sesiones e histórico", async () => {
  const { db, sql } = database();
  const first = new D1TrainingRepository(
    db,
    "default-user:real",
    false,
    "default-user",
  );
  let data = await first.snapshot();
  assert.equal(data.users.length, 1);
  await first.execute({ action: "addUser", name: "Álex" });
  data = await first.snapshot();
  const alex = data.users.find((user) => user.name === "Álex")!;
  assert.ok(alex);
  await first.execute({
    action: "addExercise",
    exercise: {
      name: "Ejercicio compartido",
      shortName: "Compartido",
      type: "gym",
      movementPattern: "push",
      primaryMuscles: "Pecho",
      secondaryMuscles: "",
      equipment: "Máquina",
      metricType: "reps",
      bodyweightExercise: 0,
      supportsAssistance: 0,
      supportsAddedWeight: 0,
      defaultRepMin: 8,
      defaultRepMax: 12,
      defaultRIR: "2",
      notes: "",
      enabled: 1,
    },
  });
  const plan = [
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
  ];
  await first.execute({
    action: "saveTemplate",
    dayId: "A",
    name: "Plantilla compartida",
    description: "Visible para todos",
    exercises: plan,
  });
  await first.execute({
    action: "start",
    dayId: "A",
    templateName: "Sesión privada",
    exercises: plan,
  });
  const second = new D1TrainingRepository(
    db,
    `${alex.id}:real`,
    false,
    alex.id,
  );
  const alexData = await second.snapshot();
  assert.equal(alexData.workouts.length, 0);
  assert.ok(
    alexData.exercises.some(
      (exercise) => exercise.name === "Ejercicio compartido",
    ),
  );
  assert.ok(
    alexData.templates.some(
      (template) => template.name === "Plantilla compartida",
    ),
  );
  await first.execute({ action: "deleteUser", userId: "default-user" });
  const afterDelete = await first.snapshot();
  assert.equal(afterDelete.activeUserId, alex.id);
  assert.equal(afterDelete.workouts.length, 0);
  assert.ok(
    afterDelete.templates.some(
      (template) => template.name === "Plantilla compartida",
    ),
  );
  sql.close();
});
test("una migración de personalizaciones pendiente no bloquea la aplicación", async () => {
  const { db, sql } = database(3);
  const repo = new D1TrainingRepository(db, "legacy-schema:real");
  let data = await repo.snapshot();
  assert.ok(data.exercises.some((exercise) => exercise.id === "pushup"));
  await repo.execute({
    action: "start",
    dayId: "A",
    templateName: "Esquema anterior",
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
  assert.equal(data.workouts.length, 1);
  assert.equal(data.workoutExercises[0].name, "Flexiones");
  sql.close();
});

test("el plan adaptativo respeta tiempo, bloqueos y funciona sin historial", async () => {
  const { db, sql } = database();
  const repo = new D1TrainingRepository(db, "adaptive-empty:real");
  const data = await repo.snapshot();
  const context = buildAdaptiveContext(data, new Date("2026-11-22T10:00:00.000Z"));
  assert.equal(context.recentWorkoutCount, 0);
  assert.ok(context.needs.every((need) => need.daysSinceExposure === null));
  const short = deterministicPlan(data, {
    durationMinutes: 30,
    energy: "normal",
    blockedExerciseIds: ["pullup"],
    equipment: [],
  }, context);
  const long = deterministicPlan(data, {
    durationMinutes: 60,
    energy: "normal",
    blockedExerciseIds: [],
    equipment: [],
  }, context);
  assert.ok(short.length > 0);
  assert.ok(!short.some((exercise) => exercise.exerciseId === "pullup"));
  assert.ok(short.reduce((sum, exercise) => sum + exercise.sets, 0) <= 11);
  assert.ok(long.reduce((sum, exercise) => sum + exercise.sets, 0) >= short.reduce((sum, exercise) => sum + exercise.sets, 0));
  sql.close();
});

test("adaptive-1.1 usa estímulos estructurados y estados del catálogo autoritativo", async () => {
  const { db, sql } = database();
  const data = await new D1TrainingRepository(db, "adaptive-catalog:real").snapshot();
  assert.equal(data.exercises.length >= 104, true);
  assert.equal(data.exercises.filter((exercise) => exercise.planningStatus === "active").length, 87);
  assert.equal(data.exercises.filter((exercise) => exercise.planningStatus === "manual_only").length, 15);
  assert.equal(data.exercises.filter((exercise) => exercise.planningStatus === "legacy_only").length, 2);
  assert.deepEqual(exerciseStimulus(data.exercises.find((exercise) => exercise.id === "side-bench-crunch")!).primary, ["core"]);
  assert.deepEqual(exerciseStimulus(data.exercises.find((exercise) => exercise.id === "pullup")!).primary, ["vertical_pull"]);
  assert.deepEqual(exerciseStimulus(data.exercises.find((exercise) => exercise.id === "pullup")!).secondary.sort(), ["biceps", "forearms_grip"]);
  assert.ok(!exerciseStimulus(data.exercises.find((exercise) => exercise.id === "ez-bar-curl")!).primary.includes("horizontal_pull"));
  assert.deepEqual(exerciseStimulus(data.exercises.find((exercise) => exercise.id === "side-plank")!).primary, ["core"]);
  sql.close();
});

test("adaptive-1.1 penaliza exceso reciente y respeta equipamiento restringido", async () => {
  const { db, sql } = database();
  const data = await new D1TrainingRepository(db, "adaptive-equipment:real").snapshot();
  const now = new Date("2026-11-22T20:00:00.000Z");
  const baseline = buildAdaptiveContext(data, now).needs.find((need) => need.group === "chest")!;
  data.workouts.push({ id: "recent-chest", dayId: "A", status: "completed", startedAt: "2026-11-22T18:00:00.000Z", finishedAt: "2026-11-22T19:00:00.000Z", bodyweight: null, notes: "", templateName: "", isFreeDay: 0, sessionType: "adaptive", proposalId: null });
  data.workoutExercises.push({ id: "recent-dip", workoutId: "recent-chest", dayId: "A", exerciseId: "dip", name: "Fondos", position: 0, sets: 10, repMin: 5, repMax: 10, rir: "1", optional: 0, notes: "", priority: "", metricType: "reps", bodyweightExercise: 1, supportsAssistance: 0, supportsAddedWeight: 1, variant: "", nextLoadAction: null });
  for (let index = 0; index < 10; index++) data.sets.push({ id: `recent-set-${index}`, workoutId: "recent-chest", workoutExerciseId: "recent-dip", exerciseId: "dip", setNumber: index + 1, reps: 8, weight: null, bodyweight: 86, assistanceWeight: null, addedWeight: null, RIR: 1, RPE: 9, durationSeconds: null, distance: null, notes: "", completed: 1, timestamp: "2026-11-22T18:30:00.000Z" });
  const chest = buildAdaptiveContext(data, now).needs.find((need) => need.group === "chest")!;
  assert.ok(chest.score < baseline.score);
  assert.ok(chest.excessRatio > 0);
  const plan = deterministicPlan(data, { durationMinutes: 50, energy: "normal", blockedExerciseIds: [], equipment: ["Peso corporal", "Barra de dominadas", "Paralelas"] }, buildAdaptiveContext(data, now));
  assert.ok(chest.score < 8, "un grupo excedido el mismo día no conserva urgencia artificial");
  assert.ok(!plan.some((row) => row.exerciseId === "dip"), "la preferencia por fondos no desplaza necesidades reales");
  assert.ok(plan.every((row) => data.exercises.find((exercise) => exercise.id === row.exerciseId)?.stimulus
    .some((stimulus) => stimulus.direct && stimulus.group === row.targetGroup)));
  assert.ok(plan.every((row) => {
    const exercise = data.exercises.find((item) => item.id === row.exerciseId)!;
    return !exercise.autoSuggestRequiresEquipmentMatch || ["Peso corporal", "Barra de dominadas", "Paralelas"].includes(exercise.equipment);
  }));
  assert.ok(plan.every((row) => data.exercises.find((exercise) => exercise.id === row.exerciseId)?.planningStatus === "active"));
  sql.close();
});

test("el perfil gimnasio completo normaliza equipamiento y respeta estados y exclusiones", async () => {
  const { db, sql } = database();
  const data = await new D1TrainingRepository(db, "adaptive-full-gym:real").snapshot();
  const fullGym = { durationMinutes: 45 as const, energy: "normal" as const, blockedExerciseIds: [],
    equipment: [], equipmentProfile: "full_gym" as const };
  const ids = ["lateral-raise", "lateral-raise-db", "lateral-raise-cable", "rear-delt-fly", "reverse-pec-deck", "face-pull", "cable-rear-delt-fly"];
  const byId = new Map(data.exercises.filter((exercise) => ids.includes(exercise.id)).map((exercise) => [exercise.id, exercise]));
  assert.equal(equipmentMatches(byId.get("lateral-raise-db")!, fullGym), true);
  assert.equal(equipmentMatches(byId.get("lateral-raise-cable")!, fullGym), true);
  assert.equal(equipmentMatches(byId.get("reverse-pec-deck")!, fullGym), true);
  assert.equal(equipmentMatches(byId.get("face-pull")!, fullGym), true);
  assert.equal(equipmentMatches(byId.get("cable-rear-delt-fly")!, fullGym), true);
  assert.equal(byId.get("lateral-raise")!.planningStatus, "manual_only");
  assert.equal(byId.get("rear-delt-fly")!.planningStatus, "manual_only");
  const customDumbbells = { ...fullGym, equipmentProfile: "custom" as const, equipment: ["Mancuernas y banco"] };
  assert.equal(equipmentMatches(byId.get("lateral-raise-db")!, customDumbbells), true);
  assert.equal(equipmentMatches(byId.get("lateral-raise-cable")!, customDumbbells), false);
  const context = buildAdaptiveContext(data);
  context.needs = context.needs.map((need) => ({ ...need, score: need.group === "lateral_rear_delts" ? 20 : 0 }));
  const audit = buildEquipmentAudit(data, context, { ...fullGym, blockedExerciseIds: ["face-pull"] });
  assert.equal(audit.find((item) => item.exerciseId === "face-pull")?.reason, "blocked");
  assert.equal(audit.find((item) => item.exerciseId === "lateral-raise")?.reason, "manual_only");
  assert.equal(audit.find((item) => item.exerciseId === "lateral-raise-db")?.reason, "eligible");
  sql.close();
});

test("30, 45, 60 y 75 minutos producen tiempos coherentes y reparan propuestas cortas", async () => {
  const { db, sql } = database();
  const data = await new D1TrainingRepository(db, "adaptive-duration-matrix:real").snapshot();
  const context = buildAdaptiveContext(data, new Date("2026-11-22T10:00:00.000Z"));
  context.needs = context.needs.map((need) => ({ ...need, score: Math.max(12, need.score), recovery: 1 }));
  let previousSeconds = 0;
  for (const durationMinutes of [30, 45, 60, 75] as const) {
    const constraints = { durationMinutes, energy: "normal" as const, blockedExerciseIds: [], equipment: [], equipmentProfile: "full_gym" as const };
    const plan = deterministicPlan(data, constraints, context);
    const summary = summarizePlanTime(data, constraints, plan);
    assert.equal(summary.plannedMainSeconds, plan.reduce((sum, row) => sum + (row.estimatedSeconds ?? 0), 0));
    assert.ok(summary.plannedMainSeconds <= summary.mainSessionSeconds);
    assert.equal(summary.remainingSeconds, summary.mainSessionSeconds - summary.plannedMainSeconds);
    assert.ok(summary.plannedMainSeconds >= previousSeconds);
    previousSeconds = summary.plannedMainSeconds;
    if (durationMinutes === 45) {
      const short = plan.slice(0, 2);
      const repaired = repairUnderfilledPlan(data, short, plan, constraints, context);
      assert.equal(repaired.repaired, true);
      assert.ok(repaired.plan.length > short.length);
      assert.ok(repaired.plan.reduce((sum, row) => sum + (row.estimatedSeconds ?? 0), 0) <= summary.mainSessionSeconds);
    }
  }
  data.settings.includeWarmupInDuration = 1;
  data.settings.generalWarmupMinutes = 7;
  const warm = adaptiveTimeBudget(data, { durationMinutes: 45, energy: "normal", blockedExerciseIds: [], equipment: [], equipmentProfile: "full_gym" });
  assert.deepEqual(warm, { totalSeconds: 2700, generalWarmupSeconds: 420, mainSessionSeconds: 2280 });
  sql.close();
});

test("la validación del LLM rechaza IDs inventados y sesiones imposibles", async () => {
  const { db, sql } = database();
  const data = await new D1TrainingRepository(db, "adaptive-validation:real").snapshot();
  const constraints = { durationMinutes: 30 as const, energy: "normal" as const, blockedExerciseIds: [], equipment: [] };
  const llmRow = (exerciseId: string, order = 1) => ({
    exerciseId, order, targetGroup: "vertical_pull" as const, sets: 3,
    repMin: 5, repMax: 10, rir: "2", optional: 0, notes: "", priority: "Prioritario",
    restSeconds: 180, suggestedLoad: { kind: "calibration" as const, valueKg: null, confidence: "low" as const },
    reason: "Prueba", alternatives: [], estimatedSeconds: 1000,
  });
  assert.throws(() => validateAdaptivePlan(data, {
    schemaVersion: "adaptive-session-1.1",
    exercises: [llmRow("inventado")],
    rationale: ["Prueba"],
  }, constraints), /no disponibles/);
  const directTargets = { pullup: "vertical_pull", dip: "chest", row: "horizontal_pull", pushup: "chest" } as const;
  assert.throws(() => validateAdaptivePlan(data, {
    schemaVersion: "adaptive-session-1.1",
    exercises: (["pullup", "dip", "row", "pushup"] as const).map((exerciseId, index) => ({
      ...llmRow(exerciseId, index + 1), targetGroup: directTargets[exerciseId],
    })),
    rationale: ["Prueba"],
  }, constraints), /tiempo disponible/);
  assert.throws(() => validateAdaptivePlan(data, {
    schemaVersion: "adaptive-session-1.1",
    exercises: [{ ...llmRow("dip"), targetGroup: "forearms_grip" }],
    rationale: ["Prueba"],
  }, constraints), /estímulo directo/);
  assert.throws(() => validateAdaptivePlan(data, {
    schemaVersion: "adaptive-session-1.1",
    exercises: [{ ...llmRow("pullup"), alternatives: ["dip"] }],
    rationale: ["Prueba"],
  }, constraints), /alternativas/);
  sql.close();
});

test("IA validada rechaza baja necesidad que desplaza cobertura y un orden deportivo incoherente", async () => {
  const { db, sql } = database();
  const data = await new D1TrainingRepository(db, "adaptive-sports-validation:real").snapshot();
  const constraints = { durationMinutes: 45 as const, energy: "normal" as const, blockedExerciseIds: [], equipment: [] };
  const context = buildAdaptiveContext(data);
  context.needs = context.needs.map((need) => ({ ...need,
    score: need.group === "lateral_rear_delts" ? 19 : need.group === "chest" ? 0 : need.group === "vertical_pull" ? 35 : need.group === "calves" ? 45 : 5 }));
  const row = (exerciseId: string, targetGroup: "chest" | "vertical_pull" | "calves", order: number) => ({
    exerciseId, targetGroup, order, sets: 2, repMin: 5, repMax: 10, rir: "2", optional: 0,
    notes: "", priority: "Cobertura", restSeconds: 90,
    suggestedLoad: { kind: "bodyweight" as const, valueKg: null, confidence: "low" as const },
    reason: "Prueba", alternatives: [], estimatedSeconds: 200,
  });
  assert.throws(() => validateAdaptivePlan(data, { schemaVersion: "adaptive-session-1.1",
    exercises: [row("dip", "chest", 1)], rationale: ["Prueba"] }, constraints, context), /desplaza/);
  const orderContext = { ...context, needs: context.needs.map((need) => ({ ...need,
    score: need.group === "vertical_pull" ? 35 : need.group === "calves" ? 45 : 0 })) };
  assert.throws(() => validateAdaptivePlan(data, { schemaVersion: "adaptive-session-1.1",
    exercises: [row("single-leg-calf-raise", "calves", 1), row("pullup", "vertical_pull", 2)], rationale: ["Prueba"] }, constraints, orderContext), /orden relega/);
  sql.close();
});

test("el presupuesto temporal solo descuenta el calentamiento general cuando se activa", async () => {
  const { db, sql } = database();
  const repo = new D1TrainingRepository(db, "adaptive-time:real");
  let data = await repo.snapshot();
  const constraints = { durationMinutes: 45 as const, energy: "normal" as const, blockedExerciseIds: [], equipment: [] };
  assert.deepEqual(adaptiveTimeBudget(data, constraints), { totalSeconds: 2700, generalWarmupSeconds: 0, mainSessionSeconds: 2700 });
  await repo.execute({ action: "setTrainerSettings", settings: {
    defaultDurationMinutes: 45, includeWarmupInDuration: 1, generalWarmupMinutes: 7,
    equipmentProfile: "full_gym", excludedExerciseIds: [],
    usualFrequency: data.settings.usualFrequency, variationLevel: data.settings.variationLevel,
    priorities: data.settings.priorities, exercisePreferences: data.settings.exercisePreferences,
    availableEquipment: data.settings.availableEquipment,
  } });
  data = await repo.snapshot();
  assert.equal(data.settings.includeWarmupInDuration, 1);
  assert.equal(data.settings.generalWarmupMinutes, 7);
  assert.deepEqual(adaptiveTimeBudget(data, constraints), { totalSeconds: 2700, generalWarmupSeconds: 420, mainSessionSeconds: 2280 });
  const plan = deterministicPlan(data, constraints, buildAdaptiveContext(data));
  assert.ok(plan.reduce((sum, row) => sum + (row.estimatedSeconds ?? 0), 0) <= 2280);
  sql.close();
});

test("la prescripción temporal usa calidad técnica y el cálculo unilateral cuenta ambos lados", async () => {
  const { db, sql } = database();
  const data = await new D1TrainingRepository(db, "adaptive-prescription:real").snapshot();
  const base = buildAdaptiveContext(data, new Date("2026-11-22T20:00:00.000Z"));
  const only = (group: "core" | "calves") => ({ ...base, needs: base.needs.map((need) => ({ ...need, score: need.group === group ? 50 : 0 })) });
  const plankPlan = deterministicPlan(data, {
    durationMinutes: 30, energy: "normal", equipment: [],
    blockedExerciseIds: data.exercises.filter((exercise) => exercise.id !== "plank").map((exercise) => exercise.id),
  }, only("core"));
  assert.equal(plankPlan[0]?.exerciseId, "plank");
  assert.equal(plankPlan[0]?.rir, "Técnica");
  assert.match(plankPlan[0]?.notes ?? "", /posición|técnico/i);
  const calfPlan = deterministicPlan(data, {
    durationMinutes: 30, energy: "normal", equipment: [],
    blockedExerciseIds: data.exercises.filter((exercise) => exercise.id !== "single-leg-calf-raise").map((exercise) => exercise.id),
  }, only("calves"));
  assert.equal(calfPlan[0]?.unilateralPerSide, true);
  assert.match(calfPlan[0]?.notes ?? "", /por lado/);
  assert.ok((calfPlan[0]?.estimatedSeconds ?? 0) >= 400);
  sql.close();
});

test("los movimientos de referencia conservan un orden favorable frente a aislamientos", async () => {
  const { db, sql } = database();
  const data = await new D1TrainingRepository(db, "adaptive-order:real").snapshot();
  const context = buildAdaptiveContext(data, new Date("2026-11-22T20:00:00.000Z"));
  context.needs = context.needs.map((need) => ({ ...need,
    score: need.group === "calves" ? 50 : need.group === "vertical_pull" ? 35 : 0 }));
  const keep = new Set(["pullup", "single-leg-calf-raise"]);
  const plan = deterministicPlan(data, { durationMinutes: 45, energy: "normal", equipment: [],
    blockedExerciseIds: data.exercises.filter((exercise) => !keep.has(exercise.id)).map((exercise) => exercise.id) }, context);
  assert.deepEqual(new Set(plan.map((row) => row.exerciseId)), keep);
  assert.equal(plan[0].exerciseId, "pullup");
  sql.close();
});

test("la propuesta queda versionada y la sesión adaptativa no reescribe el histórico", async () => {
  const { db, sql } = database();
  const repo = new D1TrainingRepository(db, "adaptive-persistence:real");
  await repo.execute({
    action: "importWorkouts",
    workouts: [{
      sourceId: "historical-g",
      dayId: "G",
      startedAt: "2025-01-02T10:00:00.000Z",
      finishedAt: "2025-01-02T10:45:00.000Z",
      bodyweight: 75,
      notes: "Histórico intacto",
      templateName: "Rutina anterior",
      isFreeDay: 0,
      exercises: [{
        exerciseId: "pullup", name: "Dominadas pronas", sets: 1,
        repMin: 1, repMax: 10, rir: "2", optional: 0, notes: "", priority: "Principal",
        metricType: "reps", bodyweightExercise: 1, supportsAssistance: 0,
        supportsAddedWeight: 1, variant: "", setsDone: [{ setNumber: 1, reps: 6,
          weight: null, assistanceWeight: null, addedWeight: null, RIR: 1,
          durationSeconds: null, notes: "Serie original" }],
      }],
    }],
  });
  const before = await repo.snapshot();
  const historical = before.workouts.find((workout) => workout.dayId === "G")!;
  const historicalSet = before.sets.find((set) => set.workoutId === historical.id)!;
  const id = "00000000-0000-4000-8000-000000000001";
  const plan = [{ exerciseId: "dip", sets: 3, repMin: 5, repMax: 10, rir: "1–2", optional: 0, notes: "", priority: "Prioritario" }];
  await repo.execute({ action: "saveAdaptiveProposal", proposal: {
    id, constraintsJson: JSON.stringify({ durationMinutes: 45, energy: "normal", blockedExerciseIds: [], equipment: [] }),
    contextJson: JSON.stringify(buildAdaptiveContext(before)), originalPlanJson: JSON.stringify(plan),
    currentPlanJson: JSON.stringify(plan), rationaleJson: JSON.stringify(["Tríceps pendiente"]),
    rulesVersion: ADAPTIVE_RULES_VERSION, source: "fallback", latencyMs: 4, errorCode: null,
  } });
  await repo.execute({ action: "start", dayId: "A", templateName: "Sesión adaptativa", exercises: plan, sessionType: "adaptive", proposalId: id });
  const after = await repo.snapshot();
  assert.equal(after.adaptiveProposals[0].status, "accepted");
  assert.equal(after.workouts.find((workout) => workout.status === "active")?.sessionType, "adaptive");
  assert.equal(after.workouts.find((workout) => workout.id === historical.id)?.dayId, "G");
  assert.equal(after.sets.find((set) => set.id === historicalSet.id)?.reps, 6);
  assert.equal(after.sets.find((set) => set.id === historicalSet.id)?.notes, "Serie original");
  sql.close();
});
