"use client";

import { useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Info, Minus, Trophy } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Snapshot, WorkoutSet } from "../domain/types";
import { completedWorkouts, effectiveLoad, estimatedOneRepMax, stats } from "../services/training";

const DAY = 86_400_000;
const shortDate = (value: string) => new Date(value).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
const fullDate = (value: string) => new Date(value).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

function setLabel(set: WorkoutSet, isTime: boolean) {
  if (isTime) return `${set.durationSeconds ?? 0} s`;
  const load = effectiveLoad(set);
  return `${set.reps ?? 0} reps${load ? ` · ${load.toFixed(1)} kg` : ""}${set.RIR !== null ? ` · RIR ${set.RIR}` : ""}`;
}

export function Progress({ data }: { data: Snapshot }) {
  const completed = useMemo(() => completedWorkouts(data), [data]);
  const completedIds = useMemo(() => new Set(completed.map((workout) => workout.id)), [completed]);
  const sets = useMemo(
    () => data.sets.filter((set) => completedIds.has(set.workoutId) && set.completed),
    [data.sets, completedIds],
  );
  const exercisesWithData = useMemo(
    () => data.exercises.filter((item) => sets.some((set) => set.exerciseId === item.id)),
    [data.exercises, sets],
  );
  const [exercise, setExercise] = useState(exercisesWithData[0]?.id ?? data.exercises[0]?.id ?? "pullup");
  const selected = data.exercises.find((item) => item.id === exercise) ?? data.exercises[0];
  const isTime = selected?.metricType === "time";
  const [now] = useState(() => Date.now());
  const recent = completed.filter((workout) => Date.parse(workout.startedAt) > now - 30 * DAY);
  const [today] = useState(() => new Date());
  const startOfWeek = new Date(today);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const weekIds = new Set(completed.filter((workout) => Date.parse(workout.startedAt) >= startOfWeek.getTime()).map((workout) => workout.id));
  const weekly = stats(sets.filter((set) => weekIds.has(set.workoutId)));
  const weeklyTrend = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(startOfWeek);
    start.setDate(start.getDate() - (7 - index) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
      label: start.toLocaleDateString("es-ES", { day: "numeric", month: "short" }),
      sesiones: completed.filter((workout) => {
        const date = Date.parse(workout.startedAt);
        return date >= start.getTime() && date < end.getTime();
      }).length,
    };
  });

  const exerciseSets = sets.filter((set) => set.exerciseId === exercise);
  const sessionData = completed
    .filter((workout) => exerciseSets.some((set) => set.workoutId === workout.id))
    .map((workout) => {
      const sessionSets = exerciseSets.filter((set) => set.workoutId === workout.id).sort((a, b) => a.setNumber - b.setNumber);
      const estimations = sessionSets
        .map((set) => ({ set, value: estimatedOneRepMax(set) }))
        .filter((item): item is { set: WorkoutSet; value: number } => item.value !== null);
      const fallback = sessionSets.map((set) => ({ set, value: (set.reps ?? 0) + Math.max(0, set.RIR ?? 0) }));
      const candidates = isTime
        ? sessionSets.map((set) => ({ set, value: set.durationSeconds ?? 0 }))
        : estimations.length ? estimations : fallback;
      const best = candidates.reduce(
        (current, item) => item.value > current.value ? item : current,
        candidates[0] ?? { set: sessionSets[0], value: 0 },
      );
      return {
        id: workout.id,
        date: workout.startedAt,
        dateLabel: shortDate(workout.startedAt),
        score: Number(best.value.toFixed(1)),
        bestSet: best.set,
        sets: sessionSets,
      };
    })
    .reverse();

  const hasLoadData = !isTime && exerciseSets.some((set) => estimatedOneRepMax(set) !== null);
  const metricName = isTime ? "Mejor duración" : hasLoadData ? "Fuerza estimada" : "Repeticiones potenciales";
  const unit = isTime ? "s" : hasLoadData ? "kg e1RM" : "reps";
  const latest = sessionData.at(-1)?.score ?? 0;
  const first = sessionData[0]?.score ?? 0;
  const best = Math.max(0, ...sessionData.map((session) => session.score));
  const change = first > 0 ? ((latest - first) / first) * 100 : 0;
  const chartData = sessionData.slice(-12);
  const TrendIcon = change > 0.05 ? ArrowUpRight : change < -0.05 ? ArrowDownRight : Minus;

  return (
    <>
      <div className="page-heading progress-heading">
        <div>
          <p className="eyebrow">PROGRESO QUE SE ENTIENDE</p>
          <h1>Tu evolución.</h1>
          <p className="muted">Menos registros que descifrar; más señales para decidir.</p>
        </div>
        <span className="progress-heading-icon"><Trophy size={25} /></span>
      </div>

      <section className="progress-overview">
        <div className="progress-kpis">
          <article><span>Últimos 30 días</span><strong>{recent.length}</strong><small>{((recent.length / 30) * 7).toFixed(1)} sesiones / semana</small></article>
          <article><span>Esta semana</span><strong>{weekly.sets}</strong><small>series completadas</small></article>
          <article><span>Cerca del límite</span><strong>{weekly.failure}%</strong><small>series a RIR 0</small></article>
        </div>
        <div className="weekly-chart-card">
          <div><span>Ritmo de entrenamiento</span><small>Sesiones por semana · 8 semanas</small></div>
          <ResponsiveContainer width="100%" height={116}>
            <BarChart data={weeklyTrend} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <Tooltip cursor={{ fill: "#eef1e9" }} contentStyle={{ borderRadius: 8, borderColor: "#e2e6df", fontSize: 12 }} formatter={(value) => [`${value} sesiones`, ""]} labelFormatter={(label) => `Semana del ${label}`} />
              <Bar dataKey="sesiones" fill="#252c22" radius={[4, 4, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <h2 className="subheading">Objetivos</h2>
      <div className="goals-grid compact-goals">
        {data.goals.map((goal) => {
          const candidates = sets.filter((set) =>
            set.exerciseId === goal.exerciseId && !(set.assistanceWeight ?? 0) && !(set.addedWeight ?? 0) &&
            (goal.id.endsWith(":handstand") ? data.workoutExercises.find((item) => item.id === set.workoutExerciseId)?.variant === "Free handstand" : true),
          );
          const value = Math.max(0, ...candidates.map((set) => goal.metric === "reps" ? set.reps ?? 0 : set.durationSeconds ?? 0));
          const percentage = Math.min(100, Math.round((value / goal.target) * 100));
          return (
            <article className="goal-card" key={goal.id}>
              <div className="goal-value"><strong>{value}</strong><span>/ {goal.target}</span></div>
              <h3>{goal.name}</h3>
              <div className="goal-track" aria-label={`${percentage}% del objetivo`}><span style={{ width: `${percentage}%` }} /></div>
            </article>
          );
        })}
      </div>

      <section className="exercise-progress-card">
        <div className="exercise-progress-header">
          <div><p className="eyebrow">PROGRESO DEL EJERCICIO</p><h2>{selected?.name ?? "Ejercicio"}</h2></div>
          <select className="exercise-select" aria-label="Ejercicio para consultar progreso" value={exercise} onChange={(event) => setExercise(event.target.value)}>
            {(exercisesWithData.length ? exercisesWithData : data.exercises).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>

        {sessionData.length ? (
          <>
            <div className="exercise-summary">
              <article><span>Ahora</span><strong>{latest.toLocaleString("es-ES")} <small>{unit}</small></strong></article>
              <article><span>Cambio total</span><strong className={change > 0 ? "positive" : change < 0 ? "negative" : ""}><TrendIcon size={20} /> {change > 0 ? "+" : ""}{change.toFixed(1)}%</strong></article>
              <article><span>Mejor marca</span><strong>{best.toLocaleString("es-ES")} <small>{unit}</small></strong></article>
              <article><span>Sesiones</span><strong>{sessionData.length}</strong></article>
            </div>

            <div className="performance-chart">
              <div className="chart-heading">
                <div><h3>{metricName}</h3><p>Mejor serie de cada sesión · últimas {chartData.length}</p></div>
                <span className="metric-chip"><Activity size={14} /> {unit}</span>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 20, right: 14, left: -14, bottom: 2 }}>
                  <CartesianGrid stroke="#e7eae3" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fill: "#73796f", fontSize: 11 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#73796f", fontSize: 11 }} domain={["dataMin - 2", "dataMax + 2"]} />
                  <Tooltip cursor={{ stroke: "#aab19f", strokeDasharray: "4 4" }} content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as (typeof sessionData)[number] | undefined;
                    if (!active || !point) return null;
                    return <div className="progress-tooltip"><span>{fullDate(point.date)}</span><strong>{point.score.toLocaleString("es-ES")} {unit}</strong>{point.bestSet && <small>{setLabel(point.bestSet, isTime)}</small>}</div>;
                  }} />
                  <Line type="monotone" dataKey="score" stroke="#252c22" strokeWidth={3} dot={{ r: 4, fill: "#c5f36c", stroke: "#252c22", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#c5f36c", stroke: "#252c22", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="metric-explainer"><Info size={16} /><p>{isTime
                ? "Se muestra tu mejor duración válida de cada sesión."
                : hasLoadData
                  ? "La fuerza estimada combina carga efectiva, repeticiones y RIR con la fórmula de Epley. En peso corporal: peso + lastre − asistencia."
                  : "Aún no hay carga registrada. Se comparan repeticiones realizadas + RIR como repeticiones potenciales."}</p></div>
            </div>

            <div className="recent-performance">
              <div className="chart-heading"><div><h3>Últimas sesiones</h3><p>El detalle justo para entender cada punto</p></div></div>
              <div className="recent-session-grid">
                {sessionData.slice(-3).reverse().map((session) => (
                  <article key={session.id}>
                    <div><strong>{shortDate(session.date)}</strong><span>{session.score} {unit}</span></div>
                    <div className="set-pills">{session.sets.map((set) => <span key={set.id}>{setLabel(set, isTime)}</span>)}</div>
                  </article>
                ))}
              </div>
            </div>
          </>
        ) : <p className="empty-hint">Completa una sesión con este ejercicio para ver su curva de progreso.</p>}
      </section>
    </>
  );
}
