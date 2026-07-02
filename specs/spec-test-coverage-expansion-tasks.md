# Plan: Test Coverage Expansion Tasks

## Task Description

Create an ordered backlog of test-only implementation tasks to increase IssueMe repository coverage from the current Sonar-reported baseline of about `42.9%` coverage. This plan is investigative and implementation-oriented: it identifies what tests to add, where to add them, and how to validate coverage gains without changing production behavior yet.

Task type: chore  
Complexity: complex

## Objective

Increase meaningful test coverage for the highest-impact IssueMe modules by adding focused Node test files that exercise existing behavior, error handling, truncation, normalization, cache safety, and tool result semantics.

The first implementation pass should prioritize coverage gains in files with the largest uncovered executable surface:

- `src/tools/runtime.ts`
- `src/github/client.ts`
- `src/commands/config-tui.ts`
- `src/issues/store.ts`
- `src/github/projects-client.ts`
- `src/tools/sub-issue.ts`
- `src/tools/bulk-issues.ts`

## Problem Statement

The project already has a broad Node test suite, but Sonar still reports coverage around `42.9%`. A local `npm run test:coverage` investigation showed all tests passing, but coverage hotspots remain concentrated in shared runtime helpers, GitHub client wrappers, Projects v2 normalizers, cache-store validation paths, and less common tool branches.

Baseline captured during investigation:

- `npm run test:coverage`: `264` tests passing.
- Local Node coverage summary:
  - Lines: `4656/14081` = `33.07%`
  - Branches: `3631/4480` = `81.05%`
  - Functions: `1362/2435` = `55.93%`
- Sonar summary for `senad-d_IssueMe`:
  - Coverage: `42.9`
  - Quality gate: `ERROR`
  - Bugs/vulnerabilities/security hotspots: `0`

Top local missing-line opportunities:

| File | Local line % | Missing lines | Primary test opportunity |
|---|---:|---:|---|
| `src/tools/runtime.ts` | `23.23%` | `1018` | Unit tests for result bounding, truncation, safe errors, creator-scope helpers |
| `src/github/client.ts` | `29.39%` | `735` | Fake-fetch tests for REST and GraphQL client methods |
| `src/commands/config-tui.ts` | `28.77%` | `666` | TUI snapshot and interaction branch tests |
| `src/issues/store.ts` | `19.46%` | `567` | Filesystem/cache validation and invalid record tests |
| `src/github/projects-client.ts` | `23.53%` | `559` | Projects v2 query, normalizer, validation, and input tests |
| `src/tools/sub-issue.ts` | `31.05%` | `504` | Additional native sub-issue branch and partial-success tests |
| `src/tools/bulk-issues.ts` | `26.40%` | `368` | Bulk action matrix tests |

Important caveat: Node/V8 coverage for TypeScript can mark type declarations, object-shape lines, multi-line literals, and comments as uncovered. The implementation should optimize for meaningful behavioral coverage, not artificial coverage hacks.

## Solution Approach

Add focused tests in small batches, ordered by coverage return and risk:

1. Establish a repeatable before/after coverage baseline.
2. Add pure/helper tests where no GitHub or filesystem mocking is needed.
3. Add fake-fetch GitHub client tests for direct REST and GraphQL methods.
4. Add filesystem tests for local issue cache validation and safety branches.
5. Add tool-level tests for remaining mutation, partial-success, and validation branches.
6. Re-rank coverage after each batch and stop when the target improvement is met or remaining uncovered lines are not worth testing.

Keep production behavior unchanged. Production-code edits are out of scope unless a small testability export is explicitly discussed and approved during implementation.

## Relevant Files

Use these files to complete the task:

