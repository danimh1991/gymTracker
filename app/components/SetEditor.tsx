"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import type { WorkoutExercise, WorkoutSet } from "../domain/types";
import type { Command } from "../services/validation";
type SetCommand = Extract<Command, { action: "saveSet" }>["set"];
function NumberControl({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="stepper">
        <button
          type="button"
          aria-label={`Reducir ${label}`}
          onClick={() => onChange(String(Math.max(0, Number(value) - step)))}
        >
          <Minus size={17} />
        </button>
        <input
          aria-label={label}
          type="number"
          inputMode={step === 1 ? "numeric" : "decimal"}
          min="0"
          step={step}
          value={value}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          onClick={() => onChange(String(Number(value) + step))}
        >
          <Plus size={17} />
        </button>
      </div>
    </label>
  );
}
export function SetEditor({
  exercise,
  number,
  saved,
  previous,
  copied,
  clone,
  lastSaved,
  busy,
  onSave,
}: {
  exercise: WorkoutExercise;
  number: number;
  saved?: WorkoutSet;
  previous?: WorkoutSet;
  copied?: WorkoutSet;
  clone?: WorkoutSet;
  lastSaved?: WorkoutSet;
  busy: boolean;
  onSave: (s: SetCommand) => Promise<boolean>;
}) {
  const key = `gym-draft:${exercise.id}:${number}`;
  const base = {
    value: String(
      saved?.reps ??
        saved?.durationSeconds ??
        clone?.reps ??
        clone?.durationSeconds ??
        lastSaved?.reps ??
        lastSaved?.durationSeconds ??
        "",
    ),
    load: String(
      exercise.supportsAssistance
        ? (saved?.assistanceWeight ??
            clone?.assistanceWeight ??
            copied?.assistanceWeight ??
            lastSaved?.assistanceWeight ??
            "")
        : exercise.supportsAddedWeight
          ? (saved?.addedWeight ??
            clone?.addedWeight ??
            copied?.addedWeight ??
            lastSaved?.addedWeight ??
            0)
          : exercise.bodyweightExercise
            ? ""
            : (saved?.weight ??
              clone?.weight ??
              copied?.weight ??
              lastSaved?.weight ??
              ""),
    ),
    rir: saved?.RIR ?? clone?.RIR ?? lastSaved?.RIR ?? null,
    // A set note describes only that specific set and must never carry forward.
    notes: saved?.notes ?? "",
  };
  const [draft, setDraft] = useState(base),
    [restored, setRestored] = useState(false);
  const savedRef = useRef(false);
  useEffect(() => {
    try {
      const value = localStorage.getItem(key);
      if (value && !saved && !clone) {
        const parsed = JSON.parse(value);
        if (
          typeof parsed.value === "string" &&
          typeof parsed.load === "string" &&
          (parsed.rir === null || [0, 1, 2, 3].includes(parsed.rir)) &&
          typeof parsed.notes === "string"
        ) {
          setDraft({ ...parsed, load: copied ? base.load : parsed.load });
          setRestored(true);
        }
      }
    } catch {
      /* A blocked draft store must not block server saves. */
    }
  }, []);
  useEffect(() => {
    if (!savedRef.current)
      try {
        localStorage.setItem(key, JSON.stringify(draft));
      } catch {
        /* Optional local draft only. */
      }
  }, [draft, key]);
  const time = exercise.metricType === "time",
    showLoad =
      !exercise.bodyweightExercise ||
      !!exercise.supportsAssistance ||
      !!exercise.supportsAddedWeight;
  return (
    <div className="set-editor">
      <div className="section-title">
        <strong>
          Serie {number} <span className="muted">de {exercise.sets}</span>
        </strong>
        <span className="small muted">
          {previous
            ? `Anterior: ${previous.reps ?? `${previous.durationSeconds}s`} · RIR ${previous.RIR ?? "—"}`
            : "Primera referencia"}
        </span>
      </div>
      {restored && (
        <p className="small notice">
          Borrador recuperado. Pulsa guardar para registrarlo.
        </p>
      )}
      {clone && (
        <p className="small notice">
          Serie clonada. Revisa los valores antes de confirmarla.
        </p>
      )}
      <div className="inputs-row">
        <NumberControl
          label={time ? "Segundos" : "Repeticiones"}
          value={draft.value}
          onChange={(value) => setDraft({ ...draft, value })}
        />
        {showLoad ? (
          <NumberControl
            label={
              exercise.supportsAssistance
                ? "Asistencia (kg)"
                : exercise.supportsAddedWeight
                  ? "Lastre (kg)"
                  : "Peso (kg)"
            }
            step={0.5}
            value={draft.load}
            onChange={(load) => setDraft({ ...draft, load })}
          />
        ) : null}
      </div>
      <div className="rir-label">
        <span>Repeticiones en reserva</span>
        <span className="muted">Objetivo {exercise.rir}</span>
      </div>
      <div className="rir-buttons">
        {[3, 2, 1, 0].map((n) => (
          <button
            type="button"
            key={n}
            aria-pressed={draft.rir === n}
            className={`${draft.rir === n ? "chosen" : ""} ${n === 0 ? "failure-option" : ""}`}
            onClick={() =>
              setDraft({ ...draft, rir: draft.rir === n ? null : n })
            }
          >
            {n === 3 ? "3+" : n === 0 ? "0 · Fallo" : n}
          </button>
        ))}
      </div>
      <details className="set-notes">
        <summary>Nota de esta serie</summary>
        <textarea
          aria-label="Nota de esta serie"
          maxLength={2000}
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
      </details>
      <button
        className="primary save-set"
        disabled={busy || draft.value === "" || Number(draft.value) < 0}
        onClick={async () => {
          const v = Number(draft.value),
            load = draft.load === "" ? null : Number(draft.load);
          const success = await onSave({
            workoutExerciseId: exercise.id,
            setNumber: number,
            reps: time ? null : v,
            durationSeconds: time ? v : null,
            weight: exercise.bodyweightExercise ? null : load,
            addedWeight: exercise.supportsAddedWeight ? load : null,
            assistanceWeight: exercise.supportsAssistance ? load : null,
            RIR: draft.rir,
            notes: draft.notes,
          });
          if (success) {
            savedRef.current = true;
            try {
              localStorage.removeItem(key);
            } catch {}
          }
        }}
      >
        <Check size={19} />
        {busy ? "Guardando…" : saved ? "Actualizar serie" : "Guardar serie"}
      </button>
    </div>
  );
}
