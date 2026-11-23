"use client";

import { useMemo, useState } from "react";
import { BrainCircuit, ChevronDown, Play, RefreshCw, Settings2, Sparkles } from "lucide-react";
import type { AdaptiveConstraints, LocationEquipmentOverride, MuscleFocus, MuscleGroup, PlanExercise, SessionModality, Snapshot, TrainingLocation } from "../domain/types";
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
const LOCATION_LABELS: Record<TrainingLocation, string> = { gym: "Gimnasio", calisthenics_park: "Parque de calistenia", home: "Casa", outdoors: "Aire libre sin equipamiento", hotel: "Hotel / viaje", custom: "Personalizado" };
const MODALITY_LABELS: Record<SessionModality, string> = { general: "General adaptativo", hypertrophy: "Hipertrofia", calisthenics: "Calistenia", strength: "Fuerza", muscular_endurance: "Resistencia muscular", functional_mobility: "Funcional / movilidad" };
const FOCUS_LABELS: Record<MuscleFocus, string> = { automatic: "Automático", full_body: "Cuerpo completo", upper_body: "Tren superior", lower_body: "Tren inferior", push: "Empuje", pull: "Tracción", back: "Espalda", chest: "Pecho", shoulders: "Hombros", arms: "Brazos completos", biceps: "Bíceps", triceps: "Tríceps", quads: "Cuádriceps", posterior_chain: "Cadena posterior", calves: "Gemelos", core: "Abdomen / core" };
const emptyLocationOverride = (): LocationEquipmentOverride => ({ available: [], unavailable: [], availableExerciseIds: [], excludedExerciseIds: [] });

