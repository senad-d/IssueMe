# Plan: Archived IssueMe Architecture

> Archive status: this original architecture plan is retained as historical implementation context. It does not define current availability or release readiness. Use `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`, source, and tests for current behavior; use `specs/spec-remediation-tasks.md` for the active hardening backlog.

## Task Description

Record the architecture prepared for `@senad-d/issueme`, a Pi extension that gives agents a structured GitHub REST/GraphQL interface for managing GitHub issues in the current repository. The runtime implementation now includes commands and tools for creating, syncing, reading, updating, commenting, labeling, assigning, closing, and inspecting/linking native sub-issues while maintaining one local JSON file per open issue.

This archived specification may contain historical future-tense task language below. Do not treat that language as a current task list or as proof that unverified behavior is release-ready.

## Objective

Document the module boundaries, Pi integration surfaces, data flow, state/config model, dependencies, security boundaries, and validation approach that guided the IssueMe implementation.

## Problem Statement

Pi agents need a safe, explicit, agent-friendly way to manage GitHub issues without relying on the GitHub CLI. The extension must work both locally and in GitHub Actions, use tokens from environment sources, keep human/LLM-readable issue files in the project, and prevent mutation of closed/resolved issues.

## Solution Approach

IssueMe should be built as a small Pi package with a minimal `src/extension.ts` entry point that imports registration modules and calls `register*` functions. Runtime behavior should be divided into isolated command, tool, GitHub API, config, issue-store, and utility modules. GitHub operations should use REST API calls through Node's built-in `fetch`; local persistence should use safe path resolution and file-mutation queue helpers when mutating issue files.

## Approved Project Definition

- Template source: `/Users/senad/Documents/Code/Moj_git/pi-tmp`
- Target directory: `/Users/senad/Documents/Code/Moj_git/pi-issueme`
- Package name: `@senad-d/issueme`
- Display name: `IssueMe`
- Exported extension function: `issueMeExtension`
- Repository URL: `https://github.com/senad-d/issueme`
- Pitch: IssueMe is an agent-friendly GitHub issue management layer that lets LLM agents create, update, comment on, label, assign, close, and track issues through structured Pi tools.
- Current scope excludes GitHub CLI usage, webhook listeners, bundled IssueMe skills, and mutation of closed/resolved issues.

## Relevant Files

Use these files for historical context and current cross-checks:

- `package.json` - Package identity, Pi manifest, scripts, dependency placement, and package contents.
- `src/extension.ts` - Small Pi extension entry point that should only import modules and call registration functions.
- `src/constants.ts` - Shared display name, command name, config path constants, issue directory name, and status key.
- `docs/STRUCTURE.md` - Repository architecture guide that should stay aligned with implementation.
- `docs/PROJECT_DEFINITION_BRIEF.md` - Approved project brief and decision log.
- `README.md` - Public user documentation for commands, tools, auth, issue files, and safety model.
- `SECURITY.md` - Security model for GitHub tokens, `.env`, REST calls, local files, and no shell/webhook behavior.
- `test/*.test.mjs` - Runtime, safety, schema, command, TUI, and package-content tests.

### Runtime Files

The implementation created these runtime files:

