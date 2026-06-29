# Changelog

## 0.1.0 - Unreleased

### Added

- Implemented `/issueme`, `/issueme info`/`help` aliases, and `/issueme start <skill-path>`.
- Implemented twenty-eight IssueMe tools for listing/searching, focused refresh, syncing, creating, reading, updating, adding/editing/deleting comments, assigning, labeling, assignee discovery, repository label discovery/management, milestone discovery/management, linked development inspection, GitHub Projects v2 discovery/item management, reopening, closing with reasons, explicit-list bulk updates, and inspecting/linking/reordering native GitHub sub-issues.
- Added approved configuration TUI renderer with wide, narrow, tiny, search, edit, validation, and visual snapshot coverage.
- Added GitHub REST/GraphQL client support with token redaction, pagination/request boundary checks, abort support, rate-limit metadata, response-shape validation, native sub-issue inspection/mutations, and closed-issue mutation guards.
- Added project-root discovery, `.git` file/worktree repository resolution, project `.env` token precedence, non-secret config persistence, slug/path safety, and local issue JSON storage.
- Added tests for helpers, GitHub REST behavior, token safety, repository parsing, path safety, config validation, command parsing, TUI rendering, extension registration, schema compatibility, package contents, and local issue files.
- Added smoke discovery observability for `/issueme` and all twenty-eight `issueme_*` tool registrations without live GitHub calls.

### Changed

- Reduced IssueMe tool context size with compact tool descriptions, shorter schema guidance, centralized shared terms, and budget coverage; tool behavior is unchanged.
- `/issueme info`, `/issueme help`, `/issueme --help`, and `/issueme -h` now share one help/status surface.
- `/issueme start` preserves escaped spaces and Windows-style backslashes while sending a canonical readable project-local skill path to the agent.
- Mutating tools run sequentially to avoid sibling tool-call races.
- `issueme_update_issue` uses `milestoneNumber` and `clearMilestone` instead of nullable union schema fields.
- Local issue cache operations are repository-aware, report invalid files safely, preserve `synced_at` when content is unchanged, distinguish renamed files during sync, and filter `issueme_get_issue` local reads to the resolved current repository.
- `issueme_get_issue` now documents and reports focused any-state refresh behavior, including cache actions and closed-issue stale-file removal; missing explicit local cache paths report the standard not-found error instead of leaking filesystem errors.
- `issueme_reopen_issue` is the only intentional closed-issue mutation path; it reopens closed issues, optionally comments with a reopen reason, refreshes local cache, and treats already-open issues as no-ops.
- `issueme_close_issue` supports optional GitHub close reasons (`completed` or `not_planned`) while remaining idempotent for already-closed issues and sending no close mutation payload in that case.
- `issueme_update_comment` and `issueme_delete_comment` edit/delete existing comments only after verifying the parent issue is open and the comment belongs to that issue, then refresh the parent issue cache.
- `issueme_label_issue` reports partial success when a multi-label removal fails after an earlier removal was acknowledged.
- `issueme_update_project_item` rejects impossible Projects v2 date values instead of sending malformed `YYYY-MM-DD` dates to GitHub.
- `issueme_manage_label` creates, updates, and explicitly deletes repository labels with local validation, conflict/missing-label handling, and no issue-object deletion.
- `issueme_list_milestones` discovers repository milestone numbers, titles, state, due dates, issue counts, and URLs with bounded read-only output before `issueme_update_issue` milestone assignment.
- `issueme_list_assignees` discovers repository assignable users with bounded read-only login, safe ID, profile URL, and type metadata before assignment workflows.
- `issueme_manage_milestone` creates, updates, closes, reopens, and explicitly deletes repository milestones with local validation, conflict/missing-milestone handling, and no issue-object deletion.
- `issueme_add_issue_to_project` adds or confirms open issues as GitHub Projects v2 items, and `issueme_update_project_item` updates discovered item fields after verifying the item belongs to the requested project, current repository, requested issue number, and an open issue.
- `issueme_list_sub_issues` inspects native parent/sub-issue relationships, bounds large child lists with truncation metadata, reports permission/unsupported GraphQL failures clearly, refreshes local relationship metadata only when `refreshCache: true` is explicitly requested, and preserves existing sibling sub-issue metadata after add/remove cache refreshes.
- `issueme_list_issue_development_links` inspects linked pull requests, branch names, commits, and closing/reference metadata read-only through GitHub GraphQL timeline data when available, keeps same-number pull requests distinct by URL, and uses bounded output with documented limitations for standalone branches or hidden references.
- `issueme_reorder_sub_issues` reorders/prioritizes all current native child issues under an open parent using GitHub GraphQL `reprioritizeSubIssue`, validates the full child list before mutation, and refreshes relationship cache metadata without body-only ordering fallback.
- Native issue dependency/blocker links are documented as unsupported until GitHub exposes a stable REST or GraphQL API; IssueMe does not register dependency tools or add body-only fallbacks.
- README, SECURITY, CONTRIBUTING, structure docs, the project brief, and historical specs now point to the remediated implementation behavior plus the expanded issue-management surface.
- Package contents now include `src/**/*.ts` after placeholder cleanup, and `check:pack` verifies every local source module is present so new real modules are not accidentally omitted.
- CI uses lockfile-strict installs and local validation includes format checks.
- Config path construction now uses Pi's exported project config directory name while retaining `.pi/agent/issueme.json` for standard Pi installs.

### Fixed

- Fixed `issueme_reorder_sub_issues` compatibility with GitHub's live GraphQL `ReprioritizeSubIssuePayload` by no longer selecting a non-existent `subIssue` payload field and reusing the prevalidated child summary before refreshing relationships.

### Security

- Project-local `.env`, Git config, IssueMe config, and issue cache files are honored only in trusted projects.
- Issue directory validation rejects project root, traversal, the active Pi project config directory, `.git`, `.pi`, `node_modules`, and symlink escapes, including explicit cache lookups through symlinked subdirectories.
- IssueMe config reads/writes refuse symlinked config files and symlinked config parent directories.
- Issue cache files are ignored by git by default because they may contain private bodies/comments, while source directories named `issues` under `src/` remain trackable.
- Default labels/assignees and explicit label/assignee tool arrays reject null-byte and multiline values before persistence or mutation, and assignee defaults/tool inputs must be valid GitHub usernames.

> IssueMe intentionally does not use GitHub CLI, shell-based GitHub operations, webhooks, background listeners, or telemetry.
