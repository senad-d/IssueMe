#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const coverageDir = new URL("../coverage/", import.meta.url);
const partialCoverageDir = new URL("../coverage/.lcov-parts/", import.meta.url);
const lcovPath = new URL("../coverage/lcov.info", import.meta.url);
const fullSuiteLcovPath = new URL("../coverage/.lcov-parts/full-suite.lcov", import.meta.url);

await mkdir(coverageDir, { recursive: true });
await rm(partialCoverageDir, { recursive: true, force: true });
await mkdir(partialCoverageDir, { recursive: true });

const testFiles = await listTestFiles();
const fullSuiteExitCode = await runFullSuiteCoverage(testFiles, fullSuiteLcovPath);
const coverageRuns = fullSuiteExitCode === 0
  ? await runCoverageForTestFiles(testFiles)
  : { exitCode: fullSuiteExitCode, partialPaths: [] };

if (fullSuiteExitCode !== 0) await rerunFullSuiteForDiagnostics(testFiles);
if (coverageRuns.exitCode === 0) {
  const merged = await mergeLcovFiles(fullSuiteLcovPath, coverageRuns.partialPaths);
  await writeFile(lcovPath, merged, "utf8");
  await rm(partialCoverageDir, { recursive: true, force: true });
  await printCoverageSummary(lcovPath);
}

process.exitCode = coverageRuns.exitCode;

async function listTestFiles() {
  const entries = await readdir(new URL("../test/", import.meta.url), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => `test/${entry.name}`)
    .sort();
}

async function runFullSuiteCoverage(testFiles, outputPath) {
  return spawnNode([
    "--test",
    "--experimental-test-coverage",
    "--test-coverage-include=src/**/*.ts",
    "--test-reporter=lcov",
    `--test-reporter-destination=${fileURLToPath(outputPath)}`,
    ...testFiles,
  ], "ignore");
}

async function rerunFullSuiteForDiagnostics(testFiles) {
  console.error("Full coverage run failed; rerunning the suite with the spec reporter for diagnostics.");
  await spawnNode(["--test", ...testFiles], "inherit");
}

async function runCoverageForTestFiles(testFiles) {
  const partialPaths = [];
  for (const testFile of testFiles) {
    const partialPath = new URL(`${partialFileName(testFile)}.lcov`, partialCoverageDir);
    const exitCode = await runCoverageForTestFile(testFile, partialPath);
    if (exitCode !== 0) {
      await rerunFailedTestForDiagnostics(testFile);
      return { exitCode, partialPaths };
    }
    partialPaths.push(partialPath);
  }
  return { exitCode: 0, partialPaths };
}

function partialFileName(testFile) {
  return testFile.replace(/[^a-z0-9_.-]/gi, "_");
}

async function runCoverageForTestFile(testFile, partialPath) {
  return spawnNode([
    "--test",
    "--experimental-test-coverage",
    "--test-coverage-include=src/**/*.ts",
    "--test-reporter=lcov",
    `--test-reporter-destination=${fileURLToPath(partialPath)}`,
    testFile,
  ], "ignore");
}

async function rerunFailedTestForDiagnostics(testFile) {
  console.error(`Coverage run failed for ${testFile}; rerunning with the spec reporter for diagnostics.`);
  await spawnNode(["--test", testFile], "inherit");
}

