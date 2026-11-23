import { build } from "esbuild";
import { spawnSync } from "node:child_process";

await build({
  entryPoints: ["scripts/simulate-adaptive-1-2.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".sites-runtime/simulate-adaptive-1-2.mjs",
});
const result = spawnSync(process.execPath, [".sites-runtime/simulate-adaptive-1-2.mjs"], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
