import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const backupPath = resolve(process.argv[2] ?? "../reports/gymtracker-pre-adaptive-1.1-2026-11-22.sql");
const reportPath = resolve(process.argv[3] ?? "../reports/adaptive-1.1-migration-verification.json");
const postPath = process.argv[4] ? resolve(process.argv[4]) : null;
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(backupPath, "utf8").replace("PRAGMA defer_foreign_keys=TRUE;", "PRAGMA foreign_keys=OFF;"));

const rows = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const protectedTables = ["workouts", "workoutExercises", "workoutSets"];
const before = Object.fromEntries(protectedTables.map((table) => {
  const value = rows(table); return [table, { count: value.length, sha256: digest(value) }];
}));
const referencedBefore = db.prepare("SELECT COUNT(DISTINCT exerciseId) count FROM workoutExercises").get().count;

db.exec(readFileSync(new URL("../drizzle/0009_adaptive_1_1.sql", import.meta.url), "utf8"));

const after = Object.fromEntries(protectedTables.map((table) => {
  const value = rows(table); return [table, { count: value.length, sha256: digest(value) }];
}));
const statusRows = db.prepare(`SELECT json_extract(metadataJson,'$.planningStatus') status,COUNT(*) count
  FROM exerciseAdaptiveMetadata GROUP BY status ORDER BY status`).all();
const unresolved = db.prepare(`SELECT COUNT(*) count FROM workoutExercises w
  LEFT JOIN exercises e ON e.id=w.exerciseId WHERE e.id IS NULL`).get().count;
const report = {
  verifiedAt: new Date().toISOString(), backupPath, migration: "0009_adaptive_1_1.sql",
  protectedTables: Object.fromEntries(protectedTables.map((table) => [table, {
    before: before[table], after: after[table], unchanged: before[table].sha256 === after[table].sha256,
  }])),
  catalog: {
    exerciseCount: db.prepare("SELECT COUNT(*) count FROM exerciseAdaptiveMetadata").get().count,
    statuses: Object.fromEntries(statusRows.map((row) => [row.status, row.count])),
    aliases: db.prepare("SELECT COUNT(*) count FROM exerciseAliases").get().count,
    referencedExerciseIdsBefore: referencedBefore, unresolvedHistoricalExerciseIds: unresolved,
  },
  foreignKeyViolations: db.prepare("PRAGMA foreign_key_check").all(),
};
if (postPath) {
  const post = new DatabaseSync(":memory:");
  post.exec(readFileSync(postPath, "utf8").replace("PRAGMA defer_foreign_keys=TRUE;", "PRAGMA foreign_keys=OFF;"));
  const productionPost = Object.fromEntries(protectedTables.map((table) => {
    const value = post.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
    return [table, { count: value.length, sha256: digest(value), unchangedFromPreMigration: digest(value) === before[table].sha256 }];
  }));
  report.productionComparison = { postPath, protectedTables: productionPost };
  if (!Object.values(productionPost).every((item) => item.unchangedFromPreMigration))
    throw new Error(`Producción difiere del backup previo: ${JSON.stringify(productionPost)}`);
}
if (!Object.values(report.protectedTables).every((item) => item.unchanged) || unresolved || report.foreignKeyViolations.length)
  throw new Error(`La migración no conserva la integridad: ${JSON.stringify(report)}`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
