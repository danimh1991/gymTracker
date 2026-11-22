import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dryRun = process.argv.includes("--dry-run");
const appRoot = fileURLToPath(new URL("../", import.meta.url));
const dataRoot = fileURLToPath(new URL("../r2/", import.meta.url));
const manifestPath = fileURLToPath(
  new URL("../r2/manifest.json", import.meta.url),
);
const wranglerCli = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const bucket = process.env.LLM_R2_BUCKET?.trim() || "llm-core-knowledge";
const jurisdiction = process.env.LLM_R2_JURISDICTION?.trim() || "eu";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
  throw new Error("r2/manifest.json no tiene una estructura válida.");
}

const prefix = "gym-tracker/v1/";
const uploads = manifest.entries.map((entry) => {
  if (
    typeof entry.key !== "string" ||
    !entry.key.startsWith(prefix) ||
    entry.key.includes("..") ||
    !["application/json", "text/markdown"].includes(entry.contentType)
  ) {
    throw new Error(`Clave no válida en el manifiesto: ${String(entry.key)}`);
  }
  const relativePath = entry.key.slice(prefix.length);
  const localUrl = new URL(
    relativePath.replaceAll("\\", "/"),
    new URL("../r2/", import.meta.url),
  );
  const localPath = fileURLToPath(localUrl);
  if (!localPath.startsWith(dataRoot))
    throw new Error(`Ruta fuera de r2/: ${relativePath}`);
  readFileSync(localPath);
  return { key: entry.key, localPath, contentType: entry.contentType };
});

console.log(`${uploads.length} archivos R2 validados para ${bucket}.`);
if (dryRun) process.exit(0);

for (const upload of uploads) put(upload);
put({
  key: `${prefix}manifest.json`,
  localPath: manifestPath,
  contentType: "application/json",
});

function put({ key, localPath, contentType }) {
  const result = spawnSync(
    process.execPath,
    [
      wranglerCli,
      "r2",
      "object",
      "put",
      `${bucket}/${key}`,
      "--file",
      localPath,
      "--content-type",
      contentType,
      "--remote",
      "--jurisdiction",
      jurisdiction,
    ],
    { cwd: appRoot, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
