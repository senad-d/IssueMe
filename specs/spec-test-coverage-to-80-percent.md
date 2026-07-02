# Plan: Raise Test Coverage to At Least 80%

## Task Description

Create a focused testing backlog for raising IssueMe test coverage from the current low baseline to at least 80% by adding deterministic unit, integration, GraphQL client, tool, command, and TUI interaction tests.

## Objective

Increase project test coverage to **at least 80% line coverage** as measured by the project coverage command, without weakening safety rules, excluding production code to game the metric, or requiring live GitHub access.

## Problem Statement

The project already has many behavior tests, but the coverage report still shows large untested areas in high-value runtime, GitHub client, Projects v2, local cache, command, TUI, and tool orchestration code. User-reported coverage is around 46%; the checked-in `coverage/lcov.info` snapshot currently reports lower line coverage, so the first implementation step must re-run the official coverage command and use that result as the source of truth.

## Solution Approach

Prioritize tests by uncovered executable lines and risk. Cover pure helpers first because they are fast and deterministic, then cover mocked REST/GraphQL clients, tool execution flows, command/TUI interactions, local file-system edge cases, and finally add an enforceable coverage gate. Use mocked `fetch` responses and temporary directories only; do not call live GitHub APIs.

## Current Coverage Baseline

Baseline source used for this spec: `npm run test:coverage` on 2026-07-02 with Node v26.0.0 and npm 11.12.1. The run passed with 307 deterministic tests; the task spec file was the only pre-existing untracked working-tree file.

- Lines: `5782/14277` = `40.50%`
- Functions: `1437/2521` = `57.00%`
- Branches: `4137/4790` = `86.37%`
- To reach 80% line coverage with the same executable-line total: cover at least `11422` lines, a net gain of about `5640` currently missed lines.

Highest-impact missed-line targets:

| Priority | File | Current line coverage | Missed lines | Main task |
| --- | --- | ---: | ---: | --- |
| 1 | `src/tools/runtime.ts` | 26.68% | 1058 | Runtime/detail-boundary tests |
| 2 | `src/github/client.ts` | 29.39% | 735 | REST client tests |
| 3 | `src/issues/store.ts` | 20.45% | 560 | Cache/store edge tests |
| 4 | `src/github/projects-client.ts` | 23.80% | 557 | Projects v2 GraphQL tests |
| 5 | `src/tools/sub-issue.ts` | 31.23% | 513 | Sub-issue tool tests |
| 6 | `src/tools/bulk-issues.ts` | 27.00% | 365 | Bulk tool matrix tests |
| 7 | `src/tools/manage-milestone.ts` | 38.14% | 326 | Milestone management tests |
| 8 | `src/tools/projects.ts` | 45.29% | 296 | Projects tool tests |
| 9 | `src/github/transport.ts` | 24.68% | 290 | Transport/pagination tests |
| 10 | `src/issues/format.ts` | 27.13% | 274 | Issue formatting tests |
| 11 | `src/tools/manage-label.ts` | 36.27% | 239 | Label management tests |
| 12 | `src/github/development-links-client.ts` | 17.04% | 224 | Development-link GraphQL tests |
| 13 | `src/github/sub-issues-client.ts` | 16.93% | 211 | Sub-issue GraphQL tests |
| 14 | `src/github/issues-client.ts` | 30.48% | 203 | REST issue helper tests |
| 15 | `src/config/config.ts` | 22.91% | 175 | Config safety tests |

Covering most of the top 15 files is enough to cross 80% if the total executable-line count stays similar.

## Relevant Files

Use these files to complete the task:

- `package.json` - Defines `npm test`, `npm run test:coverage`, `npm run validate`, and current test glob behavior.
- `scripts/test-coverage.mjs` - Runs Node test coverage and writes `coverage/lcov.info`; update only after coverage reaches the target.
- `coverage/lcov.info` - Current coverage snapshot and prioritization source.
- `test/*.test.mjs` - Existing test patterns using `node:test`, `assert/strict`, temp directories, direct `.ts` imports, and mocked fetch.
- `src/tools/runtime.ts` - Largest missed-line target; contains runtime setup, trust checks, safe result shaping, truncation, input validation, and partial-success helpers.
- `src/github/client.ts` and `src/github/transport.ts` - REST/GraphQL transport, pagination, request shaping, and error mapping.
- `src/github/issues-client.ts`, `src/github/projects-client.ts`, `src/github/sub-issues-client.ts`, `src/github/development-links-client.ts` - Pure query builders, normalizers, validators, and GraphQL response handling.
- `src/issues/store.ts` and `src/issues/format.ts` - Local cache read/write/list/remove behavior and GitHub-to-cache formatting.
- `src/tools/*.ts` - Tool-specific execution paths, safety guards, result details, and partial-success behavior.
- `src/commands/issueme-command.ts` and `src/commands/config-tui.ts` - `/issueme` command routing and configuration TUI behavior.
- `src/config/config.ts`, `src/utils/*.ts`, `src/errors.ts` - Remaining utilities and edge cases that can add reliable coverage.

### New Files

Create or extend these files as needed:

- `test/helpers/issueme-test-helpers.mjs` - Shared factories for temp projects, configs, GitHub issues, comments, labels, milestones, Projects v2 nodes, fake Pi APIs, fake contexts, JSON responses, fetch recorders, and secret-leak assertions.
- `test/runtime-details.test.mjs` - Runtime creation, creator-scope, truncation, sanitization, and safe-error tests.
- `test/github-transport-client.test.mjs` - REST transport, pagination, request, response, and error tests.
- `test/github-projects-graphql.test.mjs` - Projects v2 query builder, normalizer, validation, and client tests.
- `test/github-relationships.test.mjs` - Native sub-issue and development-link GraphQL tests.
- `test/issue-store-format-edge.test.mjs` - Local cache and formatter edge cases.
- `test/tool-matrix-core.test.mjs` - Core issue tool behavior matrix.
- `test/tool-matrix-admin.test.mjs` - Discovery/admin/Projects/bulk tool behavior matrix.
- `test/command-tui-interactions.test.mjs` - `/issueme` command and configuration TUI interaction coverage.
- `test/utils-config-edge.test.mjs` - Config, validation, safe read/write, project-root, login, date, and slug utility edge cases.
- `scripts/assert-coverage-threshold.mjs` - Optional fallback threshold checker if Node's built-in coverage threshold flags are not available or are insufficient for LCOV gating.

## Implementation Phases

### Phase 1: Foundation

Re-run the current coverage command, record the true baseline, and add shared test fixtures so the new tests stay compact and deterministic.

### Phase 2: Core Coverage Expansion

Add targeted tests for the largest missed-line files first: runtime details, GitHub client/transport, config TUI, issue store, Projects v2, sub-issues, bulk operations, command routing, and management tools.

### Phase 3: Gate and Polish

Close remaining gaps using LCOV data, add an 80% coverage gate, run validation, and mark tasks complete only when acceptance criteria pass.

## Step by Step Tasks

IMPORTANT: Execute every task in order, top to bottom. Keep each task unchecked until its acceptance criteria are met.

### 1. Capture the current coverage baseline

- [x] Re-run `npm run test:coverage` from a clean working tree.

#### Why

The user-reported 46% and the checked-in LCOV snapshot differ. Implementation must optimize against the metric that CI and local validation actually use.

#### How

- Run `npm run test:coverage`.
- Parse `coverage/lcov.info` by file and sort by missed lines.
- Save the resulting summary in the implementation notes or update the baseline table in this spec if it changed materially.
- Do not edit production code in this task.

#### Where

- `coverage/lcov.info`
- `scripts/test-coverage.mjs`
- `specs/spec-test-coverage-to-80-percent.md`

