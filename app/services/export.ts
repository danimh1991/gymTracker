import type { Snapshot } from "../domain/types";
export function csv(rows: object[]): string {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const cell = (value: unknown) => {
    let s = value === null || value === undefined ? "" : String(value);
    if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return (
    "\ufeff" +
    [
      columns.map(cell).join(","),
      ...rows.map((row) =>
        columns.map((k) => cell((row as Record<string, unknown>)[k])).join(","),
      ),
    ].join("\r\n")
  );
}
export function exportData(
  data: Snapshot,
  kind: "json" | "workouts" | "sets",
  demo: boolean,
) {
  const text =
    kind === "json"
      ? JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            space: demo ? "demo" : "real",
            ...data,
          },
          null,
          2,
        )
      : csv(kind === "workouts" ? data.workouts : data.sets);
  const blob = new Blob([text], {
      type: kind === "json" ? "application/json" : "text/csv;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `gym-tracker-${demo ? "demo-" : ""}${kind}-${new Date().toISOString().slice(0, 10)}.${kind === "json" ? "json" : "csv"}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
