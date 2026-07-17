#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import issueMeExtension from "../src/extension.ts";
import { ISSUEME_TOOL_NAMES } from "../src/tools/inventory.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const packageJson = JSON.parse(readFileSync(join(rootPath, "package.json"), "utf8"));
const packageName = packageJson.name;
const jsonOutput = process.argv.includes("--json");
const keepTemp = process.argv.includes("--keep-temp");
const scrubbedEnvKeys = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_REPOSITORY"];
const smokeRepository = "owner/repo";
const smokeRepositoryObject = { owner: "owner", repo: "repo", fullName: smokeRepository };
const smokeConfig = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };
const injectedTokenCanary = "ghp_smoke_handler_token";

const toolSmokeScenarios = [
  { name: "issueme_list_issues", params: { state: "open", limit: 3 } },
  { name: "issueme_list_labels", params: { query: "ready", limit: 5 } },
  { name: "issueme_list_milestones", params: { state: "all", limit: 5 } },
  { name: "issueme_list_assignees", params: { query: "bot", limit: 5 } },
  { name: "issueme_list_projects", params: { limit: 5 } },
  { name: "issueme_get_project_fields", params: { projectNumber: 1, fieldLimit: 5 } },
  { name: "issueme_add_issue_to_project", params: { issueNumber: 10, projectId: "PVT_repo_1" } },
  {
    name: "issueme_update_project_item",
    params: {
      projectId: "PVT_repo_1",
      itemId: "PVTI_10",
      issueNumber: 10,
      fieldId: "PVTSSF_status",
      valueType: "single_select",
      singleSelectOptionId: "opt_todo",
    },
  },
  { name: "issueme_manage_label", params: { action: "create", name: "safe-smoke", color: "0e8a16", description: "Handler smoke label" } },
  { name: "issueme_manage_milestone", params: { action: "create", title: "Smoke milestone", description: "Handler smoke milestone", dueOn: "2026-07-01" } },
  { name: "issueme_sync_issues", params: {} },
  { name: "issueme_get_issue", params: { number: 10, refresh: true } },
  { name: "issueme_list_sub_issues", params: { issueNumber: 10 } },
  { name: "issueme_reorder_sub_issues", params: { parentNumber: 10, orderedChildNumbers: [12, 11] } },
  { name: "issueme_create_issue", params: { title: "Smoke created issue", body: "Created by packed handler smoke.", labels: [], assignees: [] } },
  { name: "issueme_create_sub_issue", params: { parentNumber: 10, title: "Smoke child issue", body: "Created as a native sub-issue.", labels: [], assignees: [] } },
  { name: "issueme_add_sub_issue", params: { parentNumber: 10, childNumber: 12 } },
  { name: "issueme_remove_sub_issue", params: { parentNumber: 10, childNumber: 12 } },
  { name: "issueme_list_issue_development_links", params: { issueNumber: 10, limit: 5 } },
  { name: "issueme_update_issue", params: { number: 10, title: "Smoke updated parent", labels: ["ready"] } },
  { name: "issueme_comment_issue", params: { number: 10, body: "Smoke progress note" } },
  { name: "issueme_update_comment", params: { issueNumber: 10, commentId: 700, body: "Updated smoke progress note" } },
  { name: "issueme_delete_comment", params: { issueNumber: 10, commentId: 700 } },
  { name: "issueme_assign_issue", params: { number: 10, action: "add", assignees: ["hubot"] } },
  { name: "issueme_label_issue", params: { number: 10, action: "add", labels: ["bug"] } },
  { name: "issueme_reopen_issue", params: { number: 13, comment: "Reopening for smoke verification." } },
  { name: "issueme_close_issue", params: { number: 14, reason: "completed" } },
  { name: "issueme_delete_issue", params: { number: 16, confirmDelete: true } },
  { name: "issueme_bulk_update_issues", params: { issueNumbers: [15], action: "add_labels", labels: ["ready"] } },
];

assertToolScenarioCoverage();

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

function assertNoSecretLeak(value) {
  const text = JSON.stringify(value);
  if (/ghp_smoke_handler_token/.test(text)) throw new Error("Smoke handler output leaked the injected test token.");
}