#### Acceptance criteria

- The active baseline line/function/branch percentages are known.
- The target number of additional covered lines is calculated.
- The top missed-line files are identified before new tests are added.

### 2. Add shared deterministic test helpers

- [x] Create reusable test factories and fake integrations for all later tasks.

#### Why

Many existing tests duplicate temp-project, fake-Pi, mocked-fetch, and GitHub fixture setup. Shared helpers make it practical to add many focused tests without large copy/paste blocks.

#### How

- Add `test/helpers/issueme-test-helpers.mjs`.
- Include helpers for temporary project creation, `.git/config` setup, IssueMe config files, local issue records, GitHub REST issue/comment/label/milestone/user fixtures, Projects v2 GraphQL fixtures, JSON responses, fake Pi API, fake command/tool context, tool execution, and fetch call recording.
- Include `assertNoSecretLeak(text, secrets)` for token and body-safety checks.
- Keep helpers deterministic and free of live network access.
- Avoid changing the test runner glob; helpers should be imported by `test/*.test.mjs` files and not executed directly.

#### Where

- `test/helpers/issueme-test-helpers.mjs`
- Existing tests may optionally import helpers after this task.

#### Acceptance criteria

- Existing `npm test` still passes.
- Helper file is not picked up as a standalone test.
- New helpers do not require project secrets or live GitHub state.

### 3. Cover runtime setup, safe details, truncation, and input validation

- [x] Add high-volume runtime unit tests for `src/tools/runtime.ts`.

#### Why

`src/tools/runtime.ts` has the largest uncovered-line count and contains core safety behavior shared by every tool.

#### How

Add `test/runtime-details.test.mjs` covering:

- `createIssueMeRuntime` with trusted/untrusted projects, injected options, async options provider, repository mismatch, invalid repository strings, config defaults, and token resolution through injected env.
- `normalizeRuntimeRepository`, `isProjectTrusted`, `assertTrustedProject`, `allowedIssueCreator`, `issueCreatorScopeLabel`, `issueCreatorMatchesConfig`, `assertIssueCreatorAllowed`, `assertExistingIssueCreatorAllowed`, and `assertAuthenticatedUserAllowedForCreate` for all creator-scope outcomes.
- `fetchIssueRecord`, `refreshIssueRecord`, `writeAndSummarizeIssue`, and `refreshAndCacheIssue` with comment truncation, missing comment count, cache writes, removed stale paths, abort signals, and creator rejection.
- `toolText` and `boundToolDetails` for text truncation and every detail collection: paths, removed paths, changed fields, file actions, invalid files, issues, labels, milestones, assignees, projects, project fields, project items, development links, bulk results, messages, errors, and nested truncation metadata.
- `safeToolError`, `partialSuccessToolError`, `partialSuccessToolText`, and `isAbortError` for domain errors, Node errors, unknown errors, redaction, recovery hints, and `needsSync` behavior.
- `sanitizeStringList`, `sanitizeGitHubLoginList`, `requireNonEmptyStrings`, `requireNonEmptyGitHubLogins`, `requireNonEmptyTitle`, `listChangedFields`, and `normalizeIssueBody` for valid, empty, duplicate, newline, null-byte, invalid-login, blank-body, and explicit-empty-body cases.

#### Where

- `src/tools/runtime.ts`
- `test/runtime-details.test.mjs`
- `test/helpers/issueme-test-helpers.mjs`

#### Acceptance criteria

- Runtime tests are deterministic and do not call live GitHub.
- Coverage for `src/tools/runtime.ts` increases substantially, ideally above 70% line coverage.
- Token-like strings used in tests do not appear in failure output or tool details.

### 4. Cover GitHub transport, REST client, and issue-client helpers

- [x] Add REST and transport tests for request construction, pagination, and errors.

#### Why

`src/github/client.ts`, `src/github/transport.ts`, and `src/github/issues-client.ts` contain many important branches around GitHub API behavior and are large coverage gaps.