- `package.json` - Confirms the Node test runner and `test:coverage` script.
- `scripts/test-coverage.mjs` - Generates `coverage/lcov.info` for Sonar and local coverage analysis.
- `sonar-project.properties` - Points Sonar to `coverage/lcov.info`.
- `src/tools/runtime.ts` - Shared runtime, result normalization, truncation, safe-error, creator-scope, and helper logic.
- `src/github/client.ts` - High-level GitHub REST/GraphQL client methods using fake `fetchFn` in tests.
- `src/github/transport.ts` - Lower-level request, retry, pagination, and response behavior.
- `src/github/projects-client.ts` - Projects v2 query builders, normalizers, validation, and value input helpers.
- `src/github/sub-issues-client.ts` - Native sub-issue query/mutation helpers and relationship normalizers.
- `src/github/development-links-client.ts` - Development-link GraphQL normalizers and edge cases.
- `src/issues/store.ts` - Local issue file scanning, validation, repository scoping, safe reads/writes, and stale cleanup.
- `src/issues/format.ts` - GitHub issue to cache/tool summary conversion and relationship formatting.
- `src/commands/config-tui.ts` - TUI snapshot renderer, keyboard handling, value editing, ANSI/Unicode width helpers.
- `src/commands/issueme-command.ts` - `/issueme` command parsing, help/info/start/config branches.
- `src/tools/*.ts` - Tool registration and execution branches for list, mutation, cache refresh, partial success, and validation.
- `test/*.test.mjs` - Existing Node test suite patterns to follow.

### New Files

Likely new test files:

- `test/runtime-coverage.test.mjs` - Runtime helper, truncation, and safe-error coverage.
- `test/github-client-coverage.test.mjs` - Direct fake-fetch coverage for GitHub client methods not fully exercised by tool tests.
- `test/projects-client-normalizers.test.mjs` - Pure Projects v2 query/normalizer/input coverage.
- `test/issue-store-validation.test.mjs` - Cache-store invalid-file and validation branch coverage.
- `test/config-tui-coverage.test.mjs` - Additional TUI snapshot and interaction branch coverage.
- `test/bulk-tool-coverage.test.mjs` - Additional bulk action matrix coverage.

Reuse existing test files instead of creating new files when that keeps related scenarios together and avoids duplication.

## Implementation Phases

### Phase 1: Baseline and Fast Pure Coverage

- Capture the current `coverage/lcov.info` state.
- Add direct unit tests for exported pure helpers and deterministic formatters.
- Prioritize `src/tools/runtime.ts` and `src/github/projects-client.ts`.

### Phase 2: Fake-Fetch Client Coverage

- Add fake `fetchFn` tests for direct `GitHubClient` methods that are currently mostly covered only indirectly.
- Cover REST and GraphQL success, validation failure, permission failure, idempotent no-op, and malformed response paths.

### Phase 3: Filesystem and Tool Branch Coverage

- Add temporary-directory tests for issue store/cache paths.
- Add tool-level tests for less common partial-success, abort, validation, and result-rendering branches.

### Phase 4: Coverage Re-rank and Polish

- Re-run coverage.
- Re-rank remaining hotspots from `coverage/lcov.info`.
- Add targeted follow-up tests only where they verify meaningful behavior.
- Confirm all validation commands pass.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom. Mark each task with `x` only after its acceptance criteria pass.

### 1. Confirm and Record the Coverage Baseline

- [ ] Re-run the current test suite with coverage before adding tests.

#### Why

A fresh baseline prevents measuring against stale local coverage and helps identify whether Sonar and local coverage differ materially.

#### How

- Run `npm run test:coverage`.
- Parse `coverage/lcov.info` to rank files by missing lines.
- Optionally query Sonar with `analyseme_get_project_summary` after CI/Sonar has processed the latest coverage report.
- Do not change source or tests in this task.

#### Where

- `coverage/lcov.info`
- `scripts/test-coverage.mjs`
- `sonar-project.properties`

#### Acceptance criteria

- The full test suite passes before new coverage work starts.
- A before/after note is added to the implementation PR or task log with:
  - total tests passing,
  - local line/branch/function coverage,
  - top 10 files by missing lines,
  - Sonar coverage if available.

### 2. Add Runtime Helper and Truncation Tests

- [ ] Add focused tests for runtime result normalization, truncation, safe errors, and creator-scope behavior.

#### Why

