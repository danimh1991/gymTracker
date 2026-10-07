"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FilePlus2, Pencil, Trash2, Upload } from "lucide-react";
import type { DayKey, PlanExercise, Snapshot, Template } from "../domain/types";
import type { Execute } from "./Training";
import { PlanEditor } from "./PlanEditor";
import { closeOnBackdrop, useHistoryView } from "./navigation";
import { reconcileTemplateExercises } from "../services/template-import";

function planFor(data: Snapshot, template: Template): PlanExercise[] {
  return data.templateExercises
    .filter((row) => row.templateId === template.id)
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
    );
}

function initialPlan(data: Snapshot): PlanExercise[] {
  const exercise = data.exercises.find((row) => row.enabled);
  return exercise
    ? [
        {
          exerciseId: exercise.id,
          sets: 3,
          repMin: exercise.defaultRepMin,
          repMax: exercise.defaultRepMax,
          rir: exercise.defaultRIR || "1–2",
          optional: 0,
          notes: "",
          priority: "Principal",
        },
      ]
    : [];
}

export function Templates({
  data,
  busy,
  execute,
}: {
  data: Snapshot;
  busy: boolean;
  execute: Execute;
}) {
  const editorView = useHistoryView<string | null>("template-editor", null);
  const deleteView = useHistoryView<string>("template-delete", "");
  const editingId = editorView.value === "new" ? "" : editorView.value;
  const editorOpen =
    editingId === "" ||
    (editingId !== null &&
      data.templates.some((template) => template.id === editingId));
  const [dayId, setDayId] = useState<DayKey>(data.days[0]?.id ?? "A");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [plan, setPlan] = useState<PlanExercise[]>([]);
  const pendingDelete =
    data.templates.find((template) => template.id === deleteView.value) ?? null;
  const editorRef = useRef<HTMLElement>(null);
  const initializedEditor = useRef<string | null>(null);

  useEffect(() => {
    if (
      editorView.value !== null &&
      initializedEditor.current !== editorView.value
    ) {
      initializedEditor.current = editorView.value;
      if (editorView.value === "new") {
        setDayId(data.days[0]?.id ?? "A");
        setName("");
        setDescription("");
        setPlan(initialPlan(data));
      } else if (editingId) {
        const template = data.templates.find((row) => row.id === editingId);
        if (template) {
          setDayId(template.dayId);
          setName(template.name);
          setDescription(template.description);
          setPlan(planFor(data, template));
        }
      }
    }
    if (editingId !== null)
      requestAnimationFrame(() =>
        editorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
  }, [editorView.value, editingId, data]);

  const beginNew = () => {
    initializedEditor.current = "new";
    setDayId(data.days[0]?.id ?? "A");
    setName("");
    setDescription("");
    setPlan(initialPlan(data));
    editorView.open("new");
  };
  const beginEdit = (template: Template) => {
    initializedEditor.current = template.id;
    setDayId(template.dayId);
    setName(template.name);
    setDescription(template.description);
    setPlan(planFor(data, template));
    editorView.open(template.id);
  };
  const download = () => {
    const referencedIds = new Set(
      data.templateExercises.map((exercise) => exercise.exerciseId),
    );
    const value = {
      version: 2,
      exerciseCatalog: data.exercises.filter((exercise) =>
        referencedIds.has(exercise.id),
      ),
      templates: data.templates.map((template) => ({
        dayId: template.dayId,
        name: template.name,
        description: template.description,
        exercises: planFor(data, template),
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "gym-tracker-plantillas.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      const templates = Array.isArray(value) ? value : value.templates;
      if (!Array.isArray(templates))
        throw new Error("El JSON no contiene una lista válida de plantillas.");
      const exerciseCatalog = Array.isArray(value?.exerciseCatalog)
        ? value.exerciseCatalog
        : [];
      let library = data.exercises;
      if (exerciseCatalog.length) {
        const result = await execute({
          action: "importExercises",
          exercises: exerciseCatalog,
        });
        if (!result) return;
        library = result.exercises;
      }
      const prepared = reconcileTemplateExercises(
        templates,
        exerciseCatalog,
        library,
      );
      if (prepared.missing.length) {
        const ids = prepared.missing.map((id) => `“${id}”`).join(", ");
        throw new Error(
          `Faltan ejercicios en la biblioteca: ${ids}. Importa primero el archivo de ejercicios o vuelve a exportar las plantillas con la versión actual.`,
        );
      }
      await execute({
        action: "importTemplates",
        templates: prepared.templates,
      });
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
          <p className="eyebrow">TU PLANIFICACIÓN</p>
          <h1>Plantillas.</h1>
          <p className="muted">
            Crea, revisa y ajusta tus sesiones antes de entrenar.
          </p>
        </div>
        <button type="button" className="primary" onClick={beginNew}>
          <FilePlus2 size={18} /> Nueva plantilla
        </button>
      </div>

      <div className="template-actions">
        <button
          type="button"
          className="secondary"
          onClick={download}
          disabled={!data.templates.length}
        >
          <Download size={17} /> Exportar plantillas
        </button>
        <label className="secondary file-button">
          <Upload size={17} /> Importar plantillas
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      {editorOpen && (
        <section ref={editorRef} className="settings-card template-editor-card">
          <div className="section-title">
            <h2>{editingId ? "Editar plantilla" : "Nueva plantilla"}</h2>
            <button
              type="button"
              className="secondary compact"
              onClick={editorView.close}
            >
              Cerrar
            </button>
          </div>
          <div className="template-fields">
            <label className="field">
              Día
              <select
                value={dayId}
                onChange={(event) => setDayId(event.target.value as DayKey)}
              >
                {!data.days.some((day) => day.id === dayId) && (
                  <option value={dayId}>Día {dayId} (oculto)</option>
                )}
                {data.days.map((day) => (
                  <option key={day.id} value={day.id}>
                    Día {day.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Nombre
              <input
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="Fuerza de tirón"
              />
            </label>
            <label className="field template-description">
              Descripción
              <input
                value={description}
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Objetivo o notas de esta variante"
              />
            </label>
          </div>
          <PlanEditor
            plan={plan}
            exercises={data.exercises}
            onChange={setPlan}
          />
          <div className="template-save-row">
            <span className="small muted">{plan.length} ejercicios</span>
            <button
              type="button"
              className="primary"
              disabled={busy || name.trim().length < 2 || !plan.length}
              onClick={async () => {
                const result = await execute({
                  action: "saveTemplate",
                  ...(editingId ? { id: editingId } : {}),
                  dayId,
                  name,
                  description,
                  exercises: plan,
                });
                if (result) {
                  initializedEditor.current = null;
                  editorView.close();
                }
              }}
            >
              Guardar plantilla
            </button>
          </div>
        </section>
      )}

      <div className="template-grid">
        {data.templates.map((template) => {
          const exercises = planFor(data, template);
          const enabled = data.days.some((day) => day.id === template.dayId);
          return (
            <article className="template-card" key={template.id}>
              <div className="template-card-head">
                <span className={`tag ${enabled ? "lime" : ""}`}>
                  DÍA {template.dayId}
                </span>
                {!enabled && <span className="tag">DÍA OCULTO</span>}
              </div>
              <h2>{template.name}</h2>
              <p className="muted">
                {template.description || "Sin descripción"}
              </p>
              <div className="template-metrics">
                <strong>{exercises.length}</strong> ejercicios
                <span>·</span>
                <strong>
                  {exercises.reduce((total, row) => total + row.sets, 0)}
                </strong>{" "}
                series
              </div>
              <div className="template-card-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => beginEdit(template)}
                >
                  <Pencil size={16} /> Editar
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  onClick={() => deleteView.open(template.id)}
                >
                  <Trash2 size={16} /> Eliminar
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!data.templates.length && (
        <div className="empty-state">
          <FilePlus2 size={30} />
          <h2>Todavía no tienes plantillas</h2>
          <p className="muted">Crea la primera para empezar a entrenar.</p>
        </div>
      )}
      {pendingDelete && (
        <div
          className="modal-backdrop"
          onClick={(event) => closeOnBackdrop(event, deleteView.close)}
        >
          <section className="modal" role="dialog" aria-modal="true">
            <h2>¿Eliminar “{pendingDelete.name}”?</h2>
            <p>
              La plantilla desaparecerá, pero tus sesiones guardadas no cambian.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={deleteView.close}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={busy}
                onClick={async () => {
                  const result = await execute({
                    action: "deleteTemplate",
                    templateId: pendingDelete.id,
                  });
                  if (result) {
                    deleteView.close();
                  }
                }}
              >
                <Trash2 size={16} /> Eliminar plantilla
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
