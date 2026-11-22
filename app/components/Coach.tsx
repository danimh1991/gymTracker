"use client";

import { useMemo, useState } from "react";
import { BrainCircuit, ChevronDown, Play, RefreshCw, Settings2, Sparkles } from "lucide-react";
import type { AdaptiveConstraints, MuscleGroup, PlanExercise, Snapshot } from "../domain/types";
import type { Command } from "../services/validation";
import { MUSCLE_GROUPS } from "../services/adaptive-planner";
import { PlanEditor } from "./PlanEditor";

const LABELS: Record<MuscleGroup, string> = {
  vertical_pull: "Tracción vertical",
  horizontal_pull: "Tracción horizontal",
  chest: "Pecho",
  vertical_push: "Empuje vertical",
  lateral_rear_delts: "Deltoides lateral/posterior",
  biceps: "Bíceps",
  triceps: "Tríceps",
  quads: "Cuádriceps",
  posterior_chain: "Cadena posterior",
  core: "Core",
  calves: "Gemelos",
  forearms_grip: "Antebrazo y agarre",
};

type Generated = {
  id: string;
  plan: PlanExercise[];
  rationale: string[];
  context: Snapshot["adaptiveProposals"][number]["context"];
  source: "llm" | "fallback";
  fallbackReason?: string | null;
  diagnosticCode?: string | null;
};

