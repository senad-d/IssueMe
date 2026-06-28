# Plan: IssueMe Remediation Tasks

## Task Description

Review the current IssueMe implementation and define an ordered remediation backlog. This list fixes implementation, UX, design-standard, safety, test, documentation, packaging, and smoke-test issues found after the first implementation pass.

## Checkbox Policy

- A task heading uses `[ ]` until **all** acceptance criteria for that task are met.
- A task heading uses `[x]` only when the task is complete.
- Subtask checkboxes may be checked only when that exact sub-step is already complete.
- At this review point, no product-code remediation task is complete yet; only Task 0 is complete because it records this backlog review.

## Review Summary

Current implementation note: the remediation pass has addressed a large subset of this backlog, including source-of-truth notes, placeholder cleanup, project-root resolution, config TUI rendering, command parsing/help aliases, config/env/repository/path hardening, repository-aware cache operations, GitHub client pagination/error hardening, schema cleanup, sequential mutating tools, cache privacy defaults, CI validation, TUI visual artifacts, and documentation/source-of-truth reconciliation. Keep individual task checkboxes authoritative; do not treat unchecked tasks as complete without verifying acceptance criteria.

The first implementation compiles and has useful foundations, but it is not release-ready. Main gaps include:

- `/issueme` opens a raw JSON editor instead of the approved configuration TUI design standard.
- `/issueme info` and `/issueme help` are split when they should be one help/status surface.
- Command behavior is under-tested and not separated into parse/render/save helpers.
- Several tools need stricter schemas, safer defaults, better idempotency, partial-success handling, and bounded output/details.
- Local issue cache operations are not fully repository-aware and can remove files for the wrong repo.
- Local path checks are lexical only and need protection against dangerous directories and symlink escapes.
- GitHub REST methods need stricter response typing, pagination host/path boundaries, rate-limit/error handling, and response-shape validation.
- Repository/config/env helpers need edge-case handling for worktrees, nested cwd, unreadable `.env`, and common dotenv syntax.
- Placeholder/template source files remain in the repo.
- Specs and docs contain stale planning language that conflicts with the current partially implemented state.
- Smoke testing only proved process startup, not command/tool discovery.

## Step by Step Tasks

### 0. [x] Review and expand the remediation backlog

#### Why

The existing remediation list needed a second pass to capture missing issues, add resolution guidance, and make completion state explicit.

#### How to resolve

- [x] Review the current `src/`, `test/`, docs, package metadata, CI, and remediation task list.
- [x] Add missing issue categories found during review.
- [x] Add task-level acceptance criteria and resolution guidance.
- [x] Mark completed task(s) with `[x]`.

#### Acceptance criteria

- The remediation backlog contains clear, ordered tasks.
- Every task has a `How to resolve` section.
- Every task has acceptance criteria.
- Completed tasks are marked with `[x]`.

### 1. [x] Re-establish current scope and source of truth

#### Why

The repository now has a partially implemented runtime, while older specs still say implementation is future/planning-only. Contributors need one clear source of truth before modifying behavior.

#### How to resolve

- [x] Re-read `docs/PROJECT_DEFINITION_BRIEF.md`, `specs/spec-architecture.md`, `specs/spec-guidelines.md`, `specs/spec-configuration-tui-design-standard.md`, `specs/spec-tasks.md`, and this file.
- [x] Decide whether this remediation file supersedes `specs/spec-tasks.md` or whether `specs/spec-tasks.md` stays as historical implementation-pass evidence.
- [x] Add a short note to stale specs/docs pointing readers to this remediation file for the next pass.
- [x] Confirm scope remains direct GitHub APIs only, no GitHub CLI, no webhooks, no mutation of closed issues.

#### Acceptance criteria

- There is no ambiguity about which task list drives the next implementation pass.
- Scope still says direct GitHub APIs only, no GitHub CLI, no webhooks, and no closed-issue mutation.
- Docs no longer imply the current code is release-ready before remediation is complete.

### 2. [x] Remove preparation/template leftovers safely

#### Why

`src/commands/example-command.ts`, `src/tools/example-tool.ts`, `src/events/lifecycle.ts`, and `src/utils/format.ts` are preparation/template leftovers. Keeping them creates confusion and package-maintenance risk.

