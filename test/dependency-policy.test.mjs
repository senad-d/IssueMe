import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", rootUrl), "utf8"));
const lockfile = JSON.parse(await readFile(new URL("package-lock.json", rootUrl), "utf8"));
const dependabot = await readFile(new URL(".github/dependabot.yml", rootUrl), "utf8");

test("TypeScript manifests allow compatible 6.0 patches without admitting 6.1", () => {
  assert.equal(manifest.devDependencies.typescript, "~6.0.3");
  assert.equal(lockfile.packages[""].devDependencies.typescript, manifest.devDependencies.typescript);
});

test("the lockfile resolves TypeScript within the declared 6.0 patch range", () => {
  const version = lockfile.packages["node_modules/typescript"].version;
  assert.match(version, /^6\.0\.\d+$/);
  assert.ok(Number(version.split(".")[2]) >= 3, "the locked patch must satisfy ~6.0.3");
});

test("Dependabot ignores only TypeScript 6.1 and newer in the root npm update block", () => {
  // Match update-level blocks, as in the existing CI configuration contract tests.
  const updates = dependabot.split(/(?=^ {2}- package-ecosystem:)/m);
  const npmUpdates = updates.filter((block) => /^ {2}- package-ecosystem: npm\s*$/m.test(block));
  assert.equal(npmUpdates.length, 1);
  const npm = npmUpdates[0];
  assert.match(npm, /^ {4}directory: \/\s*$/m);
  const ignore = npm.match(/^ {4}ignore:\n((?:^ {6,}[^\n]*\n|^\s*\n)+)/m);
  assert.ok(ignore, "the ignore policy must be at npm update level, not inside a group");
  assert.equal(
    ignore[1].trimEnd(),
    '      - dependency-name: typescript\n        versions: [">=6.1.0"]',
    "keep 6.0.x updates eligible and do not ignore other dependencies",
  );
  assert.equal((dependabot.match(/^\s*ignore:/gm) ?? []).length, 1, "do not add an ignore policy to GitHub Actions or groups");
});