function clock(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

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
  const [location, setLocation] = useState<TrainingLocation>(data.settings.defaultTrainingLocation);
  const [modality, setModality] = useState<SessionModality>("general");
  const [muscleFocus, setMuscleFocus] = useState<MuscleFocus>("automatic");
  const [customProfileId, setCustomProfileId] = useState(data.settings.customEquipmentProfiles[0]?.id ?? "");
  const [includeWarmup, setIncludeWarmup] = useState(Boolean(data.settings.includeWarmupInDuration));
  const [warmupMinutes, setWarmupMinutes] = useState(data.settings.generalWarmupMinutes);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [plan, setPlan] = useState<PlanExercise[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [priorities, setPriorities] = useState(data.settings.priorities);
  const [frequency, setFrequency] = useState(data.settings.usualFrequency);
  const [variation, setVariation] = useState(data.settings.variationLevel);
  const [equipmentProfile, setEquipmentProfile] = useState(data.settings.equipmentProfile);
  const [excludedExercises, setExcludedExercises] = useState(data.settings.excludedExerciseIds);
  const [locationOverrides, setLocationOverrides] = useState(data.settings.locationEquipmentOverrides);
  const [customProfiles, setCustomProfiles] = useState(data.settings.customEquipmentProfiles);
  const [equipment, setEquipment] = useState(data.settings.availableEquipment.join(", "));
  const [preferences, setPreferences] = useState(data.settings.exercisePreferences);
  const totalSets = plan.reduce((sum, item) => sum + item.sets, 0);
  const planTiming = useMemo(() => plan.reduce((sum, row) => ({
    work: sum.work + (row.timing?.workSeconds ?? 0), rest: sum.rest + (row.timing?.restSeconds ?? 0),
    transition: sum.transition + (row.timing?.transitionSeconds ?? 0), ramp: sum.ramp + (row.timing?.rampUpSeconds ?? 0),
    total: sum.total + (row.estimatedSeconds ?? 0),
  }), { work: 0, rest: 0, transition: 0, ramp: 0, total: 0 }), [plan]);
  const generalWarmupSeconds = generated?.context.timeBudget?.generalWarmupSeconds ?? 0;
  const topNeeds = useMemo(() => generated?.context.needs.slice(0, 5) ?? [], [generated]);
  const coveredGroups = useMemo(() => [...new Set(plan.flatMap((row) =>
    data.exercises.find((exercise) => exercise.id === row.exerciseId)?.stimulus
      .filter((stimulus) => stimulus.direct && stimulus.weight > 0).map((stimulus) => stimulus.group) ?? [],
  ))], [data.exercises, plan]);

  async function createSession() {
    await persistSettings();
    const result = await generate({ durationMinutes: duration, energy, blockedExerciseIds: blocked,
      equipment: equipment.split(",").map((item) => item.trim()).filter(Boolean), location,
      customEquipmentProfileId: location === "custom" ? customProfileId : null, modality, muscleFocus });
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
        equipmentProfile,
        excludedExerciseIds: excludedExercises,
        defaultTrainingLocation: location,
        locationEquipmentOverrides: Object.fromEntries(Object.entries(locationOverrides)
          .map(([key, value]) => [key, { ...value!, availableExerciseIds: value?.availableExerciseIds ?? [] }])),
        customEquipmentProfiles: customProfiles.map((profile) => ({ ...profile, availableExerciseIds: profile.availableExerciseIds ?? [] })),
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

  function list(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
  function updateLocationOverride(field: "available" | "unavailable", value: string) {
    if (location === "custom") return;
    const current = locationOverrides[location] ?? emptyLocationOverride();
    setLocationOverrides({ ...locationOverrides, [location]: { ...current, [field]: list(value) } });
  }
  function addCustomProfile() {
    const id = crypto.randomUUID();
    setCustomProfiles([...customProfiles, { id, name: "Nuevo perfil", baseLocation: "hotel", available: ["Peso corporal", "Suelo"], unavailable: [], availableExerciseIds: [], excludedExerciseIds: [], exercisePreferences: {} }]);
    setCustomProfileId(id); setLocation("custom");
  }
  function setLocationExerciseStatus(exerciseId: string, status: "automatic" | "available" | "unavailable") {
    if (location === "custom") {
      setCustomProfiles(customProfiles.map((profile) => profile.id === customProfileId
        ? { ...profile,
          availableExerciseIds: status === "available" ? [...new Set([...(profile.availableExerciseIds ?? []), exerciseId])] : (profile.availableExerciseIds ?? []).filter((id) => id !== exerciseId),
          excludedExerciseIds: status === "unavailable" ? [...new Set([...profile.excludedExerciseIds, exerciseId])] : profile.excludedExerciseIds.filter((id) => id !== exerciseId) } : profile));
      return;
    }
    const current = locationOverrides[location] ?? emptyLocationOverride();
    setLocationOverrides({ ...locationOverrides, [location]: { ...current,
      availableExerciseIds: status === "available" ? [...new Set([...(current.availableExerciseIds ?? []), exerciseId])] : (current.availableExerciseIds ?? []).filter((id) => id !== exerciseId),
      excludedExerciseIds: status === "unavailable" ? [...new Set([...current.excludedExerciseIds, exerciseId])] : current.excludedExerciseIds.filter((id) => id !== exerciseId) } });
  }
  function updateCustomProfile(patch: Partial<(typeof customProfiles)[number]>) {
    setCustomProfiles(customProfiles.map((profile) => profile.id === customProfileId ? { ...profile, ...patch } : profile));
  }
  const currentOverride = location === "custom" ? null : locationOverrides[location] ?? emptyLocationOverride();
  const currentCustomProfile = customProfiles.find((profile) => profile.id === customProfileId);
  const locationAvailableExercises = location === "custom" ? currentCustomProfile?.availableExerciseIds ?? [] : currentOverride?.availableExerciseIds ?? [];
  const locationExcluded = location === "custom" ? currentCustomProfile?.excludedExerciseIds ?? [] : currentOverride?.excludedExerciseIds ?? [];
  const configurableExercises = data.exercises.filter((item) => item.enabled && item.planningStatus === "active")
    .sort((a, b) => a.equipment.localeCompare(b.equipment, "es") || a.name.localeCompare(b.name, "es"));

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
          <h1>Prepara tu sesión de <span>hoy</span></h1>
          <p>Ajusta lo esencial. El entrenador cruza recuperación, volumen y progresión para construir una sesión realista.</p>
          <div className="coach-context-strip">
            <span><strong>{duration}</strong> min</span>
            <span><strong>{LOCATION_LABELS[location]}</strong> lugar</span>
            <span><strong>{FOCUS_LABELS[muscleFocus]}</strong> enfoque</span>
          </div>
        </div>
        <div className="coach-controls">
          <div className="coach-control-heading"><span>CONFIGURA TU ENTRENO</span><small>3 decisiones rápidas</small></div>
          <label className="coach-control-wide"><span>Lugar</span><select value={location} onChange={(e) => setLocation(e.target.value as TrainingLocation)}>{Object.entries(LOCATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {location === "custom" && (customProfiles.length ? <label><span>Perfil personalizado</span><select value={customProfileId} onChange={(e) => setCustomProfileId(e.target.value)}>{customProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label> : <button className="secondary" type="button" onClick={addCustomProfile}>Crear perfil personalizado</button>)}
          <fieldset className="coach-segment-field"><legend>Tiempo</legend><div className="coach-segments">{[30,45,50,60,75].map((v) => <button type="button" className={duration === v ? "active" : ""} key={v} onClick={() => setDuration(v as typeof duration)}>{v}</button>)}</div></fieldset>
          <fieldset className="coach-segment-field"><legend>Energía</legend><div className="coach-segments three">{([['low','Baja'],['normal','Normal'],['high','Alta']] as const).map(([value,label]) => <button type="button" className={energy === value ? "active" : ""} key={value} onClick={() => setEnergy(value)}>{label}</button>)}</div></fieldset>
          <label><span>Modalidad</span><select value={modality} onChange={(e) => setModality(e.target.value as SessionModality)}>{Object.entries(MODALITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Enfoque</span><select value={muscleFocus} onChange={(e) => setMuscleFocus(e.target.value as MuscleFocus)}>{Object.entries(FOCUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="warmup-time-toggle"><span><input type="checkbox" checked={includeWarmup} onChange={(e) => setIncludeWarmup(e.target.checked)} /> Incluir calentamiento en el tiempo</span><small>{includeWarmup ? `${warmupMinutes} min de calentamiento; ${duration - warmupMinutes} min de sesión principal` : `${duration} min íntegros para la sesión principal`}</small></label>
          <button className="primary coach-generate" disabled={busy} onClick={() => void createSession()}>{generated ? <RefreshCw size={18} /> : <BrainCircuit size={18} />}{busy ? "Analizando…" : generated ? "Regenerar propuesta" : "Preparar mi sesión"}</button>
          <button className="coach-settings-button" onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 size={17} /> Ajustar prioridades <ChevronDown size={16} /></button>
        </div>
      </section>

      {settingsOpen && <section className="coach-settings">
        <div><p className="eyebrow">CONFIGURACIÓN REAL</p><h2>Cómo debe entrenarte</h2><p className="muted">El lugar habitual se recuerda; modalidad y enfoque vuelven a General + Automático en cada nueva sesión.</p></div>
        <div className="coach-setting-basics">
          <label><span>Sesiones habituales/semana</span><select value={frequency} onChange={(e) => setFrequency(Number(e.target.value))}>{[1,2,3,4,5,6,7].map((v) => <option key={v}>{v}</option>)}</select></label>
          <label><span>Nivel de variación</span><select value={variation} onChange={(e) => setVariation(Number(e.target.value))}><option value={1}>Bajo · continuidad</option><option value={2}>Medio</option><option value={3}>Alto</option></select></label>
          {includeWarmup && <label><span>Calentamiento general (min)</span><input type="number" min={0} max={20} value={warmupMinutes} onChange={(e) => setWarmupMinutes(Math.max(0, Math.min(20, Number(e.target.value))))} /></label>}
        </div>
        <h3>Equipamiento de {LOCATION_LABELS[location]}</h3><p className="muted">Lo que no marques como disponible o no disponible conserva el estado desconocido y no anula tus decisiones explícitas.</p>
        {location === "custom" ? <div className="coach-setting-basics">
          <label><span>Perfil</span><select value={customProfileId} onChange={(e) => setCustomProfileId(e.target.value)}>{customProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
          {currentCustomProfile && <><label><span>Nombre</span><input value={currentCustomProfile.name} onChange={(e) => updateCustomProfile({ name: e.target.value })} /></label><label><span>Lugar base</span><select value={currentCustomProfile.baseLocation} onChange={(e) => updateCustomProfile({ baseLocation: e.target.value as Exclude<TrainingLocation, "custom"> })}>{Object.entries(LOCATION_LABELS).filter(([value]) => value !== "custom").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Disponible</span><input value={currentCustomProfile.available.join(", ")} onChange={(e) => updateCustomProfile({ available: list(e.target.value) })} /></label><label><span>No disponible</span><input value={currentCustomProfile.unavailable.join(", ")} onChange={(e) => updateCustomProfile({ unavailable: list(e.target.value) })} /></label></>}
          <button className="secondary" type="button" onClick={addCustomProfile}>Crear perfil</button>
        </div> : <div className="coach-setting-basics"><label><span>Confirmado disponible</span><input value={(currentOverride?.available ?? []).join(", ")} onChange={(e) => updateLocationOverride("available", e.target.value)} placeholder="Añade excepciones al perfil inicial" /></label><label><span>Confirmado no disponible</span><input value={(currentOverride?.unavailable ?? []).join(", ")} onChange={(e) => updateLocationOverride("unavailable", e.target.value)} placeholder="Bandas, poleas, barra…" /></label></div>}
        {location === "custom" && currentCustomProfile && <details className="exercise-preferences"><summary>Preferencias específicas del perfil</summary><div className="priority-grid">{data.exercises.filter((item) => item.enabled).map((exercise) => <label key={exercise.id}><span>{exercise.name}</span><select value={currentCustomProfile.exercisePreferences[exercise.id] ?? 3} onChange={(e) => updateCustomProfile({ exercisePreferences: { ...currentCustomProfile.exercisePreferences, [exercise.id]: Number(e.target.value) } })}>{[1,2,3,4,5].map((value) => <option key={value}>{value}</option>)}</select></label>)}</div></details>}
        <details className="exercise-preferences"><summary>Ejercicios por equipamiento en este lugar</summary><p className="muted">Automático usa el equipamiento configurado. «Disponible» fuerza una excepción para este lugar y «No disponible» la bloquea solo aquí.</p><div className="priority-grid">{configurableExercises.map((exercise) => { const status = locationExcluded.includes(exercise.id) ? "unavailable" : locationAvailableExercises.includes(exercise.id) ? "available" : "automatic"; return <label key={exercise.id}><span>{exercise.name}<small>{exercise.equipment}</small></span><select value={status} onChange={(e) => setLocationExerciseStatus(exercise.id, e.target.value as typeof status)}><option value="automatic">Automático</option><option value="available">Disponible aquí</option><option value="unavailable">No disponible aquí</option></select></label>; })}</div></details>
        <h3>Prioridad global por estímulo</h3><div className="priority-grid">{MUSCLE_GROUPS.map((group) => <label key={group}><span>{LABELS[group]}</span><select value={priorities[group]} onChange={(e) => setPriorities({ ...priorities, [group]: Number(e.target.value) })}>{[1,2,3,4,5].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>)}</div>
        <details className="exercise-preferences"><summary>Preferencia por ejercicio</summary><div className="priority-grid">{data.exercises.filter((item) => item.enabled).map((exercise) => <label key={exercise.id}><span>{exercise.name}</span><select value={preferences[exercise.id] ?? 3} onChange={(e) => setPreferences({ ...preferences, [exercise.id]: Number(e.target.value) })}>{[1,2,3,4,5].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>)}</div></details>
        <button className="secondary" disabled={busy} onClick={() => void saveSettings()}>Guardar configuración</button>
      </section>}

      <details className="coach-blocked"><summary>¿Algún ejercicio no está disponible hoy?</summary><div>{data.exercises.filter((e) => e.enabled).map((exercise) => <label key={exercise.id}><input type="checkbox" checked={blocked.includes(exercise.id)} onChange={(e) => setBlocked(e.target.checked ? [...blocked, exercise.id] : blocked.filter((id) => id !== exercise.id))} /> {exercise.name}</label>)}</div></details>

      {generated ? <>
        <section className="coach-session-intent"><p className="eyebrow">CONTEXTO DE LA SESIÓN</p><p>{LOCATION_LABELS[location]} · {MODALITY_LABELS[modality]} · {FOCUS_LABELS[muscleFocus]}{muscleFocus !== "automatic" ? " · énfasis temporal" : ""}</p>{generated.context.warnings?.map((warning) => <p className="muted" key={warning}>Aviso: {warning}</p>)}</section>
        <section className="coach-analysis"><div><p className="eyebrow">POR QUÉ ESTA SESIÓN</p><h2>Prioridades detectadas</h2></div><div className="need-grid">{topNeeds.map((need) => <article key={need.group}><span>{LABELS[need.group]}</span><strong>{need.score.toFixed(1)}</strong><small>{need.directSets10d}/{need.targetSets10d} directas · 10 días</small></article>)}</div><h3>Necesidades cubiertas directamente</h3><p>{coveredGroups.map((group) => LABELS[group]).join(" · ")}</p>{generated.context.decisionAudit?.uncoveredNeeds.length ? <><h3>Necesidades no cubiertas</h3><ul>{generated.context.decisionAudit.uncoveredNeeds.map((item) => <li key={item.group}>{LABELS[item.group]} ({item.score.toFixed(1)}): {item.reason === "time" ? "no cabe en el tiempo" : item.reason === "recovery" ? "recuperación insuficiente" : item.reason === "equipment" ? "equipamiento no disponible" : item.reason === "no_candidate" ? "sin candidato directo" : "menor prioridad residual"}</li>)}</ul></> : null}<ul>{generated.rationale.map((reason) => <li key={reason}>{reason}</li>)}</ul><h3>Desglose temporal</h3><p className="muted">Solicitado: {clock(duration * 60)} · Entrenamiento estimado: {clock(planTiming.total)} · Series: {clock(planTiming.work)} · Descansos: {clock(planTiming.rest)} · Transiciones: {clock(planTiming.transition)} · Aproximaciones: {clock(planTiming.ramp)} · Calentamiento general: {clock(generalWarmupSeconds)} · Disponible restante: {clock((generated.context.timeBudget?.mainSessionSeconds ?? duration * 60) - planTiming.total)}.</p>{generated.context.remainingTimeExplanation && <p className="muted">{generated.context.remainingTimeExplanation}</p>}{generated.context.qualityRepairApplied && <p className="muted">La propuesta corta de la IA se amplió automáticamente con trabajo útil validado.</p>}<details><summary>Auditoría técnica de equipamiento</summary><ul>{generated.context.equipmentAudit?.map((item) => <li key={`${item.group}:${item.exerciseId}`}>{item.name} · {item.equipment}: {item.reason === "eligible" ? "elegible" : item.reason === "manual_only" ? "solo manual" : item.reason === "legacy_only" ? "solo histórico" : item.reason === "blocked" ? "excluido" : item.reason === "equipment" ? "sin capacidad compatible" : "no seleccionable"}</li>)}</ul></details><p className="planner-source">Motor: {generated.source === "llm" ? "IA validada (esquema + coherencia deportiva)" : "respaldo determinista"}. Reglas versionadas y catálogo cerrado.</p>{generated.fallbackReason && <p className="muted" title={generated.diagnosticCode ?? undefined}>{generated.fallbackReason}</p>}</section>
        <section className="coach-plan"><div className="section-title"><div><p className="eyebrow">PROPUESTA EDITABLE</p><h2>{plan.length} ejercicios · {totalSets} series · ~{Math.ceil((planTiming.total + generalWarmupSeconds) / 60)} min estimados</h2></div></div><PlanEditor plan={plan} exercises={data.exercises} onChange={setPlan} /><button className="primary coach-start" disabled={busy || !plan.length} onClick={() => void start()}><Play size={19} fill="currentColor" /> Empezar entrenamiento adaptativo</button></section>
      </> : <section className="coach-empty"><BrainCircuit size={34} /><div><h2>Tu sesión aparecerá aquí</h2><p>La propuesta se crea con tu tiempo, energía y entrenamiento reciente.</p></div></section>}
    </>
  );
}