#### How

Add `test/github-transport-client.test.mjs` covering:

- `GitHubTransport` headers, methods, JSON bodies, 204/no-content responses, invalid JSON, non-JSON responses, abort errors, network errors, rate-limit-style errors, permission errors, and token redaction.
- `parseNextLink` with no link, single next link, multiple relations, quoted URLs, relative/absolute URLs, and malformed headers.
- Pagination with exact limits, truncation, filtering out pull requests, empty pages, next-link loops prevented by limits, and search pagination using `total_count` and `incomplete_results`.
- `GitHubClient` issue methods: list/search issues, get issue, ensure open, create, update, close with reason, reopen, comments, comment update/delete, labels, assignees, milestones, repository labels, repository assignees, and authenticated user login.
- `issues-client` pure helpers: list/search query builders, filter normalization, label/assignee filtering, PR detection, search response normalization, positive-number validators, update-input normalization, comment ownership checks, and safe issue summaries.

#### Where

- `src/github/client.ts`
- `src/github/transport.ts`
- `src/github/issues-client.ts`
- `test/github-transport-client.test.mjs`

#### Acceptance criteria

- Mocked fetch call assertions prove paths, query strings, methods, headers, and payloads are correct.
- Closed-issue guards are covered before mutation payloads are sent.
- Coverage for these three files increases substantially, with no live API calls.

### 5. Cover Projects v2 GraphQL helpers, client flows, and tool behavior

- [x] Add Projects v2 GraphQL and tool tests.

#### Why

Projects v2 code is a major coverage gap and high-risk because it combines GraphQL shapes, scope/owner policy, opaque IDs, field value types, and issue-target validation.

#### How

Add `test/github-projects-graphql.test.mjs` and extend or create Projects tool tests covering:

- Query builders for repository, organization, and user scopes.
- Field lookup by project ID and by project number.
- Project list pagination, closed-board filtering, `includeClosed`, query filters, page cap behavior, owner fallback, and truncation.
- `normalizeProjectV2Summary`, `normalizeProjectV2FieldSummary`, `normalizeProjectV2ItemMutationResult`, field option/iteration truncation, invalid shapes, missing owners, and output ID validation.
- `normalizeProjectV2Scope`, owner policy, query trimming, project number/field/option/iteration limits, required/optional ID validation, and all field value input variants: single-select, iteration, date, text, and number.
- `assertProjectV2AllowedForAdd` for matching/mismatching repository/org/user owners and explicit policies.
- `assertProjectV2ItemTargetsIssue` for wrong project, wrong issue number, wrong content type, closed issue content if applicable, and repository mismatch.
- Tool-level flows for `issueme_list_projects`, `issueme_get_project_fields`, `issueme_add_issue_to_project`, and `issueme_update_project_item`, including remote errors, validation errors, partial cache failures if applicable, and bounded details.

#### Where

- `src/github/projects-client.ts`
- `src/tools/projects.ts`
- Existing `test/projects-*.test.mjs` files or new `test/github-projects-graphql.test.mjs`

#### Acceptance criteria

- Repository/org/user scopes are all covered.
- Every Projects v2 mutation validates IDs and target issue ownership before mutation.
- Coverage for `src/github/projects-client.ts` and `src/tools/projects.ts` increases materially.

### 6. Cover native sub-issues and development-link GraphQL logic

- [x] Add relationship and development-link tests.

#### Why

Native sub-issue and development-link modules have low coverage and contain complex GraphQL response normalization and relationship safety rules.

#### How

Add `test/github-relationships.test.mjs` covering:

