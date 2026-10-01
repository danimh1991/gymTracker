"use client";

import { useState } from "react";
import { Bike, Plus, X } from "lucide-react";
import { SPORTS, sportDefinition, type SportKey } from "../domain/sports";
import type { Execute } from "./Training";

const groups = [...new Set(SPORTS.map((sport) => sport.group))];

export function ExternalActivityForm({
  busy,
  execute,
}: {
  busy: boolean;
  execute: Execute;
}) {
  const today = new Date().toLocaleDateString("sv-SE");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sport, setSport] = useState<SportKey>("padel");
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [laps, setLaps] = useState("");
  const [elevation, setElevation] = useState("");
  const [intensity, setIntensity] = useState<"easy" | "moderate" | "hard">(
    "moderate",
  );
  const [notes, setNotes] = useState("");
  const definition = sportDefinition(sport);
  const needsDistance = "distance" in definition && definition.distance;
  const needsLaps = "laps" in definition && definition.laps;
  const supportsElevation = "elevation" in definition && definition.elevation;

  const selectSport = (nextSport: SportKey) => {
    setSport(nextSport);
    setDistance("");
    setLaps("");
    setElevation("");
    setSaved(false);
  };

  return (
    <section className={`external-activity-panel ${open ? "is-open" : ""}`}>
      <div className="external-activity-intro">
        <span className="external-activity-icon">
          <Bike size={24} />
        </span>
        <div>
          <p className="eyebrow">MÁS ALLÁ DEL GIMNASIO</p>
          <h2>¿Has practicado otro deporte?</h2>
          <p className="muted">
            Añádelo a tu actividad para que también aparezca en el histórico.
          </p>
        </div>
        <button
          type="button"
          className={open ? "icon-button" : "primary"}
          aria-label={open ? "Cerrar formulario" : undefined}
          onClick={() => {
            setOpen(!open);
            setSaved(false);
          }}
        >
          {open ? (
            <X size={18} />
          ) : (
            <>
              <Plus size={18} /> Registrar deporte
            </>
          )}
        </button>
      </div>

      {open && (
        <form
          className="external-activity-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await execute({
              action: "addExternalActivity",
              activity: {
                sport,
                date,
                durationMinutes: Number(duration),
                distanceKm: needsDistance ? Number(distance) : null,
                laps: needsLaps ? Number(laps) : null,
                elevationGainM:
                  supportsElevation && elevation ? Number(elevation) : null,
                intensity,
                notes,
              },
            });
            if (result) {
              setDuration("");
              setDistance("");
              setLaps("");
              setElevation("");
              setNotes("");
              setSaved(true);
              setOpen(false);
            }
          }}
        >
          <label className="field sport-field">
            Deporte
            <select
              value={sport}
              onChange={(event) => selectSport(event.target.value as SportKey)}
            >
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {SPORTS.filter((item) => item.group === group).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.emoji} {item.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            Fecha
            <input
              required
              type="date"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label className="field">
            Tiempo (min)
            <input
              required
              type="number"
              min="1"
              max="1440"
              inputMode="numeric"
              placeholder="60"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </label>
          {needsDistance && (
            <label className="field">
              Distancia (km)
              <input
                required
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                inputMode="decimal"
                placeholder="5,00"
                value={distance}
                onChange={(event) => setDistance(event.target.value)}
              />
            </label>
          )}
          {needsLaps && (
            <label className="field">
              Número de largos
              <input
                required
                type="number"
                min="1"
                max="10000"
                inputMode="numeric"
                placeholder="40"
                value={laps}
                onChange={(event) => setLaps(event.target.value)}
              />
            </label>
          )}
          {supportsElevation && (
            <label className="field">
              Desnivel positivo (m)
              <input
                type="number"
                min="0"
                max="20000"
                inputMode="numeric"
                placeholder="Opcional"
                value={elevation}
                onChange={(event) => setElevation(event.target.value)}
              />
            </label>
          )}
          <label className="field">
            Intensidad
            <select
              value={intensity}
              onChange={(event) =>
                setIntensity(event.target.value as typeof intensity)
              }
            >
              <option value="easy">Suave</option>
              <option value="moderate">Moderada</option>
              <option value="hard">Intensa</option>
            </select>
          </label>
          <label className="field activity-notes">
            Notas
            <input
              maxLength={2000}
              placeholder="Opcional"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <button className="primary activity-submit" disabled={busy}>
            {busy ? "Guardando…" : `Guardar ${definition.name.toLowerCase()}`}
          </button>
        </form>
      )}
      {saved && <p className="success-line">Actividad guardada.</p>}
    </section>
  );
}