- `src/commands/issueme-command.ts` - Registers `/issueme`, `/issueme info`, and `/issueme start [skill-path]` with `defaultSkillPath` fallback.
- `src/commands/config-tui.ts` - Implements the configuration TUI renderer/component and snapshot helper.
- `src/tools/issueme-tools.ts` - Aggregates IssueMe tool registration.
- `src/tools/create-issue.ts` - Registers `issueme_create_issue`.
- `src/tools/sync-issues.ts` - Registers `issueme_sync_issues`.
- `src/tools/get-issue.ts` - Registers `issueme_get_issue`.
- `src/tools/update-issue.ts` - Registers `issueme_update_issue`.
- `src/tools/comment-issue.ts` - Registers `issueme_comment_issue`.
- `src/tools/assign-issue.ts` - Registers `issueme_assign_issue`.
- `src/tools/label-issue.ts` - Registers `issueme_label_issue`.
- `src/tools/close-issue.ts` - Registers `issueme_close_issue`.
- `src/github/client.ts` - GitHub REST client, auth headers, error mapping, pagination helpers, and issue-state guards.
- `src/github/repository.ts` - Resolves current repository from `GITHUB_REPOSITORY` or local `.git/config` remote URL without shelling out.
- `src/config/config.ts` - Loads/saves non-secret config from `.pi/agent/issueme.json` and reads token sources.
- `src/issues/store.ts` - Reads/writes/removes issue JSON files under `issues/` with safe filenames.
- `src/issues/format.ts` - Produces human/LLM-friendly issue JSON and text summaries for tool output.
- `src/utils/env.ts` - Parses project `.env` values with trusted project-token precedence.
- `src/utils/mutation-queue.ts` - Wraps local file mutations in Pi's file mutation queue.
- `src/utils/project-root.ts` - Resolves project roots and Git directories without shelling out.
- `src/utils/slug.ts` - Builds `issues/<number>-<title-slug>.json` safely.
- `src/types.ts` - Shared domain types for config, issue records, GitHub REST responses, and tool results.

## Pi Integration Surface

| Surface | Name | Purpose | Notes |
| --- | --- | --- | --- |
| Command | `/issueme` | Open configuration UI | Writes non-secret settings to `.pi/agent/issueme.json` only after user action. |
| Command | `/issueme info` | Show command/tool/auth/cache status | Should avoid printing secrets. |
| Command | `/issueme start [skill-path]` | Start a skill-guided issue workflow | Sends a user message that asks the agent to use the explicit project-local skill path, or configured `defaultSkillPath` when omitted, with IssueMe tools. |
| Tool | `issueme_create_issue` | Create a GitHub issue and cache it locally | REST API; supports labels and assignees. |
| Tool | `issueme_create_sub_issue` | Create a GitHub issue and attach it under a parent | REST create plus GraphQL `addSubIssue`; no body-only fallback. |
| Tool | `issueme_add_sub_issue` | Attach an existing issue as a sub-issue | GraphQL `addSubIssue`; no body-only fallback. |
| Tool | `issueme_remove_sub_issue` | Detach an existing native sub-issue relationship | GraphQL `removeSubIssue`; never closes/deletes issues. |
| Tool | `issueme_list_sub_issues` | Inspect native parent/sub-issue relationships | GraphQL `subIssues` metadata, bounded output, optional `refreshCache`; no body-only fallback. |
| Tool | `issueme_sync_issues` | Fetch open issues and rewrite local issue files | Removes local files for closed issues; never deletes remote issues. |
| Tool | `issueme_get_issue` | Return one issue by number, title slug, or local file | Reads cache and can optionally refresh from GitHub. |
| Tool | `issueme_update_issue` | Update title/body/labels/assignees/milestone/state fields on open issues | Must reject closed issues. |
| Tool | `issueme_comment_issue` | Add a comment to an open issue | Must reject closed issues. |
| Tool | `issueme_assign_issue` | Assign, unassign, or set assignees on an open issue | Must reject closed issues. |
| Tool | `issueme_label_issue` | Add, remove, or set labels on an open issue | Must reject closed issues. |
| Tool | `issueme_close_issue` | Close an open issue and remove local issue file | Must re-check state before mutation. |
| Event | `session_start`/`session_shutdown` only if needed | Restore status or clean session-scoped state | No background jobs, no timers, no watchers, no webhooks. |
| UI | Configuration dialog | Configure non-secret defaults | Guard TUI-only UI with `ctx.mode === "tui"`; use simpler notifications in non-TUI modes. |
| Resource | Project-local skill path | Documented integration only | No bundled skill; `/issueme start` validates a readable path inside the trusted project. |

