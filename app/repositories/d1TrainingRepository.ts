import type { TrainingRepository } from "./trainingRepository";
import type { Snapshot, Workout, WorkoutExercise } from "../domain/types";
import type { Command } from "../services/validation";
import {
  initialDays,
  initialExercises,
  initialRoutine,
  initialGoals,
  initialSkills,
} from "../database/seed";

export class D1TrainingRepository implements TrainingRepository {
  constructor(
    private db: D1Database,
    private ownerId: string,
    private demo = false,
  ) {}
  private query(sql: string, ...values: unknown[]) {
    return this.db.prepare(sql).bind(...values);
  }
  private insert(table: string, row: object, ignore = false) {
    const entries = Object.entries(row);
    return this.query(
      `INSERT ${ignore ? "OR IGNORE " : ""}INTO ${table} (${entries.map(([k]) => `"${k}"`).join(",")}) VALUES (${entries.map(() => "?").join(",")})`,
      ...entries.map(([, v]) => v),
    );
  }
  async seed() {
    // Seeds are idempotent; schema is owned exclusively by migrations.
    const found = await this.query(
      "SELECT id FROM routines WHERE id = ?",
      "abc",
    ).first();
    if (!found)
      await this.db.batch([
        this.insert(
          "routines",
          { id: "abc", name: "Gimnasio hacia calistenia" },
          true,
        ),
        ...initialExercises.map((e) => this.insert("exercises", e, true)),
        ...initialDays.map((d) =>
          this.insert("days", { ...d, routineId: "abc" }, true),
        ),
        ...initialRoutine.map((r) => this.insert("routineExercises", r, true)),
        ...initialSkills.map((name, i) =>
          this.insert("skills", { id: `skill-${i}`, name }, true),
        ),
        ...["Knee raises", "Tuck L-sit", "One-leg L-sit", "L-sit completo"].map(
          (name, i) =>
            this.insert(
              "skillProgressions",
              { id: `lsit-${i}`, skillId: "skill-5", name, level: i + 1 },
              true,
            ),
        ),
        ...[
          "Wall handstand",
          "Wall handstand facing wall",
          "Kick-up",
          "Free handstand",
        ].map((name, i) =>
          this.insert(
            "skillProgressions",
            { id: `handstand-${i}`, skillId: "skill-6", name, level: i + 1 },
            true,
          ),
        ),
      ]);
    await this.db.batch([
      ...initialDays.map((d) =>
        this.insert("days", { ...d, routineId: "abc" }, true),
      ),
      this.insert(
        "userSettings",
        { ownerId: this.ownerId, trainingDays: 3 },
        true,
      ),
      ...initialGoals.map((g) =>
        this.insert(
          "goals",
          { ...g, id: `${this.ownerId}:${g.id}`, ownerId: this.ownerId },
          true,
        ),
      ),
    ]);
    for (const day of initialDays) {
      const templateId = `${this.ownerId}:default-${day.id}`;
      const rows = initialRoutine.filter((r) => r.dayId === day.id);
      if (
        rows.length &&
        !(await this.query(
          "SELECT id FROM workoutTemplates WHERE id=?",
          templateId,
        ).first())
      ) {
        await this.db.batch([
          this.insert("workoutTemplates", {
            id: templateId,
            ownerId: this.ownerId,
            dayId: day.id,
            name: `${day.title} · Base`,
            description: "Plantilla inicial editable",
            createdAt: new Date().toISOString(),
          }),
          ...rows.map(
            (
              {
                exerciseId,
                sets,
                repMin,
                repMax,
                rir,
                optional,
                notes,
                priority,
              },
              position,
            ) =>
              this.insert("templateExercises", {
                id: `${templateId}:${position}`,
                templateId,
                exerciseId,
                sets,
                repMin,
                repMax,
                rir,
                optional,
                notes,
                priority,
                position,
              }),
          ),
        ]);
      }
    }
  }
  async snapshot(): Promise<Snapshot> {
    await this.seed();
    const result = await this.db.batch([
      this.query(
        "SELECT * FROM exercises WHERE ownerId IS NULL OR ownerId=? ORDER BY name",
        this.ownerId,
      ),
      this.query(
        "SELECT * FROM days WHERE position < (SELECT trainingDays FROM userSettings WHERE ownerId=?) ORDER BY position",
        this.ownerId,
      ),
      this.query("SELECT * FROM routineExercises ORDER BY position"),
      this.query(
        "SELECT * FROM workouts WHERE ownerId = ? ORDER BY startedAt DESC",
        this.ownerId,
      ),
      this.query(
        "SELECT e.* FROM workoutExercises e JOIN workouts w ON w.id=e.workoutId WHERE w.ownerId=? ORDER BY e.position",
        this.ownerId,
      ),
      this.query(
        "SELECT s.* FROM workoutSets s JOIN workouts w ON w.id=s.workoutId WHERE w.ownerId=? ORDER BY s.setNumber",
        this.ownerId,
      ),
      this.query(
        "SELECT * FROM bodyWeights WHERE ownerId=? ORDER BY date DESC",
        this.ownerId,
      ),
      this.query("SELECT * FROM goals WHERE ownerId=?", this.ownerId),
      this.query("SELECT * FROM routines"),
      this.query("SELECT * FROM skills"),
      this.query("SELECT * FROM skillProgressions ORDER BY level"),
      this.query("SELECT * FROM skillLogs WHERE ownerId=?", this.ownerId),
      this.query("SELECT * FROM personalRecords WHERE ownerId=?", this.ownerId),
      this.query(
        "SELECT id,dayId,name,description,createdAt FROM workoutTemplates WHERE ownerId=? ORDER BY dayId,createdAt",
        this.ownerId,
      ),
      this.query(
        "SELECT e.* FROM templateExercises e JOIN workoutTemplates t ON t.id=e.templateId WHERE t.ownerId=? ORDER BY e.position",
        this.ownerId,
      ),
      this.query(
        "SELECT trainingDays FROM userSettings WHERE ownerId=?",
        this.ownerId,
      ),
    ]);
    const snapshot = Object.fromEntries(
      [
        "exercises",
        "days",
        "routine",
        "workouts",
        "workoutExercises",
        "sets",
        "bodyWeights",
        "goals",
        "routines",
        "skills",
        "skillProgressions",
        "skillLogs",
        "personalRecords",
        "templates",
        "templateExercises",
      ].map((key, i) => [key, result[i].results]),
    ) as unknown as Snapshot;
    snapshot.settings = {
      trainingDays:
        (result[15].results[0] as { trainingDays?: number } | undefined)
          ?.trainingDays ?? 3,
    };
    return snapshot;
  }
  private async active(id: string) {
    const w = await this.query(
      "SELECT * FROM workouts WHERE id=? AND ownerId=? AND status='active'",
      id,
      this.ownerId,
    ).first<Workout>();
    if (!w)
      throw new Error("La sesión ya no está activa. Actualiza la página.");
    return w;
  }
  async execute(c: Command): Promise<void> {
    await this.seed();
    if (c.action === "setTrainingDays") {
      const active = await this.query(
        "SELECT d.position FROM workouts w JOIN days d ON d.id=w.dayId WHERE w.ownerId=? AND w.status='active'",
        this.ownerId,
      ).first<{ position: number }>();
      if (active && active.position >= c.trainingDays)
        throw new Error(
          "Termina o cancela la sesión activa antes de quitar ese día.",
        );
      await this.query(
        "UPDATE userSettings SET trainingDays=? WHERE ownerId=?",
        c.trainingDays,
        this.ownerId,
      ).run();
      return;
    }
    if (c.action === "deleteTemplate") {
      const template = await this.query(
        "SELECT id FROM workoutTemplates WHERE id=? AND ownerId=?",
        c.templateId,
        this.ownerId,
      ).first();
      if (!template) throw new Error("Plantilla no encontrada.");
      await this.db.batch([
        this.query(
          "DELETE FROM templateExercises WHERE templateId=?",
          c.templateId,
        ),
        this.query(
          "DELETE FROM workoutTemplates WHERE id=? AND ownerId=?",
          c.templateId,
          this.ownerId,
        ),
      ]);
      return;
    }
    if (c.action === "start") {
      const enabledDay = await this.query(
        "SELECT d.id FROM days d JOIN userSettings s ON d.position < s.trainingDays WHERE d.id=? AND s.ownerId=?",
        c.dayId,
        this.ownerId,
      ).first();
      if (!enabledDay) throw new Error("Ese día no está activo en tu rutina.");
      if (
        await this.query(
          "SELECT id FROM workouts WHERE ownerId=? AND status='active'",
          this.ownerId,
        ).first()
      )
        return;
      const id = crypto.randomUUID(),
        now = new Date().toISOString();
      const bw = await this.query(
        "SELECT weightKg FROM bodyWeights WHERE ownerId=? ORDER BY date DESC,rowid DESC LIMIT 1",
        this.ownerId,
      ).first<{ weightKg: number }>();
      const rows = [] as WorkoutExercise[];
      for (const [position, plan] of c.exercises.entries()) {
        const exercise = await this.query(
          "SELECT * FROM exercises WHERE id=? AND (ownerId IS NULL OR ownerId=?)",
          plan.exerciseId,
          this.ownerId,
        ).first<WorkoutExercise>();
        if (!exercise)
          throw new Error("Uno de los ejercicios ya no está disponible.");
        rows.push({
          ...plan,
          ...exercise,
          id: `plan-${position}`,
          dayId: c.dayId,
          position,
          workoutId: id,
          variant: "",
        });
      }
      await this.db.batch([
        this.insert("workouts", {
          id,
          ownerId: this.ownerId,
          dayId: c.dayId,
          status: "active",
          startedAt: now,
          finishedAt: null,
          bodyweight: bw?.weightKg ?? null,
          notes: "",
          templateName: c.templateName,
        }),
        ...rows.map((row) =>
          this.insert("workoutExercises", {
            id: `${id}:${row.id}`,
            workoutId: id,
            dayId: c.dayId,
            exerciseId: row.exerciseId,
            name: row.name,
            position: row.position,
            sets: row.sets,
            repMin: row.repMin,
            repMax: row.repMax,
            rir: row.rir,
            optional: row.optional,
            notes: row.notes,
            priority: row.priority,
            metricType: row.metricType,
            bodyweightExercise: row.bodyweightExercise,
            supportsAssistance: row.supportsAssistance,
            supportsAddedWeight: row.supportsAddedWeight,
            variant: row.exerciseId === "handstand" ? "Wall handstand" : "",
          }),
        ),
      ]);
      return;
    }
    if (c.action === "saveTemplate" || c.action === "importTemplates") {
      const templates = c.action === "saveTemplate" ? [c] : c.templates;
      for (const t of templates) {
        const id = "id" in t && t.id ? t.id : crypto.randomUUID();
        const existing = await this.query(
          "SELECT id FROM workoutTemplates WHERE id=? AND ownerId=?",
          id,
          this.ownerId,
        ).first();
        const statements = [] as D1PreparedStatement[];
        if (existing) {
          statements.push(
            this.query(
              "UPDATE workoutTemplates SET dayId=?,name=?,description=? WHERE id=? AND ownerId=?",
              t.dayId,
              t.name,
              t.description,
              id,
              this.ownerId,
            ),
            this.query("DELETE FROM templateExercises WHERE templateId=?", id),
          );
        } else
          statements.push(
            this.insert("workoutTemplates", {
              id,
              ownerId: this.ownerId,
              dayId: t.dayId,
              name: t.name,
              description: t.description,
              createdAt: new Date().toISOString(),
            }),
          );
        for (const [position, e] of t.exercises.entries()) {
          if (
            !(await this.query(
              "SELECT id FROM exercises WHERE id=? AND (ownerId IS NULL OR ownerId=?)",
              e.exerciseId,
              this.ownerId,
            ).first())
          )
            throw new Error(`Ejercicio desconocido: ${e.exerciseId}`);
          statements.push(
            this.insert("templateExercises", {
              ...e,
              id: `${id}:${position}:${crypto.randomUUID()}`,
              templateId: id,
              position,
            }),
          );
        }
        await this.db.batch(statements);
      }
      return;
    }
    if (c.action === "addExercise" || c.action === "importExercises") {
      const exercises = c.action === "addExercise" ? [c.exercise] : c.exercises;
      for (const e of exercises) {
        const id = e.id?.trim() || `custom-${crypto.randomUUID()}`;
        if (
          await this.query("SELECT id FROM exercises WHERE id=?", id).first()
        ) {
          if (c.action === "importExercises") continue;
          throw new Error(`Ya existe un ejercicio con id ${id}.`);
        }
        await this.insert("exercises", {
          ...e,
          id,
          ownerId: this.ownerId,
        }).run();
      }
      return;
    }
    if (
      c.action === "updateWorkoutExercise" ||
      c.action === "removeWorkoutExercise"
    ) {
      const e = await this.query(
        "SELECT e.* FROM workoutExercises e JOIN workouts w ON w.id=e.workoutId WHERE e.id=? AND w.ownerId=?",
        c.workoutExerciseId,
        this.ownerId,
      ).first<WorkoutExercise>();
      if (!e) throw new Error("Ejercicio no encontrado.");
      await this.active(e.workoutId);
      if (c.action === "removeWorkoutExercise") {
        if (
          await this.query(
            "SELECT id FROM workoutSets WHERE workoutExerciseId=?",
            e.id,
          ).first()
        )
          throw new Error(
            "No puedes eliminar un ejercicio que ya tiene series guardadas.",
          );
        await this.query("DELETE FROM workoutExercises WHERE id=?", e.id).run();
        return;
      }
      const lib = await this.query(
        "SELECT * FROM exercises WHERE id=? AND (ownerId IS NULL OR ownerId=?)",
        c.exercise.exerciseId,
        this.ownerId,
      ).first<WorkoutExercise>();
      if (!lib) throw new Error("Ejercicio no disponible.");
      const count = await this.query(
        "SELECT COUNT(*) count FROM workoutSets WHERE workoutExerciseId=?",
        e.id,
      ).first<{ count: number }>();
      if ((count?.count ?? 0) > c.exercise.sets)
        throw new Error(
          "El objetivo no puede tener menos series que las ya guardadas.",
        );
      await this.query(
        "UPDATE workoutExercises SET exerciseId=?,name=?,sets=?,repMin=?,repMax=?,rir=?,optional=?,notes=?,priority=?,metricType=?,bodyweightExercise=?,supportsAssistance=?,supportsAddedWeight=? WHERE id=?",
        lib.id,
        lib.name,
        c.exercise.sets,
        c.exercise.repMin,
        c.exercise.repMax,
        c.exercise.rir,
        c.exercise.optional,
        c.exercise.notes,
        c.exercise.priority,
        lib.metricType,
        lib.bodyweightExercise,
        lib.supportsAssistance,
        lib.supportsAddedWeight,
        e.id,
      ).run();
      return;
    }
    if (c.action === "addWorkoutExercise") {
      const w = await this.active(c.workoutId);
      const lib = await this.query(
        "SELECT * FROM exercises WHERE id=? AND (ownerId IS NULL OR ownerId=?)",
        c.exercise.exerciseId,
        this.ownerId,
      ).first<WorkoutExercise>();
      if (!lib) throw new Error("Ejercicio no disponible.");
      const pos = await this.query(
        "SELECT COALESCE(MAX(position),-1)+1 position FROM workoutExercises WHERE workoutId=?",
        w.id,
      ).first<{ position: number }>();
      await this.insert("workoutExercises", {
        ...c.exercise,
        id: crypto.randomUUID(),
        workoutId: w.id,
        dayId: w.dayId,
        name: lib.name,
        position: pos?.position ?? 0,
        metricType: lib.metricType,
        bodyweightExercise: lib.bodyweightExercise,
        supportsAssistance: lib.supportsAssistance,
        supportsAddedWeight: lib.supportsAddedWeight,
        variant: "",
      }).run();
      return;
    }
    if (c.action === "saveSet") {
      const e = await this.query(
        "SELECT e.* FROM workoutExercises e JOIN workouts w ON w.id=e.workoutId WHERE e.id=? AND w.ownerId=?",
        c.set.workoutExerciseId,
        this.ownerId,
      ).first<WorkoutExercise>();
      if (!e) throw new Error("Ejercicio no encontrado.");
      const w = await this.active(e.workoutId),
        s = c.set;
      if (s.setNumber > e.sets) throw new Error("Serie fuera del objetivo.");
      if (
        e.metricType === "time"
          ? s.durationSeconds === null || s.durationSeconds <= 0
          : s.reps === null
      )
        throw new Error(
          e.metricType === "time"
            ? "Introduce los segundos."
            : "Introduce las repeticiones.",
        );
      if (!e.bodyweightExercise && s.weight === null)
        throw new Error("Introduce el peso utilizado (0 si corresponde).");
      if (e.supportsAssistance && s.assistanceWeight === null)
        throw new Error("Introduce la asistencia real en kg.");
      if (!e.supportsAssistance && (s.assistanceWeight ?? 0) > 0)
        throw new Error("Este ejercicio no utiliza asistencia.");
      if (!e.supportsAddedWeight && (s.addedWeight ?? 0) > 0)
        throw new Error("Este ejercicio no utiliza lastre.");
      const row = {
        ...s,
        id: `${e.id}:${s.setNumber}`,
        workoutId: w.id,
        exerciseId: e.exerciseId,
        bodyweight: w.bodyweight,
        RPE: null,
        distance: null,
        completed: 1,
        timestamp: new Date().toISOString(),
        reps: e.metricType === "reps" ? s.reps : null,
        durationSeconds: e.metricType === "time" ? s.durationSeconds : null,
        weight: e.bodyweightExercise ? null : s.weight,
      };
      const entries = Object.entries(row);
      const saved = await this.query(
        `INSERT INTO workoutSets (${entries.map(([k]) => `"${k}"`).join(",")}) SELECT ${entries.map(() => "?").join(",")} WHERE EXISTS (SELECT 1 FROM workouts WHERE id=? AND ownerId=? AND status='active') ON CONFLICT(workoutExerciseId,setNumber) DO UPDATE SET ${entries
          .filter(([k]) => k !== "id")
          .map(([k]) => `"${k}"=excluded."${k}"`)
          .join(",")}`,
        ...entries.map(([, v]) => v),
        w.id,
        this.ownerId,
      ).run();
      if (!saved.meta.changes)
        throw new Error(
          "La sesión se ha cerrado en otra pestaña. Actualiza antes de continuar.",
        );
      return;
    }
    if (c.action === "finish") {
      // Conditional update makes retries harmless and never completes an empty session.
      await this.query(
        "UPDATE workouts SET status='completed',finishedAt=?,notes=? WHERE id=? AND ownerId=? AND status='active' AND EXISTS(SELECT 1 FROM workoutSets WHERE workoutId=workouts.id AND completed=1)",
        new Date().toISOString(),
        c.notes,
        c.workoutId,
        this.ownerId,
      ).run();
      const w = await this.query(
        "SELECT status FROM workouts WHERE id=? AND ownerId=?",
        c.workoutId,
        this.ownerId,
      ).first<{ status: string }>();
      if (w?.status !== "completed")
        throw new Error("Guarda al menos una serie antes de terminar.");
      return;
    }
    if (c.action === "cancel") {
      await this.query(
        "UPDATE workouts SET status='cancelled',finishedAt=? WHERE id=? AND ownerId=? AND status='active'",
        new Date().toISOString(),
        c.workoutId,
        this.ownerId,
      ).run();
      return;
    }
    if (c.action === "bodyWeight") {
      if (c.date > new Date().toISOString().slice(0, 10))
        throw new Error("La fecha no puede ser futura.");
      await this.insert("bodyWeights", {
        id: crypto.randomUUID(),
        ownerId: this.ownerId,
        date: c.date,
        weightKg: c.weightKg,
      }).run();
      return;
    }
    if (c.action === "variant") {
      const e = await this.query(
        "SELECT e.* FROM workoutExercises e JOIN workouts w ON w.id=e.workoutId WHERE e.id=? AND w.ownerId=?",
        c.workoutExerciseId,
        this.ownerId,
      ).first<WorkoutExercise>();
      if (!e) throw new Error("Ejercicio no encontrado.");
      await this.active(e.workoutId);
      const allowed =
        e.exerciseId === "handstand"
          ? [
              "Pike técnico",
              "Wall handstand",
              "Facing wall",
              "Kick-up",
              "Free handstand",
            ]
          : e.exerciseId === "pushup-hard"
            ? [
                "Normales",
                "Pies elevados",
                "Diamante",
                "Pseudo planche",
                "Lastradas",
              ]
            : [];
      if (!allowed.includes(c.variant)) throw new Error("Variante no válida.");
      if (
        (e.exerciseId === "handstand" &&
          c.metricType !== (c.variant === "Pike técnico" ? "reps" : "time")) ||
        (e.exerciseId !== "handstand" && c.metricType !== "reps")
      )
        throw new Error("Métrica incompatible.");
      if (
        await this.query(
          "SELECT id FROM workoutSets WHERE workoutExerciseId=?",
          e.id,
        ).first()
      )
        throw new Error("Elige la variante antes de guardar sus series.");
      await this.query(
        "UPDATE workoutExercises SET variant=?,metricType=? WHERE id=?",
        c.variant,
        c.metricType,
        e.id,
      ).run();
      return;
    }
    if (c.action === "resetDemo") {
      if (!this.demo)
        throw new Error("Solo se pueden reiniciar los datos demo.");
      await this.db.batch([
        this.query(
          "DELETE FROM workoutSets WHERE workoutId IN (SELECT id FROM workouts WHERE ownerId=?)",
          this.ownerId,
        ),
        this.query(
          "DELETE FROM workoutExercises WHERE workoutId IN (SELECT id FROM workouts WHERE ownerId=?)",
          this.ownerId,
        ),
        this.query("DELETE FROM workouts WHERE ownerId=?", this.ownerId),
        this.query("DELETE FROM bodyWeights WHERE ownerId=?", this.ownerId),
      ]);
      for (const [i, dayId] of (["A", "B", "C"] as const).entries()) {
        const plan = initialRoutine
          .filter((r) => r.dayId === dayId)
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
        await this.execute({
          action: "start",
          dayId,
          templateName: `Demo Día ${dayId}`,
          exercises: plan,
        });
        const data = await this.snapshot();
        const w = data.workouts.find((w) => w.status === "active")!;
        for (const e of data.workoutExercises.filter(
          (e) => e.workoutId === w.id,
        ))
          for (let n = 1; n <= e.sets; n++)
            await this.execute({
              action: "saveSet",
              set: {
                workoutExerciseId: e.id,
                setNumber: n,
                reps: e.metricType === "reps" ? e.repMin : null,
                durationSeconds: e.metricType === "time" ? 20 : null,
                weight: !e.bodyweightExercise ? 20 : null,
                addedWeight: null,
                assistanceWeight: e.supportsAssistance ? 14 : null,
                RIR: 2,
                notes: "Sesión de ejemplo",
              },
            });
        await this.execute({
          action: "finish",
          workoutId: w.id,
          notes: "Datos demo",
        });
        const start = new Date(Date.now() - (7 - i * 2) * 86400000),
          end = new Date(start.getTime() + 48 * 60000);
        await this.query(
          "UPDATE workouts SET startedAt=?,finishedAt=? WHERE id=?",
          start.toISOString(),
          end.toISOString(),
          w.id,
        ).run();
      }
      return;
    }
  }
}
