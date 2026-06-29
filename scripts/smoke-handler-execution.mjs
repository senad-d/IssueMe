#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import issueMeExtension from "../src/extension.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(rootPath, "package.json"), "utf8"));
const packageName = packageJson.name;
const jsonOutput = process.argv.includes("--json");
const keepTemp = process.argv.includes("--keep-temp");
const scrubbedEnvKeys = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_REPOSITORY"];
const smokeRepository = "owner/repo";
const smokeConfig = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? rootPath,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
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
  return packageRoot;
}

async function loadPackedModules(packageRoot) {
  const extensionPath = join(packageRoot, "src", "extension.ts");
  const toolsPath = join(packageRoot, "src", "tools", "issueme-tools.ts");
  const jitiPath = join(rootPath, "node_modules", "@earendil-works", "pi-coding-agent", "node_modules", "jiti", "lib", "jiti.mjs");
  if (!existsSync(jitiPath)) throw new Error(`Cannot load TypeScript handler probe; jiti is missing at ${jitiPath}.`);
  const { createJiti } = await import(pathToFileURL(jitiPath).href);
  const jiti = createJiti(pathToFileURL(extensionPath).href, { moduleCache: false });
  const extensionModule = await jiti.import(extensionPath);
  const toolsModule = await jiti.import(toolsPath);
  return {
    issueMeExtension: extensionModule.default ?? extensionModule,
    registerIssueMeTools: toolsModule.registerIssueMeTools,
  };
}

function fakePi() {
  const commands = new Map();
  const tools = new Map();
  const messages = [];
  const userMessages = [];
  return {
    commands,
    tools,
    messages,
    userMessages,
    registerCommand(name, options) { commands.set(name, options); },
    registerTool(tool) { tools.set(tool.name, tool); },
    sendMessage(message) { messages.push(message); },
    sendUserMessage(content, options) { userMessages.push({ content, options }); },
  };
}

function commandContext(cwd) {
  return {
    cwd,
    mode: "rpc",
    hasUI: true,
    isProjectTrusted: () => false,
    isIdle: () => true,
    ui: {
      notify() {},
    },
  };
}

function toolContext(cwd, trusted) {
  return {
    cwd,
    isProjectTrusted: () => trusted,
  };
}

