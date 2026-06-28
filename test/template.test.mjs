import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const requiredSpecs = [
  "../specs/spec-architecture.md",
  "../specs/spec-guidelines.md",
  "../specs/spec-tasks.md",
];

test("package declares the IssueMe Pi extension entry file", async () => {
  assert.equal(packageJson.name, "@senad-d/issueme");
  assert.deepEqual(packageJson.pi?.extensions, ["./src/extension.ts"]);
  await access(new URL("../src/extension.ts", import.meta.url));
});

test("package metadata points at the IssueMe repository", () => {
  assert.equal(packageJson.description, "Agent-friendly GitHub issue management layer for Pi using GitHub APIs and local issue files.");
  assert.equal(packageJson.repository?.url, "git+https://github.com/senad-d/issueme.git");
  assert.equal(packageJson.bugs?.url, "https://github.com/senad-d/issueme/issues");
  assert.equal(packageJson.homepage, "https://github.com/senad-d/issueme#readme");
  assert.ok(packageJson.keywords.includes("pi-package"));
  assert.ok(packageJson.keywords.includes("github-issues"));
});

test("required IssueMe implementation specs exist", async () => {
  for (const specPath of requiredSpecs) {
    const specText = await readFile(new URL(specPath, import.meta.url), "utf8");
    assert.match(specText, /^# Plan:/m);
  }
});

test("approved project definition brief is present", async () => {
  const brief = await readFile(new URL("../docs/PROJECT_DEFINITION_BRIEF.md", import.meta.url), "utf8");
  assert.match(brief, /Package name: `@senad-d\/issueme`/);
  assert.match(brief, /REST and GraphQL APIs/);
  assert.match(brief, /No webhooks now/);
});
