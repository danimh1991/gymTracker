"use client";
import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  CopyPlus,
  Edit3,
  Plus,
  Save,
  Scale,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import type {
  Snapshot,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "../domain/types";
import type { Command } from "../services/validation";
import { previousSets, loadLabel, stats } from "../services/training";
import { SetEditor } from "./SetEditor";
export type Execute = (command: Command) => Promise<Snapshot | null>;

function WorkoutExerciseEditor({
  data,
  exercise,
  doneCount,
  busy,
  execute,
  onClose,
}: {
  data: Snapshot;
  exercise: WorkoutExercise;
  doneCount: number;
  busy: boolean;
  execute: Execute;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    exerciseId: exercise.exerciseId,
    sets: String(exercise.sets),
    repMin: String(exercise.repMin),
    repMax: String(exercise.repMax),
    rir: exercise.rir,
  });
  const sets = Number(draft.sets),
    repMin = Number(draft.repMin),
    repMax = Number(draft.repMax),
    invalid =
      !draft.sets ||
      !draft.repMin ||
      !draft.repMax ||
      !draft.rir.trim() ||
      sets < Math.max(1, doneCount) ||
      repMin < 0 ||
      repMax < repMin;
  return (
    <div className="active-exercise-editor">
      <label>
        Ejercicio
        <select
          value={draft.exerciseId}
          onChange={(event) =>
            setDraft({ ...draft, exerciseId: event.target.value })
          }
        >
          {data.exercises
            .filter((item) => item.enabled)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Series
        <input
          type="number"
          min={Math.max(1, doneCount)}
          max="30"
          value={draft.sets}
          onChange={(event) => setDraft({ ...draft, sets: event.target.value })}
        />
      </label>
      <label>
        Mín.
        <input
          type="number"
          min="0"
          max="1000"
          value={draft.repMin}
          onChange={(event) =>
            setDraft({ ...draft, repMin: event.target.value })
          }
        />
      </label>
      <label>
        Máx.
        <input
          type="number"
          min={Math.max(0, repMin)}
          max="1000"
          value={draft.repMax}
          onChange={(event) =>
            setDraft({ ...draft, repMax: event.target.value })
          }
        />
      </label>
      <label>
        RIR
        <input
          maxLength={20}
          value={draft.rir}
          onChange={(event) => setDraft({ ...draft, rir: event.target.value })}
        />
      </label>
      <div className="exercise-edit-actions">
        <button
          type="button"
          className="secondary compact"
          disabled={busy || invalid}
          onClick={async () => {
            const result = await execute({
              action: "updateWorkoutExercise",
              workoutExerciseId: exercise.id,
              exercise: {
                exerciseId: draft.exerciseId,
                sets,
                repMin,
                repMax,
                rir: draft.rir,
                optional: exercise.optional,
                notes: exercise.notes,
                priority: exercise.priority,
              },
            });
            if (result) onClose();
          }}
        >
          <Save size={16} /> Guardar
        </button>
        <button
          type="button"
          className="icon-button danger"
          disabled={busy || doneCount > 0}
          title="Quitar ejercicio"
          onClick={() =>
            void execute({
              action: "removeWorkoutExercise",
              workoutExerciseId: exercise.id,
            })
          }
        >
          <Trash2 size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar edición"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
    </div>
  );
}

export function Training({
  data,
  workout,
  busy,
  execute,
  onFinished,
}: {
  data: Snapshot;
  workout: Workout;
  busy: boolean;
  execute: Execute;
  onFinished: (id: string) => void;
}) {
  const exercises = data.workoutExercises
      .filter((e) => e.workoutId === workout.id)
      .sort((a, b) => a.position - b.position),
    sets = data.sets.filter((s) => s.workoutId === workout.id),
    first = exercises.find(
      (e) => sets.filter((s) => s.workoutExerciseId === e.id).length < e.sets,
    );
  const [open, setOpen] = useState(first?.id ?? exercises[0].id),
    [editing, setEditing] = useState<number | null>(null),
    [clone, setClone] = useState<WorkoutSet | null>(null),
    [editSession, setEditSession] = useState(false),
    [editingExercise, setEditingExercise] = useState(""),
    [newExercise, setNewExercise] = useState(data.exercises[0]?.id ?? ""),
    [copy, setCopy] = useState(false),
    [copyVersion, setCopyVersion] = useState(0),
    [seconds, setSeconds] = useState(150),
    [autoRest, setAutoRest] = useState(true),
    [end, setEnd] = useState<number | null>(null),
    [now, setNow] = useState(() => Date.now()),
    [confirm, setConfirm] = useState<"finish" | "cancel" | null>(null),
    [bodyweightPrompt, setBodyweightPrompt] = useState(false),
    [bodyweightHandled, setBodyweightHandled] = useState(false),
    [bodyweightDraft, setBodyweightDraft] = useState(
      String(workout.bodyweight ?? data.bodyWeights[0]?.weightKg ?? ""),
    ),
    [notes, setNotes] = useState("");
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const remaining = end ? Math.max(0, Math.ceil((end - now) / 1000)) : 0,
    total = exercises.reduce((n, e) => n + e.sets, 0),
    summary = stats(sets);
  const copyPrevious = () => {
    setCopy(true);
    setCopyVersion((v) => v + 1);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ENTRENAMIENTO EN CURSO</p>
          <h1>
            Día {workout.dayId}
            <span className="muted"> / A tu ritmo</span>
          </h1>
          <p className="muted">
            {Math.floor((now - Date.parse(workout.startedAt)) / 60000)} min ·{" "}
            {summary.sets} de {total} series guardadas
            {workout.bodyweight
              ? ` · ${workout.bodyweight} kg de peso corporal`
              : ""}
          </p>
        </div>
        <div className="button-row">
          <button
            className="secondary"
            onClick={() => setEditSession(!editSession)}
            disabled={busy}
          >
            <Edit3 size={17} />
            {editSession ? "Cerrar edición" : "Editar sesión"}
          </button>
          <button className="secondary" onClick={copyPrevious} disabled={busy}>
            <Copy size={17} />
            {copy
              ? "Cargas anteriores precargadas"
              : "Copiar entrenamiento anterior"}
          </button>
        </div>
      </div>
      <progress
        aria-label="Series completadas"
        value={summary.sets}
        max={total}
      />
      {copy && (
        <p className="notice">
          Solo se copian pesos, lastres y asistencias de cada serie.
          Repeticiones y RIR quedan vacíos en las series nuevas.
        </p>
      )}
      <div className="rest-controls">
        <Timer size={18} />
        <label>
          <input
            type="checkbox"
            checked={autoRest}
            onChange={(e) => setAutoRest(e.target.checked)}
          />{" "}
          Descanso automático
        </label>
        <select
          aria-label="Duración del descanso"
          value={seconds}
          onChange={(e) => setSeconds(Number(e.target.value))}
        >
          {[60, 90, 120, 150, 180, 210].map((s) => (
            <option key={s} value={s}>
              {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
            </option>
          ))}
        </select>
        <span className="small muted">Dominadas y fondos: 2:30–3:00</span>
      </div>
      <div className="training-list">
        {editSession && (
          <div className="session-editor">
            <p>
              Puedes sustituir ejercicios y cambiar objetivos. Los ejercicios
              con series guardadas se pueden ajustar, pero no quitar.
            </p>
            <div className="inline-add">
              <select
                value={newExercise}
                onChange={(e) => setNewExercise(e.target.value)}
              >
                {data.exercises.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                className="secondary"
                onClick={() =>
                  void execute({
                    action: "addWorkoutExercise",
                    workoutId: workout.id,
                    exercise: {
                      exerciseId: newExercise,
                      sets: 3,
                      repMin: 8,
                      repMax: 12,
                      rir: "1–2",
                      optional: 0,
                      notes: "",
                      priority: "Accesorio",
                    },
                  })
                }
              >
                <Plus size={17} />
                Añadir a la sesión
              </button>
            </div>
          </div>
        )}
        {exercises.map((e, i) => {
          const done = sets
              .filter((s) => s.workoutExerciseId === e.id)
              .sort((a, b) => a.setNumber - b.setNumber),
            prev = previousSets(
              data,
              e.exerciseId,
              workout.startedAt,
              workout.dayId,
            ),
            next =
              editing && open === e.id
                ? editing
                : Array.from({ length: e.sets }, (_, i) => i + 1).find(
                    (n) => !done.some((s) => s.setNumber === n),
                  ),
            library = data.exercises.find((x) => x.id === e.exerciseId);
          return (
            <section
              className={`training-card ${open === e.id ? "expanded" : ""}`}
              key={e.id}
            >
              <div className="training-card-header">
                <button
                  className="exercise-toggle"
                  onClick={() => {
                    setOpen(open === e.id ? "" : e.id);
                    setEditing(null);
                  }}
                >
                  <span className="exercise-index">
                    {done.length === e.sets ? (
                      <Check size={20} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <div>
                    <h2>{e.name}</h2>
                    <p>
                      {e.sets} × {e.repMin}–{e.repMax}{" "}
                      {e.metricType === "time" ? "s" : "reps"} ·{" "}
                      {e.rir === "Técnica" ? "Técnica" : `RIR ${e.rir}`}{" "}
                      {e.optional ? "· Opcional" : ""}
                    </p>
                  </div>
                  <span className="set-count">
                    {done.length}/{e.sets}
                  </span>
                  <ChevronDown size={20} />
                </button>
                <button
                  type="button"
                  className={`exercise-edit-shortcut ${editingExercise === e.id ? "active" : ""}`}
                  aria-label={`Editar ${e.name}`}
                  title="Editar este ejercicio"
                  onClick={() => {
                    setOpen(e.id);
                    setEditing(null);
                    setEditingExercise(editingExercise === e.id ? "" : e.id);
                  }}
                >
                  <Edit3 size={17} />
                  <span>Editar</span>
                </button>
              </div>
              {open === e.id && (
                <div className="exercise-body">
                  {(editSession || editingExercise === e.id) && (
                    <WorkoutExerciseEditor
                      key={`${e.id}:${e.exerciseId}:${e.sets}:${e.repMin}:${e.repMax}:${e.rir}`}
                      data={data}
                      exercise={e}
                      doneCount={done.length}
                      busy={busy}
                      execute={execute}
                      onClose={() => {
                        setEditingExercise("");
                        if (editSession) setEditSession(false);
                      }}
                    />
                  )}
                  {(e.notes || library?.notes) && (
                    <p className="technique">
                      {library?.notes} {e.notes}
                    </p>
                  )}
                  <div className="reference">
                    <span>ÚLTIMA VEZ</span>
                    <strong>
                      {prev.length
                        ? prev
                            .map(
                              (s) =>
                                `${s.reps ?? `${s.durationSeconds}s`} · ${loadLabel(s, !!e.bodyweightExercise)}`,
                            )
                            .join(" / ")
                        : "Aún sin registros"}
                    </strong>
                  </div>
                  {["handstand", "pushup-hard"].includes(e.exerciseId) && (
                    <label className="field">
                      Variante
                      <select
                        value={e.variant || "Normales"}
                        disabled={busy || done.length > 0}
                        onChange={(ev) =>
                          void execute({
                            action: "variant",
                            workoutExerciseId: e.id,
                            variant: ev.target.value,
                            metricType:
                              e.exerciseId === "handstand" &&
                              ev.target.value !== "Pike técnico"
                                ? "time"
                                : "reps",
                          })
                        }
                      >
                        {(e.exerciseId === "handstand"
                          ? [
                              "Pike técnico",
                              "Wall handstand",
                              "Facing wall",
                              "Kick-up",
                              "Free handstand",
                            ]
                          : [
                              "Normales",
                              "Pies elevados",
                              "Diamante",
                              "Pseudo planche",
                              "Lastradas",
                            ]
                        ).map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {done.length > 0 && (
                    <div className="saved-sets">
                      {done.map((s) => (
                        <div
                          className={`saved-set-wrap ${s.RIR === 0 ? "failure-row" : ""}`}
                          key={s.id}
                        >
                          <button
                            disabled={busy}
                            onClick={() => setEditing(s.setNumber)}
                          >
                            <Check size={15} />
                            <span>Serie {s.setNumber}</span>
                            <strong>
                              {s.reps ?? `${s.durationSeconds} s`}
                            </strong>
                            <span>{loadLabel(s, !!e.bodyweightExercise)}</span>
                            <span>
                              {s.RIR === 0 ? "Fallo" : `RIR ${s.RIR ?? "—"}`}
                            </span>
                            <small>Editar</small>
                          </button>
                          {done.length < e.sets && (
                            <button
                              className="clone-set"
                              title="Clonar en la siguiente serie"
                              onClick={() => {
                                setClone(s);
                                setEditing(done.length + 1);
                                setCopyVersion((v) => v + 1);
                              }}
                            >
                              <CopyPlus size={16} />
                              Clonar
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {next ? (
                    <SetEditor
                      key={`${e.id}:${next}:${e.metricType}:${copyVersion}`}
                      exercise={e}
                      number={next}
                      previous={prev.find((s) => s.setNumber === next)}
                      copied={
                        copy
                          ? prev.find((s) => s.setNumber === next)
                          : undefined
                      }
                      clone={clone ?? undefined}
                      lastSaved={done[done.length - 1]}
                      saved={done.find((s) => s.setNumber === next)}
                      busy={busy}
                      onSave={async (set) => {
                        const updated = await execute({
                          action: "saveSet",
                          set,
                        });
                        if (!updated) return false;
                        setEditing(null);
                        setClone(null);
                        if (autoRest) setEnd(Date.now() + seconds * 1000);
                        const current = updated.sets.filter(
                          (s) => s.workoutExerciseId === e.id,
                        );
                        if (current.length === e.sets) {
                          if (!bodyweightHandled) setBodyweightPrompt(true);
                          const following = exercises.find(
                            (x) =>
                              x.position > e.position &&
                              updated.sets.filter(
                                (s) => s.workoutExerciseId === x.id,
                              ).length < x.sets,
                          );
                          if (following) setOpen(following.id);
                        }
                        return true;
                      }}
                    />
                  ) : (
                    <p className="success-line">
                      <Check size={18} /> Ejercicio completado. Puedes editar
                      una serie pulsándola.
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="finish-actions">
        <button
          className="secondary danger"
          disabled={busy}
          onClick={() => setConfirm("cancel")}
        >
          Abandonar sesión
        </button>
        <button
          className="primary"
          disabled={busy || !sets.length}
          onClick={() => setConfirm("finish")}
        >
          <Check size={19} /> Terminar entrenamiento
        </button>
      </div>
      {end !== null && (
        <aside className="rest-toast" role="status">
          <Timer size={20} />
          <div>
            <strong>
              {remaining
                ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                : "Descanso terminado"}
            </strong>
            <span>
              {remaining
                ? "Descansa. La siguiente serie te espera."
                : "Continúa cuando estés preparado."}
            </span>
          </div>
          <button aria-label="Cerrar temporizador" onClick={() => setEnd(null)}>
            <X size={20} />
          </button>
        </aside>
      )}
      {bodyweightPrompt && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="bodyweight-title"
            className="modal"
          >
            <h2 id="bodyweight-title">
              <Scale size={21} /> Peso corporal de hoy
            </h2>
            <p>
              Has terminado un ejercicio. Registra el peso de esta sesión para
              que las cargas relativas queden completas.
            </p>
            <label className="field">
              Peso (kg)
              <input
                type="number"
                inputMode="decimal"
                min="20"
                max="400"
                step="0.1"
                value={bodyweightDraft}
                onChange={(event) => setBodyweightDraft(event.target.value)}
              />
            </label>
            {data.bodyWeights[0] && (
              <button
                type="button"
                className="secondary compact"
                onClick={() =>
                  setBodyweightDraft(String(data.bodyWeights[0].weightKg))
                }
              >
                <Copy size={16} /> Copiar último: {data.bodyWeights[0].weightKg}{" "}
                kg
              </button>
            )}
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setBodyweightPrompt(false);
                  setBodyweightHandled(true);
                }}
              >
                Ahora no
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  busy ||
                  !bodyweightDraft ||
                  Number(bodyweightDraft) < 20 ||
                  Number(bodyweightDraft) > 400
                }
                onClick={async () => {
                  const updated = await execute({
                    action: "setWorkoutBodyweight",
                    workoutId: workout.id,
                    weightKg: Number(bodyweightDraft),
                  });
                  if (updated) {
                    setBodyweightPrompt(false);
                    setBodyweightHandled(true);
                  }
                }}
              >
                Guardar peso
              </button>
            </div>
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="modal"
          >
            <h2 id="confirm-title">
              {confirm === "finish"
                ? "¿Terminar entrenamiento?"
                : "¿Abandonar la sesión?"}
            </h2>
            <p>
              {confirm === "finish"
                ? `${summary.sets} de ${total} series guardadas. ${summary.sets < total ? "Las series pendientes no contarán como realizadas." : ""}`
                : "La sesión quedará cancelada y la secuencia no avanzará. Sus datos se conservarán en el backup."}
            </p>
            {confirm === "finish" && (
              <label className="field">
                Notas de la sesión
                <textarea
                  maxLength={4000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            )}
            <div className="button-row">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Seguir entrenando
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  const updated = await execute(
                    confirm === "finish"
                      ? { action: "finish", workoutId: workout.id, notes }
                      : { action: "cancel", workoutId: workout.id },
                  );
                  if (updated)
                    onFinished(confirm === "finish" ? workout.id : "");
                }}
              >
                {busy
                  ? "Guardando…"
                  : confirm === "finish"
                    ? "Guardar y terminar"
                    : "Abandonar"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
