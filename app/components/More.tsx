"use client";
import { useState } from "react";
import {
  Download,
  FlaskConical,
  Scale,
  CalendarDays,
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
    [saved, setSaved] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A TU MEDIDA</p>
          <h1>Preferencias.</h1>
          <p className="muted">
            Peso corporal, configuración y una copia de tus datos.
          </p>
        </div>
      </div>
      <section className="settings-card days-setting">
        <div>
          <h2>
            <CalendarDays size={21} /> Días de entrenamiento
          </h2>
          <p className="muted">
            Decide cuántos días forman tu ciclo. Las plantillas de los días que
            quites se conservan por si vuelves a añadirlos.
          </p>
        </div>
        <div
          className="day-stepper"
          aria-label="Número de días de entrenamiento"
        >
          <button
            className="secondary"
            aria-label="Quitar un día"
            disabled={busy || data.settings.trainingDays <= 1}
            onClick={() =>
              void execute({
                action: "setTrainingDays",
                trainingDays: data.settings.trainingDays - 1,
              })
            }
          >
            −
          </button>
          <strong>{data.settings.trainingDays}</strong>
          <span>{data.settings.trainingDays === 1 ? "día" : "días"}</span>
          <button
            className="secondary"
            aria-label="Añadir un día"
            disabled={busy || data.settings.trainingDays >= 7}
            onClick={() =>
              void execute({
                action: "setTrainingDays",
                trainingDays: data.settings.trainingDays + 1,
              })
            }
          >
            +
          </button>
        </div>
      </section>
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
    </>
  );
}