#### How to resolve

- [x] Delete or consolidate `src/commands/example-command.ts`.
- [x] Delete or consolidate `src/tools/example-tool.ts`.
- [x] Delete `src/events/lifecycle.ts` if no lifecycle hooks are intentionally registered.
- [x] Delete `src/utils/format.ts` if it is not used by real runtime behavior.
- [x] Update `package.json`, `docs/STRUCTURE.md`, and package-content tests after cleanup.

#### Acceptance criteria

- No placeholder/example modules remain unless explicitly used and documented.
- `src/extension.ts` still imports only real registration modules.
- `npm run typecheck` passes.
- `npm run check:pack` excludes specs, `.pi`, `.env`, `issues`, caches, reports, tarballs, and local state.

### 3. [x] Introduce a single project-root/path context helper

#### Why

Multiple modules currently assume `ctx.cwd` is the repository/project root. If Pi is launched from a nested directory, `.env`, `.git/config`, `.pi/agent/issueme.json`, and `issues/` may resolve incorrectly.

#### How to resolve

- [x] Add a helper that determines the project root for IssueMe operations.
- [x] Prefer Pi context root if available; otherwise discover the nearest Git root without shelling out.
- [x] Make config, env, repository, and issue-store modules use this root consistently.
- [x] Keep behavior documented for nested working directories.

#### Acceptance criteria

- Running from a nested directory resolves the same config, `.env`, repo, and issue directory as running from repo root.
- Repository discovery remains shell-free.
- Tests cover root cwd and nested cwd behavior.

### 4. [x] Redesign command parsing around one help/status surface

#### Why

`/issueme info` and `/issueme help` should be the same user-facing command surface. Current parsing also treats any string beginning with `start` as the start subcommand.

#### How to resolve

- [x] Extract command parsing into a pure helper, for example `parseIssueMeCommand(args)`.
- [x] Parse exact subcommands only: empty, `info`, `help`, `--help`, `-h`, and `start`.
- [x] Make `/issueme info`, `/issueme help`, `/issueme --help`, and `/issueme -h` render the same combined help/status view.
- [x] Route unknown subcommands to the combined help/status view with a concise warning.
- [x] Keep `/issueme` with no args dedicated to configuration.

#### Acceptance criteria

- Info/help output is one command surface with usage, tool list, repo status, token presence, config path, issue directory, cache count, and troubleshooting hints.
- `/issueme starter` does not run the start workflow.
- Tests cover empty args, info/help aliases, start args, and unknown commands.

### 5. [x] Make command UI mode-safe

#### Why

Some command paths call `ctx.ui.notify` without checking `ctx.hasUI`, and the future config TUI must be guarded with `ctx.mode === "tui"`.

#### How to resolve

- [x] Audit every command handler for `ctx.hasUI` and `ctx.mode` checks.
- [x] Use `ctx.mode === "tui"` before custom TUI rendering.
- [x] Use `ctx.hasUI` before notifications/dialogs.
- [x] Provide safe non-TUI output via `pi.sendMessage` or returned command text where appropriate.

#### Acceptance criteria

- Commands behave safely in TUI, RPC, JSON, and print modes.
- No TUI-only component is attempted outside TUI mode.
- Tests cover no-UI and UI-capable command contexts.

### 6. [x] Implement the approved configuration TUI design standard

#### Why

The current `/issueme` configuration command opens a raw JSON editor, which does not follow `specs/spec-configuration-tui-design-standard.md`.

#### How to resolve

- [x] Create a dedicated config TUI component/module.
- [x] Implement wide mode with category and setting panes.
- [x] Implement narrow mode with one pane at a time.
- [x] Implement tiny mode with the no-border four-line fallback.
- [x] Use the `▶ ` selection marker and ` • ` footer separator.
- [x] Use theme roles instead of hardcoded ANSI colors.
- [x] Right-align values and clip/pad every line ANSI-safely.
- [x] Add search, focus state, keyboard help, save/cancel, and edit states.
- [x] Keep non-TUI fallback concise and non-interactive.

#### Acceptance criteria

- Wide screens use the two-pane framed layout.
- Narrow screens use the one-pane framed layout.
- Tiny screens use the no-border fallback.
- Rendered lines never exceed terminal width.
- No hardcoded ANSI colors are used.
- Config UI edits only non-secret settings.

