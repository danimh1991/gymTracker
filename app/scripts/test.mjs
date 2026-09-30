import { build } from "esbuild";
import { spawnSync } from "node:child_process";
await build({
  entryPoints: ["tests/training.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".sites-runtime/training.test.mjs",
});
const result = spawnSync(
  process.execPath,
  ["--test", ".sites-runtime/training.test.mjs"],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