- `buildSubIssueRelationshipsQuery` and `buildIssueDevelopmentLinksQuery` include expected fragments and variables.
- Sub-issue limits, reorder number validation, duplicate children, missing children, parent included as child, empty reorder lists, and `moveNativeSubIssue` reorder planning.
- Required issue node IDs, native sub-issue safe summaries, mutation result normalization, reprioritize result normalization, relationship result normalization, invalid shapes, total-count truncation, parent summary, child summary, and repository URL safety.
- Development-link limit normalization, timeline event normalization for linked PRs, branches, commits, closing references, draft PRs, missing fields, unknown event types, truncation, and invalid response shapes.
- Tool-level flows for `issueme_create_sub_issue`, `issueme_add_sub_issue`, `issueme_remove_sub_issue`, `issueme_reorder_sub_issues`, `issueme_list_sub_issues`, and `issueme_list_issue_development_links`, including open-state guards, cache refresh, partial success, and bounded output.

#### Where

- `src/github/sub-issues-client.ts`
- `src/github/development-links-client.ts`
- `src/tools/sub-issue.ts`
- `src/tools/development-links.ts`
- `test/github-relationships.test.mjs`

#### Acceptance criteria

- Relationship operations are fully mocked and deterministic.
- Reorder tests prove all current children are supplied exactly once.
- Coverage for relationship client/tool files increases substantially.

### 7. Cover issue cache store and formatter edge cases

- [x] Add local cache and issue-format tests.

#### Why

Local issue files are a core IssueMe safety boundary. `src/issues/store.ts` and `src/issues/format.ts` have large missed-line counts despite existing basic tests.

#### How

Add `test/issue-store-format-edge.test.mjs` covering:

- `writeIssueRecord` create/update/rename/no-op paths, stale title removal, removed-path summaries, repository mismatch, invalid issue directory, abort before write, and write failure handling.
- `listIssueFiles` and `listIssueFileEntries` with empty directories, missing directories, invalid JSON files, wrong schema versions, invalid filenames, duplicate issue numbers, non-JSON files, subdirectories, unreadable files if portable, and sorted output.
- `readIssueFile`, `readIssueByNumber`, `readIssueByLookup`, `findIssueByNumber`, `findIssueByLookup`, `removeIssueByNumber`, `removeClosedIssueFiles`, `issueFileDiagnosticReason`, and `relativeIssuePath` for success and error paths.
- `githubIssueToRecord` with null/missing bodies, malformed labels/assignees, milestone fields, pull-request issues, comments, truncated comment metadata, relationship metadata, creator extraction, and unknown optional fields.
- `issueRecordToToolSummary`, `applyIssueRelationshipMetadata`, `formatIssueSummary`, and `truncateText` for long text, missing local paths, comment count display, linked relationship fields, closed issues, and output truncation.

#### Where

- `src/issues/store.ts`
- `src/issues/format.ts`
- `test/issue-store-format-edge.test.mjs`

#### Acceptance criteria

- Cache tests use temporary directories only.
- Unsafe path and invalid file cases never write outside the project.
- Coverage for store and format files increases materially.

### 8. Cover core issue tool execution matrices

- [x] Add table-driven tool execution tests for core issue tools.

#### Why

Tool files often share runtime and result behavior, but each has specific input validation, remote calls, cache effects, and partial-success paths that need direct coverage.

#### How

Add `test/tool-matrix-core.test.mjs` covering:

- `issueme_create_issue`: default labels/assignees, explicit empty labels/assignees, title/body validation, creator-scope authenticated-user check, remote success, cache success, cache partial failure.
- `issueme_update_issue`: changed field detection, clear milestone, omitted body vs explicit empty body, blank whitespace body rejection, open-state guard, creator-scope guard, remote/cache partial success.
- `issueme_get_issue`: cached lookup by number/filename/title fragment, refresh open issue, refresh closed issue cache removal, comment truncation, missing issue, local invalid cache handling.
- `issueme_sync_issues`: open issue sync, PR filtering, stale closed file removal, comment truncation, invalid file reporting, partial cache errors, creator filtering.
- `issueme_comment_issue`, `issueme_update_comment`, `issueme_delete_comment`: body validation, comment ID validation, comment ownership, remote errors, partial cache sync behavior.
- `issueme_assign_issue`, `issueme_label_issue`, `issueme_close_issue`, and `issueme_reopen_issue`: add/remove/set semantics, empty-set semantics, unassignable/missing labels, close reasons, already-closed/already-open no-ops, closed-issue mutation protection, and cache updates.

