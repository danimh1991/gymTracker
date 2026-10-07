"use client";
import { useState } from "react";
import { Trophy } from "lucide-react";
import type { Snapshot } from "../domain/types";
import { completedWorkouts, stats } from "../services/training";
import { dateLabel } from "./Home";
export function Progress({ data }: { data: Snapshot }) {
  const [exercise, setExercise] = useState("pullup"),
    completed = completedWorkouts(data),
    ids = new Set(completed.map((w) => w.id)),
    sets = data.sets.filter((s) => ids.has(s.workoutId)),
    recent = completed.filter(
      (w) => Date.parse(w.startedAt) > Date.now() - 30 * 86400000,
    ),
    start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const weekIds = new Set(
      completed
        .filter((w) => Date.parse(w.startedAt) >= start.getTime())
        .map((w) => w.id),
    ),
    weekly = stats(sets.filter((s) => weekIds.has(s.workoutId))),
    selected = data.exercises.find((e) => e.id === exercise)!,
    exerciseSets = sets.filter((s) => s.exerciseId === exercise),
    sessions = completed.filter((w) =>
      exerciseSets.some((s) => s.workoutId === w.id),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FUERZA QUE SE CONSTRUYE</p>
          <h1>Tu progreso.</h1>
          <p className="muted">
            Cada repetición deja una referencia para la siguiente.
          </p>
        </div>
        <Trophy size={29} />
      </div>
      <div className="stats-grid">
        <div>
          <strong>{recent.length}</strong>
          <span>Sesiones · últimos 30 días</span>
        </div>
        <div>
          <strong>{((recent.length / 30) * 7).toFixed(1)}</strong>
          <span>Sesiones / semana · media de 30 días</span>
        </div>
        <div>
          <strong>{weekly.failure}%</strong>
          <span>Series al fallo · esta semana</span>
        </div>
        <div>
          <strong>{weekly.sets}</strong>
          <span>Series · esta semana</span>
        </div>
      </div>
      {weekly.unknownRIR > 0 && (
        <p className="small muted">
          {weekly.unknownRIR} series sin RIR. El porcentaje de fallo usa todas
          las series.
        </p>
      )}
      <h2 className="subheading">Tus objetivos iniciales</h2>
      <div className="goals-grid">
        {data.goals.map((g) => {
          const candidates = sets.filter(
            (s) =>
              s.exerciseId === g.exerciseId &&
              !(s.assistanceWeight ?? 0) &&
              !(s.addedWeight ?? 0) &&
              (g.id.endsWith(":handstand")
                ? data.workoutExercises.find(
                    (e) => e.id === s.workoutExerciseId,
                  )?.variant === "Free handstand"
                : true),
          );
          const value = Math.max(
            0,
            ...candidates.map((s) =>
              g.metric === "reps" ? (s.reps ?? 0) : (s.durationSeconds ?? 0),
            ),
          );
          return (
            <section className="goal-card" key={g.id}>
              <h3>{g.name}</h3>
              <strong>
                {value}
                <span>
                  {" "}
                  / {g.target} {g.metric === "reps" ? "reps" : "s"}
                </span>
              </strong>
              <progress
                aria-label={`Objetivo ${g.name}`}
                max={g.target}
                value={Math.min(g.target, value)}
              />
              <p>
                {value
                  ? "Tu mejor serie sin asistencia ni lastre"
                  : "Todavía sin registros"}
              </p>
            </section>
          );
        })}
      </div>
      <section className="settings-card">
        <div className="section-title">
          <h2>Evolución por ejercicio</h2>
          <select
            className="exercise-select"
            aria-label="Ejercicio para consultar progreso"
            value={exercise}
            onChange={(e) => setExercise(e.target.value)}
          >
            {data.exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="stats-grid">
          <div>
            <strong>{sessions.length}</strong>
            <span>Sesiones registradas</span>
          </div>
          <div>
            <strong>
              {Math.max(
                0,
                ...exerciseSets.map((s) => s.reps ?? s.durationSeconds ?? 0),
              )}
            </strong>
            <span>
              Mejor serie ·{" "}
              {selected.metricType === "time" ? "segundos" : "reps"}
            </span>
          </div>
          <div>
            <strong>
              {exerciseSets
                .filter(
                  (s) =>
                    Date.parse(
                      data.workouts.find((w) => w.id === s.workoutId)!
                        .startedAt,
                    ) >
                    Date.now() - 30 * 86400000,
                )
                .reduce((n, s) => n + (s.reps ?? s.durationSeconds ?? 0), 0)}
            </strong>
            <span>Volumen · últimos 30 días</span>
          </div>
          <div>
            <strong>
              {sessions[0]
                ? new Date(sessions[0].startedAt).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                  })
                : "—"}
            </strong>
            <span>Última sesión</span>
          </div>
        </div>
        {sessions.length ? (
          <div className="evolution-list">
            {sessions.map((w) => {
              const s = exerciseSets.filter((s) => s.workoutId === w.id),
                total = s.reduce(
                  (n, s) => n + (s.reps ?? s.durationSeconds ?? 0),
                  0,
                ),
                rated = s.filter((s) => s.RIR !== null);
              return (
                <div key={w.id}>
                  <div>
                    <strong>{dateLabel(w.startedAt)}</strong>
                    <span>
                      {w.isFreeDay ? w.templateName : `Día ${w.dayId}`} ·{" "}
                      {s.length} series · RIR medio{" "}
                      {rated.length
                        ? (
                            rated.reduce((n, s) => n + s.RIR!, 0) / rated.length
                          ).toFixed(1)
                        : "—"}
                    </span>
                  </div>
                  <strong>
                    {s
                      .map((s) => s.reps ?? `${s.durationSeconds}s`)
                      .join(" / ")}
                  </strong>
                  <span>
                    {total} {selected.metricType === "time" ? "s" : "reps"}
                    {selected.supportsAssistance
                      ? ` · Asistencia ${s.map((s) => s.assistanceWeight ?? 0).join("/")} kg`
                      : ""}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-hint">
            Completa una sesión con este ejercicio para ver tu evolución.
          </p>
        )}
      </section>
    </>
  );
}