function createMockGitHubClient() {
  const calls = [];
  const comments = new Map([[10, [githubComment(10, 100, "Existing smoke comment")]]]);
  const labels = new Map([
    ["bug", { name: "bug", description: "Bug reports", color: "d73a4a", default: true, url: "https://api.github.com/repos/owner/repo/labels/bug" }],
    ["ready", { name: "ready", description: "Ready for work", color: "0e8a16", default: false, url: "https://api.github.com/repos/owner/repo/labels/ready" }],
  ]);
  const milestones = new Map([
    [1, githubMilestone(1, "v1.0", { state: "open", description: "First release", due_on: "2026-07-01T00:00:00Z" })],
    [2, githubMilestone(2, "Backlog", { state: "closed", description: "Archived backlog", due_on: null })],
  ]);
  const assignees = [
    { login: "octocat", id: 1, type: "User", html_url: "https://github.com/octocat", url: "https://api.github.com/users/octocat" },
    { login: "hubot", id: 2, type: "Bot", html_url: "https://github.com/hubot", url: "https://api.github.com/users/hubot" },
  ];
  const issues = new Map([
    [10, githubIssue(10, "Parent issue", { labels: ["bug"], assignees: ["octocat"], commentsCount: 1 })],
    [11, githubIssue(11, "First child issue")],
    [12, githubIssue(12, "Second child issue")],
    [13, githubIssue(13, "Closed issue to reopen", { state: "closed", closed_at: "2026-06-27T00:05:00Z" })],
    [14, githubIssue(14, "Issue to close")],
    [15, githubIssue(15, "Bulk target")],
    [16, githubIssue(16, "Issue to delete")],
  ]);
  const project = {
    id: "PVT_repo_1",
    title: "Roadmap",
    number: 1,
    owner: "owner",
    ownerType: "User",
    url: "https://github.com/users/owner/projects/1",
    shortDescription: "Development board",
    closed: false,
    public: false,
  };
  const projectFields = [
    { id: "PVTSSF_status", name: "Status", dataType: "SINGLE_SELECT", type: "ProjectV2SingleSelectField", options: [{ id: "opt_todo", name: "Todo", color: "GRAY", description: "Not started" }, { id: "opt_done", name: "Done", color: "GREEN" }] },
    { id: "PVTF_iteration", name: "Iteration", dataType: "ITERATION", type: "ProjectV2IterationField", iterations: [{ id: "iter_1", title: "Sprint 1", startDate: "2026-07-01", duration: 14 }], completedIterations: [] },
  ];
  const parentChildren = new Map([[10, [11, 12]]]);
  const childParent = new Map([[11, 10], [12, 10]]);
  let nextIssueNumber = 30;
  let nextCommentId = 700;

  function record(operation, target, detail = {}) {
    calls.push({ operation, target, ...detail });
  }

  function getIssueOrThrow(issueNumber) {
    const issue = issues.get(issueNumber);
    if (!issue) throw new Error(`Mock GitHub issue #${issueNumber} not found.`);
    return issue;
  }

  function setIssue(issue) {
    issues.set(issue.number, issue);
    return issue;
  }

  function ensureOpen(issueNumber) {
    const issue = getIssueOrThrow(issueNumber);
    if (issue.state !== "open") throw new Error(`Mock GitHub issue #${issueNumber} is closed.`);
    return issue;
  }

  function addRelationship(parentNumber, childNumber) {
    const children = parentChildren.get(parentNumber) ?? [];
    if (!children.includes(childNumber)) parentChildren.set(parentNumber, [...children, childNumber]);
    childParent.set(childNumber, parentNumber);
  }

  function removeRelationship(parentNumber, childNumber) {
    parentChildren.set(parentNumber, (parentChildren.get(parentNumber) ?? []).filter((number) => number !== childNumber));
    if (childParent.get(childNumber) === parentNumber) childParent.delete(childNumber);
  }

  function relationshipFor(issueNumber, limit = 25) {
    const issue = getIssueOrThrow(issueNumber);
    const childNumbers = parentChildren.get(issueNumber) ?? [];
    const shownChildNumbers = childNumbers.slice(0, limit);
    const parentNumber = childParent.get(issueNumber);
    return {
      issue: nativeIssue(issue),
      parentIssue: parentNumber ? nativeIssue(getIssueOrThrow(parentNumber)) : null,
      subIssues: shownChildNumbers.map((childNumber) => nativeIssue(getIssueOrThrow(childNumber))),
      subIssuesCount: childNumbers.length,
      truncated: shownChildNumbers.length < childNumbers.length,
    };
  }

  function projectItem(issueNumber) {
    const issue = getIssueOrThrow(issueNumber);
    return {
      id: `PVTI_${issueNumber}`,
      type: "ISSUE",
      project,
      issue: nativeIssue(issue),
    };
  }

  function listFilteredValues(values, filters = {}, predicate = () => true) {
    const limit = filters.limit ?? values.length;
    const filtered = values.filter(predicate);
    return { values: filtered.slice(0, limit), truncated: filtered.length > limit };
  }

  const client = {
    repository: smokeRepositoryObject,
    async listIssues(filters = {}) {
      record("listIssues", filters.state ?? "open", { filters });
      const state = filters.state ?? "open";
      const labelsFilter = filters.labels ?? [];
      const creatorFilter = filters.creator;
      const { values, truncated } = listFilteredValues([...issues.values()], filters, (issue) => {
        if (state !== "all" && issue.state !== state) return false;
        if (labelsFilter.length > 0 && !labelsFilter.every((label) => labelNames(issue).includes(label))) return false;
        if (creatorFilter && issue.user?.login?.toLowerCase() !== creatorFilter.toLowerCase()) return false;
        return issue.pull_request === undefined;
      });
      return { mode: "list", issues: values, truncated };
    },
    async searchIssues(filters = {}) {
      record("searchIssues", filters.query ?? "", { filters });
      const result = await client.listIssues({ ...filters, state: filters.state ?? "all" });
      return { ...result, mode: "search", totalCount: result.issues.length, incompleteResults: false };
    },
    async listLabels(filters = {}) {
      record("listLabels", filters.query ?? filters.name ?? "all", { filters });
      const query = (filters.query ?? "").toLowerCase();
      const name = (filters.name ?? "").toLowerCase();
      const { values, truncated } = listFilteredValues([...labels.values()], filters, (label) => {
        if (name && !label.name.toLowerCase().includes(name)) return false;
        if (query && !`${label.name} ${label.description ?? ""}`.toLowerCase().includes(query)) return false;
        return true;
      });
      return { labels: values, truncated };
    },
    async listMilestones(filters = {}) {
      record("listMilestones", filters.state ?? "open", { filters });
      const state = filters.state ?? "open";
      const { values, truncated } = listFilteredValues([...milestones.values()], filters, (milestone) => state === "all" || milestone.state === state);
      return { milestones: values, truncated };
    },
    async listAssignees(filters = {}) {
      record("listAssignees", filters.query ?? filters.login ?? "all", { filters });
      const query = (filters.query ?? "").toLowerCase();
      const login = (filters.login ?? "").toLowerCase();
      const { values, truncated } = listFilteredValues(assignees, filters, (assignee) => {
        if (login && !assignee.login.toLowerCase().includes(login)) return false;
        if (query && !`${assignee.login} ${assignee.type ?? ""}`.toLowerCase().includes(query)) return false;
        return true;
      });
      return { assignees: values, truncated };
    },
    async listProjectsV2(filters = {}) {
      record("listProjectsV2", filters.scope ?? "repository", { filters });
      return { scope: filters.scope ?? "repository", owner: smokeRepository, projects: [project], truncated: false };
    },
    async getProjectV2Fields(filters = {}) {
      record("getProjectV2Fields", filters.projectId ?? filters.projectNumber ?? "unknown", { filters });
      return { project, fields: projectFields, truncated: false };
    },
    async addIssueToProjectV2(input) {
      record("addIssueToProjectV2", input.issueNumber, { input });
      ensureOpen(input.issueNumber);
      return { item: projectItem(input.issueNumber) };
    },
    async updateProjectV2ItemField(input) {
      record("updateProjectV2ItemField", input.issueNumber, { input });
      ensureOpen(input.issueNumber);
      return { item: projectItem(input.issueNumber) };
    },
    async createRepositoryLabel(input) {
      record("createRepositoryLabel", input.name, { input });
      const label = { name: input.name, description: input.description ?? "", color: input.color, default: false, url: `https://api.github.com/repos/owner/repo/labels/${encodeURIComponent(input.name)}` };
      labels.set(label.name, label);
      return label;
    },
    async updateRepositoryLabel(name, input) {
      record("updateRepositoryLabel", name, { input });
      const current = labels.get(name) ?? { name, color: "ededed", default: false, url: `https://api.github.com/repos/owner/repo/labels/${encodeURIComponent(name)}` };
      const nextName = input.new_name ?? name;
      const next = { ...current, name: nextName, color: input.color ?? current.color, description: input.description ?? current.description };
      labels.delete(name);
      labels.set(nextName, next);
      return next;
    },
    async deleteRepositoryLabel(name) {
      record("deleteRepositoryLabel", name);
      labels.delete(name);
    },
    async createRepositoryMilestone(input) {
      record("createRepositoryMilestone", input.title, { input });
      const number = Math.max(...milestones.keys()) + 1;
      const milestone = githubMilestone(number, input.title, { state: input.state ?? "open", description: input.description ?? "", due_on: input.due_on ?? null });
      milestones.set(number, milestone);
      return milestone;
    },
    async updateRepositoryMilestone(number, input) {
      record("updateRepositoryMilestone", number, { input });
      const current = milestones.get(number) ?? githubMilestone(number, `Milestone ${number}`);
      const next = { ...current, title: input.title ?? current.title, state: input.state ?? current.state, description: input.description ?? current.description, due_on: Object.hasOwn(input, "due_on") ? input.due_on : current.due_on };
      milestones.set(number, next);
      return next;
    },
    async deleteRepositoryMilestone(number) {
      record("deleteRepositoryMilestone", number);
      milestones.delete(number);
    },
    async getAuthenticatedUserLogin() {
      record("getAuthenticatedUserLogin", "user");
      return "octocat";
    },
    async createIssue(input) {
      record("createIssue", input.title, { input });
      const number = nextIssueNumber++;
      const issue = githubIssue(number, input.title, { body: input.body, labels: input.labels ?? [], assignees: input.assignees ?? [] });
      issues.set(number, issue);
      comments.set(number, []);
      return issue;
    },
    async getIssue(issueNumber) {
      record("getIssue", issueNumber);
      return getIssueOrThrow(issueNumber);
    },
    async ensureIssueOpen(issueNumber) {
      record("ensureIssueOpen", issueNumber);
      return ensureOpen(issueNumber);
    },
    async listComments(issueNumber, _signal, options = {}) {
      record("listComments", issueNumber, { limit: options.limit });
      return (comments.get(issueNumber) ?? []).slice(0, options.limit ?? undefined);
    },
    async addComment(issueNumber, body) {
      record("addComment", issueNumber, { bodyLength: body.length });
      ensureOpen(issueNumber);
      const comment = githubComment(issueNumber, nextCommentId++, body);
      comments.set(issueNumber, [...(comments.get(issueNumber) ?? []), comment]);
      const issue = getIssueOrThrow(issueNumber);
      setIssue(issueWith(issue, { commentsCount: (issue.comments ?? 0) + 1 }));
      return comment;
    },
    async updateComment(issueNumber, commentId, body) {
      record("updateComment", commentId, { issueNumber, bodyLength: body.length });
      ensureOpen(issueNumber);
      const updated = githubComment(issueNumber, commentId, body, { updated_at: "2026-06-27T00:06:00Z" });
      comments.set(issueNumber, (comments.get(issueNumber) ?? []).map((comment) => comment.id === commentId ? updated : comment));
      return updated;
    },
    async deleteComment(issueNumber, commentId) {
      record("deleteComment", commentId, { issueNumber });
      ensureOpen(issueNumber);
      const current = comments.get(issueNumber) ?? [];
      const deleted = current.find((comment) => comment.id === commentId) ?? githubComment(issueNumber, commentId, "Deleted smoke comment");
      comments.set(issueNumber, current.filter((comment) => comment.id !== commentId));
      const issue = getIssueOrThrow(issueNumber);
      setIssue(issueWith(issue, { commentsCount: Math.max(0, (issue.comments ?? 0) - 1) }));
      return deleted;
    },
    async updateIssue(issueNumber, input) {
      record("updateIssue", issueNumber, { input });
      const issue = ensureOpen(issueNumber);
      const next = issueWith(issue, {
        title: input.title ?? issue.title,
        body: input.body ?? issue.body,
        labels: input.labels ?? labelNames(issue),
        assignees: input.assignees ?? assigneeLogins(issue),
        milestone: Object.hasOwn(input, "milestone") ? milestoneFromNumber(input.milestone, milestones) : issue.milestone,
      });
      return setIssue(next);
    },
    async addAssignees(issueNumber, values) {
      record("addAssignees", issueNumber, { assignees: values });
      const issue = ensureOpen(issueNumber);
      return setIssue(issueWith(issue, { assignees: [...new Set([...assigneeLogins(issue), ...values])] }));
    },
    async removeAssignees(issueNumber, values) {
      record("removeAssignees", issueNumber, { assignees: values });
      const issue = ensureOpen(issueNumber);
      return setIssue(issueWith(issue, { assignees: assigneeLogins(issue).filter((login) => !values.includes(login)) }));
    },
    async setAssignees(issueNumber, values) {
      record("setAssignees", issueNumber, { assignees: values });
      const issue = ensureOpen(issueNumber);
      return setIssue(issueWith(issue, { assignees: values }));
    },
    async addLabels(issueNumber, values) {
      record("addLabels", issueNumber, { labels: values });
      const issue = ensureOpen(issueNumber);
      const nextLabels = [...new Set([...labelNames(issue), ...values])];
      setIssue(issueWith(issue, { labels: nextLabels }));
      return nextLabels.map((name) => labels.get(name) ?? { name });
    },
    async setLabels(issueNumber, values) {
      record("setLabels", issueNumber, { labels: values });
      const issue = ensureOpen(issueNumber);
      setIssue(issueWith(issue, { labels: values }));
      return values.map((name) => labels.get(name) ?? { name });
    },
    async removeLabel(issueNumber, label) {
      record("removeLabel", issueNumber, { label });
      const issue = ensureOpen(issueNumber);
      const nextLabels = labelNames(issue).filter((value) => value !== label);
      setIssue(issueWith(issue, { labels: nextLabels }));
      return nextLabels.map((name) => labels.get(name) ?? { name });
    },
    async closeIssue(issueNumber, input = {}) {
      record("closeIssue", issueNumber, { input });
      const issue = ensureOpen(issueNumber);
      return setIssue(issueWith(issue, { state: "closed", closed_at: "2026-06-27T00:07:00Z" }));
    },
    async reopenIssue(issueNumber) {
      record("reopenIssue", issueNumber);
      const issue = getIssueOrThrow(issueNumber);
      return setIssue(issueWith(issue, { state: "open", closed_at: null }));
    },
    async deleteIssueByIssueResponse(issue) {
      record("deleteIssueByIssueResponse", issue.number);
      getIssueOrThrow(issue.number);
      issues.delete(issue.number);
      comments.delete(issue.number);
    },
    async addSubIssueByIssueResponses(parentIssue, childIssue) {
      record("addSubIssueByIssueResponses", `${parentIssue.number}/${childIssue.number}`);
      ensureOpen(parentIssue.number);
      ensureOpen(childIssue.number);
      addRelationship(parentIssue.number, childIssue.number);
      return { parent: nativeIssue(getIssueOrThrow(parentIssue.number)), child: nativeIssue(getIssueOrThrow(childIssue.number)) };
    },
    async removeSubIssueByIssueResponses(parentIssue, childIssue) {
      record("removeSubIssueByIssueResponses", `${parentIssue.number}/${childIssue.number}`);
      ensureOpen(parentIssue.number);
      ensureOpen(childIssue.number);
      removeRelationship(parentIssue.number, childIssue.number);
      return { parent: nativeIssue(getIssueOrThrow(parentIssue.number)), child: nativeIssue(getIssueOrThrow(childIssue.number)) };
    },
    async listSubIssueRelationships(issueNumber, options = {}) {
      record("listSubIssueRelationships", issueNumber, { limit: options.limit });
      return relationshipFor(issueNumber, options.limit ?? 25);
    },
    async reorderSubIssuesByIssueResponseAndRelationship(parentIssue, relationship, orderedChildNumbers) {
      record("reorderSubIssuesByIssueResponseAndRelationship", parentIssue.number, { orderedChildNumbers });
      const previous = relationship.subIssues.map((issue) => issue.number);
      parentChildren.set(parentIssue.number, [...orderedChildNumbers]);
      for (const childNumber of orderedChildNumbers) childParent.set(childNumber, parentIssue.number);
      const changed = previous.join(",") !== orderedChildNumbers.join(",");
      return {
        relationship: relationshipFor(parentIssue.number, relationship.subIssuesCount || orderedChildNumbers.length),
        mutations: changed ? [{ parent: nativeIssue(getIssueOrThrow(parentIssue.number)), child: nativeIssue(getIssueOrThrow(orderedChildNumbers[0])) }] : [],
      };
    },
    async listIssueDevelopmentLinks(issueNumber, options = {}) {
      record("listIssueDevelopmentLinks", issueNumber, { limit: options.limit });
      const issue = getIssueOrThrow(issueNumber);
      return {
        issue: nativeIssue(issue),
        links: [{ type: "pull_request", referenceTypes: ["closes"], number: 42, title: "Smoke PR", state: "open", html_url: "https://github.com/owner/repo/pull/42", branchName: "smoke", baseBranchName: "main", willCloseTarget: true }],
        timelineEventCount: 1,
        truncated: false,
      };
    },
  };

  return { client, calls };
}

