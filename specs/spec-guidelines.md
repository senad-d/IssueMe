# Plan: Archived IssueMe Implementation Guidelines

> Archive status: these original guidelines remain useful engineering context, but they do not define the active task order or current availability. Use `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`, source, and tests for current behavior; use `specs/spec-remediation-tasks.md` for the active hardening backlog.

## Task Description

Record coding, Pi extension, package metadata, documentation, testing, security, privacy, and smoke-test guidelines prepared for `@senad-d/issueme`.

This archived specification may contain historical preparation/future-tense language below. Do not treat that language as a current task list or as proof that unverified behavior is release-ready.

## Objective

Provide durable engineering rules for IssueMe so it remains safe, agent-friendly, Pi-native, and maintainable.

## Problem Statement

IssueMe will combine Pi tools, local file writes, environment-based credentials, and GitHub REST mutations. Without explicit guidelines, implementation could accidentally leak secrets, mutate closed issues, use shell/GitHub CLI, overfill model context, or wire long-lived behavior unsafely.

## Solution Approach

Use strict modular boundaries, explicit schemas, safe file handling, direct GitHub REST/GraphQL access, conservative local persistence, and clear docs/tests. Treat every remote mutation and every local file write as security-sensitive.

## Relevant Files

Use these files for historical context and current cross-checks:

- `specs/spec-architecture.md` - Architecture and module boundaries.
- `specs/spec-tasks.md` - Ordered implementation tasks with acceptance criteria.
- `docs/PROJECT_DEFINITION_BRIEF.md` - Approved project definition and decision log.
- `docs/STRUCTURE.md` - Repository layout and conventions.
- `README.md` - User-facing behavior and examples.
- `SECURITY.md` - Security-sensitive behavior and reporting.
- `package.json` - Dependency placement, Pi manifest, scripts, keywords, and package metadata.
- `src/extension.ts` - Entry point that must stay small.
- `test/*.test.mjs` - Validation and behavior tests.

## Coding Conventions

- Prefer small modules with explicit names and narrow responsibilities.
- Keep `src/extension.ts` small. It should import feature modules and call their `register*` functions only.
- Export one registration function per command/tool group, for example `registerIssueMeCommand(pi)` or `registerCreateIssueTool(pi)`.
- Keep GitHub API details out of Pi command/tool modules; command/tool modules should call domain helpers.
- Keep filesystem path construction out of GitHub API modules; use issue-store helpers for local files.
- Prefer pure helpers for parsing, slugging, redaction, and formatting so they can be unit tested without Pi.
- Use typed domain objects in `src/types.ts` for config, issue records, tool inputs, and tool results.
- Avoid broad `any`; when external API responses are unknown, validate/narrow before use.
- Surface user-friendly errors in tool output while preserving structured safe details for debugging.

## Pi Extension Best Practices

- Do not start long-lived processes, file watchers, timers, sockets, HTTP listeners, or background jobs directly in the extension factory.
- Do not implement webhooks in the first version.
- If future webhook support is added, start it only from an explicit command/tool and clean it up in `session_shutdown`.
- Start session-scoped resources from `session_start`, a command, or a tool; clean them up in `session_shutdown`.
- Use `ctx.mode === "tui"` for TUI-only custom components.
- Use `ctx.hasUI` before prompts/notifications that need UI support.
- Use `pi.sendUserMessage()` for `/issueme start [skill-path]` workflow kickoff instead of trying to execute a skill internally.
- Avoid persisting branch-sensitive runtime state in memory. Store useful branch-sensitive state in tool result `details` when possible, and reconstruct from local issue files or the current branch on `session_start`.

## Tool Guidelines

