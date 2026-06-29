# First-pass Pi extension review tasks

## Review scope and date

- Date: 2026-06-29
- Scope: security, runtime bug, high-risk correctness, input validation, credential/config handling, GitHub API boundary behavior, file/cache safety, and Pi extension registration for the current IssueMe working tree.
- Review mode: planning only. No source, test, docs, dependency, generated, state, or changelog files were changed.

## Files or areas reviewed

- Pi docs: `docs/extensions.md`, `docs/tui.md`, `docs/packages.md` from the installed Pi documentation.
- Project metadata and validation: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `.github/workflows/ci.yml`, `scripts/check-format.mjs`, `scripts/check-package-contents.mjs`, `scripts/smoke-observability.mjs`, `scripts/smoke-handler-execution.mjs`, `scripts/smoke-packaged-install.mjs`.
- Extension surface: `src/extension.ts`, `src/commands/issueme-command.ts`, `src/commands/config-tui.ts`, `src/tools/issueme-tools.ts`, `src/tools/inventory.ts`, all `src/tools/*.ts`.
- Security-sensitive internals: `src/github/client.ts`, `src/github/repository.ts`, `src/issues/store.ts`, `src/issues/format.ts`, `src/config/config.ts`, `src/errors.ts`, `src/contracts.ts`, `src/types.ts`, `src/utils/*.ts`.
- Documentation/contracts: `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`, `docs/public-contracts.md`, `docs/PROJECT_DEFINITION_BRIEF.md`, selected existing specs.
- Tests reviewed by command output and spot inspection: `test/*.test.mjs`, TUI snapshots, public contract and extension registration tests.

## Safe commands run and results

- `npm run typecheck` — passed (`tsc --noEmit`).
- `npm run format:check` — passed before review specs were created and again after all three review specs were written (117 files).
- `npm test` — passed, 246 tests.
- `npm run check:pack` — passed; dry-run package contains 53 files and all 44 `src/**/*.ts` files.
- `npm audit --audit-level=low` — passed, 0 vulnerabilities reported.
- `npm run smoke:handlers` — passed for checkout and packed handlers with temporary directories and mocked GitHub requests.
- `npm run smoke:packaged` — passed packed install command/tool discovery.
- `git status --short` and `git diff --stat` — read-only inspection showed substantial pre-existing uncommitted work; this review did not modify those files.

## Findings summary by severity

- High: invalid loaded `allowedIssueCreator` config fails open to `all`, potentially broadening processing scope after a manual config typo.
- High: many public issue/comment/milestone numeric inputs rely on schema minimums but are not normalized to positive safe integers before GitHub URL construction.
- Medium: `issueme_add_issue_to_project` accepts an opaque `projectId` and mutates before verifying project scope/ownership, increasing wrong-board mutation risk.

## Ordered tasks

- [x] Fail closed on invalid loaded allowedIssueCreator values

#### Why

`src/config/config.ts` uses `normalizeAllowedIssueCreatorForLoad()` for config reads, and `src/utils/github-login.ts` returns `all` when a loaded `allowedIssueCreator` is invalid. `test/foundation.test.mjs` currently asserts that `{ allowedIssueCreator: "bad login" }` loads as `all`. For a setting that is meant to restrict which issue bodies, comments, cache files, and mutations IssueMe processes, silently broadening an invalid manual edit to `all` is a privacy and authorization-scope risk.

#### How to resolve

- Change loaded config handling in `src/config/config.ts` and `src/utils/github-login.ts` so an invalid explicit `allowedIssueCreator` is treated as a config error or safe disabled state, not as unrestricted `all`.
- Preserve backwards-compatible defaults only when the key is absent, empty legacy config is loaded, or the user explicitly sets `all`.
- Update `/issueme info` behavior in `src/commands/issueme-command.ts` to report the config error safely without exposing file contents.
- Update tests in `test/foundation.test.mjs`, `test/command-and-tui.test.mjs`, and restricted-scope tool tests so invalid configured creator scope blocks processing instead of widening scope.
- Validate with `npm run typecheck`, `npm test`, and `npm run format:check`.