async function withScrubbedIssueMeEnvironment(callback) {
  const saved = new Map(scrubbedEnvKeys.map((key) => [key, process.env[key]]));
  for (const key of scrubbedEnvKeys) delete process.env[key];
  try {
    return await callback();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function executeAsPiTool(tool, cwd, params, trusted) {
  try {
    const result = await tool.execute("smoke-tool-call", params, undefined, undefined, toolContext(cwd, trusted));
    return { isError: false, result };
  } catch (error) {
    return { isError: true, error: summarizeError(error) };
  }
}

function summarizeError(error) {
  if (error && typeof error === "object") {
    return {
      name: error.constructor?.name ?? "Error",
      code: typeof error.code === "string" ? error.code : undefined,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return { name: "Error", message: String(error) };
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function assertNoSecretLeak(value) {
  const text = JSON.stringify(value);
  if (/ghp_smoke_handler_token/.test(text)) throw new Error("Smoke handler output leaked the injected test token.");
}

function createInjectedListLabelsFetch() {
  const calls = [];
  const fetchFn = async (input, init = {}) => {
    const url = new URL(input.toString());
    const method = init.method ?? "GET";
    calls.push({ method, path: url.pathname, authorization: init.headers?.Authorization });
    if (url.pathname === "/repos/owner/repo/labels" && method === "GET") {
      return jsonResponse([
        { name: "safe-smoke", description: "Handler smoke label", color: "0e8a16", default: false, url: "https://api.github.com/repos/owner/repo/labels/safe-smoke" },
      ]);
    }
    throw new Error(`Unexpected smoke GitHub request: ${method} ${url.pathname}`);
  };
  return { calls, fetchFn };
}

async function runCommandHandlerCheck(extensionFactory, cwd) {
  const pi = fakePi();
  extensionFactory(pi);
  const command = pi.commands.get("issueme");
  if (!command?.handler) throw new Error("/issueme command handler was not registered.");

  await withScrubbedIssueMeEnvironment(() => command.handler("unknown-subcommand", commandContext(cwd)));
  const message = pi.messages.at(-1);
  if (message?.customType !== "issueme-info") throw new Error("/issueme unknown-subcommand did not execute the info fallback handler.");
  if (message.details?.trusted !== false) throw new Error("Untrusted command smoke should report trusted=false.");
  if (!String(message.content ?? "").includes("Unknown /issueme subcommand")) throw new Error("Command fallback output did not include the unknown-subcommand warning.");
  return {
    command: "/issueme unknown-subcommand",
    handlerInvoked: true,
    trusted: message.details.trusted,
    warning: message.details.warning,
    emittedMessageType: message.customType,
  };
}

async function runTrustRefusalToolCheck(extensionFactory, cwd) {
  const pi = fakePi();
  extensionFactory(pi);
  const tool = pi.tools.get("issueme_list_issues");
  if (!tool) throw new Error("issueme_list_issues was not registered for trust-refusal smoke.");
  const result = await withScrubbedIssueMeEnvironment(() => executeAsPiTool(tool, cwd, { state: "open", limit: 1 }, false));
  if (!result.isError || result.error?.code !== "project_untrusted") {
    throw new Error(`Trust-refusal tool smoke expected project_untrusted Pi error; got ${JSON.stringify(result)}.`);
  }
  return {
    tool: "issueme_list_issues",
    handlerInvoked: true,
    expectedPiIsError: result.isError,
    errorCode: result.error.code,
  };
}

async function runInjectedToolCheck(registerToolsFn, cwd) {
  const mock = createInjectedListLabelsFetch();
  const pi = fakePi();
  registerToolsFn(pi, {
    runtime: {
      config: smokeConfig,
      repository: smokeRepository,
      token: "ghp_smoke_handler_token",
      fetchFn: mock.fetchFn,
    },
  });
  const tool = pi.tools.get("issueme_list_labels");
  if (!tool) throw new Error("issueme_list_labels was not registered for injected handler smoke.");
  const result = await executeAsPiTool(tool, cwd, { query: "safe", limit: 5 }, true);
  assertNoSecretLeak(result);
  if (result.isError) throw new Error(`Injected read-only tool smoke should not be a Pi error: ${JSON.stringify(result.error)}.`);
  if (result.result.details?.result !== "success") throw new Error(`Injected read-only tool smoke expected details.result=success; got ${result.result.details?.result}.`);
  if (result.result.details.labels?.[0]?.name !== "safe-smoke") throw new Error("Injected read-only tool smoke did not return mocked label data.");
  if (mock.calls.length !== 1 || mock.calls[0].authorization !== "Bearer ghp_smoke_handler_token") {
    throw new Error(`Injected read-only tool smoke made unexpected mocked requests: ${JSON.stringify(mock.calls)}.`);
  }
  return {
    tool: "issueme_list_labels",
    handlerInvoked: true,
    expectedPiIsError: result.isError,
    result: result.result.details.result,
    labels: result.result.details.labels.map((label) => label.name),
    mockedGitHubRequests: mock.calls.map((call) => `${call.method} ${call.path}`),
  };
}

async function runHandlerChecks(label, modules) {
  const cwd = await mkdtemp(join(tmpdir(), `issueme-handler-smoke-${label}-`));
  try {
    const commandFallback = await runCommandHandlerCheck(modules.issueMeExtension, cwd);
    const trustRefusal = await runTrustRefusalToolCheck(modules.issueMeExtension, cwd);
    const injectedReadOnlyTool = await runInjectedToolCheck(modules.registerIssueMeTools, cwd);
    return {
      label,
      commandFallback,
      toolHandlers: [trustRefusal, injectedReadOnlyTool],
      safety: {
        temporaryDirectory: cwd,
        projectEnvRead: false,
        liveGitHubCalls: false,
        remoteMutations: false,
        issueMeEnvironmentScrubbed: scrubbedEnvKeys,
      },
    };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function main() {
  const checkout = await runHandlerChecks("checkout", { issueMeExtension, registerIssueMeTools });
  const tempRoot = await mkdtemp(join(tmpdir(), "issueme-packed-handler-smoke-"));
  try {
    const packed = packToTemp(tempRoot);
    const installRoot = join(tempRoot, "install");
    const packageRoot = await installPackedPackage(installRoot, packed.tarballPath);
    const packedModules = await loadPackedModules(packageRoot);
    const packedHandlers = await runHandlerChecks("packed", packedModules);
    const report = {
      ok: true,
      packageInstall: {
        packageName,
        tarballFile: packed.filename,
        packedFileCount: packed.fileCount,
        temporaryDirectoryKept: keepTemp ? tempRoot : undefined,
      },
      handlerExecution: {
        checkout,
        packed: packedHandlers,
      },
      safety: {
        handlersInvoked: true,
        commandHandlersInvoked: true,
        toolHandlersInvoked: true,
        projectEnvRead: false,
        liveGitHubCalls: false,
        remoteMutations: false,
        writesOnlyTemporaryDirectories: true,
        mockedGitHubOnly: true,
        cleansTemporaryArtifacts: !keepTemp,
      },
    };

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log("IssueMe handler smoke passed.");
    console.log("");
    console.log("Checkout handlers invoked:");
    console.log(`- ${checkout.commandFallback.command} -> ${checkout.commandFallback.emittedMessageType}`);
    for (const tool of checkout.toolHandlers) console.log(`- ${tool.tool} -> ${tool.expectedPiIsError ? `Pi error ${tool.errorCode}` : tool.result}`);
    console.log("");
    console.log("Packed-package handlers invoked:");
    console.log(`- ${packedHandlers.commandFallback.command} -> ${packedHandlers.commandFallback.emittedMessageType}`);
    for (const tool of packedHandlers.toolHandlers) console.log(`- ${tool.tool} -> ${tool.expectedPiIsError ? `Pi error ${tool.errorCode}` : tool.result}`);
    console.log("");
    console.log("No project .env files, live GitHub calls, or remote mutations were used; only temporary directories and mocked fetches were touched.");
  } finally {
    if (!keepTemp) await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IssueMe handler smoke failed: ${message}`);
  process.exitCode = 1;
});