## Data Flow

### Command flow

1. User runs `/issueme`.
2. Command loads `.pi/agent/issueme.json` if present and project is trusted.
3. Command shows configuration UI for non-secret values such as issue directory, default labels, default assignees, and optional default skill path.
4. Command writes only non-secret config.

### Tool flow

1. Agent calls an `issueme_*` tool with structured arguments.
2. Tool loads config and resolves token from project `.env`, then `GH_TOKEN`, then `GITHUB_TOKEN`.
3. Tool resolves current repo from `GITHUB_REPOSITORY`; if absent, parse local `.git/config` origin URL.
4. Tool performs GitHub REST request with `Authorization: Bearer <token>` and `Accept: application/vnd.github+json`.
5. Mutating tools first confirm the issue is still open when operating on an existing issue.
6. Tool updates local `issues/*.json` only after successful remote operations.
7. Tool returns concise LLM-facing text and structured `details` with safe metadata and no secrets.

### Local issue file shape

Each local file should use this path shape:

```text
issues/<issue-number>-<issue-title-slug>.json
```

Each file should be human/LLM-readable JSON with stable keys:

```json
{
  "schemaVersion": 1,
  "repository": "owner/repo",
  "number": 123,
  "title": "Short issue title",
  "state": "open",
  "body": "Markdown issue body...",
  "labels": ["bug", "agent-ready"],
  "assignees": ["octocat"],
  "milestone": null,
  "comments": [
    {
      "id": 1,
      "author": "octocat",
      "body": "Comment body...",
      "created_at": "2026-06-27T00:00:00Z",
      "updated_at": "2026-06-27T00:00:00Z",
      "html_url": "https://github.com/owner/repo/issues/123#issuecomment-1"
    }
  ],
  "html_url": "https://github.com/owner/repo/issues/123",
  "created_at": "2026-06-27T00:00:00Z",
  "updated_at": "2026-06-27T00:00:00Z",
  "closed_at": null,
  "synced_at": "2026-06-27T00:00:00Z"
}
```

Large comment lists or bodies should be truncated in tool output, but local files may contain complete issue details when practical.

## Config, State, and Persistence

- Non-secret config path: `.pi/agent/issueme.json`.
- Secret/token sources: trusted project `.env` `GH_TOKEN`/`GITHUB_TOKEN`, then process `GH_TOKEN`/`GITHUB_TOKEN`; tokens must never be persisted to config or issue files.
- Issue cache path: `issues/` by default, project-local, containing only open issues.
- Session state: avoid long-lived in-memory state; use tool result `details` for branch-sensitive state and reconstruct from current files when needed.
- Cleanup: remove local issue file after successful `issueme_close_issue` or when `issueme_sync_issues` sees the issue is closed.

## Dependencies