function githubIssue(number, title, overrides = {}) {
  const state = overrides.state ?? "open";
  const labels = overrides.labels ?? [];
  const assignees = overrides.assignees ?? [];
  const creator = overrides.creator ?? "octocat";
  return {
    node_id: `I_${number}`,
    number,
    title,
    state,
    body: overrides.body ?? `Body for ${title}`,
    milestone: overrides.milestone ?? null,
    html_url: `https://github.com/${smokeRepository}/issues/${number}`,
    created_at: overrides.created_at ?? "2026-06-27T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-06-27T00:01:00Z",
    closed_at: Object.hasOwn(overrides, "closed_at") ? overrides.closed_at : state === "closed" ? "2026-06-27T00:05:00Z" : null,
    comments: overrides.commentsCount ?? 0,
    user: { login: creator },
    labels: labels.map((label) => typeof label === "string" ? { name: label } : label),
    assignees: assignees.map((assignee) => typeof assignee === "string" ? { login: assignee } : assignee),
  };
}

function issueWith(issue, overrides = {}) {
  return githubIssue(issue.number, overrides.title ?? issue.title, {
    body: overrides.body ?? issue.body,
    state: overrides.state ?? issue.state,
    labels: overrides.labels ?? labelNames(issue),
    assignees: overrides.assignees ?? assigneeLogins(issue),
    milestone: Object.hasOwn(overrides, "milestone") ? overrides.milestone : issue.milestone,
    commentsCount: overrides.commentsCount ?? issue.comments ?? 0,
    creator: issue.user?.login ?? "octocat",
    closed_at: Object.hasOwn(overrides, "closed_at") ? overrides.closed_at : issue.closed_at,
    created_at: issue.created_at,
    updated_at: "2026-06-27T00:08:00Z",
  });
}