`src/tools/runtime.ts` is the largest uncovered file and contains shared behavior used by every tool. Tests here should provide high coverage ROI and protect public tool result semantics.

#### How

Create or extend `test/runtime-coverage.test.mjs` with cases for:

- `issueMeResultPolicyPromptGuideline` formatting.
- `normalizeRuntimeRepository` valid string, valid object, malformed repository, and inconsistent object fields.
- `isProjectTrusted` and `assertTrustedProject` trusted/untrusted paths.
- `allowedIssueCreator`, `isCreatorScopeRestricted`, `issueCreatorMatchesConfig`, `issueCreatorScopeLabel`, and `assertIssueCreatorAllowed` for:
  - default/all creator scope,
  - exact allowed login,
  - case-insensitive login match,
  - legacy records without creator,
  - GitHub REST issue shape with `user.login`,
  - GraphQL/user node shapes where currently supported.
- `assertAuthenticatedUserAllowedForCreate` with fake runtime client success and mismatch failure.
- `sanitizeStringList`, `sanitizeGitHubLoginList`, `requireNonEmptyStrings`, `requireNonEmptyGitHubLogins`, `requireNonEmptyTitle`, and `normalizeIssueBody` edge cases.
- `safeToolError` redaction and detail sanitization for:
  - `IssueMeError`,
  - `GitHubApiError`,
  - generic `Error`,
  - non-error thrown values,
  - sensitive keys such as token/password/secret/body.
- `partialSuccessToolError` and `partialSuccessToolText` keep recovery guidance and do not throw.
- `toolText` and `boundToolDetails` truncation for oversized:
  - content text,
  - issue summaries,
  - comments,
  - labels,
  - milestones,
  - assignees,
  - project summaries,
  - project fields/options/iterations,
  - development links,
  - bulk results,
  - paths and changed fields.

#### Where

- `src/tools/runtime.ts`
- `test/runtime-coverage.test.mjs`
- Existing related files:
  - `test/error-taxonomy.test.mjs`
  - `test/tool-failure-semantics.test.mjs`
  - `test/tool-detail-consistency.test.mjs`

#### Acceptance criteria

- Runtime tests cover successful and failing branches without real GitHub calls.
- No test output contains fake token values except through explicit redaction assertions.
- `npm run test -- test/runtime-coverage.test.mjs` equivalent targeted run passes, or the full `npm run test` passes if the runner does not support a single-file script.
- `npm run test:coverage` shows `src/tools/runtime.ts` coverage improved.

### 3. Add Projects v2 Client Normalizer Tests

- [ ] Add direct unit tests for Projects v2 query builders, validators, limit normalizers, and field value normalization.

#### Why

`src/github/projects-client.ts` has large uncovered pure-helper surface that can be tested without network access. These tests should be fast, deterministic, and high signal.

#### How

Create or extend `test/projects-client-normalizers.test.mjs` with cases for:

- `buildProjectsV2ListQuery` for repository, organization, and user scopes.
- `buildProjectV2FieldsByIdQuery`, `buildProjectV2FieldsByNumberQuery`, `buildProjectV2AddValidationQuery`, `buildAddIssueToProjectV2Mutation`, `buildUpdateProjectV2ItemFieldValueMutation`, and `buildProjectV2ItemValidationQuery` include expected operation names and fragments.
- `extractProjectV2Connection` and `extractProjectV2FieldProject` for repository/org/user data and missing data.
- `normalizeProjectV2Summary` for:
  - repository-owned project,
  - user-owned project,
  - organization-owned project,
  - closed/public flags,
  - missing required fields.
- `normalizeProjectV2FieldSummary` for:
  - single-select fields with bounded options,
  - iteration fields with current and completed iterations,
  - text/number/date fields,
  - unknown field types,
  - truncation metadata.