### 7. [x] Validate configuration before saving

#### Why

Config persistence currently normalizes values but does not fully validate safety or semantics before writing.

#### How to resolve

- [x] Add a config validation function separate from raw normalization.
- [x] Validate `issueDirectory` with the final project-root helper.
- [x] Sanitize and deduplicate `defaultLabels` and `defaultAssignees`.
- [x] Decide whether `defaultSkillPath` can be absolute or must be project-local.
- [x] Reject secret-like keys at every nesting level.
- [x] Use a file mutation queue or equivalent full safe write window for `.pi/agent/issueme.json`.

#### Acceptance criteria

- Invalid config values are rejected with safe, actionable errors.
- Secret-like keys are never persisted.
- Config writes create only `.pi/agent/issueme.json` and needed parent directories.
- Tests cover path traversal, absolute paths, duplicate values, blank values, and secret-like keys.

### 8. [x] Add project-trust gates for project-local reads

#### Why

IssueMe reads project-local `.env`, `.git/config`, `.pi/agent/issueme.json`, and issue cache files. Those should not be silently honored in untrusted projects.

#### How to resolve

- [x] Define a trust policy for commands and tools.
- [x] Check `ctx.isProjectTrusted()` before honoring project-local config and `.env`.
- [x] Decide whether repository resolution from `.git/config` also requires trust.
- [x] Provide safe error/fallback behavior when project trust is missing.
- [x] Document trust behavior in README and SECURITY.

#### Acceptance criteria

- IssueMe does not silently honor project-local config or `.env` in untrusted projects.
- Trusted projects retain expected behavior.
- Tests cover trusted and untrusted contexts without live Pi startup.

### 9. [x] Harden repository resolution

#### Why

Repository resolution only reads `.git/config` directly under `cwd`; it does not handle worktrees, submodules, nested cwd, or `.git` files.

#### How to resolve

- [x] Support `.git` directories.
- [x] Support `.git` files containing `gitdir: ...`.
- [x] Support nested cwd by walking to the project/repo root without shelling out.
- [x] Keep `GITHUB_REPOSITORY` precedence over local Git config.
- [x] Add safe errors for missing origin, malformed origin, and non-GitHub origin.

#### Acceptance criteria

- Repository resolution works for normal checkouts, worktrees, submodules, nested cwd, and GitHub Actions.
- Error messages are safe and actionable.
- No shell/GitHub CLI commands are introduced.

### 10. [x] Harden `.env` parsing and token status behavior

#### Why

The current `.env` parser handles simple cases but fails common dotenv edge cases such as quoted values followed by comments. Token status can also fail the whole info command if `.env` is unreadable.

#### How to resolve

- [x] Correct parsing for `GH_TOKEN="abc" # comment`.
- [x] Support `export GH_TOKEN=...` consistently.
- [x] Preserve quoted `#` characters inside values.
- [x] Decide and document whether multiline values are unsupported.
- [x] Make `/issueme info/help` show token status as present/missing/error without throwing on unreadable `.env`.
- [x] Keep reading only known token keys.

#### Acceptance criteria

- `.env` parsing behaves predictably for common dotenv syntax.
- Token status never prints or returns token values.
- Tests cover comments, quoted values, escaped quotes, `export`, empty values, whitespace, quoted `#`, and unreadable `.env`.

### 11. [x] Protect dangerous issue-directory configurations

#### Why

A broad or protected issue directory could make IssueMe scan or mutate unintended project files.

#### How to resolve

- [x] Reject `issueDirectory` values that resolve to the project root.
- [x] Reject `.git`, `.pi`, `node_modules`, and other protected directories.
- [x] Reject path traversal and null bytes.
- [x] Add `issues/` to `.gitignore` so local cache files are not accidentally committed.
- [x] Document how users can intentionally share issue files later if desired.

#### Acceptance criteria

- `issueDirectory: "."`, `.git`, `.pi`, `node_modules`, and path-traversal values are rejected.
- Generated local issue cache files are ignored by git by default.
- Tests cover protected directories and normal valid directories.

### 12. [x] Make local path handling symlink-safe

#### Why

Current path checks are lexical. A symlink inside the project could point outside the project and cause IssueMe writes/removes outside the intended boundary.