function githubComment(issueNumber, id, body, overrides = {}) {
  return {
    id,
    user: { login: "octocat" },
    body,
    created_at: overrides.created_at ?? "2026-06-27T00:02:00Z",
    updated_at: overrides.updated_at ?? "2026-06-27T00:02:00Z",
    html_url: `https://github.com/${smokeRepository}/issues/${issueNumber}#issuecomment-${id}`,
    issue_url: `https://api.github.com/repos/${smokeRepository}/issues/${issueNumber}`,
  };
}

function githubMilestone(number, title, overrides = {}) {
  return {
    number,
    title,
    state: overrides.state ?? "open",
    description: overrides.description ?? "",
    due_on: overrides.due_on ?? null,
    open_issues: overrides.open_issues ?? 0,
    closed_issues: overrides.closed_issues ?? 0,
    html_url: `https://github.com/${smokeRepository}/milestone/${number}`,
    url: `https://api.github.com/repos/${smokeRepository}/milestones/${number}`,
  };
}

function labelNames(issue) {
  return (issue.labels ?? []).map((label) => typeof label === "string" ? label : label.name).filter(Boolean);
}

function assigneeLogins(issue) {
  return (issue.assignees ?? []).map((assignee) => assignee.login).filter(Boolean);
}

function milestoneFromNumber(number, milestones) {
  if (number === null || number === undefined) return null;
  return milestones.get(number) ?? githubMilestone(number, `Milestone ${number}`);
}