- Every IssueMe tool must have a clear TypeBox schema, description, `promptSnippet`, and `promptGuidelines`.
- Every prompt guideline must name the specific tool, for example: `Use issueme_sync_issues before editing local issue files directly.`
- Use `StringEnum` from `@earendil-works/pi-ai` for string enum schema fields.
- Do not use `Type.Union`/`Type.Literal` as a replacement for string enums intended for LLM tool input.
- Keep schemas strict and explicit. Optional fields should have descriptions and safe defaults.
- Add `prepareArguments` only for backwards compatibility with older stored sessions; do not expand public schemas with deprecated fields.
- Tools that mutate remote GitHub issues must re-check issue state immediately before mutation.
- Tools must reject mutation of closed issues with a clear message and safe details.
- Tools that mutate local files must use Pi's file mutation queue helpers and resolve paths safely.
- Tools must truncate large outputs and tell the agent when output is truncated.
- Tool results must never include raw GitHub tokens or `.env` contents.

## Planned Tool Naming Rules

Use these exact tool names unless a future approved spec revision changes them:

- `issueme_create_issue`
- `issueme_sync_issues`
- `issueme_get_issue`
- `issueme_update_issue`
- `issueme_comment_issue`
- `issueme_assign_issue`
- `issueme_label_issue`
- `issueme_close_issue`

Do not add webhook tools in the first implementation.

## Command Guidelines

- Register one extension command name: `/issueme`.
- Parse subcommands from command args:
  - empty args: open configuration UI.
  - `info`: show help/status.
  - `start [skill-path]`: start a skill-guided workflow using an explicit project-local skill file, or `defaultSkillPath` when omitted.
- `/issueme` configuration must write only non-secret settings to `.pi/agent/issueme.json`.
- `/issueme info` must include useful status without printing secrets.
- `/issueme start [skill-path]` must accept project-relative or absolute skill paths, fall back to configured `defaultSkillPath` when omitted, and send a clear user message that instructs the agent to read/use the selected skill and IssueMe tools.
- Avoid starting agent work when another agent turn is active unless the command explicitly uses a safe `deliverAs` mode.

## Package Metadata Rules

