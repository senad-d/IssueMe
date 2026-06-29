#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const jsonOutput = process.argv.includes("--json");
const keepTemp = process.argv.includes("--keep-temp");
const scrubbedEnvKeys = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_REPOSITORY"];
const promptTimeoutMs = 20000;
const responseTimeoutMs = 15000;
const expectedCommandName = "issueme";
const forbiddenOutputPattern = /ghp_smoke|github_pat_|GH_TOKEN=|GITHUB_TOKEN=|project-secret|process-secret/;

function localPiCommand() {
  const binary = process.platform === "win32" ? "pi.cmd" : "pi";
  const localBinary = join(rootPath, "node_modules", ".bin", binary);
  return existsSync(localBinary) ? localBinary : binary;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function scrubbedEnvironment() {
  const env = { ...process.env, PI_OFFLINE: "1", NO_COLOR: "1" };
  for (const key of scrubbedEnvKeys) delete env[key];
  return env;
}

async function createTemporaryProject() {
  const projectRoot = await mkdtemp(join(tmpdir(), "issueme-pi-lifecycle-"));
  await mkdir(join(projectRoot, ".git"), { recursive: true });
  await writeFile(
    join(projectRoot, ".git", "config"),
    '[remote "origin"]\n\turl = https://github.com/owner/repo.git\n',
    "utf8",
  );
  return projectRoot;
}

class RpcHarness {
  constructor(cwd) {
    this.cwd = cwd;
    this.events = [];
    this.pending = new Map();
    this.nextId = 1;
    this.stdoutBuffer = "";
    this.stderr = "";
    this.closed = false;
    this.child = spawn(
      localPiCommand(),
      [
        "--mode",
        "rpc",
        "--no-session",
        "--no-extensions",
        "-e",
        rootPath,
        "--offline",
        "--approve",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-context-files",
      ],
      {
        cwd,
        env: scrubbedEnvironment(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("close", (code, signal) => {
      this.closed = true;
      if (code !== 0) {
        this.rejectAll(new Error(`pi RPC exited with code ${code ?? `signal ${signal}`}: ${this.stderr.trim()}`));
      }
    });
  }

  handleStdout(chunk) {
    this.stdoutBuffer += chunk;
    while (true) {
      const newlineIndex = this.stdoutBuffer.indexOf("\n");
      if (newlineIndex === -1) return;
      let line = this.stdoutBuffer.slice(0, newlineIndex);
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.trim()) continue;

      let entry;
      try {
        entry = JSON.parse(line);
      } catch (error) {
        this.rejectAll(new Error(`Invalid RPC JSON line: ${line}\n${error instanceof Error ? error.message : String(error)}`));
        continue;
      }

      this.events.push(entry);
      if (entry.type === "response" && typeof entry.id === "string") {
        const pending = this.pending.get(entry.id);
        if (pending) {
          this.pending.delete(entry.id);
          pending.resolve(entry);
        }
      }
    }
  }

  rejectAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  async command(command, timeoutMs = responseTimeoutMs) {
    if (this.closed) throw new Error("Cannot send RPC command after pi exited.");
    const id = `issueme-lifecycle-${this.nextId++}`;
    const payload = { id, ...command };
    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for RPC ${command.type} response.`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    return responsePromise;
  }

  async promptAndMessage(message, expectedCustomType) {
    const eventStart = this.events.length;
    const response = await this.command({ type: "prompt", message }, promptTimeoutMs);
    assert(response.success === true, `${message} prompt failed: ${JSON.stringify(response)}`);
    const event = this.events.slice(eventStart).find((entry) => entry.type === "message_end" && entry.message?.customType === expectedCustomType);
    assert(event, `${message} did not emit a ${expectedCustomType} message.`);
    return event.message;
  }

  async close() {
    if (this.closed) return;
    this.child.stdin.end();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.child.kill("SIGTERM");
        reject(new Error("Timed out waiting for pi RPC process to exit."));
      }, 10000);
      this.child.once("close", (code, signal) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`pi RPC exited with code ${code ?? `signal ${signal}`}: ${this.stderr.trim()}`));
      });
    });
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function assertNoSensitiveOutput(reportable) {
  const text = JSON.stringify(reportable);
  assert(!forbiddenOutputPattern.test(text), "Pi lifecycle smoke output included a forbidden token/env canary.");
}

async function main() {
  const tempRoot = await createTemporaryProject();
  const rpc = new RpcHarness(tempRoot);
  try {
    const commandsResponse = await rpc.command({ type: "get_commands" });
    assert(commandsResponse.success === true, `get_commands failed: ${JSON.stringify(commandsResponse)}`);
    const issueMeCommands = commandsResponse.data.commands.filter((command) => command.source === "extension" && command.name === expectedCommandName);
    assert(issueMeCommands.length === 1, `Expected exactly one /issueme extension command; got ${issueMeCommands.length}.`);

    const infoMessage = await rpc.promptAndMessage("/issueme info", "issueme-info");
    assert(infoMessage.content.includes("IssueMe help and status"), "/issueme info did not render help/status.");
    assert(infoMessage.content.includes("Project trusted: yes"), "/issueme info did not run in a trusted temporary project.");
    assert(infoMessage.content.includes("Repository: owner/repo"), "/issueme info did not resolve the temporary GitHub repository.");
    assert(infoMessage.content.includes("Token: missing"), "/issueme info should report a missing token with scrubbed env.");

    const configMessage = await rpc.promptAndMessage("/issueme", "issueme-config");
    assert(configMessage.content.includes("interactive only in TUI mode"), "/issueme did not use the RPC/non-TUI fallback.");
    assert(configMessage.content.includes("Current config"), "/issueme fallback did not include current non-secret config.");
    assert(configMessage.details?.mode === "rpc", "/issueme fallback did not record RPC mode.");
    assert(configMessage.details?.hasUI === true, "/issueme fallback should record RPC UI availability.");

    const startMessage = await rpc.promptAndMessage("/issueme start", "issueme-info");
    assert(startMessage.content.includes("Usage: /issueme start [skill-path]"), "/issueme start without a default skill did not show guidance.");
    assert(startMessage.content.includes("Default skill path: not set"), "/issueme start guidance did not report missing defaultSkillPath.");

    const extensionUiRequests = rpc.events.filter((entry) => entry.type === "extension_ui_request");
    assert(extensionUiRequests.length === 0, "RPC lifecycle unexpectedly requested direct/custom TUI UI.");
    assert(!(await pathExists(join(tempRoot, ".pi", "agent", "issueme.json"))), "RPC lifecycle smoke should not persist IssueMe config.");
    assert(!(await pathExists(join(tempRoot, ".env"))), "RPC lifecycle smoke should not create or rely on project .env.");

    const report = {
      ok: true,
      piLifecycle: {
        method: "pi --mode rpc with --no-extensions -e <checkout>, --offline, --approve, and resource discovery disabled",
        commandDiscovery: issueMeCommands.map((command) => ({
          name: command.name,
          description: command.description ?? "",
          source: command.source,
          sourceInfo: command.sourceInfo,
        })),
        invokedCommands: [
          { command: "/issueme info", customType: infoMessage.customType, repository: infoMessage.details?.repositoryStatus, tokenPresent: infoMessage.details?.tokenPresent },
          { command: "/issueme", customType: configMessage.customType, mode: configMessage.details?.mode, hasUI: configMessage.details?.hasUI },
          { command: "/issueme start", customType: startMessage.customType, guidanceOnly: true },
        ],
        extensionUiRequestCount: extensionUiRequests.length,
      },
      safety: {
        scrubbedEnvironmentVariables: scrubbedEnvKeys,
        offlineMode: true,
        liveGitHubCalls: false,
        remoteMutations: false,
        projectEnvCreatedOrRead: false,
        configPersisted: false,
        temporaryDirectoryKept: keepTemp ? tempRoot : undefined,
      },
      interactiveTui: {
        status: "manual-blocked-in-ci",
        blocker: "Pi RPC documents ctx.ui.custom() as unavailable in RPC mode, while real terminal key handling requires a TTY-specific interactive session. Manual steps are documented in docs/pi-lifecycle-verification.md until Pi exposes a stable headless TUI driver.",
      },
    };

    assertNoSensitiveOutput(report);

    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log("IssueMe Pi lifecycle smoke passed.");
    console.log("");
    console.log("Real Pi RPC command lifecycle:");
    console.log("- /issueme discovered through pi --mode rpc get_commands.");
    console.log("- /issueme info emitted safe help/status for a trusted temporary repository.");
    console.log("- /issueme used the non-TUI RPC fallback instead of opening ctx.ui.custom().");
    console.log("- /issueme start without defaultSkillPath emitted guidance without starting an agent turn.");
    console.log("");
    console.log("Safety checks: scrubbed IssueMe env vars, offline mode, no .env, no config write, no live GitHub calls, no extension UI requests.");
    console.log("Interactive TUI key/save/close verification remains a documented manual check: docs/pi-lifecycle-verification.md");
  } finally {
    await rpc.close();
    if (!keepTemp) await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IssueMe Pi lifecycle smoke failed: ${message}`);
  process.exitCode = 1;
});