#### How to resolve

- [x] Resolve existing directories/files with `realpath` where possible.
- [x] Prevent issue directories from resolving outside the project root through symlinks.
- [x] Prevent writes through symlinked target files.
- [x] Document behavior for symlinked issue directories.

#### Acceptance criteria

- IssueMe cannot write/remove issue files outside the project via symlinks.
- Tests cover symlinked issue directory and symlinked issue file cases where the platform supports symlinks.
- Safe valid paths continue to work.

### 13. [x] Fix local issue cache repository safety

#### Why

Issue cache operations are keyed mostly by issue number and path. If multiple repositories share an issue directory, sync/close can remove another repo's files.

#### How to resolve

- [x] Make listing, reading, writing, and removing issue files repository-aware.
- [x] Filter stale removals by current repository.
- [x] Include repository in lookup metadata.
- [x] Return safe ambiguity errors when issue number matches multiple repositories.

#### Acceptance criteria

- Syncing repo A never deletes repo B issue files.
- Closing issue `#1` in repo A never removes repo B `#1` file.
- Tests cover mixed-repository issue cache directories.

### 14. [x] Queue every local file mutation path

#### Why

Parallel tool calls can race. Some removals are queued, but stale title-file removals happen inside the queue for the new file instead of the stale file path.

#### How to resolve

- [x] Queue the target write path for every write.
- [x] Queue each stale-file removal by that stale file's real absolute path.
- [x] Queue closed-file removals consistently.
- [x] Review config writes and issue-store writes/removes for full read-modify-write queue windows.

#### Acceptance criteria

- Every local file write/remove participates in Pi's file mutation queue with the real absolute target path.
- Tests cover title rename and stale-file removal behavior.
- No read-modify-write/remove window mutates files outside its queue.

### 15. [x] Fix sync unchanged/updated semantics

#### Why

`synced_at` changes on every sync, causing unchanged issues to be rewritten/reported as updated.

#### How to resolve

- [x] Compare remote issue content excluding `synced_at`.
- [x] Preserve old `synced_at` when content is unchanged, or report sync timestamp separately.
- [x] Add a distinct outcome for title-slug filename rename.
- [x] Update sync counts and details to distinguish created, updated, renamed, unchanged, and removed.

#### Acceptance criteria

- Running sync twice against unchanged mocked GitHub data reports unchanged files on the second run.
- Title changes are reported as updates/renames, not misleading duplicate creates.
- Tests cover repeated sync and title rename.

### 16. [x] Improve corrupt/invalid local issue-file handling

#### Why

Invalid local issue JSON files are silently ignored during listing, which hides diagnostics and can make sync behavior hard to trust.

#### How to resolve

- [x] Return invalid-file diagnostics from listing helpers without exposing private file contents.
- [x] Validate labels, assignees, comments, URLs, timestamps, issue number, and repository more thoroughly.
- [x] Decide whether invalid files are quarantined, ignored with warnings, or left untouched with diagnostics.
- [x] Ensure invalid files are never silently deleted.

#### Acceptance criteria

- Invalid issue cache files are reported safely.
- Invalid issue cache files are not deleted by sync unless an explicit remediation policy says so.
- Tests cover corrupt JSON and invalid schema files.

### 17. [x] Improve `issueme_get_issue` lookup and refresh behavior

#### Why

`issueme_get_issue` recomputes local paths, requires a number for refresh, and returns the first fragment match even if lookup is ambiguous.

#### How to resolve

- [x] Make lookup helpers return `{ record, path, metadata }` instead of only a record.
- [x] Allow refresh by local lookup by resolving the cached issue number first.
- [x] Return the actual matched local path.
- [x] Return safe ambiguity errors for multiple title/slug matches.

#### Acceptance criteria

- Lookup by number, filename, slug, title fragment, and refresh are tested.
- Tool details include the actual local path.
- Ambiguous lookup does not return a random issue.

### 18. [x] Correct GitHub label endpoint response types and idempotency

#### Why

GitHub label endpoints return label arrays for add/set/remove label operations, but the client models some as issue responses. Missing-label behavior is also unclear.

#### How to resolve

