"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "../domain/types";
import type { Command } from "../services/validation";
import { appPath } from "../lib/base-path";
export function useTraining(demo: boolean) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const url = `${appPath("/api/training")}${demo ? "?demo=1" : ""}`;
  const currentUrl = useRef(url);
  currentUrl.current = url;
  const refresh = useCallback(async () => {
    setError("");
    try {
      const r = await fetch(url, { cache: "no-store" });
      const body = (await r.json()) as Snapshot & { error?: string };
      if (currentUrl.current !== url) return;
      if (!r.ok) throw new Error(body.error);
      setData(body);
    } catch (e) {
      if (currentUrl.current === url)
        setError(e instanceof Error ? e.message : "No se pudo conectar.");
    }
  }, [url]);
  useEffect(() => {
    setData(null);
    void refresh();
  }, [refresh]);
  const execute = async (command: Command) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const body = (await r.json()) as Snapshot & { error?: string };
      if (currentUrl.current !== url) return null;
      if (!r.ok) throw new Error(body.error);
      setData(body);
      return body;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se ha guardado. Revisa la conexión y reintenta.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { data, error, busy, execute, refresh };
}
