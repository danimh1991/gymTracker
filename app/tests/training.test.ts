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