function nativeIssue(issue) {
  return {
    id: issue.node_id,
    number: issue.number,
    title: issue.title,
    state: issue.state,
    creator: issue.user?.login,
    html_url: issue.html_url,
  };
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

async function runInjectedToolChecks(registerToolsFn, cwd) {
  const mock = createMockGitHubClient();
  const pi = fakePi();
  registerToolsFn(pi, {
    runtime: {
      config: smokeConfig,
      repository: smokeRepository,
      token: injectedTokenCanary,
      client: mock.client,
    },
  });

  const registeredToolNames = [...pi.tools.keys()];
  const missingRegistrations = ISSUEME_TOOL_NAMES.filter((name) => !pi.tools.has(name));
  if (missingRegistrations.length > 0) throw new Error(`Missing registered IssueMe tools: ${missingRegistrations.join(", ")}.`);

  const toolHandlers = [];
  for (const scenario of toolSmokeScenarios) {
    const tool = pi.tools.get(scenario.name);
    if (!tool) throw new Error(`${scenario.name} was not registered for injected handler smoke.`);
    const beforeCalls = mock.calls.length;
    const result = await withScrubbedIssueMeEnvironment(() => executeAsPiTool(tool, cwd, scenario.params, true));
    assertNoSecretLeak(result);
    const mockedGitHubRequests = mock.calls.slice(beforeCalls).map(formatMockCall);
    toolHandlers.push(summarizeToolSmokeResult(scenario.name, result, mockedGitHubRequests));
  }

  const invokedTools = toolHandlers.map((handler) => handler.tool);
  const missingInvocations = ISSUEME_TOOL_NAMES.filter((name) => !invokedTools.includes(name));
  if (missingInvocations.length > 0) throw new Error(`Missing smoke executions for IssueMe tools: ${missingInvocations.join(", ")}.`);

  return {
    registeredToolNames,
    toolHandlers,
    coverage: {
      expectedToolCount: ISSUEME_TOOL_NAMES.length,
      registeredToolCount: registeredToolNames.filter((name) => ISSUEME_TOOL_NAMES.includes(name)).length,
      invokedToolCount: invokedTools.length,
      invokedTools,
      missingRegistrations,
      missingInvocations,
    },
    mockedGitHubDependency: "injected GitHubClient",
    mockedGitHubRequests: mock.calls.map(formatMockCall),
  };
}

function summarizeToolSmokeResult(toolName, result, mockedGitHubRequests) {
  if (result.isError) {
    throw new Error(`${toolName} smoke expected a safe structured result but threw a Pi error: ${JSON.stringify(result.error)}.`);
  }
  const details = result.result?.details ?? {};
  const outcome = details.result;
  if (!["success", "partial_success", "error"].includes(outcome)) {
    throw new Error(`${toolName} smoke returned unexpected details.result=${JSON.stringify(outcome)}.`);
  }
  return {
    tool: toolName,
    handlerInvoked: true,
    expectedPiIsError: false,
    result: outcome,
    status: details.status,
    cacheUpdated: details.cacheUpdated === true,
    mockedGitHubDependency: "injected GitHubClient",
    mockedGitHubRequests,
  };
}

function formatMockCall(call) {
  return `${call.operation}${call.target !== undefined ? ` ${call.target}` : ""}`;
}

function assertToolScenarioCoverage() {
  const scenarioNames = toolSmokeScenarios.map((scenario) => scenario.name);
  const duplicates = scenarioNames.filter((name, index) => scenarioNames.indexOf(name) !== index);
  const missing = ISSUEME_TOOL_NAMES.filter((name) => !scenarioNames.includes(name));
  const extras = scenarioNames.filter((name) => !ISSUEME_TOOL_NAMES.includes(name));
  if (duplicates.length > 0 || missing.length > 0 || extras.length > 0) {
    throw new Error(`IssueMe tool smoke scenario coverage mismatch: duplicates=${duplicates.join(",") || "none"}, missing=${missing.join(",") || "none"}, extras=${extras.join(",") || "none"}.`);
  }
}

async function runHandlerChecks(label, modules) {
  const cwd = await mkdtemp(join(tmpdir(), `issueme-handler-smoke-${label}-`));
  try {
    const commandFallback = await runCommandHandlerCheck(modules.issueMeExtension, cwd);
    const trustRefusal = await runTrustRefusalToolCheck(modules.issueMeExtension, cwd);
    const injectedTools = await runInjectedToolChecks(modules.registerIssueMeTools, cwd);
    return {
      label,
      commandFallback,
      trustRefusal,
      toolHandlers: injectedTools.toolHandlers,
      coverage: injectedTools.coverage,
      safety: {
        temporaryDirectory: cwd,
        projectEnvRead: false,
        liveGitHubCalls: false,
        remoteMutations: false,
        issueMeEnvironmentScrubbed: scrubbedEnvKeys,
        mockedGitHubDependency: injectedTools.mockedGitHubDependency,
        mockedGitHubRequests: injectedTools.mockedGitHubRequests,
      },
    };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function printHandlerSummary(label, handlers) {
  console.log(`${label} tool handlers invoked (${handlers.coverage.invokedToolCount}/${handlers.coverage.expectedToolCount}):`);
  for (const tool of handlers.toolHandlers) {
    const mocked = tool.mockedGitHubRequests.length ? tool.mockedGitHubRequests.join(", ") : "no GitHub client calls";
    console.log(`- ${tool.tool} -> ${tool.result}${tool.status ? ` (${tool.status})` : ""}; mocked: ${mocked}`);
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
      expectedTools: ISSUEME_TOOL_NAMES,
      handlerExecution: {
        checkout,
        packed: packedHandlers,
      },
      safety: {
        handlersInvoked: true,
        commandHandlersInvoked: true,
        toolHandlersInvoked: true,
        allPublicToolsInvoked: packedHandlers.coverage.missingInvocations.length === 0,
        projectEnvRead: false,
        liveGitHubCalls: false,
        remoteMutations: false,
        writesOnlyTemporaryDirectories: true,
        mockedGitHubOnly: true,
        mockedGitHubDependency: "injected GitHubClient",
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
    console.log(`- ${checkout.trustRefusal.tool} -> Pi error ${checkout.trustRefusal.errorCode}`);
    printHandlerSummary("Checkout", checkout);
    console.log("");
    console.log("Packed-package handlers invoked:");
    console.log(`- ${packedHandlers.commandFallback.command} -> ${packedHandlers.commandFallback.emittedMessageType}`);
    console.log(`- ${packedHandlers.trustRefusal.tool} -> Pi error ${packedHandlers.trustRefusal.errorCode}`);
    printHandlerSummary("Packed-package", packedHandlers);
    console.log("");
    console.log("Every ISSUEME_TOOL_NAMES entry was executed from the packed package with an injected mock GitHubClient.");
    console.log("No project .env files, live GitHub calls, or remote mutations were used; only temporary directories and mocked GitHub client calls were touched.");
  } finally {
    if (!keepTemp) await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`IssueMe handler smoke failed: ${message}`);
  process.exitCode = 1;
});
