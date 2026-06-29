#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import issueMeExtension from "../src/extension.ts";
import { ISSUEME_TOOL_NAMES } from "../src/tools/inventory.ts";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const expectedCommands = ["issueme"];
const expectedTools = [...ISSUEME_TOOL_NAMES];

const jsonOutput = process.argv.includes("--json");

function localPiCommand() {
  const binary = process.platform === "win32" ? "pi.cmd" : "pi";
  const localBinary = join(rootPath, "node_modules", ".bin", binary);
  return existsSync(localBinary) ? localBinary : binary;
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

function collectRegistrationProbe() {
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

async function collectRpcCommands() {
  const child = spawn(
    localPiCommand(),
    [
      "--mode",
      "rpc",
      "--no-session",
      "--no-extensions",
      "-e",
      ".",
      "--offline",
      "--approve",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
    ],
    {
      cwd: rootPath,
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
      reject(new Error("Timed out waiting for pi RPC get_commands response."));
    }, 15000);

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
    throw new Error(`pi RPC command discovery failed with code ${exit.code ?? `signal ${exit.signal}`}: ${stderr.trim() || stdout.trim()}`);
  }

  const responses = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const response = responses.find((entry) => entry.type === "response" && entry.command === "get_commands");
  if (!response?.success) {
    throw new Error(`pi RPC get_commands did not return success: ${JSON.stringify(response)}`);
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
  const rpcCommands = await collectRpcCommands();
  const issueMeRpcCommands = rpcCommands.filter((command) => command.source === "extension");
  const registrationProbe = collectRegistrationProbe();
  const probeCommandNames = registrationProbe.commands.map((command) => command.name);
  const rpcCommandNames = issueMeRpcCommands.map((command) => command.name);
  const toolNames = registrationProbe.tools.map((tool) => tool.name);

  assertNameList("Extension registration command list", probeCommandNames, expectedCommands);
  assertNameList("Pi RPC command discovery list", rpcCommandNames, expectedCommands);
  assertNameList("IssueMe tool registration list", toolNames, expectedTools);
  assertToolMetadata(registrationProbe.tools);

  const report = {
    ok: true,
    commandDiscovery: {
      method: "pi --mode rpc get_commands with explicit -e . and all other resource discovery disabled",
      commands: issueMeRpcCommands.map((command) => ({
        name: command.name,
        description: command.description ?? "",
        source: command.source,
      })),
    },
    toolDiscovery: {
      method: "local ExtensionAPI registration probe; Pi RPC exposes get_commands but no get_tools command",
      tools: registrationProbe.tools.map(toToolSummary),
    },
    safety: {
      noLiveGitHubMutation: true,
      handlersInvoked: false,
      note: "The smoke probe loads the extension and inspects registrations only; it does not call IssueMe tool handlers.",
    },
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("IssueMe smoke discovery passed.");
  console.log("");
  console.log("Command discovery (pi --mode rpc get_commands):");
  for (const command of report.commandDiscovery.commands) {
    console.log(`- /${command.name} — ${command.description}`);
  }
  console.log("");
  console.log("Tool discovery (ExtensionAPI registration probe):");
  for (const tool of report.toolDiscovery.tools) {
    console.log(`- ${tool.name} — ${tool.description}`);
  }
  console.log("");
  console.log("No IssueMe command/tool handlers were invoked; no live GitHub calls or mutations were performed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IssueMe smoke discovery failed: ${message}`);
  process.exitCode = 1;
});
