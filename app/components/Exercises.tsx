"use client";

import { useState } from "react";
import { BookOpen, Download, Plus, Upload } from "lucide-react";
import type { Exercise, Snapshot } from "../domain/types";
import type { Execute } from "./Training";
import { downloadJson } from "../services/export";

type LoadMode = "bodyweight" | "added" | "assisted" | "external";
type ExerciseType = "calisthenics" | "gym" | "mobility" | "skill";

const emptyExercise = {
  name: "",
  type: "calisthenics" as ExerciseType,
  movementPattern: "general",
  primaryMuscles: "",
  secondaryMuscles: "",
  equipment: "Peso corporal",
  metricType: "reps" as Exercise["metricType"],
  loadMode: "bodyweight" as LoadMode,
  defaultRepMin: 8,
  defaultRepMax: 12,
  defaultRIR: "1–2",
  notes: "",
};

export function Exercises({
  data,
  busy,
  execute,
}: {
  data: Snapshot;
  busy: boolean;
  execute: Execute;
}) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(emptyExercise);

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      const rows = Array.isArray(value) ? value : value.exercises;
      if (!Array.isArray(rows))
        throw new Error("El JSON no contiene una lista válida de ejercicios.");
      await execute({ action: "importExercises", exercises: rows });
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
          <p className="eyebrow">TUS MOVIMIENTOS</p>
          <h1>Biblioteca de ejercicios.</h1>
          <p className="muted">
            Configura la métrica y el tipo de carga antes de usar un ejercicio.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus size={18} /> {showAdd ? "Cerrar formulario" : "Nuevo ejercicio"}
        </button>
      </div>

      <div className="library-actions">
        <button
          type="button"
          className="secondary"
          onClick={() =>
            downloadJson("gym-tracker-ejercicios.json", {
              version: 1,
              exercises: data.exercises,
            })
          }
        >
          <Download size={17} /> Exportar ejercicios
        </button>
        <label className="secondary file-button">
          <Upload size={17} /> Importar ejercicios
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importJson(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <span className="small muted">
          La importación omite IDs y nombres que ya existan.
        </span>
      </div>

      {showAdd && (
        <form
          className="settings-card exercise-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const bodyweightExercise = draft.loadMode === "external" ? 0 : 1;
            const result = await execute({
              action: "addExercise",
              exercise: {
                name: draft.name,
                shortName: draft.name.slice(0, 80),
                type: draft.type,
                movementPattern: draft.movementPattern,
                primaryMuscles: draft.primaryMuscles,
                secondaryMuscles: draft.secondaryMuscles,
                equipment: draft.equipment,
                metricType: draft.metricType,
                bodyweightExercise,
                supportsAssistance: draft.loadMode === "assisted" ? 1 : 0,
                supportsAddedWeight: draft.loadMode === "added" ? 1 : 0,
                defaultRepMin: draft.defaultRepMin,
                defaultRepMax: draft.defaultRepMax,
                defaultRIR: draft.defaultRIR,
                notes: draft.notes,
                enabled: 1,
              },
            });
            if (result) {
              setDraft(emptyExercise);
              setShowAdd(false);
            }
          }}
        >
          <div className="section-title">
            <div>
              <p className="eyebrow">NUEVO EJERCICIO</p>
              <h2>Define cómo se registra</h2>
            </div>
          </div>
          <div className="exercise-form-grid">
            <label className="field wide-field">
              Nombre
              <input
                required
                minLength={2}
                maxLength={120}
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                placeholder="Remo con mancuerna"
              />
            </label>
            <label className="field">
              Categoría
              <select
                value={draft.type}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    type: event.target.value as ExerciseType,
                  })
                }
              >
                <option value="calisthenics">Calistenia</option>
                <option value="gym">Gimnasio</option>
                <option value="mobility">Movilidad</option>
                <option value="skill">Habilidad</option>
              </select>
            </label>
            <label className="field">
              Medición
              <select
                value={draft.metricType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    metricType: event.target.value as Exercise["metricType"],
                  })
                }
              >
                <option value="reps">Repeticiones</option>
                <option value="time">Tiempo en segundos</option>
              </select>
            </label>
            <label className="field wide-field">
              Tipo de carga
              <select
                value={draft.loadMode}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    loadMode: event.target.value as LoadMode,
                    equipment:
                      event.target.value === "external"
                        ? "Máquina, barra o mancuernas"
                        : "Peso corporal",
                  })
                }
              >
                <option value="bodyweight">Solo peso corporal</option>
                <option value="added">Peso corporal con lastre</option>
                <option value="assisted">Peso corporal con asistencia</option>
                <option value="external">Peso externo</option>
              </select>
            </label>
            <label className="field">
              Patrón de movimiento
              <input
                required
                maxLength={50}
                value={draft.movementPattern}
                onChange={(event) =>
                  setDraft({ ...draft, movementPattern: event.target.value })
                }
                placeholder="tirón horizontal"
              />
            </label>
            <label className="field">
              Equipo
              <input
                maxLength={120}
                value={draft.equipment}
                onChange={(event) =>
                  setDraft({ ...draft, equipment: event.target.value })
                }
              />
            </label>
            <label className="field">
              Músculos principales
              <input
                maxLength={200}
                value={draft.primaryMuscles}
                onChange={(event) =>
                  setDraft({ ...draft, primaryMuscles: event.target.value })
                }
                placeholder="Dorsal, bíceps"
              />
            </label>
            <label className="field">
              Músculos secundarios
              <input
                maxLength={200}
                value={draft.secondaryMuscles}
                onChange={(event) =>
                  setDraft({ ...draft, secondaryMuscles: event.target.value })
                }
                placeholder="Antebrazo"
              />
            </label>
            <label className="field">
              {draft.metricType === "time" ? "Segundos mín." : "Reps mín."}
              <input
                type="number"
                min="0"
                max="1000"
                value={draft.defaultRepMin}
                onChange={(event) =>
                  setDraft({ ...draft, defaultRepMin: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              {draft.metricType === "time" ? "Segundos máx." : "Reps máx."}
              <input
                type="number"
                min={draft.defaultRepMin}
                max="1000"
                value={draft.defaultRepMax}
                onChange={(event) =>
                  setDraft({ ...draft, defaultRepMax: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              RIR objetivo
              <input
                maxLength={20}
                value={draft.defaultRIR}
                onChange={(event) =>
                  setDraft({ ...draft, defaultRIR: event.target.value })
                }
              />
            </label>
            <label className="field notes-field">
              Notas técnicas
              <textarea
                maxLength={2000}
                value={draft.notes}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
              />
            </label>
          </div>
          <button
            className="primary"
            disabled={
              busy ||
              draft.name.trim().length < 2 ||
              draft.defaultRepMax < draft.defaultRepMin
            }
          >
            Guardar ejercicio
          </button>
        </form>
      )}

      <section className="settings-card">
        <div className="section-title">
          <h2>
            <BookOpen size={21} /> Todos los ejercicios
          </h2>
          <span className="tag">{data.exercises.length} EJERCICIOS</span>
        </div>
        <label className="field">
          Buscar ejercicio
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Dominadas, fondos, core…"
          />
        </label>
        <div className="library-list">
          {data.exercises
            .filter((exercise) =>
              `${exercise.name} ${exercise.primaryMuscles}`
                .toLocaleLowerCase("es")
                .includes(search.toLocaleLowerCase("es")),
            )
            .map((exercise) => (
              <details key={exercise.id}>
                <summary>
                  {exercise.name}
                  <span>
                    {exercise.metricType === "time" ? "Tiempo" : "Reps"} ·{" "}
                    {exercise.bodyweightExercise
                      ? exercise.supportsAssistance
                        ? "Con asistencia"
                        : exercise.supportsAddedWeight
                          ? "Con lastre"
                          : "Peso corporal"
                      : "Peso externo"}
                  </span>
                </summary>
                <p>
                  {exercise.primaryMuscles || "Músculos sin especificar"} ·{" "}
                  {exercise.equipment || "Sin equipo especificado"}
                </p>
                <p>{exercise.notes || "Sin notas permanentes."}</p>
              </details>
            ))}
        </div>
      </section>
    </>
  );
}
