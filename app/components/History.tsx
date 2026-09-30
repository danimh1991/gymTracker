"use client";
import { useState } from "react";
import { CalendarDays, Check, Trophy } from "lucide-react";
import type { Snapshot, Workout } from "../domain/types";
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
export function History({ data }: { data: Snapshot }) {
  const [day, setDay] = useState(""),
    [date, setDate] = useState(""),
    [exercise, setExercise] = useState(""),
    [type, setType] = useState(""),
    [category, setCategory] = useState(""),
    [open, setOpen] = useState("");
  const matches = completedWorkouts(data).filter(
    (w) =>
      (!day || w.dayId === day) &&
      (!date || new Date(w.startedAt).toLocaleDateString("sv-SE") === date) &&
      data.workoutExercises.some((e) => {
        const lib = data.exercises.find((x) => x.id === e.exerciseId);
        return (
          e.workoutId === w.id &&
          (!exercise ||
            e.name.toLowerCase().includes(exercise.toLowerCase())) &&
          (!type || lib?.type === type) &&
          (!category || lib?.movementPattern === category)
        );
      }),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CADA SESIÓN CUENTA</p>
          <h1>Tu histórico.</h1>
          <p className="muted">El trabajo que ya has hecho.</p>
        </div>
        <CalendarDays size={30} />
      </div>
      <div className="filters">
        <label>
          Fecha
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Entrenamiento
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">Todos los días</option>
            {["A", "B", "C"].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Ejercicio
          <input
            placeholder="Buscar ejercicio…"
            value={exercise}
            onChange={(e) => setExercise(e.target.value)}
          />
        </label>
        <label>
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos</option>
            <option value="calisthenics">Calistenia</option>
            <option value="gym">Gimnasio</option>
          </select>
        </label>
        <label>
          Categoría
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas</option>
            {[...new Set(data.exercises.map((e) => e.movementPattern))].map(
              (p) => (
                <option key={p}>{p}</option>
              ),
            )}
          </select>
        </label>
      </div>
      {matches.length ? (
        matches.map((w) => {
          const s = stats(data.sets.filter((s) => s.workoutId === w.id));
          return (
            <section className="history-card" key={w.id}>
              <button
                className="history-header"
                onClick={() => setOpen(open === w.id ? "" : w.id)}
              >
                <span className="day-badge">{w.dayId}</span>
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
        })
      ) : (
        <div className="empty-state">
          <CalendarDays size={36} />
          <h2>
            {data.workouts.some((w) => w.status === "completed")
              ? "No hay sesiones con estos filtros"
              : "Tu primera sesión irá aquí"}
          </h2>
          <p>
            Al terminar un entrenamiento, podrás consultar aquí cada serie y
            compararla con la anterior.
          </p>
        </div>
      )}
    </>
  );
}
