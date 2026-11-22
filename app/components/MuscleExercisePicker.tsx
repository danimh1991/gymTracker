"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Exercise, MuscleGroup } from "../domain/types";

const GROUPS: Array<{ id: MuscleGroup; label: string; short: string }> = [
  { id: "chest", label: "Pecho", short: "Pecho" },
  { id: "vertical_pull", label: "Espalda vertical", short: "Dorsal" },
  { id: "horizontal_pull", label: "Espalda media", short: "Espalda" },
  { id: "vertical_push", label: "Hombro", short: "Hombro" },
  { id: "lateral_rear_delts", label: "Deltoides", short: "Deltoides" },
  { id: "biceps", label: "Bíceps", short: "Bíceps" },
  { id: "triceps", label: "Tríceps", short: "Tríceps" },
  { id: "quads", label: "Cuádriceps", short: "Cuádriceps" },
  { id: "posterior_chain", label: "Cadena posterior", short: "Posterior" },
  { id: "core", label: "Core", short: "Core" },
  { id: "calves", label: "Gemelos", short: "Gemelos" },
  { id: "forearms_grip", label: "Antebrazo y agarre", short: "Agarre" },
];

export function primaryMuscleGroup(exercise?: Exercise): MuscleGroup {
  if (!exercise) return "core";
  const direct = exercise.stimulus
    ?.filter((item) => item.direct)
    .sort((a, b) => b.weight - a.weight)[0];
  if (direct) return direct.group;
  const fallback = [...(exercise.stimulus ?? [])].sort(
    (a, b) => b.weight - a.weight,
  )[0];
  return fallback?.group ?? "core";
}

export function muscleGroupLabel(group: MuscleGroup) {
  return GROUPS.find((item) => item.id === group)?.label ?? "Cuerpo completo";
}

export function MuscleGroupIcon({
  group,
  size = 46,
}: {
  group: MuscleGroup;
  size?: number;
}) {
  const upperBack = group === "vertical_pull" || group === "horizontal_pull";
  const arms = group === "biceps" || group === "triceps";
  const legs = group === "quads" || group === "posterior_chain";
  return (
    <svg
      className="muscle-map"
      width={size}
      height={size}
      viewBox="0 0 52 64"
      role="img"
      aria-label={muscleGroupLabel(group)}
    >
      <circle className="body-shape" cx="26" cy="7" r="5" />
      <path className="body-shape" d="M19 14c-4 1-7 5-8 10l-2 13 5 1 3-12 2 13-2 20h7l2-16 2 16h7l-2-20 2-13 3 12 5-1-2-13c-1-5-4-9-8-10l-7 3z" />
      {group === "chest" && <path className="muscle-active" d="M19 18c2-2 5-1 7 1 2-2 5-3 7-1l-1 8c-2 1-4 0-6-2-2 2-4 3-6 2z" />}
      {upperBack && <path className="muscle-active" d={group === "vertical_pull" ? "M18 17l8 3 8-3-2 15-6 5-6-5z" : "M19 17h14l-1 9-6 3-6-3z"} />}
      {(group === "vertical_push" || group === "lateral_rear_delts") && <><circle className="muscle-active" cx="17" cy="19" r="4" /><circle className="muscle-active" cx="35" cy="19" r="4" /></>}
      {arms && <><path className="muscle-active" d="M11 25l5 1-2 12-5-1z" /><path className="muscle-active" d="M36 26l5-1 2 12-5 1z" /></>}
      {group === "forearms_grip" && <><path className="muscle-active" d="M9 36l5 1-2 10-4-1z" /><path className="muscle-active" d="M38 37l5-1 1 10-4 1z" /></>}
      {group === "core" && <path className="muscle-active" d="M21 27h10l2 13H19z" />}
      {legs && <><path className="muscle-active" d="M19 40h7l-2 19h-7z" /><path className="muscle-active" d="M26 40h7l2 19h-7z" /></>}
      {group === "calves" && <><path className="muscle-active" d="M17 51h7v8h-7z" /><path className="muscle-active" d="M28 51h7v8h-7z" /></>}
    </svg>
  );
}

export function MuscleExercisePicker({
  exercises,
  value,
  onChange,
  disabled = false,
  label = "Ejercicio",
}: {
  exercises: Exercise[];
  value: string;
  onChange: (exerciseId: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const enabled = useMemo(() => exercises.filter((item) => item.enabled), [exercises]);
  const selected = enabled.find((item) => item.id === value) ?? enabled[0];
  const initialGroup = primaryMuscleGroup(selected);
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<MuscleGroup>(initialGroup);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  const normalized = query.trim().toLocaleLowerCase("es");
  const visible = enabled.filter((exercise) =>
    normalized
      ? `${exercise.name} ${exercise.primaryMuscles} ${exercise.equipment}`
          .toLocaleLowerCase("es")
          .includes(normalized)
      : primaryMuscleGroup(exercise) === group,
  );

  return (
    <div className="muscle-picker-field">
      <span className="muscle-picker-label">{label}</span>
      <button
        type="button"
        className="muscle-picker-trigger"
        disabled={disabled}
        onClick={() => {
          setGroup(primaryMuscleGroup(selected));
          setOpen(true);
        }}
      >
        <MuscleGroupIcon group={primaryMuscleGroup(selected)} size={36} />
        <span>
          <strong>{selected?.name ?? "Elige un ejercicio"}</strong>
          <small>{muscleGroupLabel(primaryMuscleGroup(selected))}</small>
        </span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="exercise-picker-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className={`exercise-picker-sheet ${normalized ? "searching" : ""}`} role="dialog" aria-modal="true" aria-label="Elegir ejercicio">
            <header>
              <div>
                <span className="eyebrow">BIBLIOTECA DE EJERCICIOS</span>
                <h2>¿Qué quieres entrenar?</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Cerrar selector" onClick={() => setOpen(false)}><X size={20} /></button>
            </header>
            <label className="exercise-picker-search">
              <Search size={18} />
              <input autoFocus type="search" placeholder="Buscar ejercicio" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            {!normalized && (
              <div className="muscle-group-grid" aria-label="Grupos musculares">
                {GROUPS.map((item) => (
                  <button type="button" key={item.id} className={group === item.id ? "selected" : ""} onClick={() => setGroup(item.id)}>
                    <MuscleGroupIcon group={item.id} size={42} />
                    <span>{item.short}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="exercise-picker-results">
              <div className="exercise-picker-results-title">
                <strong>{normalized ? "Resultados" : muscleGroupLabel(group)}</strong>
                <span>{visible.length} ejercicios</span>
              </div>
              {visible.map((exercise) => (
                <button
                  type="button"
                  className={exercise.id === value ? "selected" : ""}
                  key={exercise.id}
                  onClick={() => {
                    onChange(exercise.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <MuscleGroupIcon group={primaryMuscleGroup(exercise)} size={38} />
                  <span>
                    <strong>{exercise.name}</strong>
                    <small>{exercise.equipment || "Sin equipamiento"} · {exercise.metricType === "time" ? "tiempo" : "repeticiones"}</small>
                  </span>
                  {exercise.id === value && <Check size={18} />}
                </button>
              ))}
              {!visible.length && <p className="empty-picker-results">No hay ejercicios que coincidan.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
