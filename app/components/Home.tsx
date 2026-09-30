"use client";
import { useEffect, useState } from "react";
import { Clock3, Dumbbell, Play, Save, Target } from "lucide-react";
import type { DayKey, PlanExercise, Snapshot } from "../domain/types";
import {
  completedWorkouts,
  previousSets,
  getNextRoutineDay,
} from "../services/training";
import type { Execute } from "./Training";
import { PlanEditor } from "./PlanEditor";
export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
export function DayPicker({
  selected,
  onSelect,
  disabled = false,
}: {
  selected: DayKey;
  onSelect: (d: DayKey) => void;
  disabled?: boolean;
}) {
  return (
    <div className="day-picker" aria-label="Elegir entrenamiento">
      {(["A", "B", "C"] as const).map((d) => (
        <button
          key={d}
          disabled={disabled}
          className={selected === d ? "selected" : ""}
          onClick={() => onSelect(d)}
        >
          Día {d}
        </button>
      ))}
    </div>
  );
}
export function Home({
  data,
  selected,
  onSelect,
  onStart,
  execute,
  busy,
}: {
  data: Snapshot;
  selected: DayKey;
  onSelect: (d: DayKey) => void;
  onStart: (plan: PlanExercise[], templateName: string) => void;
  execute: Execute;
  busy: boolean;
}) {
  const done = completedWorkouts(data),
    last = done[0],
    active = data.workouts.find((w) => w.status === "active"),
    day = data.days.find((d) => d.id === selected)!,
    templates = data.templates.filter((t) => t.dayId === selected),
    recent = done.filter(
      (w) => Date.parse(w.startedAt) > Date.now() - 30 * 86400000,
    ),
    since = last
      ? Math.floor((Date.now() - Date.parse(last.finishedAt!)) / 86400000)
      : null;
  const [templateId, setTemplateId] = useState(""),
    [plan, setPlan] = useState<PlanExercise[]>([]),
    [editing, setEditing] = useState(false),
    [saveName, setSaveName] = useState("");
  useEffect(() => {
    const template = templates.find((t) => t.id === templateId) ?? templates[0];
    if (!template) return;
    setTemplateId(template.id);
    setSaveName(template.name);
    setPlan(
      data.templateExercises
        .filter((e) => e.templateId === template.id)
        .sort((a, b) => a.position - b.position)
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
        ),
    );
    setEditing(false);
  }, [selected, templateId, data.templates.length]);
  const chosen = templates.find((t) => t.id === templateId),
    rows = plan;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TU PRÓXIMA SESIÓN</p>
          <h1>
            Hoy toca <span>Día {active?.dayId ?? selected}.</span>
          </h1>
          <p className="muted">
            {dateLabel(new Date().toISOString())}{" "}
            <span className="dot-separator">/</span> Entrenamiento #
            {done.length + 1}
          </p>
        </div>
        <div className="sequence">
          <span className={selected === "A" ? "current" : ""}>A</span>
          <i />
          <span className={selected === "B" ? "current" : ""}>B</span>
          <i />
          <span className={selected === "C" ? "current" : ""}>C</span>
        </div>
      </div>
      <div className="home-grid">
        <section className="session-hero">
          <div className="hero-top">
            <span className="tag lime">GIMNASIO → CALISTENIA</span>
            <span className="hero-number">0{day.position + 1}</span>
          </div>
          <h2>{chosen?.name ?? day.title}</h2>
          <p>
            {rows.length} ejercicios <span>·</span>{" "}
            {rows.reduce((n, r) => n + r.sets, 0)} series{" "}
            {selected === "C" ? "(2 opcionales)" : ""}
          </p>
          <div className="hero-focus">
            <Target size={18} />
            <span>Repeticiones de calidad. Mantén RIR 1–2.</span>
          </div>
          <button
            className="primary start"
            onClick={() => onStart(plan, chosen?.name ?? `Día ${selected}`)}
            disabled={busy || !plan.length}
          >
            <Play size={19} fill="currentColor" />
            {active ? "Continuar entrenamiento" : "Empezar entrenamiento"}
          </button>
          {active && (
            <p className="resume-note">
              Tienes un entrenamiento en curso: Día {active.dayId}.
            </p>
          )}
        </section>
        <aside className="rhythm">
          <div className="section-title">
            <h2>Tu ritmo</h2>
            <span className="small muted">ÚLTIMOS 30 DÍAS</span>
          </div>
          <div className="big-stat">
            {recent.length}
            <span>entrenamientos</span>
          </div>
          <div className="day-counts">
            {data.days.map((d) => (
              <div key={d.id}>
                <span>Día {d.id}</span>
                <strong>{recent.filter((w) => w.dayId === d.id).length}</strong>
              </div>
            ))}
          </div>
          <div className="last-session">
            <Clock3 size={18} />
            <div>
              <strong>
                {last
                  ? `Última sesión · Día ${last.dayId}`
                  : "Todo empieza con una sesión"}
              </strong>
              <p>
                {last
                  ? `${dateLabel(last.startedAt)} · ${since === 0 ? "hoy" : `hace ${since} días`}`
                  : "Tu histórico está listo para empezar."}
              </p>
            </div>
          </div>
        </aside>
      </div>
      <div className="section-title routine-heading">
        <div>
          <p className="eyebrow">TU TABLA</p>
          <h2>El trabajo de hoy</h2>
        </div>
        <DayPicker
          selected={selected}
          onSelect={onSelect}
          disabled={!!active}
        />
      </div>
      {!active && (
        <div className="template-toolbar">
          <label>
            Plantilla
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => setEditing(!editing)}>
            {editing ? "Cerrar edición" : "Editar antes de empezar"}
          </button>
        </div>
      )}
      {selected !== getNextRoutineDay(last?.dayId) && !active && (
        <p className="notice">
          Has elegido el Día {selected}. Según tu última sesión, el recomendado
          es el Día {getNextRoutineDay(last?.dayId)}.
        </p>
      )}
      {editing && !active ? (
        <>
          <PlanEditor
            plan={plan}
            exercises={data.exercises}
            onChange={setPlan}
          />
          <div className="save-template">
            <label>
              Nombre de la plantilla
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </label>
            <button
              className="secondary"
              disabled={busy || saveName.trim().length < 2}
              onClick={() =>
                void execute({
                  action: "saveTemplate",
                  dayId: selected,
                  name: saveName,
                  description: "",
                  exercises: plan,
                })
              }
            >
              <Save size={17} />
              Guardar como plantilla nueva
            </button>
          </div>
        </>
      ) : (
        <div className="routine-list">
          {rows.map((r, i) => {
            const e = data.exercises.find((e) => e.id === r.exerciseId)!;
            const prev = previousSets(data, e.id);
            return (
              <article
                className="exercise-preview"
                key={`${r.exerciseId}-${i}`}
              >
                <span className="exercise-index">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="exercise-info">
                  <h3>
                    {e.name}{" "}
                    {r.optional ? (
                      <span className="tag">Opcional</span>
                    ) : r.priority === "Principal" ? (
                      <span className="tag principal">Principal</span>
                    ) : null}
                  </h3>
                  <p>
                    {e.type === "calisthenics" ? "Calistenia" : "Gimnasio"} ·{" "}
                    {r.rir === "Técnica" ? "Práctica técnica" : `RIR ${r.rir}`}
                    {["bulgarian", "lunge"].includes(e.id)
                      ? " · por pierna"
                      : ""}
                  </p>
                </div>
                <div className="prescription">
                  <strong>
                    {r.sets} <span>×</span> {r.repMin}–{r.repMax}
                  </strong>
                  <small>
                    {e.metricType === "time" ? "segundos" : "repeticiones"}
                  </small>
                </div>
                <div className="previous">
                  <span>ÚLTIMA VEZ</span>
                  <strong>
                    {prev.length
                      ? prev
                          .map(
                            (s) =>
                              `${s.reps ?? `${s.durationSeconds}s`} · ${s.assistanceWeight ? `BW − ${s.assistanceWeight} kg` : s.addedWeight ? `BW + ${s.addedWeight} kg` : s.weight !== null ? `${s.weight} kg` : "BW"}`,
                          )
                          .join(" / ")
                      : "Sin registros todavía"}
                  </strong>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="footer-note">
        <Dumbbell size={17} />
        <p>La secuencia sigue tu ritmo: A → B → C. El calendario no decide.</p>
      </div>
    </>
  );
}