#### Acceptance criteria

- A manually edited invalid `allowedIssueCreator` does not make IssueMe process all creators.
- Missing legacy `allowedIssueCreator` still defaults to `all` intentionally.
- `/issueme info` and tool failures surface a safe actionable config error.
- Tests prove the fail-closed behavior and all validation commands pass.

- [x] Normalize all public issue and comment identifiers to positive safe integers before GitHub requests

#### Why

Several tools declare `Type.Integer({ minimum: 1 })` for issue and comment IDs, but many execution paths pass those numbers directly into `GitHubClient` methods that construct REST paths without calling `normalizePositiveSafeInteger()`. Examples include `GitHubClient.getIssue()`, `getIssueComment()`, `updateIssue()`, `addComment()`, `updateComment()`, `deleteComment()`, `closeIssue()`, and tools such as `src/tools/comment-issue.ts`, `src/tools/close-issue.ts`, `src/tools/reopen-issue.ts`, `src/tools/update-issue.ts`, and parts of `src/tools/sub-issue.ts`. Unsafe JavaScript integers can be rounded before path construction, creating a wrong-issue mutation risk.

#### How to resolve

- Add positive safe-integer normalization at the GitHub client method boundary for every issue number, comment ID, milestone number, and related numeric path segment.
- Keep or add tool-level normalization where it improves error messages, but ensure the client also defends itself when called directly in tests or future tools.
- Add tests with `Number.MAX_SAFE_INTEGER + 1`, decimal-like values, zero, negative values, and valid boundary values for representative read, comment, close, update, sub-issue, and project flows.
- Ensure errors use `invalid_tool_input` or a similarly stable safe code and never make a GitHub request for invalid IDs.
- Validate with `npm run typecheck`, `npm test`, and `npm run format:check`.

#### Acceptance criteria

- No GitHub REST or GraphQL path is built from an unsafe numeric issue/comment/milestone identifier.
- Invalid numeric IDs fail before network calls or local cache mutations.
- Valid issue and comment IDs continue to work unchanged.
- Focused tests cover both tool handlers and direct `GitHubClient` calls, and validation commands pass.

- [x] Preflight Projects v2 project identity before adding issues to a project

#### Why

`src/tools/projects.ts` and `src/github/client.ts` let `issueme_add_issue_to_project` mutate with any provided `projectId` after verifying the issue is open and in creator scope. Unlike `issueme_update_project_item`, the add path does not preflight that the project ID belongs to an expected repository, organization, or user scope before the mutation. A stale or copied opaque ID could add the current repository issue to an unintended board that the token can access.

#### How to resolve

- Add a pre-mutation GraphQL validation step for `addIssueToProjectV2()` that resolves the project ID and checks its owner/scope against an explicit allow policy.
- Consider extending the tool schema to accept `scope`/`owner` or a discovered project summary, or document and enforce the default allowed owner policy.
- Refuse inaccessible, wrong-owner, archived/closed, or mismatched project IDs before calling `addProjectV2ItemById`.
- Add tests for correct repository/org/user project IDs, wrong project owner, inaccessible project ID, and closed project behavior.
- Update README/SECURITY/public contracts if the accepted project scope semantics change.
- Validate with `npm run typecheck`, `npm test`, and `npm run smoke:handlers`.

#### Acceptance criteria

- `issueme_add_issue_to_project` verifies project identity before any Projects v2 add mutation is sent.
- Wrong-board project IDs fail with actionable safe errors and no remote mutation.
- Intended repository/org/user project workflows remain supported and documented.
- Tests prove the preflight blocks mismatches and validation commands pass.

## Blocked checks or areas not reviewed

- No live GitHub credentials or live repository mutations were used; native sub-issue, Projects v2, and development-link behavior was reviewed through code and mocked tests only.
- The project `.env` file was intentionally not read.
- Exhaustive line-by-line review of all 24k test/script/doc lines was not performed; high-risk source and public-surface paths were prioritized.
