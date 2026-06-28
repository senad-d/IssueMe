# Plan: Archived IssueMe Implementation Tasks

> Archive status: this file records the first implementation-pass backlog after those tasks were completed. `specs/spec-remediation-tasks.md` supersedes it for current remediation work; do not use this file as the active task board.

## Task Description

Record the ordered implementation task list that built the approved IssueMe architecture and guidelines after repository preparation.

This archived specification may contain historical preparation/future-tense language below. Do not treat that language as a current task list or as proof that unverified behavior is release-ready.

## Objective

Provide historical implementation evidence with acceptance criteria for the completed first implementation pass.

## Problem Statement

IssueMe needs multiple coordinated capabilities: safe GitHub REST access, project-local configuration, issue-file persistence, Pi commands, agent tools, and security guarantees. The work must be sequenced to avoid unsafe behavior and to keep closed issues protected from mutation.

## Solution Approach

Implement foundational pure helpers first, then GitHub REST access, then local issue storage, then tools, then commands, then documentation and validation. Each task includes concrete acceptance criteria and should be completed independently before moving to the next task.

## Relevant Files

Use these files for historical context and current cross-checks:

- `docs/PROJECT_DEFINITION_BRIEF.md` - Approved project identity, scope, and decisions.
- `specs/spec-architecture.md` - Architecture, data flow, module boundaries, and validation plan.
- `specs/spec-guidelines.md` - Coding, Pi, package, testing, and security rules.
- `src/extension.ts` - Registration-only entry point.
- `src/constants.ts` - Shared constants.
- `README.md` - User-facing documentation.
- `SECURITY.md` - Security model.
- `test/*.test.mjs` - Unit/behavior tests.

### Runtime Files

The implementation created these runtime files:

