"use client";
import { useState } from "react";
import {
  Download,
  FlaskConical,
  Scale,
  BookOpen,
  Plus,
  Upload,
} from "lucide-react";
import type { Snapshot } from "../domain/types";
import type { Execute } from "./Training";
import { exportData } from "../services/export";
import { dateLabel } from "./Home";
export function More({
  data,
  demo,
  setDemo,
  busy,
  execute,
}: {
  data: Snapshot;
  demo: boolean;
  setDemo: (v: boolean) => void;
  busy: boolean;
  execute: Execute;
}) {
  const [weight, setWeight] = useState(""),
    [date, setDate] = useState(new Date().toLocaleDateString("sv-SE")),
    [saved, setSaved] = useState(false),
    [search, setSearch] = useState(""),
    [showAdd, setShowAdd] = useState(false),
    [exerciseName, setExerciseName] = useState("");
  const downloadJson = (name: string, value: unknown) => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importJson = async (
    file: File | undefined,
    kind: "templates" | "exercises",
  ) => {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      const rows = Array.isArray(value) ? value : value[kind];
      if (!Array.isArray(rows))
        throw new Error("El JSON no contiene una lista válida.");
      await execute(
        kind === "templates"
          ? { action: "importTemplates", templates: rows }
          : { action: "importExercises", exercises: rows },
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A TU MEDIDA</p>
          <h1>Tu espacio.</h1>
          <p className="muted">
            Peso corporal, biblioteca y una copia de tus datos.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="settings-card">
          <h2>
            <Scale size={21} /> Peso corporal
          </h2>
          <p className="muted">
            El último peso disponible se guarda con cada sesión nueva.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await execute({
                  action: "bodyWeight",
                  weightKg: Number(weight),
                  date,
                })
              ) {
                setWeight("");
                setSaved(true);
              }
            }}
          >
            <div className="weight-form">
              <label className="field">
                Peso (kg)
                <input
                  required
                  type="number"
                  inputMode="decimal"
                  min="20"
                  max="400"
                  step="0.1"
                  placeholder="72,5"
                  value={weight}
                  onChange={(e) => {
                    setWeight(e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
              <label className="field">
                Fecha
                <input
                  required
                  type="date"
                  max={new Date().toLocaleDateString("sv-SE")}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>
            <button className="primary" disabled={busy}>
              Guardar peso
            </button>
            {saved && (
              <p role="status" className="success-line">
                Peso guardado.
              </p>
            )}
          </form>
          <div className="weight-history">
            {data.bodyWeights.slice(0, 8).map((w) => (
              <div key={w.id}>
                <span>{dateLabel(w.date + "T12:00:00")}</span>
                <strong>{w.weightKg} kg</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="settings-card">
          <h2>
            <Download size={21} /> Exportar mis datos
          </h2>
          <p className="muted">
            Descarga todos tus registros, incluidas las sesiones canceladas.
            Guarda una copia periódicamente.
          </p>
          <div className="export-buttons">
            <button
              className="secondary"
              onClick={() => exportData(data, "json", demo)}
            >
              Descargar JSON completo
            </button>
            <button
              className="secondary"
              onClick={() => exportData(data, "workouts", demo)}
            >
              CSV de entrenamientos
            </button>
            <button
              className="secondary"
              onClick={() => exportData(data, "sets", demo)}
            >
              CSV de series
            </button>
          </div>
          <p className="small muted">
            La restauración del JSON y el importador WorkoutWise se incorporarán
            en la Fase 3.
          </p>
        </section>
      </div>
      <section className="settings-card demo-card">
        <div>
          <h2>
            <FlaskConical size={21} /> Entrena la aplicación
          </h2>
          <p className="muted">
            El modo demo usa registros separados. No modifica tus entrenamientos
            reales.
          </p>
        </div>
        <div className="button-row">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setDemo(!demo)}
          >
            {demo ? "Volver a mis datos" : "Entrar en modo demo"}
          </button>
          {demo && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void execute({ action: "resetDemo" })}
            >
              {busy ? "Preparando…" : "Reiniciar demo con 3 sesiones"}
            </button>
          )}
        </div>
      </section>
      <section className="settings-card">
        <div className="section-title">
          <h2>
            <BookOpen size={21} /> Biblioteca inicial
          </h2>
          <span className="tag">{data.exercises.length} EJERCICIOS</span>
        </div>
        <label className="field">
          Buscar ejercicio
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Dominadas, fondos, core…"
          />
        </label>
        <div className="library-list">
          {data.exercises
            .filter((e) =>
              (e.name + " " + e.primaryMuscles)
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((e) => (
              <details key={e.id}>
                <summary>
                  {e.name}
                  <span>
                    {e.type === "calisthenics" ? "Calistenia" : "Gimnasio"}
                  </span>
                </summary>
                <p>
                  {e.primaryMuscles} · {e.equipment}
                </p>
                <p>{e.notes || "Sin notas permanentes."}</p>
                {!!e.supportsAssistance && (
                  <p>
                    La asistencia se registra en kg reales. La convención
                    histórica de 1 kg no se aplica a registros nuevos.
                  </p>
                )}
              </details>
            ))}
        </div>
        <div className="library-actions">
          <button className="secondary" onClick={() => setShowAdd(!showAdd)}>
            <Plus size={17} />
            Añadir ejercicio
          </button>
          <button
            className="secondary"
            onClick={() =>
              downloadJson("gym-tracker-ejercicios.json", {
                version: 1,
                exercises: data.exercises,
              })
            }
          >
            <Download size={17} />
            Exportar ejercicios
          </button>
          <label className="secondary file-button">
            <Upload size={17} />
            Importar ejercicios
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) =>
                void importJson(e.target.files?.[0], "exercises")
              }
            />
          </label>
        </div>
        {showAdd && (
          <form
            className="quick-add"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await execute({
                action: "addExercise",
                exercise: {
                  name: exerciseName,
                  shortName: exerciseName,
                  type: "calisthenics",
                  movementPattern: "skill",
                  primaryMuscles: "",
                  secondaryMuscles: "",
                  equipment: "Peso corporal",
                  metricType: "reps",
                  bodyweightExercise: 1,
                  supportsAssistance: 0,
                  supportsAddedWeight: 0,
                  defaultRepMin: 8,
                  defaultRepMax: 12,
                  defaultRIR: "1–2",
                  notes: "",
                  enabled: 1,
                },
              });
              if (result) {
                setExerciseName("");
                setShowAdd(false);
              }
            }}
          >
            <label className="field">
              Nombre
              <input
                required
                minLength={2}
                value={exerciseName}
                onChange={(e) => setExerciseName(e.target.value)}
                placeholder="Nuevo ejercicio"
              />
            </label>
            <p className="small muted">
              Se crea como ejercicio de calistenia por repeticiones. Después
              podrás usarlo en cualquier plantilla o sesión.
            </p>
            <button className="primary">Guardar ejercicio</button>
          </form>
        )}
      </section>
      <section className="settings-card">
        <h2>
          <Download size={21} /> Plantillas
        </h2>
        <p className="muted">
          Importa o exporta grupos completos de plantillas A/B/C. Los ejercicios
          referenciados deben existir en tu biblioteca.
        </p>
        <div className="library-actions">
          <button
            className="secondary"
            onClick={() =>
              downloadJson("gym-tracker-plantillas.json", {
                version: 1,
                templates: data.templates.map((t) => ({
                  ...t,
                  exercises: data.templateExercises
                    .filter((e) => e.templateId === t.id)
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
                })),
              })
            }
          >
            <Download size={17} />
            Exportar plantillas
          </button>
          <label className="secondary file-button">
            <Upload size={17} />
            Importar plantillas
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) =>
                void importJson(e.target.files?.[0], "templates")
              }
            />
          </label>
        </div>
      </section>
      <p className="notice">
        Primera versión: registro, histórico y persistencia. El editor de rutina
        y biblioteca, skills, importación y modo offline están pendientes.
      </p>
    </>
  );
}
