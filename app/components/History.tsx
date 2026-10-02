"use client";
import { useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Dumbbell,
  Mountain,
  Pencil,
  Save,
  Route,
  Trash2,
  Trophy,
  Upload,
  Waves,
  X,
} from "lucide-react";
import type { Snapshot, Workout } from "../domain/types";
import { sportDefinition } from "../domain/sports";
import {
  completedWorkouts,
  stats,
  loadLabel,
  previousSets,
  evaluatePullupProgression,
  evaluateDipProgression,
  evaluateDoubleProgression,
} from "../services/training";
import { dateLabel } from "./Home";
import type { Execute } from "./Training";
import { downloadJson, workoutBackup } from "../services/export";
export function WorkoutDetail({
  data,
  workout,
  celebrate = false,
}: {
  data: Snapshot;
  workout: Workout;
  celebrate?: boolean;
}) {
  const rows = data.workoutExercises.filter((e) => e.workoutId === workout.id),
    sets = data.sets.filter((s) => s.workoutId === workout.id),
    summary = stats(sets),
    duration = Math.max(
      0,
      Math.round(
        (Date.parse(workout.finishedAt ?? workout.startedAt) -
          Date.parse(workout.startedAt)) /
          60000,
      ),
    );
  return (
    <div className="workout-detail">
      {celebrate && (
        <div className="completion-title">
          <span>
            <Check size={30} />
          </span>
          <p className="eyebrow">ENTRENAMIENTO COMPLETADO</p>
          <h1>Un paso más.</h1>
          <p>
            Día {workout.dayId} · {dateLabel(workout.startedAt)}
          </p>
        </div>
      )}
      <div className="stats-grid">
        <div>
          <strong>
            {duration}
            <small> min</small>
          </strong>
          <span>Duración</span>
        </div>
        <div>
          <strong>{summary.sets}</strong>
          <span>Series guardadas</span>
        </div>
        <div>
          <strong>{summary.reps}</strong>
          <span>Repeticiones</span>
        </div>
        <div>
          <strong>
            {summary.failure}
            <small>%</small>
          </strong>
          <span>Series al fallo</span>
        </div>
      </div>
      <p className="muted small">
        {
          rows.filter(
            (e) =>
              sets.filter((s) => s.workoutExerciseId === e.id).length ===
              e.sets,
          ).length
        }
        /{rows.length} ejercicios completos.{" "}
        {summary.unknownRIR > 0
          ? `${summary.unknownRIR} series sin RIR registrado; el porcentaje usa todas las series.`
          : ""}
      </p>
      {rows.map((e) => {
        const current = sets.filter((s) => s.workoutExerciseId === e.id),
          prev = previousSets(
            data,
            e.exerciseId,
            workout.startedAt,
            workout.dayId,
          ),
          delta = stats(current).reps - stats(prev).reps,
          recommendation =
            e.exerciseId === "pullup"
              ? evaluatePullupProgression(current, e.repMax)
              : e.exerciseId === "dip"
                ? evaluateDipProgression(current)
                : evaluateDoubleProgression(
                      current,
                      e,
                      e.metricType === "time" ? "durationSeconds" : "reps",
                    )
                  ? "Objetivo completado. Considera aumentar la dificultad o el peso en la próxima sesión."
                  : null;
        return (
          <section className="history-exercise" key={e.id}>
            <div className="section-title">
              <h3>{e.name}</h3>
              {prev.length > 0 &&
                current.length > 0 &&
                e.metricType === "reps" && (
                  <span className={delta > 0 ? "improvement" : "small muted"}>
                    {delta > 0 ? "+" : ""}
                    {delta} reps vs. último Día {workout.dayId}
                  </span>
                )}
            </div>
            <p className="muted small">
              {e.variant ? `${e.variant} · ` : ""}Anterior:{" "}
              {prev.length
                ? prev.map((s) => s.reps ?? `${s.durationSeconds}s`).join(" / ")
                : "Sin referencia"}
            </p>
            {current.length ? (
              <div className="history-sets">
                {current.map((s) => (
                  <div key={s.id}>
                    <span>Serie {s.setNumber}</span>
                    <strong>{s.reps ?? `${s.durationSeconds} s`}</strong>
                    <span>{loadLabel(s, !!e.bodyweightExercise)}</span>
                    <span className={s.RIR === 0 ? "failure-text" : ""}>
                      {s.RIR === 0 ? "RIR 0 · Fallo" : `RIR ${s.RIR ?? "—"}`}
                    </span>
                    {s.notes && <p>{s.notes}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                Sin series registradas{e.optional ? " · opcional" : ""}.
              </p>
            )}
            {recommendation && (
              <p className="progression-note">
                <Trophy size={18} />
                {recommendation}
              </p>
            )}
          </section>
        );
      })}
      {workout.notes && <p className="notice">{workout.notes}</p>}
    </div>
  );
}
const localDateKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");

const monthLabel = (date: Date) => {
  const label = date.toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const intensityLabel = {
  easy: "Suave",
  moderate: "Moderada",
  hard: "Intensa",
} as const;

export function History({
  data,
  busy,
  execute,
}: {
  data: Snapshot;
  busy: boolean;
  execute: Execute;
}) {
  const completed = completedWorkouts(data);
  const activityDates = [
    ...completed.map((workout) => localDateKey(workout.startedAt)),
    ...data.externalActivities.map((activity) => activity.date),
  ].sort((a, b) => b.localeCompare(a));
  const initialDate =
    activityDates[0] ?? new Date().toLocaleDateString("sv-SE");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [open, setOpen] = useState("");
  const [editingWorkout, setEditingWorkout] = useState("");
  const [workoutDate, setWorkoutDate] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Workout | null>(null);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const calendarOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const monthCells = [
    ...Array.from({ length: calendarOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const selectedWorkouts = completed.filter(
    (workout) => localDateKey(workout.startedAt) === selectedDate,
  );
  const selectedActivities = data.externalActivities.filter(
    (activity) => activity.date === selectedDate,
  );
  const moveMonth = (delta: number) => {
    const next = new Date(year, monthNumber - 1 + delta, 1);
    setMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  };
  const importWorkouts = async (file: File | undefined) => {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      const workouts = Array.isArray(value) ? value : value.workouts;
      if (!Array.isArray(workouts))
        throw new Error("El JSON no contiene una lista válida de sesiones.");
      await execute({ action: "importWorkouts", workouts });
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "No se pudo leer el archivo.",
      );
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CADA SESIÓN CUENTA</p>
          <h1>Tu histórico.</h1>
          <p className="muted">Gimnasio y deporte, día a día.</p>
        </div>
        <CalendarDays size={30} />
      </div>
      <div className="history-transfer-actions">
        <button
          type="button"
          className="secondary"
          disabled={!completed.length}
          onClick={() =>
            downloadJson("gym-tracker-sesiones.json", workoutBackup(data))
          }
        >
          <Download size={17} /> Exportar sesiones
        </button>
        <label className="secondary file-button">
          <Upload size={17} /> Importar sesiones
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importWorkouts(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <span className="small muted">
          Las sesiones ya existentes se omiten automáticamente.
        </span>
      </div>
      <section className="activity-calendar">
        <div className="calendar-toolbar">
          <button
            className="icon-button"
            aria-label="Mes anterior"
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft size={19} />
          </button>
          <h2>{monthLabel(firstDay)}</h2>
          <button
            className="icon-button"
            aria-label="Mes siguiente"
            onClick={() => moveMonth(1)}
          >
            <ChevronRight size={19} />
          </button>
        </div>
        <div className="calendar-weekdays">
          {["L", "M", "X", "J", "V", "S", "D"].map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {monthCells.map((dayNumber, index) => {
            if (dayNumber === null)
              return <span className="calendar-empty" key={`empty-${index}`} />;
            const key = `${month}-${String(dayNumber).padStart(2, "0")}`;
            const hasWorkout = completed.some(
              (workout) => localDateKey(workout.startedAt) === key,
            );
            const hasSport = data.externalActivities.some(
              (activity) => activity.date === key,
            );
            return (
              <button
                key={key}
                className={
                  selectedDate === key
                    ? "calendar-day selected"
                    : "calendar-day"
                }
                aria-label={`${dayNumber}${hasWorkout ? ", entrenamiento" : ""}${hasSport ? ", deporte" : ""}`}
                onClick={() => {
                  setSelectedDate(key);
                  setOpen("");
                }}
              >
                <span>{dayNumber}</span>
                <span className="calendar-markers">
                  {hasWorkout && <i className="workout-marker" />}
                  {hasSport && <i className="sport-marker" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="calendar-legend">
          <span>
            <i className="workout-marker" /> Gimnasio
          </span>
          <span>
            <i className="sport-marker" /> Otro deporte
          </span>
        </div>
      </section>

      <div className="history-day-heading">
        <div>
          <p className="eyebrow">ACTIVIDAD DEL DÍA</p>
          <h2>{dateLabel(`${selectedDate}T12:00:00`)}</h2>
        </div>
        <span className="tag">
          {selectedWorkouts.length + selectedActivities.length}{" "}
          {selectedWorkouts.length + selectedActivities.length === 1
            ? "actividad"
            : "actividades"}
        </span>
      </div>

      {selectedActivities.map((activity) => {
        const sport = sportDefinition(activity.sport);
        return (
          <article className="external-history-card" key={activity.id}>
            <span className="sport-emoji" aria-hidden="true">
              {sport.emoji}
            </span>
            <div className="external-history-main">
              <div className="section-title">
                <div>
                  <span className="tag sport-tag">DEPORTE</span>
                  <h2>{sport.name}</h2>
                </div>
                <button
                  className="delete-activity"
                  aria-label={`Eliminar ${sport.name}`}
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`¿Eliminar la actividad “${sport.name}”?`))
                      void execute({
                        action: "deleteExternalActivity",
                        activityId: activity.id,
                      });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="external-metrics">
                <span>
                  <Clock3 size={16} />
                  <strong>{activity.durationMinutes}</strong> min
                </span>
                {activity.distanceKm !== null && (
                  <span>
                    <Route size={16} />
                    <strong>{activity.distanceKm}</strong> km
                  </span>
                )}
                {activity.laps !== null && (
                  <span>
                    <Waves size={16} />
                    <strong>{activity.laps}</strong> largos
                  </span>
                )}
                {activity.elevationGainM !== null && (
                  <span>
                    <Mountain size={16} />
                    <strong>{activity.elevationGainM}</strong> m+
                  </span>
                )}
                <span className={`intensity ${activity.intensity}`}>
                  {intensityLabel[activity.intensity]}
                </span>
              </div>
              {activity.notes && (
                <p className="muted small">{activity.notes}</p>
              )}
            </div>
          </article>
        );
      })}

      {selectedWorkouts.map((w) => {
        const s = stats(data.sets.filter((s) => s.workoutId === w.id));
        return (
          <section className="history-card" key={w.id}>
            <div className="history-card-actions">
              {editingWorkout === w.id ? (
                <>
                  <label>
                    Fecha
                    <input
                      type="date"
                      max={new Date().toLocaleDateString("sv-SE")}
                      value={workoutDate}
                      onChange={(event) => setWorkoutDate(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Guardar fecha"
                    title="Guardar fecha"
                    disabled={busy || !workoutDate}
                    onClick={async () => {
                      const result = await execute({
                        action: "updateWorkoutDate",
                        workoutId: w.id,
                        date: workoutDate,
                      });
                      if (result) {
                        setSelectedDate(workoutDate);
                        setMonth(workoutDate.slice(0, 7));
                        setEditingWorkout("");
                      }
                    }}
                  >
                    <Save size={17} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Cancelar edición de fecha"
                    onClick={() => setEditingWorkout("")}
                  >
                    <X size={17} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="secondary compact"
                    onClick={() => {
                      setEditingWorkout(w.id);
                      setWorkoutDate(localDateKey(w.startedAt));
                    }}
                  >
                    <Pencil size={15} /> Cambiar fecha
                  </button>
                  <button
                    type="button"
                    className="danger-button compact"
                    disabled={busy}
                    onClick={() => setPendingDelete(w)}
                  >
                    <Trash2 size={15} /> Eliminar sesión
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              className="history-header"
              onClick={() => setOpen(open === w.id ? "" : w.id)}
            >
              <span className="day-badge">
                <Dumbbell size={17} />
                {w.dayId}
              </span>
              <div>
                <h2>{dateLabel(w.startedAt)}</h2>
                <p>{data.days.find((d) => d.id === w.dayId)?.title}</p>
              </div>
              <span className="history-meta">
                {s.sets} series · {s.reps} reps{" "}
                <span className="tag">
                  {open === w.id ? "Cerrar" : "Ver sesión"}
                </span>
              </span>
            </button>
            {open === w.id && <WorkoutDetail data={data} workout={w} />}
          </section>
        );
      })}

      {!selectedWorkouts.length && !selectedActivities.length && (
        <div className="empty-state">
          <CalendarDays size={36} />
          <h2>No hay actividad este día</h2>
          <p>
            Selecciona otro día del calendario o registra un deporte desde
            Inicio.
          </p>
        </div>
      )}
      {pendingDelete && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true">
            <h2>¿Eliminar esta sesión?</h2>
            <p>
              Se eliminarán el entrenamiento y todas sus series. Esta acción no
              se puede deshacer.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setPendingDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={busy}
                onClick={async () => {
                  const result = await execute({
                    action: "deleteWorkout",
                    workoutId: pendingDelete.id,
                  });
                  if (result) {
                    setPendingDelete(null);
                    setOpen("");
                  }
                }}
              >
                <Trash2 size={16} /> Eliminar definitivamente
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