- `normalizeProjectV2ItemMutationResult` for add/update mutation shapes and missing item failures.
- `assertProjectV2AllowedForAdd` for allowed repository default, allowed explicit scope/owner, wrong owner, closed project, and inaccessible project.
- `assertProjectV2ItemTargetsIssue` for project mismatch, non-issue content, repository mismatch, issue-number mismatch, and closed issue content.
- `normalizeProjectV2Query`, `normalizeProjectV2ListLimit`, `normalizeProjectV2Scope`, `normalizeProjectV2Owner`, `normalizeProjectV2AddValidationPolicy`, `normalizeProjectV2Id`, `normalizeProjectV2IdRequired`, `normalizeProjectV2FieldValueInput`, `normalizeProjectV2ProjectNumber`, `normalizeProjectV2FieldLimit`, `normalizeProjectV2OptionLimit`, and `normalizeProjectV2IterationLimit` edge cases.

#### Where

- `src/github/projects-client.ts`
- `test/projects-client-normalizers.test.mjs`
- Existing related file: `test/projects-tool.test.mjs`

#### Acceptance criteria

- Tests do not require GitHub or Pi runtime objects.
- Both valid and invalid Projects v2 shapes are covered.
- Error assertions check safe error codes/details instead of brittle full messages.
- `npm run test:coverage` shows `src/github/projects-client.ts` coverage improved.

### 4. Add Direct GitHub Client Method Tests

- [ ] Add fake-fetch tests for GitHub client methods that remain weakly covered through tool-level tests.

#### Why

`src/github/client.ts` is a high-impact integration layer. Direct tests can cover request construction, response normalization, GraphQL variables, idempotency, and method-specific validation more precisely than tool tests.

#### How

Create or extend `test/github-client-coverage.test.mjs` with a reusable fake-fetch harness and cases for:

- REST methods:
  - `createIssue`, `updateIssue`, `closeIssue`, `reopenIssue`, `ensureIssueOpen`, `listComments`, `getIssueComment`, `createComment`, `updateComment`, `deleteComment`, `addAssignees`, `removeAssignees`, `setLabels`, `addLabels`, `removeLabel`, `listLabels`, `listMilestones`, `listAssignees`.
- Repository label and milestone management:
  - create/update/delete success,
  - duplicate conflict,
  - missing resource,
  - permission failure.
- GraphQL methods:
  - `listProjectsV2`, `getProjectV2Fields`, `addIssueToProjectV2`, `updateProjectV2ItemField`, `listIssueDevelopmentLinks`, native sub-issue add/remove/list/reorder methods.
- Shared client behavior:
  - request URLs stay inside `owner/repo`,
  - authorization header is sent but never leaked in errors,
  - abort signal prevents extra requests,
  - pagination stops at configured limits,
  - malformed response bodies map to safe `GitHubApiError`.

#### Where

- `src/github/client.ts`
- `src/github/transport.ts`
- `test/github-client-coverage.test.mjs`
- Existing related files:
  - `test/github-client.test.mjs`
  - `test/github-client-remediation.test.mjs`

#### Acceptance criteria

- Tests use fake `fetchFn`; no live GitHub calls.
- REST and GraphQL method assertions include path, method, body, query variables, and safe error behavior.
- Existing client tests remain green.
- `npm run test:coverage` shows `src/github/client.ts` and likely `src/github/transport.ts` coverage improved.

### 5. Add Issue Store Validation and Format Tests

- [ ] Add filesystem-backed tests for local cache validation, invalid records, duplicate lookups, relationship metadata, and safe cleanup.

#### Why

`src/issues/store.ts` and `src/issues/format.ts` contain critical local-state safety logic. Additional tests here improve coverage and protect against unsafe cache reads/writes.

#### How

Create or extend `test/issue-store-validation.test.mjs` with temporary directories and cases for:

- `readIssueFile` rejects invalid JSON and invalid issue records with actionable diagnostic reasons.
- `listIssueFileEntries` reports invalid files but continues scanning valid issue files.
- Invalid record variations:
  - wrong schema version,
  - malformed repository,
  - unsafe issue number,
  - missing/blank title,
  - invalid state,
  - invalid labels/assignees,
  - malformed milestone,
  - invalid timestamps,
  - wrong issue URL repository/number,
  - invalid comment URLs or comment metadata,
  - malformed parent/sub-issue relationship metadata.