export function Coach({
  data,
  busy,
  execute,
  generate,
  onStart,
  onContinue,
}: {
  data: Snapshot;
  busy: boolean;
  execute: (command: Command) => Promise<Snapshot | null>;
  generate: (constraints: AdaptiveConstraints) => Promise<Generated | null>;
  onStart: (plan: PlanExercise[], proposalId: string) => void;
  onContinue: () => void;
}) {
  const active = data.workouts.find((workout) => workout.status === "active");
  const [duration, setDuration] = useState<AdaptiveConstraints["durationMinutes"]>(
    ([30, 45, 50, 60, 75].includes(data.settings.defaultDurationMinutes)
      ? data.settings.defaultDurationMinutes
      : 50) as AdaptiveConstraints["durationMinutes"],
  );
  const [energy, setEnergy] = useState<AdaptiveConstraints["energy"]>("normal");
  const [includeWarmup, setIncludeWarmup] = useState(Boolean(data.settings.includeWarmupInDuration));
  const [warmupMinutes, setWarmupMinutes] = useState(data.settings.generalWarmupMinutes);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [plan, setPlan] = useState<PlanExercise[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [priorities, setPriorities] = useState(data.settings.priorities);
  const [frequency, setFrequency] = useState(data.settings.usualFrequency);
  const [variation, setVariation] = useState(data.settings.variationLevel);
  const [equipment, setEquipment] = useState(data.settings.availableEquipment.join(", "));
  const [preferences, setPreferences] = useState(data.settings.exercisePreferences);
  const totalSets = plan.reduce((sum, item) => sum + item.sets, 0);
  const topNeeds = useMemo(() => generated?.context.needs.slice(0, 5) ?? [], [generated]);
  const coveredGroups = useMemo(() => [...new Set(plan.flatMap((row) =>
    data.exercises.find((exercise) => exercise.id === row.exerciseId)?.stimulus
      .filter((stimulus) => stimulus.direct && stimulus.weight > 0).map((stimulus) => stimulus.group) ?? [],
  ))], [data.exercises, plan]);

  async function createSession() {
    await persistSettings();
    const result = await generate({ durationMinutes: duration, energy, blockedExerciseIds: blocked,
      equipment: equipment.split(",").map((item) => item.trim()).filter(Boolean) });
    if (result) {
      setGenerated(result);
      setPlan(result.plan);
    }
  }

  async function persistSettings() {
    return execute({
      action: "setTrainerSettings",
      settings: {
        defaultDurationMinutes: duration,
        includeWarmupInDuration: includeWarmup ? 1 : 0,
        generalWarmupMinutes: warmupMinutes,
        usualFrequency: frequency,
        variationLevel: variation,
        priorities,
        exercisePreferences: preferences,
        availableEquipment: equipment.split(",").map((item) => item.trim()).filter(Boolean),
      },
    });
  }

  async function saveSettings() {
    const result = await persistSettings();
    if (result) setSettingsOpen(false);
  }

  async function start() {
    if (!generated || !plan.length) return;
    await execute({ action: "updateAdaptiveProposal", proposalId: generated.id, plan });
    onStart(plan, generated.id);
  }

  if (active) return (
    <section className="coach-resume">
      <span className="coach-orb"><BrainCircuit size={28} /></span>
      <div><p className="eyebrow">SESIÓN EN CURSO</p><h1>Tu entrenamiento te está esperando.</h1><p className="muted">Se conserva cada serie guardada. Puedes retomarlo exactamente donde lo dejaste.</p></div>
      <button className="primary" onClick={onContinue}><Play size={18} fill="currentColor" /> Continuar sesión</button>
    </section>
  );

  return (
    <>
      <section className="coach-hero">
        <div className="coach-hero-copy">
          <span className="tag lime"><Sparkles size={14} /> ENTRENADOR ADAPTATIVO</span>
          <h1>¿Qué necesita tu cuerpo <span>hoy?</span></h1>
          <p>Analizo recuperación, volumen reciente, prioridades y progresión antes de elegir ejercicios concretos.</p>
        </div>
        <div className="coach-controls">
          <label><span>Tiempo disponible</span><select value={duration} onChange={(e) => setDuration(Number(e.target.value) as typeof duration)}>{[30,45,50,60,75].map((v) => <option key={v} value={v}>{v} min</option>)}</select></label>
          <label><span>Energía de hoy</span><select value={energy} onChange={(e) => setEnergy(e.target.value as typeof energy)}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option></select></label>
          <label className="warmup-time-toggle"><span><input type="checkbox" checked={includeWarmup} onChange={(e) => setIncludeWarmup(e.target.checked)} /> Incluir calentamiento en el tiempo</span><small>{includeWarmup ? `${warmupMinutes} min de calentamiento; ${duration - warmupMinutes} min de sesión principal` : `${duration} min íntegros para la sesión principal`}</small></label>
          <button className="primary coach-generate" disabled={busy} onClick={() => void createSession()}>{generated ? <RefreshCw size={18} /> : <BrainCircuit size={18} />}{busy ? "Analizando…" : generated ? "Regenerar propuesta" : "Preparar mi sesión"}</button>
          <button className="coach-settings-button" onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={17} /> Ajustar prioridades <ChevronDown size={16} /></button>
        </div>
      </section>

      {settingsOpen && <section className="coach-settings"><div><p className="eyebrow">CONFIGURACIÓN REAL</p><h2>Cómo debe entrenarte</h2><p className="muted">Todos estos valores entran en el cálculo o en la selección de ejercicios.</p></div><div className="coach-setting-basics"><label><span>Sesiones habituales/semana</span><select value={frequency} onChange={(e) => setFrequency(Number(e.target.value))}>{[1,2,3,4,5,6,7].map((v) => <option key={v}>{v}</option>)}</select></label><label><span>Nivel de variación</span><select value={variation} onChange={(e) => setVariation(Number(e.target.value))}><option value={1}>Bajo · continuidad</option><option value={2}>Medio</option><option value={3}>Alto</option></select></label><label><span>Equipamiento (separado por comas)</span><input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Poleas, mancuernas, prensa" /></label>{includeWarmup && <label><span>Calentamiento general (min)</span><input type="number" min={0} max={20} value={warmupMinutes} onChange={(e) => setWarmupMinutes(Math.max(0, Math.min(20, Number(e.target.value))))} /></label>}</div><h3>Prioridad por estímulo</h3><div className="priority-grid">{MUSCLE_GROUPS.map((group) => <label key={group}><span>{LABELS[group]}</span><select value={priorities[group]} onChange={(e) => setPriorities({ ...priorities, [group]: Number(e.target.value) })}>{[1,2,3,4,5].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>)}</div><details className="exercise-preferences"><summary>Preferencia por ejercicio</summary><div className="priority-grid">{data.exercises.filter((item) => item.enabled).map((exercise) => <label key={exercise.id}><span>{exercise.name}</span><select value={preferences[exercise.id] ?? 3} onChange={(e) => setPreferences({ ...preferences, [exercise.id]: Number(e.target.value) })}>{[1,2,3,4,5].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>)}</div></details><button className="secondary" disabled={busy} onClick={() => void saveSettings()}>Guardar configuración</button></section>}

      <details className="coach-blocked"><summary>¿Algún ejercicio no está disponible hoy?</summary><div>{data.exercises.filter((e) => e.enabled).map((exercise) => <label key={exercise.id}><input type="checkbox" checked={blocked.includes(exercise.id)} onChange={(e) => setBlocked(e.target.checked ? [...blocked, exercise.id] : blocked.filter((id) => id !== exercise.id))} /> {exercise.name}</label>)}</div></details>

      {generated ? <>
        <section className="coach-analysis"><div><p className="eyebrow">POR QUÉ ESTA SESIÓN</p><h2>Prioridades detectadas</h2></div><div className="need-grid">{topNeeds.map((need) => <article key={need.group}><span>{LABELS[need.group]}</span><strong>{need.score.toFixed(1)}</strong><small>{need.directSets10d}/{need.targetSets10d} directas · 10 días</small></article>)}</div><h3>Necesidades cubiertas directamente</h3><p>{coveredGroups.map((group) => LABELS[group]).join(" · ")}</p>{generated.context.decisionAudit?.uncoveredNeeds.length ? <><h3>Necesidades no cubiertas</h3><ul>{generated.context.decisionAudit.uncoveredNeeds.map((item) => <li key={item.group}>{LABELS[item.group]} ({item.score.toFixed(1)}): {item.reason === "time" ? "no cabe en el tiempo" : item.reason === "recovery" ? "recuperación insuficiente" : item.reason === "equipment" ? "equipamiento no disponible" : item.reason === "no_candidate" ? "sin candidato directo" : "menor prioridad residual"}</li>)}</ul></> : null}<ul>{generated.rationale.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="muted">Presupuesto principal: {Math.round((generated.context.timeBudget?.mainSessionSeconds ?? duration * 60) / 60)} min{generated.context.timeBudget?.generalWarmupSeconds ? ` + ${Math.round(generated.context.timeBudget.generalWarmupSeconds / 60)} min de calentamiento incluidos` : "; calentamiento general fuera del tiempo"}.</p><p className="planner-source">Motor: {generated.source === "llm" ? "IA validada (esquema + coherencia deportiva)" : "respaldo determinista"}. Reglas versionadas y catálogo cerrado.</p>{generated.fallbackReason && <p className="muted" title={generated.diagnosticCode ?? undefined}>{generated.fallbackReason}</p>}</section>
        <section className="coach-plan"><div className="section-title"><div><p className="eyebrow">PROPUESTA EDITABLE</p><h2>{plan.length} ejercicios · {totalSets} series · ~{duration} min</h2></div></div><PlanEditor plan={plan} exercises={data.exercises} onChange={setPlan} /><button className="primary coach-start" disabled={busy || !plan.length} onClick={() => void start()}><Play size={19} fill="currentColor" /> Empezar entrenamiento adaptativo</button></section>
      </> : <section className="coach-empty"><BrainCircuit size={34} /><h2>La sesión no existe hasta analizar tu contexto.</h2><p>Ya no hay un día A, B o C que “toque”. Cada propuesta parte de lo que realizaste de verdad.</p></section>}
    </>
  );
}
