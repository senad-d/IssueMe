import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootUrl = new URL("../", import.meta.url);
const rootPath = fileURLToPath(rootUrl);
const packageJson = JSON.parse(await readFile(new URL("package.json", rootUrl), "utf8"));
const ciWorkflow = await readFile(new URL(".github/workflows/ci.yml", rootUrl), "utf8");
const sonarWorkflow = await readFile(new URL(".github/workflows/sonar.yml", rootUrl), "utf8");
const sonarPropertiesText = await readFile(new URL("sonar-project.properties", rootUrl), "utf8");
const gitignore = await readFile(new URL(".gitignore", rootUrl), "utf8");

function splitChainedScript(name) {
  const script = packageJson.scripts?.[name];
  assert.equal(typeof script, "string", `missing package script: ${name}`);
  return script.split(/\s*&&\s*/);
}

function parseProperties(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        assert.notEqual(separatorIndex, -1, `invalid property line: ${line}`);
        return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()];
      }),
  );
}

const sonarProperties = parseProperties(sonarPropertiesText);

function isIgnoredByGit(path) {
  const result = spawnSync("git", ["check-ignore", "--no-index", "--quiet", "--", path], {
    cwd: rootPath,
    stdio: "ignore",
  });
  if (result.error) throw result.error;
  assert.ok(
    result.status === 0 || result.status === 1,
    `git check-ignore exited with status ${String(result.status)} for ${path}`,
  );
  return result.status === 0;
}

test("local validation script covers CI-required checks", () => {
  assert.deepEqual(splitChainedScript("lint"), ["npm run typecheck", "npm run lint:eslint", "npm run format:check", "npm run check"]);
  assert.deepEqual(splitChainedScript("check"), ["node --check scripts/check-package-contents.mjs", "node --check scripts/test-coverage.mjs", "node --check scripts/smoke-observability.mjs", "node --check scripts/smoke-packaged-install.mjs", "node --check scripts/smoke-handler-execution.mjs", "node --check scripts/smoke-pi-lifecycle.mjs"]);
  assert.deepEqual(splitChainedScript("validate"), ["npm run lint", "npm run test", "npm run check:pack", "npm run smoke:packaged", "npm run smoke:handlers", "npm run smoke:pi-lifecycle"]);
  assert.equal(packageJson.scripts["lint:eslint"], "eslint . --max-warnings=0");
  assert.equal(packageJson.scripts["test:coverage"], "node scripts/test-coverage.mjs");
  assert.equal(packageJson.scripts["smoke:discover"], "node scripts/smoke-observability.mjs");
  assert.equal(packageJson.scripts["smoke:packaged"], "node scripts/smoke-packaged-install.mjs");
  assert.equal(packageJson.scripts["smoke:handlers"], "node scripts/smoke-handler-execution.mjs");
  assert.equal(packageJson.scripts["smoke:pi-lifecycle"], "node scripts/smoke-pi-lifecycle.mjs");
  assert.equal(packageJson.scripts["pack:dry-run"], "npm pack --dry-run --json");
  assert.equal(packageJson.scripts["check:pack"], "node scripts/check-package-contents.mjs");
});

test("package source publication is glob-based and local-state-free", () => {
  assert.deepEqual(packageJson.files.filter((entry) => entry.startsWith("src/")), ["src/**/*.ts"]);
  assert.ok(!packageJson.files.some((entry) => entry.startsWith("specs/")), "specs must not be published");
  assert.ok(!packageJson.files.some((entry) => entry.startsWith(".pi")), "local Pi state must not be published");
  assert.ok(!packageJson.files.some((entry) => entry.startsWith("issues")), "local issue cache must not be published");
});

test("gitignore keeps secret-bearing environment variants ignored by default", () => {
  assert.doesNotMatch(gitignore, /^!\.env\.\*$/m, "env variants must not be broadly unignored");
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(gitignore, /^!\.env\.template$/m);

  assert.equal(isIgnoredByGit(".env.local"), true);
  assert.equal(isIgnoredByGit(".env.production"), true);
  assert.equal(isIgnoredByGit(".env.example"), false);
  assert.equal(isIgnoredByGit(".env.template"), false);
});

test("CI uses lockfile installs and the local validation contract", () => {
  assert.match(ciWorkflow, /^\s*uses:\s*actions\/checkout@v[1-9]\d*\s*$/m);
  assert.match(ciWorkflow, /^\s*uses:\s*actions\/setup-node@v[1-9]\d*\s*$/m);
  assert.match(ciWorkflow, /node-version:\s*22\.19\.0/);
  assert.match(ciWorkflow, /cache:\s*npm/);
  assert.match(ciWorkflow, /run:\s*npm ci\b/);
  assert.doesNotMatch(ciWorkflow, /run:\s*npm install\b/);
  assert.match(ciWorkflow, /run:\s*npm run validate\b/);
});

test("SonarQube workflow runs test coverage and scans lcov output", () => {
  assert.match(sonarWorkflow, /fetch-depth:\s*0/);
  assert.match(sonarWorkflow, /node-version:\s*22\.19\.0/);
  assert.match(sonarWorkflow, /cache:\s*npm/);
  assert.match(sonarWorkflow, /run:\s*npm ci --ignore-scripts\b/);
  assert.match(sonarWorkflow, /run:\s*npm run test:coverage\b/);
  assert.match(sonarWorkflow, /uses:\s*SonarSource\/sonarqube-scan-action@/);
  assert.match(sonarWorkflow, /SONAR_TOKEN:\s*\$\{\{ secrets\.SONAR_TOKEN \}\}/);
  assert.equal(sonarProperties["sonar.projectKey"], "senad-d_IssueMe");
  assert.equal(sonarProperties["sonar.organization"], "senad-d");
  assert.equal(sonarProperties["sonar.javascript.lcov.reportPaths"], "coverage/lcov.info");
  assert.equal(sonarProperties["sonar.sources"], "src");
  assert.equal(sonarProperties["sonar.tests"], "test");
});