- `findIssueByLookup` and `readIssueByLookup` filename/slug/title/numeric lookup branches, including ambiguous matches.
- `removeClosedIssueFiles` removes only matching repository/closed records and leaves invalid or foreign-repository files untouched.
- `writeIssueRecord` repository collision branch and unchanged/write/rename behavior where not already covered.
- `githubIssueToRecord`, `issueRecordToToolSummary`, and `formatIssueSummary` for pull-request filtering, creator metadata, comments, relationship summaries, and truncation-friendly fields.

#### Where

- `src/issues/store.ts`
- `src/issues/format.ts`
- `test/issue-store-validation.test.mjs`
- Existing related file: `test/foundation.test.mjs`

#### Acceptance criteria

- Tests use isolated `mkdtemp` directories.
- Tests do not depend on existing repository `issues/` contents.
- Invalid-file assertions verify structured diagnostics where exposed.
- `npm run test:coverage` shows `src/issues/store.ts` and `src/issues/format.ts` coverage improved.

### 6. Add Native Sub-Issue and Development-Link Client Tests

- [ ] Add focused tests for native sub-issue and development-link client helpers and tool branches not covered by existing tests.

#### Why

`src/github/sub-issues-client.ts`, `src/github/development-links-client.ts`, and `src/tools/sub-issue.ts` remain coverage hotspots despite existing integration tests. Direct client/helper tests can cover normalization and edge branches that are hard to reach from tools.

#### How

Add tests in a new file or extend existing sub-issue/development-link tests for:

- Sub-issue client helpers:
  - relationship query shape,
  - limit normalization min/max/default,
  - reorder number normalization,
  - incomplete reorder list failure,
  - mutation result normalization for add/remove/reprioritize,
  - parent/child summary normalization with missing author or invalid state,
  - permission/unsupported GraphQL error mapping.
- Tool-level branches:
  - `issueme_add_sub_issue` idempotent existing relationship where supported by current behavior,
  - `issueme_remove_sub_issue` when no relationship remains,
  - `issueme_reorder_sub_issues` already-in-order input,
  - `issueme_list_sub_issues` with parent-only, child-only, and truncated mixed relationships,
  - cache refresh failures after successful remote mutation.
- Development links:
  - multiple event source types,
  - branch/commit/PR merge keys,
  - duplicate links merged deterministically,
  - unknown GraphQL states safely ignored or normalized.

#### Where

- `src/github/sub-issues-client.ts`
- `src/github/development-links-client.ts`
- `src/tools/sub-issue.ts`
- `test/sub-issue-tool.test.mjs`
- `test/development-links-tool.test.mjs`

#### Acceptance criteria

- Tests remain fake-fetch/local-only.
- Sub-issue tests cover success, validation failure, permission failure, unsupported API, and cache partial-success paths.
- `npm run test:coverage` shows coverage improved for at least one of:
  - `src/github/sub-issues-client.ts`,
  - `src/github/development-links-client.ts`,
  - `src/tools/sub-issue.ts`.

### 7. Add Bulk Issue Operation Matrix Tests

- [ ] Add missing matrix coverage for each bulk action and failure mode.

#### Why

`src/tools/bulk-issues.ts` has many action-specific branches. Existing tests cover important paths, but more matrix coverage should raise coverage and prevent regressions in partial-success behavior.

#### How

Create or extend `test/bulk-tool-coverage.test.mjs` with cases for:

- `add_labels`:
  - empty labels rejected,
  - duplicate labels de-duplicated,
  - missing repository label failure,
  - partial success after one issue succeeds.
- `assign`:
  - unassignable user failure,
  - multiple users normalized,
  - continue-on-error behavior.
- `set_milestone`:
  - valid milestone assignment,
  - invalid milestone number,
  - missing milestone API failure.
- `add_to_project`:
  - project id required,
  - GraphQL item result returned,
  - project validation failure.
- `close`:
  - default reason,
  - `completed`,
  - `not_planned`,
  - already closed cleanup,
  - abort after remote mutation before local cleanup.
