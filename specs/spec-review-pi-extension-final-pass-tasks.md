# Final-pass Pi extension review tasks

## Review scope and date

- Date: 2026-06-29
- Scope: strict final verification of IssueMe core behavior, Pi extension lifecycle, command/tool registration, public tool contracts, edge cases, tests, previous review assumptions, and unresolved unknowns.
- Review mode: planning only. No implementation work was performed.

## Files or areas reviewed

- Generated first/second review specs from this session and selected existing project specs/contracts.
- Pi extension entry and lifecycle: `src/extension.ts`, `package.json` `pi.extensions`, `scripts/smoke-observability.mjs`, `scripts/smoke-handler-execution.mjs`, `scripts/smoke-packaged-install.mjs`.
- Commands and UI: `src/commands/issueme-command.ts`, `src/commands/config-tui.ts`, command/TUI tests and snapshots.
- Public tools and contracts: `src/tools/*.ts`, `src/tools/inventory.ts`, `src/contracts.ts`, `docs/public-contracts.md`, `test/extension-registration.test.mjs`, `test/public-contracts.test.mjs`, `test/tool-*.test.mjs`.
- Core state/network modules: `src/github/client.ts`, `src/issues/store.ts`, `src/config/config.ts`, `src/utils/*.ts`.
- Packaging and distribution: `package.json`, `scripts/check-package-contents.mjs`, packed smoke output.

## Previous claims or assumptions verified

- Verified by source and tests: extension default export only registers `/issueme` and tools; no background watcher/timer/server is started in the factory.
- Verified by `package.json` and packed smoke: Pi extension entry is `./src/extension.ts` and the packed package discovers one command plus 28 `issueme_*` tools.
- Verified by registration tests: mutating/cache-refresh tools declare `executionMode: "sequential"`; schemas are strict and avoid provider-hostile union/literal/nullable patterns.
- Verified by source/tests: tools require project trust before project-local reads; `.env` is ignored in untrusted command paths; local config/cache paths have symlink/path checks; package contents exclude `.env`, `.pi`, specs, issues, caches, reports, tarballs, and `node_modules`.
- Partially verified: native sub-issues, Projects v2, development links, and GitHub REST behavior are heavily mocked but were not live-tested in this session.
- Partially verified: TUI renderer snapshots and fake command contexts pass; a real interactive Pi TUI session was not exercised.
- Blocked: live GitHub permissions, rate limits, Projects v2 board access, native sub-issue availability, and actual terminal key behavior require external credentials/UI.

## Commands run and results

- `npm run typecheck` — passed.
- `npm run format:check` — passed before review spec creation and again after all three review specs were written (117 files).
- `npm test` — passed, 246 tests.
- `npm run check:pack` — passed.
- `npm audit --audit-level=low` — passed, 0 vulnerabilities.
- `npm run smoke:handlers` — passed checkout and packed handler smoke with temporary directories and mocked GitHub calls.
- `npm run smoke:packaged` — passed packed package command/tool discovery.
- `git status --short`, `git diff --stat` — read-only inspection of pre-existing uncommitted changes.

## Findings summary by severity and category

- High / Verification Coverage: packed handler smoke executes only a small subset of handlers, leaving some public tools verified only by checkout unit tests.
- Medium / Pi Lifecycle: command/TUI behavior is tested with fake contexts and renderer snapshots, but not through a real interactive Pi TUI lifecycle.
- Medium / Concurrency/Lifecycle: sequential execution is asserted in registrations, but same-turn Pi scheduling and file-mutation queue behavior are not stress-tested through the actual Pi tool runner.
- Medium / Live API Unknowns: native sub-issues, Projects v2, and development links cannot be fully validated without opt-in live credentials and repository fixtures.

## Ordered tasks

- [ ] Expand packed-package handler smoke to exercise every public IssueMe tool at least once

#### Why

`npm run smoke:handlers` currently verifies command fallback, trust refusal for one tool, and one injected read-only success path (`issueme_list_labels`) against checkout and packed modules. Unit tests cover the rest in the checkout, and packed discovery proves registration, but it does not prove every packed handler can execute with production-style module resolution and injected runtime dependencies.

#### How to resolve

- Extend `scripts/smoke-handler-execution.mjs` or add a companion smoke script that invokes each registered `issueme_*` handler in the packed package with safe injected config, repository, token, and mocked `fetchFn` or injected `GitHubClient`.
- Use one minimal success or expected safe-failure scenario per tool; do not make live GitHub calls or remote mutations.
- Keep temporary directories scrubbed of real `GH_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_REPOSITORY` values.
- Assert each result is either the expected Pi error, `details.result: "success"`, expected `partial_success`, or expected structured `result:error`.
- Validate with `npm run smoke:handlers`, `npm run smoke:packaged`, and `npm test`.

#### Acceptance criteria