- Use Node built-ins for file I/O, path handling, URL parsing, and `fetch`.
- Keep `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `typebox` in `peerDependencies` with `"*"` when imported.
- Put non-Pi runtime libraries in `dependencies` only when implementation proves they are required.
- Put local development tools and type packages in `devDependencies`.
- Do not add GitHub CLI dependencies.

## Security Boundaries

- Do not execute shell commands for GitHub operations or repository resolution.
- Read only trusted project `.env`, Git metadata, `.pi/agent/issueme.json`, and files under the configured issue directory.
- Mutate only `.pi/agent/issueme.json` and `issues/*.json` locally.
- Perform network calls only to GitHub REST endpoints and GraphQL native sub-issue inspection/mutations for the resolved current repository.
- Never log, write, return, or include GitHub tokens in tool output, details, errors, local issue files, or config files.
- Reject updates, comments, labels, assignments, and closes when an issue is already closed.
- Re-check issue state immediately before each remote mutation.

## Historical Implementation Phases

### Phase 1: Foundation

- Replace the no-op preparation entry point with a small registration-only extension entry point.
- Add shared constants, types, config loading, environment parsing, repo resolution, slug/path helpers, and issue-store helpers.
- Add tests for pure helpers before adding network behavior.

### Phase 2: Core Implementation

- Implement GitHub REST client methods for issues, comments, labels, assignees, pagination, and state checks.
- Register tools one by one with clear TypeBox schemas, `promptSnippet`, and tool-specific `promptGuidelines`.
- Use `StringEnum` from `@earendil-works/pi-ai` for enum fields.
- Use Pi file mutation queue helpers around local issue-file writes/removes.

### Phase 3: Integration & Polish

- Implement `/issueme`, `/issueme info`, and `/issueme start [skill-path]`.
- Add concise custom rendering only if it improves usability.
- Update README, SECURITY, CHANGELOG, and tests with each behavior change.
- Run isolated smoke testing with `pi --no-extensions -e .`.

## Historical Step by Step Tasks

IMPORTANT: These steps record the original implementation workflow; current remediation work follows `specs/spec-remediation-tasks.md`.

### 1. Build non-network foundations

- Add types, constants, config loader, `.env` token resolution, repository resolution, slug/path helpers, and issue-store helpers.
- Add unit tests for token precedence, repository parsing, slug generation, safe issue paths, and local file shape.

### 2. Implement GitHub REST client

- Add a fetch wrapper with auth headers, GitHub API version headers, error mapping, and abort-signal support.
- Add issue, comment, label, assignee, and close operations.
- Add open-state guards for every mutating operation.

### 3. Register tools incrementally

- Add each `issueme_*` tool in its own module or cohesive tool group.
- Define strict schemas, descriptions, snippets, and guidelines.
- Keep tool output concise, structured, and truncated when needed.

### 4. Register commands

- Implement `/issueme` config UI with no secret persistence.
- Implement `/issueme info` status/help output.
- Implement `/issueme start [skill-path]` as a workflow kickoff that sends a user message asking the agent to use the explicit or configured default skill path and IssueMe tools.

### 5. Validate integration

- Add tests around remote mutation refusal for closed issues, local cache cleanup, and command parsing.
- Run `npm run validate`.
- Run `pi --no-extensions -e .` and manually test command/tool discovery.

## Testing Strategy

- Unit test pure helpers without network access.
- Mock or inject `fetch` for GitHub REST client tests.
- Test state-guard behavior for closed issues before every mutating operation.
- Test local cache behavior for create, sync, update, and close.
- Test `.env` token precedence and redaction in errors/tool results.
- Test command argument parsing and non-TUI fallback behavior.

## Acceptance Criteria

- `src/extension.ts` remains small and only calls registration functions.
- No GitHub CLI or shell execution is used for issue operations.
- Issue files are written as `issues/<issue-number>-<issue-title-slug>.json`.
- Closed issues cannot be updated, commented on, labeled, assigned, or closed again.
- Closing an issue removes its local issue JSON after successful remote close.
- Tokens are read from `.env`, `GH_TOKEN`, or `GITHUB_TOKEN` but never persisted or returned.
- Tools include clear schemas, descriptions, snippets, and tool-specific prompt guidelines.
- Validation passes with `npm run validate`.

## Validation Commands

Execute these commands to validate implementation completeness:

- `npm run typecheck` - Ensure TypeScript compiles.
- `npm run test` - Run unit and integration tests.
- `npm run check:pack` - Verify package contents stay minimal and safe.
- `npm run validate` - Run the full repository validation pipeline.
- `pi --no-extensions -e .` - Smoke test the extension in isolation.

## Notes

- This architecture intentionally excludes webhooks and local HTTP listeners for the first implementation.
- If webhook support is revisited later, it must be an explicitly started session-scoped resource with cleanup on `session_shutdown`, never a background listener started in the extension factory.
- If custom file mutations run in parallel with built-in tools, use Pi's file mutation queue helpers around the full read-modify-write/remove window.
