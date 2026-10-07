"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type AppPage =
  | "home"
  | "train"
  | "history"
  | "progress"
  | "templates"
  | "exercises"
  | "more";

type ViewValue = string | number | boolean | null;
type Views = Record<string, ViewValue>;

type NavigationSnapshot = {
  version: 1;
  page: AppPage;
  views: Views;
  depth: number;
  transition: string;
};

type StoredState = { __gymTrackerNavigation?: NavigationSnapshot };

type NavigationContextValue = {
  snapshot: NavigationSnapshot;
  navigate: (page: AppPage, replace?: boolean) => void;
  setView: (key: string, value: ViewValue) => void;
  closeView: (key: string) => void;
  replaceView: (key: string, value: ViewValue) => void;
  finishFlow: (page: AppPage, views?: Views) => void;
};

const pages = new Set<AppPage>([
  "home",
  "train",
  "history",
  "progress",
  "templates",
  "exercises",
  "more",
]);

const initialSnapshot = (): NavigationSnapshot => ({
  version: 1,
  page: "home",
  views: {},
  depth: 0,
  transition: "root",
});

function storedSnapshot(): NavigationSnapshot {
  if (typeof window === "undefined") return initialSnapshot();
  const value = (window.history.state as StoredState | null)
    ?.__gymTrackerNavigation;
  if (
    value?.version === 1 &&
    pages.has(value.page) &&
    value.views &&
    typeof value.views === "object" &&
    Number.isInteger(value.depth) &&
    value.depth >= 0
  )
    return value;
  return initialSnapshot();
}

function historyState(snapshot: NavigationSnapshot) {
  const current =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
  return { ...current, __gymTrackerNavigation: snapshot };
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const snapshotRef = useRef(snapshot);
  const pendingFinish = useRef<{ page: AppPage; views: Views } | null>(null);

  const apply = useCallback((next: NavigationSnapshot, replace = false) => {
    snapshotRef.current = next;
    setSnapshot(next);
    const method = replace ? "replaceState" : "pushState";
    window.history[method](historyState(next), "");
  }, []);

  useEffect(() => {
    const current = (window.history.state as StoredState | null)
      ?.__gymTrackerNavigation;
    if (!current) apply(snapshotRef.current, true);
    else {
      const restored = storedSnapshot();
      snapshotRef.current = restored;
      setSnapshot(restored);
    }

    const onPopState = (event: PopStateEvent) => {
      const restored = (event.state as StoredState | null)
        ?.__gymTrackerNavigation;
      const next =
        restored?.version === 1 && pages.has(restored.page)
          ? restored
          : initialSnapshot();

      const finish = pendingFinish.current;
      if (finish && next.depth === 0) {
        pendingFinish.current = null;
        const finished: NavigationSnapshot = {
          ...next,
          page: finish.page,
          views: finish.views,
          depth: Object.keys(finish.views).length ? 1 : 0,
          transition: Object.keys(finish.views).length ? "finished-flow" : "root",
        };
        apply(finished, Object.keys(finish.views).length === 0);
        return;
      }

      snapshotRef.current = next;
      setSnapshot(next);
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [apply]);

  const navigate = useCallback(
    (page: AppPage, replace = false) => {
      const current = snapshotRef.current;
      if (current.page === page && Object.keys(current.views).length === 0)
        return;
      apply(
        {
          ...current,
          page,
          views: {},
          depth: replace ? current.depth : current.depth + 1,
          transition: `page:${page}`,
        },
        replace,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [apply],
  );

  const setView = useCallback(
    (key: string, value: ViewValue) => {
      const current = snapshotRef.current;
      if (Object.is(current.views[key], value)) return;
      apply({
        ...current,
        views: { ...current.views, [key]: value },
        depth: current.depth + 1,
        transition: key,
      });
    },
    [apply],
  );

  const replaceView = useCallback(
    (key: string, value: ViewValue) => {
      const current = snapshotRef.current;
      apply(
        {
          ...current,
          views: { ...current.views, [key]: value },
          transition: key,
        },
        true,
      );
    },
    [apply],
  );

  const closeView = useCallback(
    (key: string) => {
      const current = snapshotRef.current;
      if (!(key in current.views)) return;
      if (current.transition === key && current.depth > 0) {
        window.history.back();
        return;
      }
      const views = { ...current.views };
      delete views[key];
      apply({
        ...current,
        views,
        depth: current.depth + 1,
        transition: key,
      });
    },
    [apply],
  );

  const finishFlow = useCallback(
    (page: AppPage, views: Views = {}) => {
      const current = snapshotRef.current;
      if (current.depth === 0) {
        const next: NavigationSnapshot = {
          ...current,
          page,
          views,
          depth: Object.keys(views).length ? 1 : 0,
          transition: Object.keys(views).length ? "finished-flow" : "root",
        };
        apply(next, Object.keys(views).length === 0);
        return;
      }
      pendingFinish.current = { page, views };
      window.history.go(-current.depth);
    },
    [apply],
  );

  return (
    <NavigationContext.Provider
      value={{
        snapshot,
        navigate,
        setView,
        closeView,
        replaceView,
        finishFlow,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useAppNavigation() {
  const context = useContext(NavigationContext);
  if (!context)
    throw new Error("useAppNavigation must be used inside NavigationProvider");
  return context;
}

export function useHistoryView<T extends ViewValue>(
  key: string,
  defaultValue: T,
) {
  const navigation = useAppNavigation();
  const value =
    key in navigation.snapshot.views
      ? (navigation.snapshot.views[key] as T)
      : defaultValue;
  return {
    value,
    active: key in navigation.snapshot.views,
    open: (next: T) => navigation.setView(key, next),
    close: () => navigation.closeView(key),
    replace: (next: T) => navigation.replaceView(key, next),
  };
}

export function closeOnBackdrop(
  event: React.MouseEvent<HTMLElement>,
  close: () => void,
) {
  if (event.target === event.currentTarget) close();
}