- [x] Add a `GitHubLabelListResponse` type or equivalent.
- [x] Update `addLabels`, `setLabels`, and `removeLabel` return types.
- [x] Decide whether removing a missing label is idempotent or a safe error.
- [x] Document missing-label behavior.
- [x] Refresh the full issue after label changes to return final issue metadata.

#### Acceptance criteria

- TypeScript types match GitHub REST behavior.
- `issueme_label_issue` returns final labels after refresh.
- Missing-label behavior is tested and documented.

### 19. [x] Harden GitHub pagination and network boundaries

#### Why

Pagination currently follows any `rel="next"` URL returned in a Link header while sending the token. Network access should stay on GitHub REST endpoints for the current repo.

#### How to resolve

- [x] Validate every pagination URL before following it.
- [x] Only follow `https://api.github.com/repos/<owner>/<repo>/...` next links.
- [x] Reject off-host, off-repo, non-HTTPS, or malformed pagination URLs.
- [x] Map invalid JSON and unexpected response shapes to `GitHubApiError` safely.

#### Acceptance criteria

- Client never follows off-repo/off-host pagination links.
- API, network, abort, invalid JSON, invalid pagination, and unexpected shape errors are safe and tested.

### 20. [x] Add GitHub rate-limit and request-policy handling

#### Why

The client does not surface rate-limit guidance and does not define retry/backoff behavior. Large syncs can hit rate limits, especially when fetching comments for every issue.

#### How to resolve

- [x] Add a safe `User-Agent` header if needed for GitHub API hygiene.
- [x] Surface rate-limit status from `x-ratelimit-*` headers in safe details/errors.
- [x] Decide whether to retry transient 5xx/secondary-rate-limit responses or fail fast.
- [x] Document the chosen retry/backoff policy.

#### Acceptance criteria

- Rate-limit failures produce actionable safe errors.
- Retry behavior is deterministic and tested, or explicitly documented as unsupported.
- No token or request body content is leaked in rate-limit errors.

### 21. [x] Replace provider-hostile schemas

#### Why

LLM-facing schemas should avoid provider-hostile `Type.Union`/nullable patterns where possible. `issueme_update_issue` currently uses a nullable union for milestone.

#### How to resolve

- [x] Redesign milestone updates with explicit fields, such as `milestoneNumber` and `clearMilestone`, or an enum action.
- [x] Remove nullable union schemas from tool parameters.
- [x] Keep string enums implemented with `StringEnum` from `@earendil-works/pi-ai`.
- [x] Add schema inspection tests for all IssueMe tools.

#### Acceptance criteria

- Tool schemas are strict, provider-compatible, and unambiguous.
- No LLM-facing string enum uses `Type.Union`/`Type.Literal` instead of `StringEnum`.
- Tests catch reintroduction of provider-hostile schema patterns.

### 22. [x] Fix create/update default and sanitization semantics

#### Why

`issueme_create_issue` treats explicit empty arrays like omitted arrays, so users cannot override configured defaults with no labels/assignees.

#### How to resolve

- [x] Distinguish omitted fields from explicit empty arrays.
- [x] Apply defaults only when fields are omitted.
- [x] Sanitize labels and assignees consistently across create, update, assign, and label tools.
- [x] Reject empty titles.
- [x] Decide how to support intentional body clearing without confusing blank input.

#### Acceptance criteria

- Explicit empty arrays are honored.
- Defaults apply only when fields are omitted.
- Tests cover defaults, explicit empty arrays, duplicate values, blank values, empty title, and safe errors.

### 23. [x] Add per-issue mutation serialization or execution controls

#### Why

Pi can execute sibling tool calls in parallel. Two remote mutations against the same GitHub issue can race.

#### How to resolve

- [x] Decide between `executionMode: "sequential"` for mutating tools or a per-repository/per-issue mutation queue.
- [x] Apply the chosen mechanism to update, comment, assign, label, and close tools.
- [x] Document behavior for parallel tool calls.
- [x] Add tests where practical.

#### Acceptance criteria

- Two IssueMe mutating tools cannot concurrently mutate the same issue without ordering.
- Behavior is documented.
- Tests cover the selected serialization mechanism where practical.

### 24. [x] Handle partial success after remote mutations

#### Why

Remote mutation can succeed while local refresh/write/remove fails afterward. Throwing a generic error can encourage duplicate remote retries.