#### Where

- `src/tools/create-issue.ts`
- `src/tools/update-issue.ts`
- `src/tools/get-issue.ts`
- `src/tools/sync-issues.ts`
- `src/tools/comment-issue.ts`
- `src/tools/assign-issue.ts`
- `src/tools/label-issue.ts`
- `src/tools/close-issue.ts`
- `src/tools/reopen-issue.ts`
- `test/tool-matrix-core.test.mjs`

#### Acceptance criteria

- Each core tool has success, validation failure, remote failure, and cache partial-success coverage where applicable.
- Mutating tool tests prove open-state and creator-scope checks happen before mutation.
- Tool outputs have bounded `details.result`, `details.status`, `details.needsSync`, and safe error details.

### 9. Cover discovery, admin, Projects, and bulk tool matrices

- [x] Add table-driven tests for non-core and bulk tools.

#### Why

Discovery/admin/project/bulk tools have many parameter combinations and output shapes. They are likely contributing large uncovered regions across tool files.

#### How

Add `test/tool-matrix-admin.test.mjs` covering:

- `issueme_list_issues`, `issueme_list_labels`, `issueme_list_milestones`, and `issueme_list_assignees`: filter normalization, query/search mode, state/sort/direction/limit bounds, truncation, empty results, remote errors, and bounded summaries.
- `issueme_manage_label`: create/update/delete, required delete confirmation, color normalization, description clearing, rename, remote conflicts, and safe errors.
- `issueme_manage_milestone`: create/update/close/reopen/delete, due date validation, `clearDueOn`, required delete confirmation, title validation, and remote errors.
- `issueme_list_projects`, `issueme_get_project_fields`, `issueme_add_issue_to_project`, and `issueme_update_project_item`: success and validation/error paths not already covered in task 5.
- `issueme_bulk_update_issues`: `add_labels`, `assign`, `set_milestone`, `add_to_project`, and `close`; `continueOnError` true/false; per-issue success/failure summaries; abort behavior; partial cache sync; invalid explicit issue numbers; and bounded bulk result details.

#### Where

- `src/tools/list-issues.ts`
- `src/tools/list-labels.ts`
- `src/tools/list-milestones.ts`
- `src/tools/list-assignees.ts`
- `src/tools/manage-label.ts`
- `src/tools/manage-milestone.ts`
- `src/tools/projects.ts`
- `src/tools/bulk-issues.ts`
- `test/tool-matrix-admin.test.mjs`

#### Acceptance criteria

- Every registered tool has at least one direct execution success test and one failure/validation test.
- Bulk behavior proves partial failure semantics are explicit and bounded.
- Coverage for tool files below 50% rises materially.

### 10. Cover `/issueme` command flows and configuration TUI interactions

- [x] Add command-handler and TUI interaction tests.

#### Why

`src/commands/issueme-command.ts` and `src/commands/config-tui.ts` are large coverage gaps. The existing snapshot tests cover rendering but not enough input and command lifecycle paths.

#### How

Add `test/command-tui-interactions.test.mjs` covering:

- `/issueme config` in trusted TUI mode with save, cancel, save failure, unchanged config, notification calls, and non-secret persistence.
- `/issueme config` in untrusted, non-TUI, and no-UI contexts.
- `/issueme info` with trusted and untrusted projects, token present/missing/error, repository resolution success/failure, config read errors, invalid cache files, and unknown command warnings.
- `/issueme start` with explicit path, configured default, missing skill path, directory path, missing path, unreadable path, symlink inside project, symlink outside project, absolute paths, `@` prefix, null byte, untrusted project, idle vs busy delivery.
- `IssueMeConfigTui` interactions: pane movement, category/settings selection, search start/typing/empty results, escape, enter, editing all setting types, backspace/delete, clear edit key, validation errors, save/quit behavior, autosave-on-close, narrow/wide/tiny rendering, footer/help text, and selection counters.
- ANSI/grapheme helper behavior through public rendering paths: wide/fullwidth text, emoji, zero-width marks, colored truncation, tiny width, and extremely narrow width.