async function spawnNode(args, stdio) {
  const child = spawn(process.execPath, args, { cwd: rootPath, stdio });
  return new Promise((resolve) => {
    child.on("error", (error) => {
      console.error(`Failed to start coverage test run: ${error instanceof Error ? error.message : String(error)}`);
      resolve(1);
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`Coverage test run terminated by ${signal}.`);
        resolve(1);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function mergeLcovFiles(fullSuitePath, paths) {
  const fullSuiteRecords = await readLcovRecords(fullSuitePath);
  const lineRecords = await readMergedLcovRecords(paths);
  overlayLineCoverage(fullSuiteRecords, lineRecords);
  return renderLcov(fullSuiteRecords);
}

async function readMergedLcovRecords(paths) {
  const records = new Map();
  for (const path of paths) {
    const lcov = await readFile(path, "utf8");
    mergeLcov(records, lcov);
  }
  return records;
}

async function readLcovRecords(path) {
  const records = new Map();
  const lcov = await readFile(path, "utf8");
  mergeLcov(records, lcov);
  return records;
}

function overlayLineCoverage(targetRecords, lineRecords) {
  for (const [sourceFile, lineRecord] of lineRecords) {
    const targetRecord = ensureRecord(targetRecords, sourceFile);
    targetRecord.lines = lineRecord.lines;
  }
}

function mergeLcov(records, lcov) {
  let current;
  for (const rawLine of lcov.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    if (line.startsWith("SF:")) current = ensureRecord(records, line.slice(3));
    else if (line.startsWith("FN:")) mergeFunctionDefinition(current, line.slice(3));
    else if (line.startsWith("FNDA:")) mergeFunctionHit(current, line.slice(5));
    else if (line.startsWith("BRDA:")) mergeBranchHit(current, line.slice(5));
    else if (line.startsWith("FNF:")) assignSummaryMetric(current, "functionFound", line.slice(4));
    else if (line.startsWith("FNH:")) assignSummaryMetric(current, "functionHit", line.slice(4));
    else if (line.startsWith("BRF:")) assignSummaryMetric(current, "branchFound", line.slice(4));
    else if (line.startsWith("BRH:")) assignSummaryMetric(current, "branchHit", line.slice(4));
    else if (line.startsWith("DA:")) mergeLineHit(current, line.slice(3));
  }
}

function ensureRecord(records, sourceFile) {
  if (!records.has(sourceFile)) {
    records.set(sourceFile, {
      sourceFile,
      functions: [],
      functionHits: [],
      branches: new Map(),
      lines: new Map(),
      functionFound: undefined,
      functionHit: undefined,
      branchFound: undefined,
      branchHit: undefined,
    });
  }
  return records.get(sourceFile);
}

function mergeFunctionDefinition(record, value) {
  if (!record) return;
  const separator = value.indexOf(",");
  if (separator < 0) return;
  const line = Number(value.slice(0, separator));
  const name = value.slice(separator + 1);
  record.functions.push({ line, name });
}

function mergeFunctionHit(record, value) {
  if (!record) return;
  const separator = value.indexOf(",");
  if (separator < 0) return;
  const hit = Number(value.slice(0, separator));
  const name = value.slice(separator + 1);
  record.functionHits.push({ hit, name });
}

function mergeBranchHit(record, value) {
  if (!record) return;
  const [line, block, branch, hit] = value.split(",");
  const key = `${line},${block},${branch}`;
  record.branches.set(key, {
    line: Number(line),
    block: Number(block),
    branch: Number(branch),
    hit: (record.branches.get(key)?.hit ?? 0) + lcovHit(hit),
  });
}

function mergeLineHit(record, value) {
  if (!record) return;
  const [line, hit] = value.split(",");
  const lineNumber = Number(line);
  record.lines.set(lineNumber, (record.lines.get(lineNumber) ?? 0) + Number(hit));
}

function assignSummaryMetric(record, key, value) {
  if (!record) return;
  record[key] = Number(value);
}

function lcovHit(value) {
  if (value === undefined || value === "-") return 0;
  return Number(value);
}

function renderLcov(records) {
  const output = [];
  for (const record of [...records.values()].sort(compareRecords)) renderRecord(output, record);
  return `${output.join("\n")}\n`;
}

function compareRecords(left, right) {
  return left.sourceFile.localeCompare(right.sourceFile);
}

function renderRecord(output, record) {
  const functions = [...record.functions].sort(compareFunctions);
  const functionHits = [...record.functionHits];
  const branches = [...record.branches.values()].sort(compareBranches);
  const lines = [...record.lines.entries()].sort(compareLineEntries);
  output.push("TN:");
  output.push(`SF:${record.sourceFile}`);
  for (const fn of functions) output.push(`FN:${fn.line},${fn.name}`);
  for (const fnHit of functionHits) output.push(`FNDA:${fnHit.hit},${fnHit.name}`);
  output.push(`FNF:${record.functionFound ?? functions.length}`);
  output.push(`FNH:${record.functionHit ?? functionHits.filter((fnHit) => fnHit.hit > 0).length}`);
  for (const branch of branches) output.push(`BRDA:${branch.line},${branch.block},${branch.branch},${branch.hit}`);
  output.push(`BRF:${record.branchFound ?? branches.length}`);
  output.push(`BRH:${record.branchHit ?? branches.filter((branch) => branch.hit > 0).length}`);
  for (const [line, hit] of lines) output.push(`DA:${line},${hit}`);
  output.push(`LF:${lines.length}`);
  output.push(`LH:${lines.filter(([, hit]) => hit > 0).length}`);
  output.push("end_of_record");
}

function compareFunctions(left, right) {
  return left.line - right.line || left.name.localeCompare(right.name);
}

function compareBranches(left, right) {
  return left.line - right.line || left.block - right.block || left.branch - right.branch;
}

function compareLineEntries([left], [right]) {
  return left - right;
}

async function printCoverageSummary(path) {
  const lcov = await readFile(path, "utf8");
  const totals = parseLcovTotals(lcov);
  console.log(`Coverage report written to coverage/lcov.info (${formatPercentage(totals.lines.hit, totals.lines.found)} lines, ${formatPercentage(totals.functions.hit, totals.functions.found)} functions, ${formatPercentage(totals.branches.hit, totals.branches.found)} branches).`);
}

function parseLcovTotals(lcov) {
  const totals = {
    lines: { found: 0, hit: 0 },
    functions: { found: 0, hit: 0 },
    branches: { found: 0, hit: 0 },
  };
  for (const line of lcov.split("\n")) addLcovMetric(totals, line);
  return totals;
}

function addLcovMetric(totals, line) {
  if (line.startsWith("LF:")) totals.lines.found += Number(line.slice(3));
  if (line.startsWith("LH:")) totals.lines.hit += Number(line.slice(3));
  if (line.startsWith("FNF:")) totals.functions.found += Number(line.slice(4));
  if (line.startsWith("FNH:")) totals.functions.hit += Number(line.slice(4));
  if (line.startsWith("BRF:")) totals.branches.found += Number(line.slice(4));
  if (line.startsWith("BRH:")) totals.branches.hit += Number(line.slice(4));
}

function formatPercentage(hit, found) {
  if (found === 0) return "100.00%";
  return `${((hit / found) * 100).toFixed(2)}%`;
}