#### How to resolve

- [x] Audit create, update, comment, assign, label, and close flows.
- [x] Return explicit partial-success results for remote-success/local-failure cases.
- [x] Add `cacheUpdated`, `needsSync`, and safe error metadata to tool details.
- [x] Avoid retry guidance that could duplicate issue creation or comments.

#### Acceptance criteria

- Remote create success with local write failure reports created issue URL/number and says cache sync is needed.
- Remote close success with local removal failure reports closed issue and local cleanup failure safely.
- Representative partial-success paths are tested.

### 25. [x] Make `issueme_close_issue` idempotent for already-closed issues

#### Why

The spec says closed issues must not be mutated. An already-closed issue should be reported as already closed, not treated as a generic failure.

#### How to resolve

- [x] Fetch the issue state first.
- [x] If closed, do not send a close mutation payload.
- [x] Remove matching local cache files for that issue/repository as stale local state.
- [x] Return details distinguishing `closed_now` from `already_closed`.

#### Acceptance criteria

- Closing an already-closed issue sends no mutation payload.
- The result clearly says the issue was already closed.
- Matching stale local cache files are removed.
- Tests cover open close and already-closed no-op behavior.

### 26. [x] Bound comment fetching and local cache growth

#### Why

Sync currently fetches all comments for every open issue. Large repositories can produce high API usage, large local files, and large session details.

#### How to resolve

- [x] Define a comment-fetch policy, such as default max comments, optional full comments, or metadata-only comments.
- [x] Add config/tool options for comment inclusion if needed.
- [x] Track and report when comments are incomplete/truncated.
- [x] Avoid unbounded arrays in local files and tool details.

#### Acceptance criteria

- Syncing many issues with many comments remains bounded or intentionally configurable.
- Tool output and local metadata indicate when comments are incomplete/truncated.
- Tests cover comment truncation/omission metadata.

### 27. [x] Bound tool result output and details consistently

#### Why

Tool text is sometimes truncated, but structured details such as sync `paths` can still grow without bounds. Large details can bloat sessions.

#### How to resolve

- [x] Define shared limits for text, issue summaries, paths, comments, and changed fields in tool details.
- [x] Apply limits consistently to all IssueMe tools.
- [x] Include truncation metadata whenever any output or detail list is truncated.
- [x] Keep full local issue files separate from concise tool results.

#### Acceptance criteria

- Tool `content` and `details` are bounded.
- Truncation is explicit and machine-readable.
- Tests cover oversized sync and get outputs.

- [x] Improve tool result and error detail consistency

#### Why

Tool result details differ by tool and errors mostly rely on thrown exceptions. Agents need consistent, safe structured data.

#### How to resolve

- Define shared detail interfaces for success, partial success, and safe errors.
- Include safe `repository`, `issue`, `paths`, `removedPaths`, `changedFields`, `cacheUpdated`, `needsSync`, and truncation metadata consistently.
- Include comment URL/ID details for `issueme_comment_issue`.
- Include closed issue URL/title/state details for `issueme_close_issue`.
- Ensure errors never contain tokens, `.env` contents, private config dumps, or large issue body/comment content.

#### Acceptance criteria

- All tool details are structured, bounded, safe, and documented.
- Closed-issue refusal details are clear and safe.
- Tests verify token/body redaction in representative error paths.

- [x] Tighten `/issueme start` path handling

#### Why

`/issueme start` currently accepts any path that exists and treats `starter` as `start`. It should validate the skill path precisely.

#### How to resolve

- Parse `start` as an exact subcommand.
- Reject missing paths.
- Reject directories and unreadable files.
- Decide whether absolute paths outside the project are allowed.
- Preserve quoted paths with spaces if Pi command args support them.
- Keep busy-agent delivery as `followUp` and idle delivery immediate.

#### Acceptance criteria

- `/issueme starter` does not run the workflow.
- Missing, directory, unreadable, and unsafe paths produce clear safe errors.
- Tests cover idle and busy delivery modes.

- [x] Add command tests

#### Why

Command behavior is currently largely untested.

#### How to resolve

- Test command parsing helper.
- Test info/help output construction.
- Test `/issueme start <skill-path>` prompt construction.
- Test busy/idle delivery choices.
- Test config save validation helpers.

