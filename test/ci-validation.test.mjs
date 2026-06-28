import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const ciWorkflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

function splitChainedScript(name) {
  const script = packageJson.scripts?.[name];
  assert.equal(typeof script, "string", `missing package script: ${name}`);
  return script.split(/\s*&&\s*/);
}

test("local validation script covers CI-required checks", () => {
  assert.deepEqual(splitChainedScript("lint"), ["npm run typecheck", "npm run format:check", "npm run check"]);
  assert.deepEqual(splitChainedScript("validate"), ["npm run lint", "npm run test", "npm run check:pack"]);
  assert.equal(packageJson.scripts["smoke:discover"], "node scripts/smoke-observability.mjs");
  assert.equal(packageJson.scripts["pack:dry-run"], "npm pack --dry-run --json");
  assert.equal(packageJson.scripts["check:pack"], "node scripts/check-package-contents.mjs");
});

test("package source publication is glob-based and local-state-free", () => {
  assert.deepEqual(packageJson.files.filter((entry) => entry.startsWith("src/")), ["src/**/*.ts"]);
  assert.ok(!packageJson.files.some((entry) => entry.startsWith("specs/")), "specs must not be published");
  assert.ok(!packageJson.files.some((entry) => entry.startsWith(".pi")), "local Pi state must not be published");
  assert.ok(!packageJson.files.some((entry) => entry.startsWith("issues")), "local issue cache must not be published");
});

test("CI uses lockfile installs and the local validation contract", () => {
  assert.match(ciWorkflow, /uses:\s*actions\/checkout@v4/);
  assert.match(ciWorkflow, /uses:\s*actions\/setup-node@v4/);
  assert.match(ciWorkflow, /node-version:\s*22\.19\.0/);
  assert.match(ciWorkflow, /cache:\s*npm/);
  assert.match(ciWorkflow, /run:\s*npm ci\b/);
  assert.doesNotMatch(ciWorkflow, /run:\s*npm install\b/);
  assert.match(ciWorkflow, /run:\s*npm run validate\b/);
});
