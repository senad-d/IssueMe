#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(join(rootPath, "package.json"), "utf8"));
const hiddenEnvironmentFilePattern = /^\.env(?:$|\.)/;
const sourceGlob = "src/**/*.ts";
const templatePlaceholderSourcePaths = new Set([
  "src/commands/example-command.ts",
  "src/tools/example-tool.ts",
  "src/events/lifecycle.ts",
  "src/utils/format.ts",
]);

const forbiddenChecks = [
  { label: "environment files", test: (path) => hiddenEnvironmentFilePattern.test(path) },
  { label: "project-local pi state", test: (path) => path === ".pi" || path.startsWith(".pi/") },
  { label: "node_modules", test: (path) => path.startsWith("node_modules/") || path.includes("/node_modules/") },
  { label: "planning specs", test: (path) => path.startsWith("specs/") || path.includes("/specs/") },
  { label: "local issue cache", test: (path) => path === "issues" || path.startsWith("issues/") },
  { label: "local caches", test: (path) => /(^|\/)(\.cache|\.local|\.trivycache)(\/|$)/.test(path) },
  { label: "generated reports", test: (path) => /(^|\/)(coverage|trivy-reports|odc-reports)(\/|$)/.test(path) },
  { label: "npm tarballs", test: (path) => path.endsWith(".tgz") },
  { label: "template placeholder source", test: (path) => templatePlaceholderSourcePaths.has(path) },
  { label: "OS/editor files", test: (path) => path.endsWith(".DS_Store") || path.endsWith(".log") },
];

function listTypeScriptSourceFiles(directory) {
  const sourceFiles = [];
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      sourceFiles.push(...listTypeScriptSourceFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      sourceFiles.push(relative(rootPath, entryPath).replaceAll("\\", "/"));
    }
  }

  return sourceFiles.sort((a, b) => a.localeCompare(b));
}

function sourceGlobPolicyFailures() {
  if (Array.isArray(pkg.files) && pkg.files.includes(sourceGlob)) return [];
  return [`package.json files must include "${sourceGlob}" so new runtime source modules are published by default.`];
}

function readPackFiles() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const output = execFileSync(npmCommand, ["pack", "--dry-run", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output);
  const pack = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!pack || !Array.isArray(pack.files)) {
    throw new Error("Unexpected npm pack --dry-run --json output.");
  }
  return pack.files.map((file) => file.path).sort((a, b) => a.localeCompare(b));
}

const files = readPackFiles();
const fileSet = new Set(files);
const sourceFiles = listTypeScriptSourceFiles(join(rootPath, "src"));
const omittedSourceFiles = sourceFiles.filter((file) => !fileSet.has(file));
const maintenancePolicyFailures = sourceGlobPolicyFailures();
const violations = [];
for (const file of files) {
  for (const check of forbiddenChecks) {
    if (check.test(file)) violations.push({ file, label: check.label });
  }
}

console.log(`${pkg.name} package dry-run contains ${files.length} file(s).`);
for (const file of files) console.log(`- ${file}`);
console.log(`\nSource publication check covers ${sourceFiles.length} src TypeScript file(s).`);

if (maintenancePolicyFailures.length > 0) {
  console.error("\nPackage maintenance policy failures:");
  for (const failure of maintenancePolicyFailures) console.error(`- ${failure}`);
}

if (omittedSourceFiles.length > 0) {
  console.error("\nSource files omitted from package contents:");
  for (const file of omittedSourceFiles) console.error(`- ${file}`);
}

if (violations.length > 0) {
  console.error("\nForbidden package contents detected:");
  for (const violation of violations) {
    console.error(`- ${violation.file} (${violation.label})`);
  }
}

if (maintenancePolicyFailures.length > 0 || omittedSourceFiles.length > 0 || violations.length > 0) {
  process.exitCode = 1;
}