- Cross-cutting:
  - duplicate issue numbers,
  - unsafe issue numbers,
  - empty issue list rejected by schema/normalizer,
  - `continueOnError: false` skips remaining issues,
  - `continueOnError: true` records mixed statuses.

#### Where

- `src/tools/bulk-issues.ts`
- `test/bulk-issues-tool.test.mjs`
- `test/bulk-tool-coverage.test.mjs`

#### Acceptance criteria

- Each bulk action has at least one success and one failure/validation test.
- Partial-success assertions verify `details.result`, `details.status`, per-issue statuses, and `needsSync` where applicable.
- `npm run test:coverage` shows `src/tools/bulk-issues.ts` coverage improved.

### 8. Add Command and Configuration TUI Branch Tests

- [ ] Add coverage for remaining command and TUI rendering/input branches.

#### Why

`src/commands/config-tui.ts` and `src/commands/issueme-command.ts` have large rendering/input surfaces with many width, focus, edit, and command-mode branches.

#### How

Extend existing TUI and command tests for:

- `renderConfigTuiSnapshot` states:
  - each category selected,
  - settings focus with each setting selected,
  - editing mode for scalar/list/path settings,
  - invalid draft value,
  - unsaved changes footer,
  - empty search results,
  - wide/narrow/tiny width boundaries,
  - ANSI-styled theme values,
  - long Unicode and emoji text.
- `IssueMeConfigTui` interaction:
  - up/down navigation wraps or clamps as designed,
  - enter switches focus or starts editing,
  - backspace/delete/edit clear behavior,
  - escape cancel editing vs close TUI,
  - auto-save path,
  - explicit no-change finish path,
  - save error/validation result path if exposed by current public API.
- `/issueme` command branches:
  - alias parsing,
  - unknown subcommand,
  - trusted vs untrusted project paths,
  - config command with/without terminal-capable UI,
  - start command with default skill path and explicit skill path,
  - info command with invalid config and env status.

#### Where

- `src/commands/config-tui.ts`
- `src/commands/issueme-command.ts`
- `test/config-tui-renderer.test.mjs`
- `test/command-and-tui.test.mjs`

#### Acceptance criteria

- Snapshot assertions are deterministic and width-bounded.
- Interaction tests do not require a real terminal.
- Tests preserve existing artifact expectations in `test/tui-artifacts.test.mjs`.
- `npm run test:coverage` shows command/TUI coverage improved.

### 9. Add Remaining Tool Branch Tests by Coverage Re-rank

- [ ] After tasks 2-8, re-rank coverage and add a final targeted batch for the next highest meaningful tool hotspots.

#### Why

Coverage hotspots will change after earlier tasks. A re-rank avoids spending time on already-improved files or type-only uncovered lines.

#### How

Use the refreshed `coverage/lcov.info` to decide which files deserve final test additions. Likely candidates include:

- `src/tools/manage-milestone.ts`
- `src/tools/manage-label.ts`
- `src/tools/projects.ts`
- `src/tools/list-issues.ts`
- `src/tools/list-labels.ts`
- `src/tools/list-milestones.ts`
- `src/tools/list-assignees.ts`
- `src/tools/sync-issues.ts`
- `src/tools/comment-issue.ts`
- `src/tools/get-issue.ts`
- `src/tools/reopen-issue.ts`
- `src/tools/close-issue.ts`
- `src/tools/create-issue.ts`
- `src/tools/update-issue.ts`
- `src/tools/label-issue.ts`
- `src/tools/assign-issue.ts`

For each selected file, add at least one of each meaningful branch type where missing:

- success with full details,
- validation failure before runtime resolution,
- handled GitHub/domain failure with safe details,
- partial success after remote mutation but before cache update,
- abort behavior,
- truncation/bounded output behavior,
- creator-scope restriction behavior.

#### Where

- `src/tools/*.ts`
- Existing corresponding `test/*-tool.test.mjs` files

#### Acceptance criteria