- Every tool in `ISSUEME_TOOL_NAMES` has at least one packed-handler smoke execution path.
- The smoke report identifies which tools were invoked and which network calls were mocked.
- No project `.env`, live GitHub call, remote mutation, or persistent repository artifact is used.
- Packed handler smoke fails if any public handler cannot load or execute in the packaged install shape.

- [ ] Add real Pi command and config TUI lifecycle verification

#### Why

The `/issueme` command and `IssueMeConfigTui` renderer are covered by fake contexts and deterministic snapshots, while packed smoke verifies command discovery and an untrusted fallback handler. That still leaves actual `ctx.ui.custom()` integration, interactive close/save behavior, mode guards, and terminal key handling unverified in a real Pi TUI lifecycle.

#### How to resolve

- Add a documented manual or automated TUI verification flow using `pi --no-extensions -e .` in a temporary trusted project.
- If automation is practical, drive Pi RPC/TUI enough to verify `/issueme`, `/issueme info`, and `/issueme start` mode behavior without exposing secrets.
- Verify that opening config in TUI mode renders, edits a non-secret setting, validates invalid input, saves only `.pi/agent/issueme.json`, and closes cleanly.
- Verify non-TUI/RPC/print-safe fallbacks remain non-interactive and do not attempt `ctx.ui.custom()`.
- Record blockers if true terminal automation is not practical in CI.

#### Acceptance criteria

- Real Pi lifecycle evidence exists for `/issueme` config behavior or a documented blocker explains why it remains manual.
- The verification proves no secrets are read/written during the TUI check.
- Mode-specific behavior is covered for TUI and at least one non-TUI mode.
- Validation commands still pass after any test harness additions.

- [ ] Stress-test same-issue sequential execution and file mutation queues through a Pi-like runner

#### Why

Registration tests assert mutating tools are sequential, and unit tests cover cache mutation helpers directly. The final unresolved Pi-specific risk is whether same-turn sibling tool calls that target the same issue/cache path remain ordered when executed through Pi's actual tool scheduling and file-mutation queue behavior, especially around partial-success and abort paths.

#### How to resolve

- Add an integration test or smoke harness that invokes representative sibling tool calls concurrently through the same execution path Pi uses for registered tools, or document the closest available Pi runner API.
- Cover at least one local cache write/write race, one write/remove race, and one abort-before-local-mutation case.
- Use temporary projects and mocked GitHub responses only.
- Assert final cache files are deterministic, not lost updates from parallel read-modify-write windows.
- Keep existing unit tests for `withCanonicalFileMutationQueue()` and sequential registration.

#### Acceptance criteria

- Same-issue mutation ordering is verified beyond static `executionMode` metadata.
- Race tests leave deterministic issue-cache state and clean temporary artifacts.
- Abort-path tests prove no local cache write/remove occurs after cancellation checkpoints.
- The test can run in CI or is documented with exact blocker and manual command.

- [ ] Create an opt-in live GitHub verification matrix for API features that mocks cannot prove

#### Why

Mocked tests validate request construction and local behavior, but they cannot prove that GitHub currently accepts every GraphQL field/mutation, permission mode, close reason, native sub-issue operation, Projects v2 field update, and development-link query against a real account. This session intentionally did not use credentials or live issues.

#### How to resolve

- Define an opt-in live test matrix that creates temporary issues/labels/milestones and cleans them up, with explicit exclusions or prerequisites for Projects v2 and native sub-issues where permissions/features vary.
- Reuse or extend the existing `.pi/skills/issueme-e2e-test` workflow as appropriate, noting that its current description excludes Projects v2 operations.
- Require environment preflights for repository, token scopes, Projects v2 access, native sub-issue availability, and cleanup permissions.
- Ensure the live suite never runs by default in CI and never logs tokens or private issue bodies.
- Record manual fallback steps for API features that cannot be reliably automated.

#### Acceptance criteria

- A documented opt-in live verification plan or script lists each IssueMe API family and required permissions.
- Temporary live artifacts are named, bounded, and cleaned up even on failure where possible.
- Projects v2/native sub-issue/development-link unknowns are either covered or explicitly marked blocked with exact prerequisites.
- Default local validation remains fully mocked and credential-free.

## Unknowns resolved

- Package manager and validation path are npm-based and verified.
- Pi package dependency policy is consistent with Pi docs: Pi core packages are peer dependencies and packed smoke supplies them.
- No extension lifecycle hooks, background resources, providers, or event handlers exist beyond command/tool registration.
- The current review specs are new files and did not overwrite existing project specs.

## Blocked checks or areas not reviewed

- Real GitHub API behavior with live credentials was not exercised.
- Real interactive TUI key handling was not exercised.
- Website/network documentation outside the local Pi docs and npm audit was not used.
- The pre-existing uncommitted implementation diff was reviewed as current project state but not modified.
