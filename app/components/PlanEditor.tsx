"use client";
import { CopyPlus, Plus, Trash2 } from "lucide-react";
import type { Exercise, PlanExercise } from "../domain/types";

export function PlanEditor({
  plan,
  exercises,
  onChange,
  lockedIds = new Set(),
}: {
  plan: PlanExercise[];
  exercises: Exercise[];
  onChange: (plan: PlanExercise[]) => void;
  lockedIds?: Set<number>;
}) {
  const patch = (i: number, value: Partial<PlanExercise>) =>
    onChange(plan.map((row, n) => (n === i ? { ...row, ...value } : row)));
  return (
    <div className="plan-editor">
      {plan.map((row, i) => (
        <article className="plan-row" key={i}>
          <div className="plan-main">
            <span className="exercise-index">
              {String(i + 1).padStart(2, "0")}
            </span>
            <label>
              Ejercicio
              <select
                value={row.exerciseId}
                disabled={lockedIds.has(i)}
                onChange={(e) => patch(i, { exerciseId: e.target.value })}
              >
                {exercises
                  .filter((e) => e.enabled)
                  .map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="plan-targets">
            <label>
              Series
              <input
                type="number"
                min="1"
                max="30"
                value={row.sets}
                onChange={(e) => patch(i, { sets: Number(e.target.value) })}
              />
            </label>
            <label>
              Mín.
              <input
                type="number"
                min="0"
                value={row.repMin}
                onChange={(e) => patch(i, { repMin: Number(e.target.value) })}
              />
            </label>
            <label>
              Máx.
              <input
                type="number"
                min="0"
                value={row.repMax}
                onChange={(e) => patch(i, { repMax: Number(e.target.value) })}
              />
            </label>
            <label>
              RIR
              <input
                value={row.rir}
                maxLength={20}
                onChange={(e) => patch(i, { rir: e.target.value })}
              />
            </label>
            <button
              className="icon-button"
              title="Duplicar ejercicio"
              onClick={() =>
                onChange([
                  ...plan.slice(0, i + 1),
                  { ...row },
                  ...plan.slice(i + 1),
                ])
              }
            >
              <CopyPlus size={17} />
            </button>
            <button
              className="icon-button danger"
              title="Quitar ejercicio"
              disabled={lockedIds.has(i) || plan.length === 1}
              onClick={() => onChange(plan.filter((_, n) => n !== i))}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </article>
      ))}
      <button
        className="secondary add-plan"
        onClick={() =>
          onChange([
            ...plan,
            {
              exerciseId: exercises[0]?.id ?? "",
              sets: 3,
              repMin: 8,
              repMax: 12,
              rir: "1–2",
              optional: 0,
              notes: "",
              priority: "Accesorio",
            },
          ])
        }
      >
        <Plus size={17} />
        Añadir ejercicio
      </button>
    </div>
  );
}
