import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const command = process.argv[2] ?? "build";
if (!new Set(["build", "deploy"]).has(command)) {
  throw new Error("Uso: node scripts/cloudflare-deploy.mjs [build|deploy]");
}

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const wranglerPath = fileURLToPath(
  new URL("../dist/server/wrangler.cloudflare.json", import.meta.url),
);
const generatedWranglerPath = fileURLToPath(
  new URL("../dist/server/wrangler.json", import.meta.url),
);
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();

run(process.execPath, ["scripts/run-framework.mjs", "build"], {
  APP_BASE_PATH: "/gymtracker",
  NEXT_PUBLIC_APP_BASE_PATH: "/gymtracker",
});

const config = JSON.parse(readFileSync(generatedWranglerPath, "utf8"));
config.name = "gym-tracker";
config.workers_dev = false;
config.routes = [
  {
    pattern: "danieta.com/gymtracker*",
    zone_name: "danieta.com",
  },
];
config.d1_databases = [
  {
    binding: "DB",
    database_name: "gym-tracker-db",
    database_id: databaseId ?? "REPLACE_WITH_D1_DATABASE_ID",
    migrations_dir: "../../drizzle",
  },
];
writeFileSync(wranglerPath, `${JSON.stringify(config, null, 2)}\n`);

if (command === "build") {
  console.log(`Build de Cloudflare preparado en ${wranglerPath}`);
  if (!databaseId) {
    console.log(
      "Define CLOUDFLARE_D1_DATABASE_ID antes de migrar o desplegar.",
    );
  }
  process.exit(0);
}

if (!databaseId) {
  throw new Error(
    "Falta CLOUDFLARE_D1_DATABASE_ID. Crea gym-tracker-db y copia su ID en esa variable.",
  );
}

const wranglerCli = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
run(process.execPath, [
  wranglerCli,
  "d1",
  "migrations",
  "apply",
  "gym-tracker-db",
  "--remote",
  "--config",
  wranglerPath,
], { CI: "true" });
run(process.execPath, [wranglerCli, "deploy", "--config", wranglerPath]);

function run(executable, args, extraEnv = {}) {
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
