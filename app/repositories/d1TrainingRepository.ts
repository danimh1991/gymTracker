import type { TrainingRepository } from "./trainingRepository";
import type {
  Exercise,
  Snapshot,
  Workout,
  WorkoutExercise,
} from "../domain/types";
import type { Command } from "../services/validation";
import { sportDefinition } from "../domain/sports";
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
    private profileId?: string,
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
  private async resolveProfile() {
    if (this.profileId === undefined) return;
    const count = await this.query("SELECT COUNT(*) count FROM users").first<{
      count: number;
    }>();
    if (!count?.count)
      await this.insert("users", {
        id: "default-user",
        name: "Usuario 1",
        createdAt: new Date().toISOString(),
      }).run();
    const selected =
      (await this.query(
        "SELECT id FROM users WHERE id=?",
        this.profileId,
      ).first<{
        id: string;
      }>()) ??
      (await this.query(
        "SELECT id FROM users ORDER BY createdAt,id LIMIT 1",
      ).first<{ id: string }>());
    if (!selected) throw new Error("No hay ningún usuario disponible.");
    this.profileId = selected.id;
    this.ownerId = `${selected.id}:${this.demo ? "demo" : "real"}`;
  }
  async seed() {
    await this.resolveProfile();
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
      const templateId = `default-${day.id}`;
      const templateName = `${day.title} · Base`;
      const rows = initialRoutine.filter((r) => r.dayId === day.id);
      if (
        rows.length &&
        !(await this.query(
          "SELECT id FROM workoutTemplates WHERE id=? OR (dayId=? AND LOWER(TRIM(name))=LOWER(TRIM(?))) LIMIT 1",
          templateId,
          day.id,
          templateName,
        ).first())
      ) {
        await this.db.batch([
          this.insert("workoutTemplates", {
            id: templateId,
            ownerId: "shared",
            dayId: day.id,
            name: templateName,
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
      this.query("SELECT * FROM exercises ORDER BY name"),
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
        "SELECT id,dayId,name,description,createdAt FROM workoutTemplates t WHERE t.id=(SELECT t2.id FROM workoutTemplates t2 WHERE t2.dayId=t.dayId AND LOWER(TRIM(t2.name))=LOWER(TRIM(t.name)) ORDER BY t2.createdAt,t2.id LIMIT 1) ORDER BY dayId,createdAt",
      ),
      this.query(
        "SELECT e.* FROM templateExercises e JOIN workoutTemplates t ON t.id=e.templateId WHERE t.id=(SELECT t2.id FROM workoutTemplates t2 WHERE t2.dayId=t.dayId AND LOWER(TRIM(t2.name))=LOWER(TRIM(t.name)) ORDER BY t2.createdAt,t2.id LIMIT 1) ORDER BY e.position",
      ),
      this.query(
        "SELECT trainingDays FROM userSettings WHERE ownerId=?",
        this.ownerId,
      ),
      this.query(
        "SELECT id,sport,date,durationMinutes,distanceKm,laps,elevationGainM,intensity,notes,createdAt FROM externalActivities WHERE ownerId=? ORDER BY date DESC,createdAt DESC",
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
    snapshot.externalActivities = result[16]
      .results as unknown as Snapshot["externalActivities"];
    snapshot.users =
      this.profileId === undefined
        ? [
            {
              id: this.ownerId,
              name: "Usuario",
              createdAt: "",
            },
          ]
        : ((
            await this.query(
              "SELECT id,name,createdAt FROM users ORDER BY createdAt,id",
            ).all()
          ).results as unknown as Snapshot["users"]);
    snapshot.activeUserId = this.profileId ?? this.ownerId;
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
  private async libraryExercise(id: string): Promise<Exercise | null> {
    return this.query(
      "SELECT * FROM exercises WHERE id=?",
      id,
    ).first<Exercise>();
  }
  async execute(c: Command): Promise<void> {
    await this.seed();
    if (c.action === "addUser") {
      if (this.profileId === undefined)
        throw new Error("La gestión de usuarios no está disponible aquí.");
      if (
        await this.query(
          "SELECT id FROM users WHERE LOWER(TRIM(name))=LOWER(TRIM(?))",
          c.name,
        ).first()
      )
        throw new Error("Ya existe un usuario con ese nombre.");
      await this.insert("users", {
        id: crypto.randomUUID(),
        name: c.name.trim(),
        createdAt: new Date().toISOString(),
      }).run();
      return;
    }
    if (c.action === "deleteUser") {
      if (this.profileId === undefined)
        throw new Error("La gestión de usuarios no está disponible aquí.");
      const count = await this.query("SELECT COUNT(*) count FROM users").first<{
        count: number;
      }>();
      if ((count?.count ?? 0) <= 1)
        throw new Error("Debe quedar al menos un usuario.");
      const found = await this.query(
        "SELECT id FROM users WHERE id=?",
        c.userId,
      ).first();
      if (!found) throw new Error("Usuario no encontrado.");
      const realOwner = `${c.userId}:real`;
      const demoOwner = `${c.userId}:demo`;
      await this.db.batch([
        this.query(
          "DELETE FROM personalRecords WHERE ownerId IN (?,?)",
          realOwner,
          demoOwner,
        ),
        this.query(
          "DELETE FROM workoutSets WHERE workoutId IN (SELECT id FROM workouts WHERE ownerId IN (?,?))",
          realOwner,
          demoOwner,
        ),
        this.query(
          "DELETE FROM workoutExercises WHERE workoutId IN (SELECT id FROM workouts WHERE ownerId IN (?,?))",
          realOwner,
          demoOwner,
        ),
        this.query(
          "DELETE FROM workouts WHERE ownerId IN (?,?)",
          realOwner,
          demoOwner,
        ),
        this.query(
          "DELETE FROM bodyWeights WHERE ownerId IN (?,?)",
          realOwner,
          demoOwner,
        ),
        this.query(
          "DELETE FROM goals WHERE ownerId IN (?,?)",
          realOwner,
          demoOwner,
        ),
        this.query(
          "DELETE FROM skillLogs WHERE ownerId IN (?,?)",
          realOwner,
          demoOwner,
        ),
        this.query(
          "DELETE FROM externalActivities WHERE ownerId IN (?,?)",
          realOwner,
          demoOwner,
        ),
        this.query(
          "DELETE FROM exerciseOverrides WHERE ownerId IN (?,?)",
          realOwner,
          demoOwner,
        ),
        this.query(
          "DELETE FROM userSettings WHERE ownerId IN (?,?)",
          realOwner,
          demoOwner,
        ),
        this.query(
          "UPDATE workoutTemplates SET ownerId='shared' WHERE ownerId IN (?,?)",
          realOwner,
          demoOwner,
        ),
        this.query(
          "UPDATE exercises SET ownerId=NULL WHERE ownerId IN (?,?)",
          realOwner,
          demoOwner,
        ),
        this.query("DELETE FROM users WHERE id=?", c.userId),
      ]);
      return;
    }
    if (c.action === "addExternalActivity") {
      if (c.activity.date > new Date().toISOString().slice(0, 10))
        throw new Error("La fecha no puede ser futura.");
      const sport = sportDefinition(c.activity.sport);
      if (
        "distance" in sport &&
        sport.distance &&
        c.activity.distanceKm === null
      )
        throw new Error("Indica la distancia de este deporte.");
      if ("laps" in sport && sport.laps && c.activity.laps === null)
        throw new Error("Indica el número de largos.");
      await this.insert("externalActivities", {
        id: crypto.randomUUID(),
        ownerId: this.ownerId,
        ...c.activity,
        createdAt: new Date().toISOString(),
      }).run();
      return;
    }
    if (c.action === "deleteExternalActivity") {
      const result = await this.query(
        "DELETE FROM externalActivities WHERE id=? AND ownerId=?",
        c.activityId,
        this.ownerId,
      ).run();
      if (!result.meta.changes) throw new Error("Actividad no encontrada.");
      return;
    }
    if (c.action === "updateWorkoutDate") {
      if (c.date > new Date().toISOString().slice(0, 10))
        throw new Error("La fecha no puede ser futura.");
      const workout = await this.query(
        "SELECT startedAt,finishedAt,status FROM workouts WHERE id=? AND ownerId=?",
        c.workoutId,
        this.ownerId,
      ).first<{
        startedAt: string;
        finishedAt: string | null;
        status: string;
      }>();
      if (!workout) throw new Error("Sesión no encontrada.");
      if (workout.status === "active")
        throw new Error("Termina la sesión antes de cambiar su fecha.");
      const oldStart = Date.parse(workout.startedAt);
      const newStartedAt = `${c.date}${workout.startedAt.slice(10)}`;
      const delta = Date.parse(newStartedAt) - oldStart;
      const newFinishedAt = workout.finishedAt
        ? new Date(Date.parse(workout.finishedAt) + delta).toISOString()
        : null;
      await this.db.batch([
        this.query(
          "UPDATE workouts SET startedAt=?,finishedAt=? WHERE id=? AND ownerId=?",
          newStartedAt,
          newFinishedAt,
          c.workoutId,
          this.ownerId,
        ),
        this.query(
          "UPDATE workoutSets SET timestamp=datetime(timestamp, ?) WHERE workoutId=?",
          `${delta / 1000} seconds`,
          c.workoutId,
        ),
      ]);
      return;
    }
    if (c.action === "deleteWorkout") {
      const workout = await this.query(
        "SELECT status FROM workouts WHERE id=? AND ownerId=?",
        c.workoutId,
        this.ownerId,
      ).first<{ status: string }>();
      if (!workout) throw new Error("Sesión no encontrada.");
      if (workout.status === "active")
        throw new Error("Abandona la sesión activa antes de eliminarla.");
      await this.db.batch([
        this.query(
          "UPDATE personalRecords SET setId=NULL WHERE ownerId=? AND setId IN (SELECT id FROM workoutSets WHERE workoutId=?)",
          this.ownerId,
          c.workoutId,
        ),
        this.query("DELETE FROM workoutSets WHERE workoutId=?", c.workoutId),
        this.query(
          "DELETE FROM workoutExercises WHERE workoutId=?",
          c.workoutId,
        ),
        this.query(
          "DELETE FROM workouts WHERE id=? AND ownerId=?",
          c.workoutId,
          this.ownerId,
        ),
      ]);
      return;
    }
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
        "SELECT id,dayId,name FROM workoutTemplates WHERE id=?",
        c.templateId,
      ).first<{ id: string; dayId: string; name: string }>();
      if (!template) throw new Error("Plantilla no encontrada.");
      await this.db.batch([
        this.query(
          "DELETE FROM templateExercises WHERE templateId IN (SELECT id FROM workoutTemplates WHERE dayId=? AND LOWER(TRIM(name))=LOWER(TRIM(?)))",
          template.dayId,
          template.name,
        ),
        this.query(
          "DELETE FROM workoutTemplates WHERE dayId=? AND LOWER(TRIM(name))=LOWER(TRIM(?))",
          template.dayId,
          template.name,
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
      const rows = [] as WorkoutExercise[];
      for (const [position, plan] of c.exercises.entries()) {
        const exercise = await this.libraryExercise(plan.exerciseId);
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
          nextLoadAction: null,
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
          bodyweight: null,
          notes: "",
          templateName: c.templateName,
          ...(c.isFreeDay ? { isFreeDay: 1 } : {}),
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
        if (
          c.action === "importTemplates" &&
          (await this.query(
            "SELECT id FROM workoutTemplates WHERE dayId=? AND LOWER(TRIM(name))=LOWER(TRIM(?))",
            t.dayId,
            t.name,
          ).first())
        )
          continue;
        const id = "id" in t && t.id ? t.id : crypto.randomUUID();
        const existing = await this.query(
          "SELECT id FROM workoutTemplates WHERE id=?",
          id,
        ).first();
        const statements = [] as D1PreparedStatement[];
        if (existing) {
          statements.push(
            this.query(
              "UPDATE workoutTemplates SET dayId=?,name=?,description=? WHERE id=?",
              t.dayId,
              t.name,
              t.description,
              id,
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
              "SELECT id FROM exercises WHERE id=?",
              e.exerciseId,
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
    if (c.action === "updateExercise") {
      const existing = await this.query(
        "SELECT id FROM exercises WHERE id=?",
        c.exerciseId,
      ).first<{ id: string }>();
      if (!existing) throw new Error("Ejercicio no encontrado.");
      const e = c.exercise;
      await this.query(
        "UPDATE exercises SET name=?,shortName=?,type=?,movementPattern=?,primaryMuscles=?,secondaryMuscles=?,equipment=?,metricType=?,bodyweightExercise=?,supportsAssistance=?,supportsAddedWeight=?,defaultRepMin=?,defaultRepMax=?,defaultRIR=?,notes=?,enabled=? WHERE id=?",
        e.name,
        e.shortName,
        e.type,
        e.movementPattern,
        e.primaryMuscles,
        e.secondaryMuscles,
        e.equipment,
        e.metricType,
        e.bodyweightExercise,
        e.supportsAssistance,
        e.supportsAddedWeight,
        e.defaultRepMin,
        e.defaultRepMax,
        e.defaultRIR,
        e.notes,
        e.enabled,
        c.exerciseId,
      ).run();
      await this.query(
        "DELETE FROM exerciseOverrides WHERE exerciseId=?",
        c.exerciseId,
      ).run();
      return;
    }
    if (c.action === "deleteExercise") {
      const existing = await this.query(
        "SELECT id FROM exercises WHERE id=? AND enabled=1",
        c.exerciseId,
      ).first<{ id: string }>();
      if (!existing) throw new Error("Ejercicio no encontrado.");
      await this.db.batch([
        this.query(
          "DELETE FROM templateExercises WHERE exerciseId=?",
          c.exerciseId,
        ),
        this.query(
          "DELETE FROM routineExercises WHERE exerciseId=?",
          c.exerciseId,
        ),
        this.query("DELETE FROM goals WHERE exerciseId=?", c.exerciseId),
        this.query(
          "DELETE FROM exerciseOverrides WHERE exerciseId=?",
          c.exerciseId,
        ),
        this.query("UPDATE exercises SET enabled=0 WHERE id=?", c.exerciseId),
        this.query(
          "DELETE FROM workoutTemplates WHERE NOT EXISTS (SELECT 1 FROM templateExercises WHERE templateId=workoutTemplates.id)",
        ),
      ]);
      return;
    }
    if (c.action === "addExercise" || c.action === "importExercises") {
      const exercises = c.action === "addExercise" ? [c.exercise] : c.exercises;
      for (const e of exercises) {
        const id = e.id?.trim() || `custom-${crypto.randomUUID()}`;
        const existingById = await this.query(
          "SELECT id FROM exercises WHERE id=?",
          id,
        ).first<{ id: string }>();
        if (existingById) {
          if (c.action === "importExercises") {
            await this.query(
              "UPDATE exercises SET enabled=1 WHERE id=?",
              existingById.id,
            ).run();
            continue;
          }
          throw new Error(`Ya existe un ejercicio con id ${id}.`);
        }
        if (c.action === "importExercises") {
          const existingByName = await this.query(
            "SELECT id FROM exercises WHERE LOWER(TRIM(name))=LOWER(TRIM(?))",
            e.name,
          ).first<{ id: string }>();
          if (existingByName) {
            await this.query(
              "UPDATE exercises SET enabled=1 WHERE id=?",
              existingByName.id,
            ).run();
            continue;
          }
        }
        await this.insert("exercises", {
          ...e,
          id,
          ownerId: this.ownerId,
        }).run();
      }
      return;
    }
    if (c.action === "importWorkouts") {
      for (const imported of c.workouts) {
        if (
          await this.query(
            "SELECT id FROM workouts WHERE ownerId=? AND startedAt=? AND dayId=? AND templateName=?",
            this.ownerId,
            imported.startedAt,
            imported.dayId,
            imported.templateName,
          ).first()
        )
          continue;
        const workoutId = crypto.randomUUID();
        const statements: D1PreparedStatement[] = [];
        const rows: Array<{
          id: string;
          exerciseId: string;
          source: (typeof imported.exercises)[number];
        }> = [];
        for (const source of imported.exercises) {
          if (source.setsDone.some((set) => set.setNumber > source.sets))
            throw new Error(
              `La sesión importada contiene una serie fuera del objetivo de ${source.name}.`,
            );
          let exercise = await this.query(
            "SELECT id FROM exercises WHERE id=?",
            source.exerciseId,
          ).first<{ id: string }>();
          if (!exercise)
            exercise = await this.query(
              "SELECT id FROM exercises WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1",
              source.name,
            ).first<{ id: string }>();
          let exerciseId = exercise?.id;
          if (!exerciseId) {
            exerciseId = `imported-${crypto.randomUUID()}`;
            statements.push(
              this.insert("exercises", {
                id: exerciseId,
                name: source.name,
                shortName: source.name.slice(0, 80),
                type: source.bodyweightExercise ? "calisthenics" : "gym",
                movementPattern: "imported",
                primaryMuscles: "",
                secondaryMuscles: "",
                equipment: "",
                metricType: source.metricType,
                bodyweightExercise: source.bodyweightExercise,
                supportsAssistance: source.supportsAssistance,
                supportsAddedWeight: source.supportsAddedWeight,
                defaultRepMin: source.repMin,
                defaultRepMax: source.repMax,
                defaultRIR: source.rir,
                notes: "Importado desde una sesión",
                enabled: 1,
                ownerId: this.ownerId,
              }),
            );
          }
          rows.push({
            id: crypto.randomUUID(),
            exerciseId,
            source,
          });
        }
        statements.unshift(
          this.insert("workouts", {
            id: workoutId,
            ownerId: this.ownerId,
            dayId: imported.dayId,
            status: "completed",
            startedAt: imported.startedAt,
            finishedAt: imported.finishedAt ?? imported.startedAt,
            bodyweight: imported.bodyweight,
            notes: imported.notes,
            templateName: imported.templateName,
            ...(imported.isFreeDay ? { isFreeDay: 1 } : {}),
          }),
        );
        for (const [position, row] of rows.entries()) {
          const { source } = row;
          statements.push(
            this.insert("workoutExercises", {
              id: row.id,
              workoutId,
              dayId: imported.dayId,
              exerciseId: row.exerciseId,
              name: source.name,
              position,
              sets: source.sets,
              repMin: source.repMin,
              repMax: source.repMax,
              rir: source.rir,
              optional: source.optional,
              notes: source.notes,
              priority: source.priority,
              metricType: source.metricType,
              bodyweightExercise: source.bodyweightExercise,
              supportsAssistance: source.supportsAssistance,
              supportsAddedWeight: source.supportsAddedWeight,
              variant: source.variant,
            }),
          );
          for (const set of source.setsDone)
            statements.push(
              this.insert("workoutSets", {
                id: crypto.randomUUID(),
                workoutId,
                workoutExerciseId: row.id,
                exerciseId: row.exerciseId,
                setNumber: set.setNumber,
                reps: set.reps,
                weight: set.weight,
                bodyweight: imported.bodyweight,
                assistanceWeight: set.assistanceWeight,
                addedWeight: set.addedWeight,
                RIR: set.RIR,
                RPE: set.RPE ?? null,
                durationSeconds: set.durationSeconds,
                distance: set.distance ?? null,
                notes: set.notes,
                completed: 1,
                timestamp: set.timestamp ?? imported.startedAt,
              }),
            );
        }
        await this.db.batch(statements);
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
      const lib = await this.libraryExercise(c.exercise.exerciseId);
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
      const lib = await this.libraryExercise(c.exercise.exerciseId);
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
    if (c.action === "setExerciseLoadDecision") {
      const e = await this.query(
        "SELECT e.* FROM workoutExercises e JOIN workouts w ON w.id=e.workoutId WHERE e.id=? AND w.ownerId=?",
        c.workoutExerciseId,
        this.ownerId,
      ).first<WorkoutExercise>();
      if (!e) throw new Error("Ejercicio no encontrado.");
      await this.active(e.workoutId);
      const count = await this.query(
        "SELECT COUNT(*) count FROM workoutSets WHERE workoutExerciseId=? AND completed=1",
        e.id,
      ).first<{ count: number }>();
      if ((count?.count ?? 0) < e.sets)
        throw new Error("Completa todas las series antes de decidir la carga.");
      await this.query(
        "UPDATE workoutExercises SET nextLoadAction=? WHERE id=?",
        c.decision,
        e.id,
      ).run();
      return;
    }
    if (c.action === "deleteSet") {
      const set = await this.query(
        "SELECT s.id,w.status FROM workoutSets s JOIN workouts w ON w.id=s.workoutId WHERE s.id=? AND w.ownerId=?",
        c.setId,
        this.ownerId,
      ).first<{ id: string; status: string }>();
      if (!set) throw new Error("Serie no encontrada.");
      if (set.status !== "active")
        throw new Error("Solo puedes eliminar series de la sesión activa.");
      await this.db.batch([
        this.query(
          "UPDATE personalRecords SET setId=NULL WHERE ownerId=? AND setId=?",
          this.ownerId,
          c.setId,
        ),
        this.query("DELETE FROM workoutSets WHERE id=?", c.setId),
      ]);
      return;
    }
    if (c.action === "setWorkoutBodyweight") {
      const workout = await this.active(c.workoutId);
      const date = workout.startedAt.slice(0, 10);
      const existing = await this.query(
        "SELECT id FROM bodyWeights WHERE ownerId=? AND date=? ORDER BY rowid DESC LIMIT 1",
        this.ownerId,
        date,
      ).first<{ id: string }>();
      const statements = [
        this.query(
          "UPDATE workouts SET bodyweight=? WHERE id=? AND ownerId=?",
          c.weightKg,
          workout.id,
          this.ownerId,
        ),
        this.query(
          "UPDATE workoutSets SET bodyweight=? WHERE workoutId=?",
          c.weightKg,
          workout.id,
        ),
      ];
      statements.push(
        existing
          ? this.query(
              "UPDATE bodyWeights SET weightKg=? WHERE id=? AND ownerId=?",
              c.weightKg,
              existing.id,
              this.ownerId,
            )
          : this.insert("bodyWeights", {
              id: crypto.randomUUID(),
              ownerId: this.ownerId,
              date,
              weightKg: c.weightKg,
            }),
      );
      await this.db.batch(statements);
      return;
    }
    if (c.action === "finish") {
      if (c.name) {
        const workout = await this.query(
          "SELECT isFreeDay FROM workouts WHERE id=? AND ownerId=?",
          c.workoutId,
          this.ownerId,
        ).first<{ isFreeDay: number }>();
        if (workout?.isFreeDay !== 1)
          throw new Error("Solo los días libres pueden cambiar de nombre.");
      }
      // Conditional update makes retries harmless and never completes an empty session.
      await (
        c.name
          ? this.query(
              "UPDATE workouts SET status='completed',finishedAt=?,notes=?,templateName=? WHERE id=? AND ownerId=? AND status='active' AND EXISTS(SELECT 1 FROM workoutSets WHERE workoutId=workouts.id AND completed=1)",
              new Date().toISOString(),
              c.notes,
              c.name,
              c.workoutId,
              this.ownerId,
            )
          : this.query(
              "UPDATE workouts SET status='completed',finishedAt=?,notes=? WHERE id=? AND ownerId=? AND status='active' AND EXISTS(SELECT 1 FROM workoutSets WHERE workoutId=workouts.id AND completed=1)",
              new Date().toISOString(),
              c.notes,
              c.workoutId,
              this.ownerId,
            )
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
        this.query(
          "DELETE FROM externalActivities WHERE ownerId=?",
          this.ownerId,
        ),
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