- `src/commands/issueme-command.ts`
- `src/commands/config-tui.ts`
- `src/tools/issueme-tools.ts`
- `src/tools/create-issue.ts
- `src/tools/sync-issues.ts`
- `src/tools/get-issue.ts`
- `src/tools/update-issue.ts`
- `src/tools/comment-issue.ts`
- `src/tools/assign-issue.ts`
- `src/tools/label-issue.ts`
- `src/tools/close-issue.ts`
- `src/github/client.ts`
- `src/github/repository.ts`
- `src/config/config.ts`
- `src/issues/store.ts`
- `src/issues/format.ts`
- `src/utils/env.ts`
- `src/utils/mutation-queue.ts`
- `src/utils/project-root.ts`
- `src/utils/slug.ts`
- `src/types.ts`
- Additional focused tests under `test/`

## Implementation Phases

### Phase 1: Foundation

Build testable pure helpers for config, token resolution, repository discovery, slugging, safe paths, issue-file formatting, and package dependency alignment.

### Phase 2: Core Implementation

Implement GitHub REST API access and local issue-store behavior, then register tools one by one with strict schemas and safety guards.

### Phase 3: Integration & Polish

Implement commands, workflow kickoff, documentation updates, package checks, tests, and isolated Pi smoke testing.

## Step by Step Tasks

IMPORTANT: Execute every task in order, top to bottom. Keep a task unchecked until its acceptance criteria are met.

### 1. Re-read preparation sources

- [x] Read `docs/PROJECT_DEFINITION_BRIEF.md`, `specs/spec-architecture.md`, `specs/spec-guidelines.md`, and this task spec before coding.

Use the approved brief and specs as the source of truth. If they conflict, stop and ask which decision wins.

#### Acceptance criteria

- The implementation session has confirmed the approved scope: direct GitHub APIs only, no GitHub CLI, no webhooks, no mutation of closed issues.
- Any ambiguity found in the specs is raised before runtime code is changed.

### 2. Add shared types and constants

- [x] Create or update shared constants and domain types for IssueMe config, GitHub repository identity, issue records, issue comments, labels, assignees, tool results, and local file metadata.

Keep `src/constants.ts` focused on stable strings such as display name, command name, status key, default config path, and default issue directory.

#### Acceptance criteria

- TypeScript types cover config, issue JSON records, GitHub issue responses, comment responses, and tool result details.
- Constants include `IssueMe`, `issueme`, `.pi/agent/issueme.json`, and `issues` without duplicating these strings throughout runtime modules.
- `npm run typecheck` succeeds for the new type/constant files.

### 3. Implement `.env` and token resolution helpers

- [x] Add helpers that read project-root `.env` and resolve GitHub tokens with `.env` overriding process `GH_TOKEN`, then process `GITHUB_TOKEN`.

The helper must read only relevant token keys and must never return output that includes token values in errors or logs.

#### Acceptance criteria

- Tests prove `.env` token values override process environment values.
- Tests prove `GH_TOKEN` takes precedence over `GITHUB_TOKEN` when `.env` does not provide a token.
- Tests prove missing tokens return a safe, actionable error with no secret leakage.
- No token is written to `.pi/agent/issueme.json`, `issues/*.json`, or test snapshots.

### 4. Implement repository resolution

- [x] Add repository resolution from `GITHUB_REPOSITORY` first and local `.git/config` origin URL second, without shelling out.

Support common GitHub HTTPS and SSH origin URL formats.

#### Acceptance criteria

- Tests cover `GITHUB_REPOSITORY=owner/repo`.
- Tests cover `https://github.com/owner/repo.git` and `git@github.com:owner/repo.git` origins.
- Tests cover non-GitHub or malformed origins returning a safe error.
- No GitHub CLI or shell command is used.

### 5. Implement slug and safe issue path helpers

- [x] Add slug generation and safe path resolution for `issues/<issue-number>-<issue-title-slug>.json`.

The implementation must prevent path traversal and normalize unsafe characters.

#### Acceptance criteria

- Tests cover lowercase slugging, whitespace collapse, punctuation removal, unicode-safe behavior or documented transliteration behavior, length limits, and fallback titles.
- Tests prove paths always resolve inside the configured issue directory.
- Tests prove issue number is always part of the filename.

### 6. Implement config loader and saver

- [x] Add config loading and saving for non-secret settings in `.pi/agent/issueme.json`.

Potential settings include issue directory, default labels, default assignees, and optional default skill path. Tokens must never be accepted for persistence.

#### Acceptance criteria

- Tests cover default config when the file is absent.
- Tests cover reading and writing non-secret settings.
- Tests prove token-like keys are rejected, ignored, or redacted according to documented behavior.
- Config writes create `.pi/agent/` only as needed and do not alter other `.pi` state.

### 7. Implement local issue store

- [x] Add local issue-store helpers for writing, reading, listing, renaming after title changes, and removing issue JSON files.

Use safe path helpers and Pi's file mutation queue helpers for mutations in tool execution paths.

#### Acceptance criteria

- Tests cover writing one file per issue with stable, pretty-printed JSON.
- Tests cover reading by issue number and listing open issue files.
- Tests cover removing local files for closed issues.
- Tests cover title changes producing the correct filename without leaving duplicate stale files.

### 8. Implement GitHub REST client foundation

- [x] Add a GitHub REST client wrapper around `fetch` with auth headers, API version headers, abort-signal support, pagination helpers, safe error mapping, and token redaction.

Use dependency injection or a narrow wrapper so tests can mock network behavior.

#### Acceptance criteria

- Tests cover successful JSON responses, 204/no-content responses, API errors, network errors, and abort behavior.
- Error messages include status and actionable context without exposing tokens.
- Requests include `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, and GitHub API version headers.
- No GitHub CLI or shell execution is used.

### 9. Implement GitHub issue API methods

- [x] Add REST methods for listing open issues, getting one issue, creating an issue, updating title/body/labels/assignees, adding comments, assigning/unassigning users, setting labels, and closing issues.

Methods that mutate an existing issue must support an open-state guard.

#### Acceptance criteria

- Tests cover request paths and payloads for each issue operation.
- Tests cover pagination for issue listing and comments when applicable.
- Tests prove closed issue mutation attempts fail before remote mutation payloads are sent.
- Tests prove state is re-checked immediately before mutation.

### 10. Register `issueme_sync_issues`

- [x] Implement the `issueme_sync_issues` tool to fetch open issues, write/update local issue files, and remove local files for issues that are now closed.

This tool should be the recommended first call before agents operate on local issue files.

#### Acceptance criteria

- Tool schema supports optional repo override only if the approved scope is revised; otherwise it operates on the current repo only.
- Tool output summarizes created, updated, unchanged, and removed local files.
- Tool result `details` includes safe counts, paths, issue numbers, and truncation metadata if needed.
- Tool has `promptSnippet` and tool-specific `promptGuidelines` that name `issueme_sync_issues`.

### 11. Register `issueme_create_issue`

- [x] Implement the `issueme_create_issue` tool to create a GitHub issue with title/body/labels/assignees and write the local issue JSON file.

The tool should return a concise summary and structured details for agents.

#### Acceptance criteria

- Tool schema includes title, body, optional labels, and optional assignees with clear descriptions.
- Successful creation writes `issues/<number>-<title-slug>.json`.
- Tool output includes issue number, title, URL, and local path, with no token data.
- Tool has `promptSnippet` and tool-specific `promptGuidelines` that name `issueme_create_issue`.

### 12. Register `issueme_get_issue`

- [x] Implement the `issueme_get_issue` tool to return issue details from local cache and optionally refresh from GitHub.

The tool should support lookup by issue number and, where safe, by local filename/title slug.

#### Acceptance criteria

- Tool schema clearly describes lookup modes and refresh behavior.
- Tool output is concise and human/LLM-friendly.
- Large bodies/comments are truncated in tool output with an explicit truncation notice.
- Tool result `details` includes safe structured issue metadata.

### 13. Register `issueme_update_issue`

- [x] Implement the `issueme_update_issue` tool to update open issue title/body and supported metadata when explicitly requested.

The tool must reject closed issues and update/rename the local issue file after successful remote mutation.

#### Acceptance criteria

- Tool schema supports explicit update fields and avoids ambiguous free-form mutation.
- Closed issues are rejected before mutation and remain unchanged locally/remotely.
- Title changes rename the local file safely.
- Tool output lists changed fields and local path updates.

### 14. Register `issueme_comment_issue`

- [x] Implement the `issueme_comment_issue` tool to add comments to open issues.

Comments should be used for refinements/progress notes when changing the original body is not explicitly requested.

#### Acceptance criteria

- Tool schema includes issue number and comment body with clear descriptions.
- Closed issues are rejected before adding a comment.
- Successful comments update local issue JSON comments or mark the cache as needing sync if comments are too large.
- Tool output includes the comment URL or ID with no secrets.

### 15. Register `issueme_assign_issue`

- [x] Implement the `issueme_assign_issue` tool to assign, unassign, or set assignees on open issues.

Use `StringEnum` for the action field.

#### Acceptance criteria

- Tool schema includes an enum action such as `add`, `remove`, or `set`, plus assignees.
- Closed issues are rejected before assignment changes.
- Successful assignment changes update the local issue file.
- Tool output clearly lists final assignees or changed assignees.

### 16. Register `issueme_label_issue`

- [x] Implement the `issueme_label_issue` tool to add, remove, or set labels on open issues.

Use `StringEnum` for the action field.

#### Acceptance criteria

- Tool schema includes an enum action such as `add`, `remove`, or `set`, plus labels.
- Closed issues are rejected before label changes.
- Successful label changes update the local issue file.
- Tool output clearly lists final labels or changed labels.

### 17. Register `issueme_close_issue`

- [x] Implement the `issueme_close_issue` tool to close an open issue and remove its local issue file after successful remote close.

The tool must never delete remote issues.

#### Acceptance criteria

- Tool schema includes issue number and optional close reason/comment only if supported by GitHub API and approved by docs.
- Already closed issues are reported as closed and are not mutated again.
- Successful remote close removes the matching local issue JSON file.
- Tool output clearly states the remote issue was closed and local cache file was removed.

### 18. Wire the extension entry point

- [x] Update `src/extension.ts` to import and call registration functions for commands and tools only after their modules are implemented and tested.

The entry point should remain small and should not contain business logic.

#### Acceptance criteria

- `src/extension.ts` exports `issueMeExtension` as the default function.
- The entry point only calls `register*` functions and does not perform network/file mutation directly.
- No long-lived resources are started from the extension factory.
- `npm run typecheck` succeeds.

### 19. Implement `/issueme` configuration UI

- [x] Implement `/issueme` with no args to open a configuration UI for non-secret IssueMe settings.

The command should support TUI mode and provide a safe fallback or message in non-TUI modes.

#### Acceptance criteria

- TUI users can view/edit non-secret settings and save `.pi/agent/issueme.json`.
- Non-TUI users receive actionable instructions or a safe minimal configuration path.
- Token values cannot be entered or persisted through the config UI.
- Config changes are documented in README.

### 20. Implement `/issueme info`

- [x] Implement `/issueme info` to show help, configured paths, resolved repo status, token presence status, cache summary, and tool names.

The command must not print secrets.

#### Acceptance criteria

- Output includes command usage and tool list.
- Output distinguishes token present/missing without revealing token value.
- Output includes current repo resolution status and local cache path.
- Works safely in TUI and non-TUI modes.

### 21. Implement `/issueme start <skill-path>`

- [x] Implement `/issueme start <skill-path>` to start an agent workflow using the supplied skill path and IssueMe tools.

The command should send a user message that asks the agent to read/use the supplied skill and begin the issue-management workflow.

#### Acceptance criteria

- Command requires a skill path and reports usage when missing.
- Command accepts project-relative and absolute skill paths safely.
- Command uses `pi.sendUserMessage()` with safe delivery behavior for idle/busy states.
- The generated prompt explicitly tells the agent to use IssueMe tools and to avoid editing closed issues.

### 22. Update documentation for implemented behavior

- [x] Update README, SECURITY, CHANGELOG, and docs to describe the actual implemented commands, tools, config, auth, local files, safety behavior, and validation steps.

Do not document unimplemented webhook behavior as available.

#### Acceptance criteria

- README has accurate install, configuration, usage, tool, auth, cache, and troubleshooting sections.
- SECURITY documents REST API network access, token handling, local file reads/writes, no shell execution, no webhooks, and no telemetry.
- CHANGELOG distinguishes implemented features from preparation work.
- Docs match the final module layout.

### 23. Add end-to-end package and smoke validation

- [x] Run full repository validation and isolated Pi smoke testing.

Use `pi --no-extensions -e .` for smoke tests unless the user explicitly requests loading other configured extensions.

#### Acceptance criteria

- `npm run typecheck` passes.
- `npm run test` passes.
- `npm run check:pack` passes and excludes `.env`, `.pi/`, `issues/`, `specs/`, reports, caches, tarballs, and local state.
- `npm run validate` passes.
- `pi --no-extensions -e .` loads the extension and exposes registered commands/tools after implementation.

## Testing Strategy

- Use temporary directories for config and issue-store tests.
- Use dependency-injected fetch for GitHub REST tests.
- Avoid live GitHub calls in default tests.
- Test all closed-issue mutation refusal paths.
- Test token redaction and `.env` precedence.
- Test local file cleanup and path safety.

## Acceptance Criteria

- Each task above stayed unchecked until its acceptance criteria were completed.
- The implementation follows the approved IssueMe architecture and guidelines.
- Release readiness still depends on the active remediation backlog, `npm run validate`, and isolated Pi smoke testing.

## Validation Commands

Historical validation commands used during implementation:

- `npm run typecheck` - Validate TypeScript.
- `npm run test` - Run tests.
- `npm run check:pack` - Verify package contents.
- `npm run validate` - Full validation.
- `pi --no-extensions -e .` - Isolated Pi smoke test.

## Notes

- Do not run `subagent_tasks` against this archived spec for current remediation.
- Do not mark active remediation checkboxes in this archived file.
- Feature development now follows `specs/spec-remediation-tasks.md` unless a future spec explicitly supersedes it.