#### Where

- `src/commands/issueme-command.ts`
- `src/commands/config-tui.ts`
- `test/command-tui-interactions.test.mjs`
- `test/snapshots/tui/issueme-config/*` if snapshot updates are intentional.

#### Acceptance criteria

- TUI tests drive public `IssueMeConfigTui` methods instead of reaching into private state.
- Snapshot changes are intentional and reviewed.
- Command/TUI coverage increases substantially without depending on real UI or terminal input.

### 11. Cover config, utility, and error edge cases

- [ ] Add focused utility/config tests for remaining low-coverage files.

#### Why

After high-impact tasks, smaller utility files can cheaply close the remaining gap and protect safety boundaries.

#### How

Add `test/utils-config-edge.test.mjs` or extend existing utility tests covering:

- `src/config/config.ts`: absent config, invalid JSON, non-object JSON, secret-like keys at nested levels, allowed issue creator normalization, duplicate defaults, invalid issue directory, save failures, and config path resolution.
- `src/utils/env.ts`: parser edge cases, quoted values, unsupported multiline values, malformed tokens, symlinked project env file safety, process env fallback, token status redaction, and read errors.
- `src/utils/safe-read.ts` and `src/utils/safe-write.ts`: project-boundary checks, protected paths, null bytes, missing files, directory reads, atomic write behavior, and write failure cleanup where safe.
- `src/utils/project-root.ts`: normal repo, nested repo, worktree, submodule, missing git root, unsafe cwd, and realpath errors.
- `src/utils/slug.ts`, `src/utils/validation.ts`, `src/utils/github-login.ts`, `src/utils/mutation-queue.ts`, `src/utils/date.ts`, `src/github/shared.ts`, `src/github/graphql-errors.ts`, and `src/errors.ts`: boundary values, invalid input, truncation, taxonomy, and redaction branches not already covered.

#### Where

- `src/config/config.ts`
- `src/utils/*.ts`
- `src/github/shared.ts`
- `src/github/graphql-errors.ts`
- `src/errors.ts`
- `test/utils-config-edge.test.mjs`

#### Acceptance criteria

- Remaining low-coverage utility files are covered with fast pure or temp-file tests.
- Safety behavior around paths, tokens, and redaction is explicitly asserted.
- No test writes outside its temporary project directory.

### 12. Run an LCOV gap-closure pass

- [ ] Use the updated LCOV report to close remaining gaps until global coverage is above 80%.

#### Why

The first pass may not cover enough lines or may leave one large file unexpectedly low. A data-driven gap-closure pass prevents guessing.

#### How

- Run `npm run test:coverage`.
- Parse `coverage/lcov.info` by missed lines and line percentage.
- Add only meaningful tests for remaining uncovered behavior.
- Prefer tests over production refactors. If refactoring is needed for testability, keep it behavior-preserving and separately covered.
- Do not add coverage ignores or remove `--test-coverage-include=src/**/*.ts` unless the user explicitly approves a measurement-scope change.

#### Where

- `coverage/lcov.info`
- Any remaining low-coverage `src/**/*.ts` file
- Matching `test/*.test.mjs` files

#### Acceptance criteria

- Global line coverage is at least 80% locally.
- No source file is excluded purely to raise the percentage.
- Branch/function coverage does not materially regress from the baseline.

### 13. Add an enforceable 80% coverage gate

- [ ] Make the coverage target fail locally and in validation if it drops below 80%.

#### Why

