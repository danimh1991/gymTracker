"use client";
import { useEffect, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  CopyPlus,
  Edit3,
  Minus,
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
import {
  previousLoadDecision,
  previousSets,
  loadLabel,
  stats,
} from "../services/training";
import { SetEditor } from "./SetEditor";
import { closeOnBackdrop, useHistoryView } from "./navigation";
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
  const detailView = useHistoryView<string>(
      "training-exercise-detail",
      first?.id ?? exercises[0]?.id ?? "",
    ),
    setView = useHistoryView<number | null>("training-set-editor", null),
    sessionEditorView = useHistoryView<boolean>(
      "training-session-editor",
      false,
    ),
    exerciseEditorView = useHistoryView<string>("training-exercise-editor", ""),
    restView = useHistoryView<number | null>("training-rest-timer", null),
    deleteSetView = useHistoryView<string>("training-set-delete", ""),
    loadDecisionView = useHistoryView<string>("training-load-decision", ""),
    confirmView = useHistoryView<"" | "finish" | "cancel">(
      "training-confirm",
      "",
    ),
    open = detailView.value,
    editing = setView.value,
    editSession = sessionEditorView.value,
    editingExercise = exerciseEditorView.value;
  const [clone, setClone] = useState<WorkoutSet | null>(null),
    [newExercise, setNewExercise] = useState(data.exercises[0]?.id ?? ""),
    [copy, setCopy] = useState(false),
    [copyVersion, setCopyVersion] = useState(0),
    [seconds, setSeconds] = useState(150),
    [autoRest, setAutoRest] = useState(true),
    [now, setNow] = useState(() => Date.now()),
    [bodyweightDraft, setBodyweightDraft] = useState(
      String(workout.bodyweight ?? data.bodyWeights[0]?.weightKg ?? ""),
    ),
    [freeDayName, setFreeDayName] = useState(
      workout.isFreeDay && workout.templateName !== "Día libre"
        ? workout.templateName
        : "",
    ),
    [notes, setNotes] = useState("");
  const end = restView.value;
  const pendingSetDelete =
    sets.find((set) => set.id === deleteSetView.value) ?? null;
  const pendingLoadDecision =
    exercises.find((exercise) => exercise.id === loadDecisionView.value) ??
    null;
  const confirm =
    confirmView.value === "finish" || confirmView.value === "cancel"
      ? confirmView.value
      : null;
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
            {workout.isFreeDay ? "Día libre" : `Día ${workout.dayId}`}
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
            onClick={() =>
              editSession
                ? sessionEditorView.close()
                : sessionEditorView.open(true)
            }
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
            prev = previousSets(data, e.exerciseId, workout.startedAt),
            previousDecision = previousLoadDecision(
              data,
              e.exerciseId,
              workout.startedAt,
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
                    if (open === e.id) {
                      if (detailView.active) detailView.close();
                      else detailView.open("");
                    } else detailView.open(e.id);
                    if (editing !== null) setView.replace(null);
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
                    if (open !== e.id) detailView.open(e.id);
                    if (editing !== null) setView.replace(null);
                    if (editingExercise === e.id) exerciseEditorView.close();
                    else exerciseEditorView.open(e.id);
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
                        if (editingExercise === e.id)
                          exerciseEditorView.close();
                        else if (editSession) sessionEditorView.close();
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
                  {previousDecision && (
                    <div className={`load-reminder ${previousDecision}`}>
                      {previousDecision === "increase" ? (
                        <ArrowUp size={18} />
                      ) : (
                        <Minus size={18} />
                      )}
                      <div>
                        <span>INDICACIÓN DE LA ÚLTIMA VEZ</span>
                        <strong>
                          {previousDecision === "increase"
                            ? "Hoy toca subir peso"
                            : "Hoy toca mantener el peso"}
                        </strong>
                      </div>
                    </div>
                  )}
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
                            onClick={() => setView.open(s.setNumber)}
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
                                setView.open(
                                  Array.from(
                                    { length: e.sets },
                                    (_, index) => index + 1,
                                  ).find(
                                    (number) =>
                                      !done.some(
                                        (row) => row.setNumber === number,
                                      ),
                                  ) ?? null,
                                );
                                setCopyVersion((v) => v + 1);
                              }}
                            >
                              <CopyPlus size={16} />
                              Clonar
                            </button>
                          )}
                          <button
                            type="button"
                            className="delete-set"
                            aria-label={`Eliminar serie ${s.setNumber}`}
                            title="Eliminar serie"
                            disabled={busy}
                            onClick={() => deleteSetView.open(s.id)}
                          >
                            <Trash2 size={15} />
                          </button>
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
                        if (setView.active) setView.close();
                        setClone(null);
                        if (autoRest)
                          restView.open(Date.now() + seconds * 1000);
                        const current = updated.sets.filter(
                          (s) => s.workoutExerciseId === e.id,
                        );
                        if (current.length === e.sets) {
                          loadDecisionView.open(e.id);
                        }
                        return true;
                      }}
                    />
                  ) : (
                    <div className="completed-exercise">
                      <p className="success-line">
                        <Check size={18} /> Ejercicio completado. Puedes editar
                        una serie pulsándola.
                      </p>
                      {e.nextLoadAction ? (
                        <p className="load-decision-saved">
                          Próxima vez:{" "}
                          {e.nextLoadAction === "increase"
                            ? "subir peso"
                            : "mantener peso"}
                          .
                        </p>
                      ) : (
                        <button
                          type="button"
                          className="secondary compact"
                          onClick={() => loadDecisionView.open(e.id)}
                        >
                          Elegir peso para la próxima vez
                        </button>
                      )}
                    </div>
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
          onClick={() => confirmView.open("cancel")}
        >
          Abandonar sesión
        </button>
        <button
          className="primary"
          disabled={busy || !sets.length}
          onClick={() => confirmView.open("finish")}
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
          <button aria-label="Cerrar temporizador" onClick={restView.close}>
            <X size={20} />
          </button>
        </aside>
      )}
      {pendingSetDelete && (
        <div
          className="modal-backdrop"
          onClick={(event) => closeOnBackdrop(event, deleteSetView.close)}
        >
          <section className="modal" role="dialog" aria-modal="true">
            <h2>¿Eliminar la serie {pendingSetDelete.setNumber}?</h2>
            <p>La serie guardada se eliminará de este entrenamiento.</p>
            <div className="button-row">
              <button className="secondary" onClick={deleteSetView.close}>
                Cancelar
              </button>
              <button
                className="danger-button"
                disabled={busy}
                onClick={async () => {
                  const updated = await execute({
                    action: "deleteSet",
                    setId: pendingSetDelete.id,
                  });
                  if (updated) {
                    deleteSetView.close();
                    setClone(null);
                  }
                }}
              >
                <Trash2 size={16} /> Eliminar serie
              </button>
            </div>
          </section>
        </div>
      )}
      {pendingLoadDecision && (
        <div className="modal-backdrop">
          <section
            className="modal load-decision-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="load-decision-title"
          >
            <p className="eyebrow">EJERCICIO COMPLETADO</p>
            <h2 id="load-decision-title">{pendingLoadDecision.name}</h2>
            <p>¿Qué quieres hacer con el peso la próxima vez?</p>
            <div className="load-decision-actions">
              {(
                [
                  ["increase", "Subir peso", ArrowUp],
                  ["maintain", "Mantener peso", Minus],
                ] as const
              ).map(([decision, label, Icon]) => (
                <button
                  type="button"
                  className={decision === "increase" ? "primary" : "secondary"}
                  disabled={busy}
                  key={decision}
                  onClick={async () => {
                    const updated = await execute({
                      action: "setExerciseLoadDecision",
                      workoutExerciseId: pendingLoadDecision.id,
                      decision,
                    });
                    if (!updated) return;
                    loadDecisionView.replace("");
                    const following = exercises.find(
                      (exercise) =>
                        exercise.position > pendingLoadDecision.position &&
                        updated.sets.filter(
                          (set) => set.workoutExerciseId === exercise.id,
                        ).length < exercise.sets,
                    );
                    if (following) detailView.open(following.id);
                  }}
                >
                  <Icon size={18} /> {label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {confirm && (
        <div
          className="modal-backdrop"
          onClick={(event) => closeOnBackdrop(event, confirmView.close)}
        >
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
              <>
                {workout.isFreeDay === 1 && (
                  <label className="field">
                    Nombre del día libre
                    <input
                      maxLength={100}
                      placeholder="Ej. Día full abdominales"
                      value={freeDayName}
                      onChange={(event) => setFreeDayName(event.target.value)}
                    />
                    <small className="muted">
                      Si lo dejas vacío se guardará como “Día libre”.
                    </small>
                  </label>
                )}
                <label className="field">
                  <span>
                    <Scale size={17} /> Peso corporal de hoy (kg)
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="20"
                    max="400"
                    step="0.1"
                    value={bodyweightDraft}
                    onChange={(event) => setBodyweightDraft(event.target.value)}
                  />
                  <small className="muted">
                    Puedes dejarlo vacío si hoy no quieres registrarlo.
                  </small>
                </label>
                <label className="field">
                  Notas de la sesión
                  <textarea
                    maxLength={4000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </>
            )}
            <div className="button-row">
              <button
                className="secondary"
                disabled={busy}
                onClick={confirmView.close}
              >
                Seguir entrenando
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  (confirm === "finish" &&
                    bodyweightDraft !== "" &&
                    (Number(bodyweightDraft) < 20 ||
                      Number(bodyweightDraft) > 400))
                }
                onClick={async () => {
                  if (confirm === "finish" && bodyweightDraft !== "") {
                    const weightUpdated = await execute({
                      action: "setWorkoutBodyweight",
                      workoutId: workout.id,
                      weightKg: Number(bodyweightDraft),
                    });
                    if (!weightUpdated) return;
                  }
                  const updated = await execute(
                    confirm === "finish"
                      ? {
                          action: "finish",
                          workoutId: workout.id,
                          notes,
                          name: workout.isFreeDay
                            ? freeDayName.trim() || "Día libre"
                            : undefined,
                        }
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
