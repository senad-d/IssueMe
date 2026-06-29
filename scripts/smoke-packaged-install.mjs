#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ISSUEME_TOOL_NAMES } from "../src/tools/inventory.ts";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(rootPath, "package.json"), "utf8"));
const packageName = packageJson.name;
const expectedCommands = ["issueme"];
const expectedTools = [...ISSUEME_TOOL_NAMES];

const jsonOutput = process.argv.includes("--json");
const keepTemp = process.argv.includes("--keep-temp");

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function localPiCommand() {
  const binary = process.platform === "win32" ? "pi.cmd" : "pi";
  const localBinary = join(rootPath, "node_modules", ".bin", binary);
  return existsSync(localBinary) ? localBinary : binary;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? rootPath,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function assertNameList(label, actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} mismatch. Expected ${expectedJson}; got ${actualJson}.`);
  }
}

function assertToolMetadata(tools) {
  for (const tool of tools) {
    if (!tool.description) throw new Error(`${tool.name} is missing a description.`);
    if (!tool.promptSnippet) throw new Error(`${tool.name} is missing promptSnippet.`);
    if (!Array.isArray(tool.promptGuidelines) || tool.promptGuidelines.length === 0) {
      throw new Error(`${tool.name} is missing promptGuidelines.`);
    }
    if (!tool.parameters || tool.parameters.additionalProperties !== false) {
      throw new Error(`${tool.name} is missing a strict parameter schema.`);
    }
  }
}

function packToTemp(tempRoot) {
  const output = run(npmCommand(), ["pack", "--json", "--pack-destination", tempRoot]);
  const parsed = JSON.parse(output);
  const pack = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!pack?.filename) throw new Error("Unexpected npm pack --json output: missing filename.");
  const tarballPath = join(tempRoot, pack.filename);
  if (!existsSync(tarballPath)) throw new Error(`Packed tarball was not created at ${tarballPath}.`);
  return { filename: pack.filename, tarballPath, fileCount: pack.files?.length ?? undefined };
}

async function linkPeerDependency(installRoot, peerName) {
  const sourcePath = join(rootPath, "node_modules", ...peerName.split("/"));
  if (!existsSync(sourcePath)) {
    throw new Error(`Cannot satisfy IssueMe peer dependency ${peerName}; ${sourcePath} is missing. Run npm ci first.`);
  }

  const targetPath = join(installRoot, "node_modules", ...peerName.split("/"));
  if (existsSync(targetPath)) return;
  await mkdir(dirname(targetPath), { recursive: true });
  await symlink(sourcePath, targetPath, process.platform === "win32" ? "junction" : "dir");
}

async function installPackedPackage(installRoot, tarballPath) {
  await mkdir(installRoot, { recursive: true });
  await writeFile(join(installRoot, "package.json"), `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`, "utf8");
  run(npmCommand(), [
    "install",
    "--omit=dev",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    "--legacy-peer-deps",
    tarballPath,
  ], { cwd: installRoot });

  for (const peerName of ["@earendil-works/pi-ai", "@earendil-works/pi-coding-agent", "typebox"]) {
    await linkPeerDependency(installRoot, peerName);
  }

  const packageRoot = join(installRoot, "node_modules", ...packageName.split("/"));
  if (!existsSync(join(packageRoot, "package.json"))) {
    throw new Error(`Packed package did not install at ${packageRoot}.`);
  }
  if (existsSync(join(packageRoot, "node_modules"))) {
    throw new Error("Packed IssueMe package unexpectedly contains its own node_modules directory.");
  }
  return packageRoot;
}

async function collectRegistrationProbe(packageRoot) {
  const extensionPath = join(packageRoot, "src", "extension.ts");
  const jitiPath = join(rootPath, "node_modules", "@earendil-works", "pi-coding-agent", "node_modules", "jiti", "lib", "jiti.mjs");
  if (!existsSync(jitiPath)) throw new Error(`Cannot load TypeScript registration probe; jiti is missing at ${jitiPath}.`);
  const { createJiti } = await import(pathToFileURL(jitiPath).href);
  const jiti = createJiti(pathToFileURL(extensionPath).href, { moduleCache: false });
  const extensionModule = await jiti.import(extensionPath);
  const issueMeExtension = extensionModule.default ?? extensionModule;
  const commandRegistrations = [];
  const toolRegistrations = [];
  const pi = {
    registerCommand(name, options) {
      commandRegistrations.push({ name, description: options?.description ?? "" });
    },
    registerTool(tool) {
      toolRegistrations.push(tool);
    },
  };

  issueMeExtension(pi);

  return {
    commands: commandRegistrations,
    tools: toolRegistrations,
  };
}

async function collectRpcCommands(packageRoot, installRoot) {
  const child = spawn(
    localPiCommand(),
    [
      "--mode",
      "rpc",
      "--no-session",
      "--no-extensions",
      "-e",
      packageRoot,
      "--offline",
      "--approve",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
    ],
    {
      cwd: installRoot,
      env: { ...process.env, PI_OFFLINE: "1", NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.stdin.end(`${JSON.stringify({ type: "get_commands" })}\n`);

  const exit = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Timed out waiting for pi RPC get_commands response from packed install."));
    }, 20000);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

  if (exit.code !== 0) {
    throw new Error(`Packed pi RPC command discovery failed with code ${exit.code ?? `signal ${exit.signal}`}: ${stderr.trim() || stdout.trim()}`);
  }

  const responses = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const response = responses.find((entry) => entry.type === "response" && entry.command === "get_commands");
  if (!response?.success) {
    throw new Error(`Packed pi RPC get_commands did not return success: ${JSON.stringify(response)}`);
  }
  return response.data.commands;
}

function toToolSummary(tool) {
  return {
    name: tool.name,
    description: tool.description,
    executionMode: tool.executionMode ?? "parallel",
    hasPromptSnippet: Boolean(tool.promptSnippet),
    promptGuidelineCount: Array.isArray(tool.promptGuidelines) ? tool.promptGuidelines.length : 0,
    schemaStrict: tool.parameters?.additionalProperties === false,
  };
}

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), "issueme-packed-smoke-"));
  try {
    const packed = packToTemp(tempRoot);
    const installRoot = join(tempRoot, "install");
    const packageRoot = await installPackedPackage(installRoot, packed.tarballPath);
    const rpcCommands = await collectRpcCommands(packageRoot, installRoot);
    const issueMeRpcCommands = rpcCommands.filter((command) => command.source === "extension");
    const registrationProbe = await collectRegistrationProbe(packageRoot);
    const probeCommandNames = registrationProbe.commands.map((command) => command.name);
    const rpcCommandNames = issueMeRpcCommands.map((command) => command.name);
    const toolNames = registrationProbe.tools.map((tool) => tool.name);

    assertNameList("Packed extension registration command list", probeCommandNames, expectedCommands);
    assertNameList("Packed Pi RPC command discovery list", rpcCommandNames, expectedCommands);
    assertNameList("Packed IssueMe tool registration list", toolNames, expectedTools);
    assertToolMetadata(registrationProbe.tools);

    const report = {
      ok: true,
      packageInstall: {
        packageName,
        tarballFile: packed.filename,
        packedFileCount: packed.fileCount,
        method: "npm pack to a temporary directory, npm install --omit=dev in a temporary project, then load the installed package path with pi -e",
        peerDependencyMode: "IssueMe devDependencies are omitted; documented Pi peer dependencies are satisfied from the current Pi installation for this local smoke check.",
        temporaryDirectoryKept: keepTemp ? tempRoot : undefined,
      },
      commandDiscovery: {
        method: "pi --mode rpc get_commands with explicit -e <temporary node_modules package root>",
        commands: issueMeRpcCommands.map((command) => ({
          name: command.name,
          description: command.description ?? "",
          source: command.source,
        })),
      },
      toolDiscovery: {
        method: "ExtensionAPI registration probe importing the installed packed package; handlers are not invoked",
        tools: registrationProbe.tools.map(toToolSummary),
      },
      safety: {
        noLiveGitHubMutation: true,
        handlersInvoked: false,
        publishesOrUpdates: false,
        cleansTemporaryArtifacts: !keepTemp,
      },
    };

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log("IssueMe packed-install smoke passed.");
    console.log("");
    console.log(`Packed artifact: ${packed.filename} (${packed.fileCount ?? "unknown"} file(s))`);
    console.log("Temporary production-style install omitted IssueMe devDependencies and loaded the packed package root.");
    console.log("");
    console.log("Command discovery (pi --mode rpc get_commands):");
    for (const command of report.commandDiscovery.commands) {
      console.log(`- /${command.name} — ${command.description}`);
    }
    console.log("");
    console.log("Tool discovery (installed package registration probe):");
    for (const tool of report.toolDiscovery.tools) {
      console.log(`- ${tool.name} — ${tool.description}`);
    }
    console.log("");
    console.log("No IssueMe command/tool handlers were invoked; no live GitHub calls, publishes, dependency updates, or repository tarballs were produced.");
  } finally {
    if (!keepTemp) await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IssueMe packed-install smoke failed: ${message}`);
  process.exitCode = 1;
});