- Keep `package.json` package name as `@senad-d/issueme`.
- Keep the Pi manifest extension entry as `./src/extension.ts` unless the entry point intentionally moves.
- Keep Pi core packages in `peerDependencies` with `"*"` when imported, including `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, and `typebox`.
- Put non-Pi runtime libraries in `dependencies` only when necessary.
- Put local development tools in `devDependencies`.
- Do not add GitHub CLI or shell-command dependencies.
- Keep package contents minimal with `npm run check:pack`.
- Do not publish `.env`, `.pi/`, `issues/`, `specs/`, reports, coverage, caches, tarballs, or local state.

## Documentation Rules

- README must clearly state which features are implemented and which are planned/pending.
- README must document GitHub token sources and `.env` precedence.
- README must document that IssueMe uses GitHub REST/GraphQL APIs directly and does not use GitHub CLI.
- README must document local issue files as `issues/<issue-number>-<issue-title-slug>.json`.
- README must document that closed issues are read-only to IssueMe and local closed issue files are removed.
- SECURITY must document file reads, file writes, network access, credential handling, and no telemetry.
- CHANGELOG must distinguish preparation work from later feature implementation.
- `docs/STRUCTURE.md` must stay aligned with actual module boundaries.
- Do not document webhook support as implemented in the first version.

## Testing Rules

- Add tests before or with each behavior change.
- Unit test pure helpers for `.env` parsing, token precedence, repository resolution, slugging, path safety, and issue-file formatting.
- Mock/inject fetch for GitHub REST client tests; do not require live GitHub calls in normal tests.
- Test every mutating tool's closed-issue refusal path.
- Test local issue file cleanup on close and sync.
- Test that secrets are redacted from errors, details, and output.
- Keep preparation-level tests separate from runtime behavior tests until features are implemented.
- Run `npm run validate` before handoff or release.

## Security and Privacy Rules

- Treat GitHub tokens, `.env`, private issue bodies, and comments as sensitive.
- Read project `.env` only to resolve known token keys; never echo the file or persist its values.
- Token resolution order: project `.env`, then process `GH_TOKEN`, then process `GITHUB_TOKEN`.
- Do not write tokens to `.pi/agent/issueme.json`, `issues/*.json`, tool output, details, logs, or errors.
- Do not execute shell commands for GitHub operations or repo discovery.
- Limit network access to GitHub REST endpoints and GraphQL native sub-issue inspection/mutations for the resolved current repository.
- Re-check remote issue state before mutation.
- Never update/comment/assign/label/close closed issues.
- Never delete remote GitHub issues.
- Do not send telemetry.
- Document all new file/network/credential behavior in README and SECURITY.

## Isolated Smoke-Test Rules

- Use `pi --no-extensions -e .` for manual smoke tests so other configured extensions cannot interfere.
- Do not use `pi -e .` unless the user explicitly wants all other configured extensions loaded too.
- Smoke-test command/tool discovery before live GitHub mutation tests.
- Use a disposable test repository or dry-run/mocked mode for early mutation tests when possible.
- Confirm no token values appear in the UI, session transcript, or local files.

## Historical Implementation Phases

### Phase 1: Preparation-safe cleanup

- Keep the repository identity and docs aligned with IssueMe.
- Keep runtime feature code out of the initial preparation-only session.

### Phase 2: Feature implementation

- Implement foundational helpers and tests first.
- Implement GitHub REST operations with tests.
- Implement commands/tools one at a time.

### Phase 3: Release readiness

- Expand README and SECURITY after features work.
- Run validation and isolated smoke testing.
- Prepare npm publishing only after package metadata and docs are complete.

## Historical Step by Step Tasks

IMPORTANT: These steps record the original implementation workflow; current remediation work follows `specs/spec-remediation-tasks.md`.

### 1. Confirm scope before coding

- Read `docs/PROJECT_DEFINITION_BRIEF.md`, `specs/spec-architecture.md`, this guidelines spec, and `specs/spec-tasks.md`.
- Confirm no new webhook/GitHub CLI requirement has been added.

### 2. Enforce module boundaries

- Keep commands, tools, GitHub API, config, issue storage, and utilities separate.
- Keep `src/extension.ts` registration-only.

### 3. Add tests with each module

- Add pure helper tests before network tool tests.
- Add fetch-injected tests for API behavior.
- Add command/tool tests where practical.

### 4. Validate safety rules

- Verify closed issue mutation refusal.
- Verify token redaction.
- Verify local path safety and package contents.

### 5. Run final validation

- Run all validation commands.
- Run isolated Pi smoke test.

## Testing Strategy

Tests combine pure helper unit tests, mocked GitHub REST client tests, command parsing tests, issue-store filesystem tests in temporary directories, and safety tests for secret redaction and closed issue mutation refusal.

## Acceptance Criteria

- The implementation follows the approved tool and command names.
- No GitHub CLI, shell execution, or webhook listener is introduced in the first implementation.
- `src/extension.ts` remains small and registration-only.
- Every custom tool has TypeBox schema, descriptions, snippets, and tool-specific prompt guidelines.
- Enum schema fields use `StringEnum` from `@earendil-works/pi-ai`.
- Every local file mutation uses safe paths and Pi file mutation queue helpers.
- README, SECURITY, CHANGELOG, and structure docs stay aligned with behavior.
- `npm run validate` and `pi --no-extensions -e .` pass before release.

## Validation Commands

Execute these commands during implementation and release readiness:

- `npm run typecheck` - Validate TypeScript.
- `npm run test` - Run tests.
- `npm run check:pack` - Verify package contents.
- `npm run validate` - Full validation.
- `pi --no-extensions -e .` - Isolated Pi smoke test.

## Notes

- The initial preparation session intentionally did not implement commands/tools/events/UI/network behavior.
- The skill referenced by `/issueme start [skill-path]` is user-supplied or project-configured and must stay outside the bundled extension unless separately designed and approved.