After reaching 80%, the project needs a guardrail so future changes do not silently lower coverage again.

#### How

- Prefer Node's built-in test coverage threshold flags if supported by the project's Node version.
- If built-in flags are unavailable or do not apply to LCOV as needed, add `scripts/assert-coverage-threshold.mjs` to parse `coverage/lcov.info` and fail below 80% line coverage.
- Update `scripts/test-coverage.mjs` or `package.json` scripts so `npm run test:coverage` enforces the threshold after producing the report.
- Keep the threshold at 80% initially; do not set unrealistic per-file gates unless the implementation already meets them.
- Document the command in `CONTRIBUTING.md` or README if coverage guidance is missing.

#### Where

- `scripts/test-coverage.mjs`
- `scripts/assert-coverage-threshold.mjs` if needed
- `package.json`
- `CONTRIBUTING.md` or `README.md`

#### Acceptance criteria

- `npm run test:coverage` exits non-zero if line coverage is below 80%.
- The coverage report is still written to `coverage/lcov.info`.
- Documentation tells contributors how to run the coverage check.

### 14. Final validation and completion

- [ ] Validate all checks and mark completed tasks with `x`.

#### Why

Coverage work often creates broad tests and fixtures. Final validation ensures the added suite is stable, lint-clean, and aligned with project quality rules.

#### How

- Run `npm run test`.
- Run `npm run test:coverage`.
- Run `npm run lint`.
- Run `npm run validate` if time permits; otherwise run all commands listed below and record any skipped expensive checks.
- Inspect `coverage/lcov.info` and confirm line coverage is at least 80%.
- Review test names and assertions for clarity.
- Ensure no tests require real GitHub credentials, live network access, or persistent local state.
- Mark each completed task in this spec with `[x]` only after its acceptance criteria are met.

#### Where

- Entire repository
- `specs/spec-test-coverage-to-80-percent.md`

#### Acceptance criteria

- Global line coverage is at least 80%.
- `npm run test`, `npm run test:coverage`, and `npm run lint` pass.
- `npm run validate` passes or any skipped validation step is explicitly documented for the user.
- The implementation leaves no temporary files, debug scripts, or live credentials behind.

## Testing Strategy

- Use `node:test` and `node:assert/strict`, matching existing tests.
- Import TypeScript source files directly from `src/**/*.ts`, matching existing project patterns.
- Use mocked `fetch` for all REST and GraphQL behavior.
- Use `mkdtemp` under the OS temp directory for filesystem tests.
- Prefer table-driven tests for tool matrices and pure normalizers.
- Assert both user-facing text and `details` metadata for tools.
- Assert token/body redaction in all error paths that handle sensitive values.
- Keep tests deterministic: no live GitHub calls, no GitHub CLI, no real project issue mutations.

## Acceptance Criteria

- Project line coverage is at least 80% using the official coverage command.
- Coverage gain comes from meaningful tests, not from excluding production code or adding broad ignore comments.
- Every registered IssueMe tool has success and failure/validation coverage.
- High-risk safety paths are tested: project trust, token redaction, path boundaries, closed-issue mutation guards, creator-scope restrictions, cache partial success, bounded output, and GraphQL shape validation.
- The coverage threshold is enforced so regressions fail locally/CI.

## Validation Commands

Execute these commands to validate the task is complete:

- `npm run test` - Run the full deterministic test suite.
- `npm run test:coverage` - Generate `coverage/lcov.info` and enforce at least 80% line coverage.
- `npm run lint` - Run typecheck, ESLint, formatting, and script syntax checks.
- `npm run validate` - Run the complete project validation suite when feasible.

## Notes

- Do not require live GitHub credentials or network access for coverage tests.
- Do not change IssueMe behavior just to make tests easier unless the refactor is behavior-preserving and covered.
- Do not lower safety checks to increase coverage.
- If a platform-specific filesystem case is not portable, use `t.skip()` with a clear reason.