- Final selected tests are justified by refreshed coverage data.
- No duplicate tests are added for behavior already covered by earlier tasks.
- Each added test asserts public tool result contracts, not private implementation details.
- Coverage improves for every file selected in this task, unless the uncovered lines are confirmed to be type-only or non-executable under V8 coverage.

### 10. Validate, Compare, and Document Coverage Gains

- [ ] Run final validation and record before/after coverage results.

#### Why

The goal is not just passing tests; the repository needs measurable coverage improvement and confidence that test additions did not change behavior.

#### How

- Run `npm run test`.
- Run `npm run test:coverage`.
- Run `npm run lint` if test changes touch formatting or TypeScript import patterns.
- If CI/Sonar is available after merge or PR update, query `analyseme_get_project_summary` to confirm Sonar coverage changed.
- Compare new `coverage/lcov.info` against the baseline from task 1.

#### Where

- `coverage/lcov.info`
- `package.json`
- `sonar-project.properties`

#### Acceptance criteria

- Full test suite passes.
- Coverage report is generated successfully.
- Local coverage improves from the task-1 baseline.
- Sonar coverage improves from `42.9` once the new coverage report is scanned, or the PR notes explain why Sonar has not updated yet.
- No production behavior changes are included unless explicitly approved during implementation.

## Testing Strategy

Use the existing Node test runner only:

- Prefer direct unit tests for pure exported helpers.
- Use fake `fetchFn` for GitHub REST/GraphQL behavior.
- Use `mkdtemp` and isolated directories for filesystem/cache tests.
- Avoid live GitHub calls, real Pi sessions, or network access.
- Assert stable public contracts:
  - returned `details.result`, `details.status`, `details.needsSync`, and `details.cacheUpdated`,
  - safe error codes/details,
  - mutation request path/method/body,
  - cache file effects in temp directories.
- Avoid brittle full-message snapshots unless the message is a documented public contract.
- Do not add tests that exist only to execute type-only lines or object literal declarations without behavioral value.

## Acceptance Criteria

- A coverage baseline is recorded before implementation starts.
- New tests are added in focused batches matching the tasks above.
- All tests are local, deterministic, and token-safe.
- `npm run test` passes.
- `npm run test:coverage` passes and writes `coverage/lcov.info`.
- Coverage increases measurably from the baseline, with the first pass prioritizing the largest hotspots.
- Sonar coverage is expected to improve from `42.9` after CI/Sonar scans the updated `coverage/lcov.info`.
- Existing public tool contracts and command behavior remain unchanged.

## Validation Commands

Execute these commands to validate the task is complete:

- `npm run test` - Run the full Node test suite.
- `npm run test:coverage` - Generate coverage and `coverage/lcov.info` for local/Sonar comparison.
- `npm run lint` - Run typecheck, ESLint, format check, and script syntax checks after test additions.
- `npm run check:pack` - Confirm added tests do not affect package contents.

Optional investigation commands for implementers:

- `node -e "const fs=require('fs');const text=fs.readFileSync('coverage/lcov.info','utf8');const rows=text.split('end_of_record').map(s=>s.trim()).filter(Boolean).map(rec=>{let sf='',lf=0,lh=0;for(const line of rec.split(/\r?\n/)){if(line.startsWith('SF:'))sf=line.slice(3);if(line.startsWith('LF:'))lf=+line.slice(3);if(line.startsWith('LH:'))lh=+line.slice(3);}return {sf,lf,lh,missing:lf-lh,pct:lf?lh/lf*100:100};}).sort((a,b)=>b.missing-a.missing).slice(0,20);console.table(rows);"` - Rank remaining missing lines after a coverage run.

## Notes

- This spec intentionally does not implement tests yet.
- Keep changes test-only unless a testability change is explicitly discussed.
- Do not reduce `sonar.sources`, remove files from coverage, or add coverage exclusions to inflate the metric.
- Do not commit generated `coverage/` or `tmp/` artifacts.
- Existing uncommitted work may be present in the repository; do not overwrite unrelated changes while implementing these tasks.
