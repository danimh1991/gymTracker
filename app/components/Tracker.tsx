"use client";
import { useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  ChartNoAxesCombined,
  Dumbbell,
  History as HistoryIcon,
  House,
  LayoutTemplate,
  RefreshCw,
  Settings,
} from "lucide-react";
import type { DayKey, PlanExercise } from "../domain/types";
import { completedWorkouts, getNextRoutineDay } from "../services/training";
import { appPath } from "../lib/base-path";
import { useTraining } from "./useTraining";
import { Home } from "./Home";
import { Training } from "./Training";
import { More } from "./More";
import { Progress } from "./Progress";
import { History, WorkoutDetail } from "./History";
import { Templates } from "./Templates";
import { Exercises } from "./Exercises";
type Page =
  | "home"
  | "train"
  | "history"
  | "progress"
  | "templates"
  | "exercises"
  | "more";
const navigation = [
  { id: "home", name: "Inicio", icon: House },
  { id: "train", name: "Entrenar", icon: Dumbbell },
  { id: "history", name: "Histórico", icon: HistoryIcon },
  { id: "progress", name: "Progreso", icon: ChartNoAxesCombined },
  { id: "templates", name: "Plantillas", icon: LayoutTemplate },
  { id: "exercises", name: "Ejercicios", icon: BookOpen },
  { id: "more", name: "Ajustes", icon: Settings },
] as const;
export default function Tracker() {
  const [demo, updateDemo] = useState(false),
    [userId, setUserId] = useState(""),
    [page, setPage] = useState<Page>("home"),
    [selected, setSelected] = useState<DayKey>("A"),
    [summary, setSummary] = useState("");
  useEffect(() => {
    try {
      updateDemo(sessionStorage.getItem("gym-demo") === "1");
      setUserId(localStorage.getItem("gym-user") ?? "");
    } catch {}
  }, []);
  const selectUser = (value: string) => {
    setUserId(value);
    setPage("home");
    setSummary("");
    try {
      localStorage.setItem("gym-user", value);
    } catch {}
  };
  const setDemo = (value: boolean) => {
    updateDemo(value);
    try {
      sessionStorage.setItem("gym-demo", value ? "1" : "0");
    } catch {}
  };
  const { data, error, busy, execute, refresh } = useTraining(demo, userId),
    active = data?.workouts.find((w) => w.status === "active"),
    last = data ? completedWorkouts(data)[0] : undefined;
  useEffect(() => {
    if (!data?.days.length) return;
    setSelected(
      active?.dayId ??
        getNextRoutineDay(
          last?.dayId,
          data.days.map((day) => day.id),
        ),
    );
  }, [last?.id, active?.id, demo, data?.settings.trainingDays]);
  const navigate = (p: Page) => {
    setPage(p);
    setSummary("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  async function start(plan: PlanExercise[], templateName: string) {
    if (active) {
      navigate("train");
      return;
    }
    const result = await execute({
      action: "start",
      dayId: selected,
      templateName,
      exercises: plan,
    });
    if (result) navigate("train");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href={appPath("/")}
          aria-label="Gym Tracker inicio"
        >
          <span className="brand-mark">
            <Activity size={25} />
          </span>
          <span>
            GYM<span className="brand-light">TRACKER</span>
            <small>CALISTHENICS JOURNAL</small>
          </span>
        </a>
        <p className="nav-label">TU ENTRENAMIENTO</p>
        <nav>
          {navigation.map((n) => (
            <button
              className={page === n.id ? "nav-active" : ""}
              key={n.id}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={21} />
              <span>{n.name}</span>
              {n.id === "train" && active && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="tag">
            TU RUTINA · {data?.days.map((day) => day.id).join(" / ") ?? "…"}
          </span>
          <p>
            Más control.
            <br />
            Más fuerza relativa.
          </p>
          <span className="small muted">Una serie cada vez.</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="mobile-brand">
            <Activity size={22} /> GYMTRACKER
          </span>
          <span className="desktop-breadcrumb">
            Mi entrenamiento <span>/</span>{" "}
            {navigation.find((n) => n.id === page)?.name}
          </span>
          <div className="topbar-right">
            <span className={demo ? "demo-label" : "private-label"}>
              {demo
                ? "ESPACIO DEMO"
                : (data?.users.find((user) => user.id === data.activeUserId)
                    ?.name ?? "USUARIO")}
            </span>
            <button
              className="icon-button"
              aria-label="Actualizar datos"
              disabled={busy}
              onClick={() => void refresh()}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        <main>
          {demo && (
            <div className="demo-banner">
              Modo demo · Tus entrenamientos reales están separados.
              <button
                onClick={() => {
                  setDemo(false);
                  setPage("home");
                }}
              >
                Volver a mis datos
              </button>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={() => void refresh()}>Reintentar</button>
            </div>
          )}
          {!data ? (
            <div className="empty-state">
              <Activity size={32} />
              <h2>
                {error
                  ? "No se pudo cargar tu entrenamiento"
                  : "Preparando tu entrenamiento…"}
              </h2>
              {error && (
                <button onClick={() => void refresh()}>Reintentar</button>
              )}
            </div>
          ) : summary ? (
            <>
              <WorkoutDetail
                data={data}
                workout={data.workouts.find((w) => w.id === summary)!}
                celebrate
              />
              <button className="primary" onClick={() => navigate("home")}>
                Ver próximo entrenamiento · Día{" "}
                {getNextRoutineDay(
                  data.workouts.find((w) => w.id === summary)?.dayId,
                  data.days.map((day) => day.id),
                )}
              </button>
            </>
          ) : (
            <>
              {(page === "home" || (page === "train" && !active)) && (
                <Home
                  data={data}
                  onUserSelect={selectUser}
                  selected={selected}
                  onSelect={setSelected}
                  onStart={(plan, name) => void start(plan, name)}
                  execute={execute}
                  busy={busy}
                />
              )}{" "}
              {page === "train" && active && (
                <Training
                  key={active.id}
                  data={data}
                  workout={active}
                  execute={execute}
                  busy={busy}
                  onFinished={(id) => {
                    setSummary(id);
                    setPage("home");
                    window.scrollTo(0, 0);
                  }}
                />
              )}
              {page === "history" && (
                <History data={data} busy={busy} execute={execute} />
              )}{" "}
              {page === "progress" && <Progress data={data} />}
              {page === "templates" && (
                <Templates data={data} busy={busy} execute={execute} />
              )}
              {page === "exercises" && (
                <Exercises data={data} busy={busy} execute={execute} />
              )}
              {page === "more" && (
                <More
                  data={data}
                  demo={demo}
                  busy={busy}
                  execute={execute}
                  setDemo={(value) => {
                    setDemo(value);
                    setSummary("");
                  }}
                />
              )}
            </>
          )}
        </main>
        <footer className="main-footer">
          GYMTRACKER <span>Construyendo fuerza, sesión a sesión.</span>
        </footer>
      </div>
      <nav className="bottom-nav">
        {navigation.map((n) => (
          <button
            key={n.id}
            className={page === n.id ? "nav-active" : ""}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={21} />
            <span>{n.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