#### Acceptance criteria

- Command behavior is covered without launching a live Pi TUI.
- Tests do not require live GitHub calls.
- All command alias and error paths are covered.

- [x] Add tool integration tests with injected GitHub client/fetch

#### Why

Current tests cover helpers and GitHub client basics, but not each registered IssueMe tool behavior.

#### How to resolve

- Refactor tool runtime so tests can inject config, repository, token, and fetch/client beor.
- Add mocked success tests for each `issueme_*` tool.
- Add safety tests for closed-issue refusal paths.
- Add cache write/remove tests for create, sync, update, and close tools.

#### Acceptance criteria

- Default tests never call live GitHub.
- Each tool has success and safety-path tests.
- Tests verify no token values appear in output/details.

- [x] Add configuration TUI renderer tests

#### Why

The configuration TUI design standard is detailed enough to require automated coverage.

#### How to resolve

- Test wide render mode.
- Test narrow category/settings render modes.
- Test tiny render mode.
- Test ANSI-aware clipping/padding.
- Test keyboard navigation, search, edit, save, and cancel behavior.
- Test theme-role usage with injected theme stubs.

#### Acceptance criteria

- The TUI design standard has automated coverage.
- Render assertions prove no line exceeds width.
- Search/focus/edit states are covered.

- [x] Add extension registration and schema tests

#### Why

Smoke testing should prove tools and commands are registered, and tests should prevent schema regressions.

#### How to resolve

- Create a lightweight fake `ExtensionAPI` for tests.
- Load `src/extension.ts` against the fake API.
- Assert `/issueme` is registered once.
- Assert all registered `issueme_*` tools are registered.
- Assert each tool has description, `promptSnippet`, `promptGuidelines`, and strict schema metadata.

#### Acceptance criteria

- Extension registration is tested without running Pi.
- Missing tool registration or missing prompt metadata fails tests.
- Schema compatibility tests fail on forbidden patterns.

- [x] Reconcile documentation with remediated behavior

#### Why

README, SECURITY, CHANGELOG, project brief, structure docs, and specs currently mix planned, implemented, and remediation-pending language.

#### How to resolve

- Update README after behavior fixes are complete.
- Update SECURITY after trust, path, network, and token behavior is final.
- Update CHANGELOG with remediation changes.
- Update `docs/STRUCTURE.md` after file cleanup/refactors.
- Update `CONTRIBUTING.md` to point at this remediation task list.
- Update or archive specs that say runtime behavior is future-only.

#### Acceptance criteria

- Docs match actual command/tool behavior.
- No unimplemented behavior is documented as available.
- Contributors can identify the active task list unambiguously.

- [x] Strengthen CI and validation scripts

#### Why

`npm run format:check` exists but is not part of `npm run validate`, and CI uses `npm install` instead of lockfile-strict installs.

#### How to resolve

- Add `npm run format:check` to `npm run validate` or `npm run lint` and CI.
- Prefer `npm ci` in GitHub Actions when `package-lock.json` is present.
- Verify GitHub Action versions are real/supported or pin to known-good versions.
- Keep local validation aligned with CI validation.

#### Acceptance criteria

- CI runs typecheck, tests, formatting, package checks, and package dry-run.
- Local `npm run validate` matches CI expectations.
- CI action versions are valid and documented.

- [x] Review package-maintenance ergonomics

#### Why

Enumerating each source file keeps package contents tight but makes it easy to omit new real modules. Using `src/**/*.ts` is easier but may include placeholders if cleanup is incomplete.

#### How to resolve

- Decide whether `package.json` should enumerate each source file or use `src/**/*.ts` after placeholder cleanup.
- Add package-content tests that fail when real runtime modules are omitted.
- Keep specs, tests, local state, `.env`, `.pi`, `issues`, reports, and tarballs excluded.

#### Acceptance criteria

- Adding a new real source module cannot silently omit it from the published package.
- Placeholder/spec/local-state files remain excluded.
- `npm run check:pack` remains deterministic and useful.

- [x] Improve issue-cache privacy defaults

#### Why

Issue cache files can contain private issue bodies and comments. They should be private by default and documented clearly.

#### How to resolve

- Add `issues/` to `.gitignore`.
- Mention cache privacy in README and SECURITY.
- Add troubleshooting guidance for users who intentionally want to commit/share issue cache files.
- Ensure package dry-run excludes `issues/`.

#### Acceptance criteria

- Generated issue cache files are ignored by git by default.
- Users are warned that issue cache files may contain private content.
- Package dry-run excludes local issue cache files.

- [x] Add smoke-test observability

#### Why

A no-output `pi --no-extensions -e .` run only proves startup did not immediately fail. It does not prove commands/tools are discoverable.

#### How to resolve

- Find a repeatable Pi mode or command that lists registered commands/tools.
- Document manual smoke-test steps if automatic discovery is not available.
- Verify `/issueme` command discovery.
- Verify all registered `issueme_*` tool discoveries.
- Keep live GitHub mutation out of smoke tests.

#### Acceptance criteria

- Smoke testing proves `/issueme` and all `issueme_*` tools are discoverable.
- A no-output startup run is not treated as sufficient by itself.
- Smoke procedure is documented.

- [x] Add safe error taxonomy and user-facing recovery guidance

#### Why

Errors currently mix `IssueMeError`, `GitHubApiError`, `ClosedIssueMutationError`, and generic `Error`. Agents/users need consistent recovery guidance.

#### How to resolve

- Define error codes for config, trust, auth, repo, GitHub API, closed issue, local cache, validation, and partial success cases.
- Replace generic thrown errors in tools/commands with `IssueMeError` variants where appropriate.
- Add safe recovery hints without secrets or private issue content.
- Ensure tool errors and command errors are concise.

#### Acceptance criteria

- Public errors have stable codes and safe messages.
- Recovery guidance is actionable.
- Tests verify representative error codes/messages.

### 40. [x] Add TUI visual artifact capture tests

#### Why

The configuration TUI can technically pass renderer unit tests while still looking wrong to humans. We need reproducible visual artifacts that capture how IssueMe TUI elements render so agents/reviewers can inspect those files and fix UI problems without manually launching Pi.

#### How to resolve

- [x] Build a test-only TUI render harness that instantiates the IssueMe configuration component without starting a live Pi session.
- [x] Render the configuration UI across representative widths and states, including wide, narrow category view, narrow settings view, tiny mode, focused category pane, focused settings pane, search with results, search with no results, edit/save state, validation-error state, and disabled/empty values.
- [x] Save each rendered state to deterministic artifact files, for example under `test-artifacts/tui/issueme-config/` or `test/snapshots/tui/issueme-config/`.
- [x] Store both plain-text captures and ANSI/themed captures if useful: plain text for diff readability, ANSI text for visual/theme debugging.
- [x] Add a manifest file that explains each capture: width, mode, focused pane, selected item, search text, expected behavior, and source test name.
- [x] Make the artifact generation deterministic by using fixed config values, fixed terminal widths, fixed timestamps, stable theme stubs, and no live GitHub calls.
- [x] Decide whether visual artifacts are committed snapshots or generated CI artifacts, then document the workflow.
- [x] Add a script such as `npm run test:tui-artifacts` or a test flag that refreshes these captures intentionally.

#### Acceptance criteria

- Tests can render the IssueMe TUI component without launching an interactive Pi session.
- Visual capture files are written deterministically and can be fed back into agents/reviewers for UI critique.
- Captures include wide, narrow, tiny, search, empty/no-match, edit, validation-error, and focus-state examples.
- Every captured line fits within the target width in the metadata.
- The artifact manifest documents what each file represents and how to regenerate it.
- CI either verifies committed snapshots are current or uploads generated artifacts without creating noisy git diffs.
- No secrets, tokens, `.env` contents, or private issue content appear in visual artifacts.

- [x] Final validation and smoke testing

#### Why

The remediation pass is complete only after automated validation and isolated smoke testing pass.

#### How to resolve

- Run `npm run typecheck`.
- Run `npm run test`.
- Run `npm run check:pack`.
- Run `npm run validate`.
- Run the documented isolated Pi smoke test and verify command/tool discovery.

#### Acceptance criteria

- All validation commands pass.
- Package contents remain minimal and safe.
- Isolated Pi smoke test confirms `/issueme` and all `issueme_*` tools are discoverable.
- No live GitHub mutation is required for default validation.
