# Changelog

## 0.1.9 - Unreleased

### Added

- Approved project-only closed-issue exception (gap spec Task 5, maintainer approval 2026-10-10): `issueme_update_project_item`, `issueme_clear_project_item_field`, `issueme_remove_issue_from_project`, and `issueme_archive_project_item` now accept closed backing issues because they change board metadata or membership only. The per-action policy is explicit in `PROJECT_V2_ITEM_ISSUE_STATE_POLICY`; `issueme_add_issue_to_project`, bulk `add_to_project`, and every issue-content tool keep refusing closed issues, and creator-scope/repository/identity checks are unchanged (`test/project-item-closed-issue-policy.test.mjs`).
- `issueme_bulk_update_issues` gained `remove_labels`, `unassign`, `clear_milestone`, and `reopen`, each reusing the matching single-issue semantics and guards (open-or-closed label removal with missing-label no-ops and partial receipts after earlier removals, open-only unassign/clear, explicit reopen with already-open no-ops and cache refresh). Explicit unique issue numbers, bounded arrays, sequential execution, per-run preflights, stop-on-error, and per-item settlement receipts are unchanged.
- Issue records and summaries now retain GitHub's close reason: `state_reason` (`completed`, `not_planned`, `duplicate`, `reopened`, or `null`) in cache files with backward-compatible validation, `stateReason` in tool summaries, and a visible reason in `issueme_get_issue`, `issueme_list_issues`, `issueme_close_issue`, and `issueme_reopen_issue` output. Unfamiliar reasons are omitted rather than defaulted; closed-issue cache removal and overview budgets are unchanged.
- Added `issueme_get_overview`: compact repository orientation across issues, labels, milestones, assignees, and projects with one shared runtime, single-page request budgets, explicit section coverage/errors, and no cache writes or comment fan-out.
- Added native related-issue tools over GitHub's REST `relates_to` endpoints: `issueme_list_related_issues`, `issueme_add_related_issue`, and `issueme_remove_related_issue`, with the same database-id identity, both-open, creator-scope, self-relation, idempotency, and structured refusal rules as the dependency tools. Dependency and sub-issue relationships are untouched; no body-text fallback.
- Added `issueme_list_issue_timeline`: bounded read-only issue history (labels, milestones, renames, assignments, state changes with reasons, issue types, sub-issue/dependency edges, comment IDs, cross-references, commits, locks, reviews) with actor or deleted-actor flags, unfamiliar events reported without raw payloads, `eventTypes` filtering, and continuation. Development-link inspection is unchanged.
- Added native issue type support: `issueme_list_issue_types` (organization issue types through a narrowly allowed `/orgs/{owner}/issue-types` request; user-owned repositories report `issue_types_unavailable`), `type` on `issueme_create_issue`, `type`/`clearType` on `issueme_update_issue` with persisted-type verification (a silently dropped type is `partial_success`), a `type` filter on `issueme_list_issues`, and `issue_type` in cache records and `issueType` in summaries with backward-compatible validation.
- Added read-only comment tools: `issueme_list_issue_comments` (stable IDs, author, timestamps, URL, bounded body windows, `since`, continuation beyond the cache cap) and `issueme_get_comment` (verified ownership, long-body continuation bound to the comment version). Both accept open or closed in-scope issues, refuse pull requests, and never write cache files.
- Added Projects v2 item maintenance: `issueme_remove_issue_from_project` (requires `confirmRemove: true`, verifies absence through the issue's project items, never touches the issue or its cache), `issueme_clear_project_item_field` (project-owned text/number/date/single-select/iteration fields only, read-back verification, already-clear no-op), and `issueme_archive_project_item` (`archive`/`unarchive` with state preflight and verified result). All enforce the existing open-issue, current-repository, and creator-scope policy; `docs/live-github-verification.md` now uses these tools for board cleanup.
- Added read-only Projects v2 item discovery: `issueme_list_project_items` and `issueme_get_project_item` return item IDs, archive state, backing issue identity, and typed field values (text, number, date, single-select, iteration; other value types reported as unsupported) with item and nested field-value continuation. Only issue-backed items of the current repository within creator scope expose content; pull request, draft, foreign-repository, and inaccessible items are counted and omitted, and item IDs from other projects are refused. No cache or remote writes.
- Added native issue dependency tools over GitHub's REST `blocked_by`/`blocking` endpoints: `issueme_list_issue_dependencies` (both directions, creator-scope filtering, continuation per direction, explicit unavailable-feature errors), `issueme_add_issue_dependency`, and `issueme_remove_issue_dependency` (both issues open and in scope, blocking issue resolved by database id, self-dependency refusal, idempotent no-ops, structured GitHub 422/404 refusals, retry-safe partial success). No cache writes and no body-text fallback.
- Added bounded continuation to discovery tools: `issueme_list_issues`, `issueme_list_labels`, `issueme_list_milestones`, `issueme_list_assignees`, `issueme_list_projects`, `issueme_get_project_fields`, `issueme_list_sub_issues`, and `issueme_list_issue_development_links` accept an opaque `after` token and return `details.continuation` with `complete`, `resumed`, `pagesRead`, and `nextToken`. Tokens are bound to the repository, collection, and normalized filters; REST reads resume at the exact next member even after filtered or partially consumed pages, GraphQL reads resume from cursors, and malformed or mismatched tokens fail with `continuation_token_invalid`. Per-call limits and the overview request budget are unchanged.

### Changed

- Verified the integrated forty-five-tool surface: `test/workflow-composition.test.mjs` adds mocked end-to-end workflows (dependency planning, board discovery/update/clear/archive/remove, later-comment reading with continuation, issue-type and history inspection) over one stateful fake GitHub, each ending in cleanup; tool-count wording in README and docs now says forty-five; `docs/live-github-verification.md` gained matrix rows for comment reads, issue types, timeline, dependencies/related issues, project item maintenance, and bulk symmetry, all recorded as mocked-only and live-unverified.
- Initial planning now prefers the read-only overview; sync is reserved for local cache workflows. Overview partial reads explicitly report `needsSync: false`; mutation partial-success behavior is unchanged.
- Added `docs/github-api-compatibility.md`: the pinned REST version `2022-11-28` is retained with its documented support window and a transport regression test, and GitHub's native issue dependency/related-issue endpoints are recorded as documented but not yet implemented. The earlier "no native dependency API exists" statements in README, docs, `SECURITY.md`, and tests were replaced; the historical decision in `specs/spec-issue-management-expansion-tasks.md` is annotated as superseded.

### Fixed

- Projects v2 queries no longer spread a `Repository` fragment inside `ProjectV2Owner`; GitHub rejects that query (`cannotSpreadFragment`), which broke every Projects v2 tool and the overview's projects section live. Project owners are `User` or `Organization` only. Found by the 2026-10-10 live run.
- `issueme_get_project_fields` by project ID no longer nests its fragment definition inside the query body, which GitHub rejected (`Field 'fragment' doesn't exist on type 'Query'`). `test/graphql-document-shape.test.mjs` now checks fragment placement, fragment usage, brace balance, and `ProjectV2Owner` types for every GraphQL document. Found by the 2026-10-10 live run.
- Projects v2 item lookups tolerate GitHub's GraphQL `NOT_FOUND` answer for a deleted or foreign item id (returned with a null node) so `issueme_remove_issue_from_project` reaches its verified-absent no-op and the other item tools report the documented inaccessible-item refusal instead of a raw API error. Found by the 2026-10-10 live run.
- `issueme_list_issue_timeline` recognizes `relates_to_added` and `relates_to_removed` (no related-issue payload) instead of flagging them as unfamiliar. Found by the 2026-10-10 live run.
- Open issues no longer print `State: open (no recorded reason)`; the reason suffix appears only when GitHub recorded one, and `issueme_close_issue` omits the "none" line.
- Recognize GraphQL `RATE_LIMITED` errors as rate-limit failures, including HTTP 200 error envelopes.
- Simplified GraphQL rate-limit handling and overview formatting/result selection without changing validation or failure semantics.

## 0.1.0 - Unreleased

### Added

- Implemented `/issueme`, `/issueme info`/`help` aliases, and `/issueme start <skill-path>`.
- Implemented thirty IssueMe tools for listing/searching, focused refresh, syncing, creating, reading, updating, adding/editing/deleting comments, assigning, labeling, assignee discovery, repository label discovery/management, milestone discovery/management, linked development inspection, GitHub Projects v2 discovery/item management, reopening, closing with reasons, confirmed permanent issue deletion, explicit-list bulk updates, and inspecting/linking/reordering native GitHub sub-issues.
- Added approved configuration TUI renderer with wide, narrow, tiny, search, edit, validation, and visual snapshot coverage.
- Added GitHub REST/GraphQL client support with token redaction, pagination/request boundary checks, abort support, rate-limit metadata, response-shape validation, native sub-issue inspection/mutations, and closed-issue mutation guards.
- Added project-root discovery, `.git` file/worktree repository resolution, project `.env` token precedence, non-secret config persistence, slug/path safety, and local issue JSON storage.
- Added tests for helpers, GitHub REST behavior, token safety, repository parsing, path safety, config validation, command parsing, TUI rendering, extension registration, schema compatibility, package contents, and local issue files.
- Added smoke discovery observability for `/issueme` and all thirty `issueme_*` tool registrations without live GitHub calls.

### Changed

- Made ordered GitHub requests and cache operations explicitly sequential through a shared async iterator, preserving fail-fast mutation/abort behavior and limiting resource usage; independent Git config reads now run concurrently without changing precedence.
- The default issue cache moved from `issues/` to `.pi/issues/` so tracker work never dirties the product working tree; `git status` is unaffected by IssueMe caches. IssueMe also writes a directory-local `.gitignore` (`*`) into the issue directory - including explicitly configured legacy `issues/` directories - so cache files stay git-invisible even in repositories that do not ignore `.pi/`. Existing legacy `issues/` caches are migrated by copy into `.pi/issues` on first use (never deleted, since some files may be git-tracked); an explicit `issueDirectory: "issues"` config keeps the legacy location working unchanged.
- Reduced IssueMe tool context size with compact tool descriptions, shorter schema guidance, centralized shared terms, and budget coverage; tool behavior is unchanged.
- `/issueme info`, `/issueme help`, `/issueme --help`, and `/issueme -h` now share one help/status surface.
- `/issueme start` preserves escaped spaces and Windows-style backslashes while sending a canonical readable project-local skill path to the agent.
- Mutating tools run sequentially to avoid sibling tool-call races.
- `issueme_update_issue` uses `milestoneNumber` and `clearMilestone` instead of nullable union schema fields.
- Local issue cache operations are repository-aware, report invalid files safely, preserve `synced_at` when content is unchanged, distinguish renamed files during sync, and filter `issueme_get_issue` local reads to the resolved current repository.
- `issueme_get_issue` now documents and reports focused any-state refresh behavior, including cache actions and closed-issue stale-file removal; missing explicit local cache paths report the standard not-found error instead of leaking filesystem errors.
- `issueme_reopen_issue` is the controlled state-preserving closed-issue mutation path; it reopens closed issues, optionally comments with a reopen reason, refreshes local cache, and treats already-open issues as no-ops. Confirmed permanent deletion is the separate irreversible exception.
- `issueme_close_issue` supports optional GitHub close reasons (`completed` or `not_planned`) while remaining idempotent for already-closed issues and sending no close mutation payload in that case.
- `issueme_delete_issue` permanently deletes one exact open or closed issue through GitHub GraphQL after explicit confirmation, creator-scope and pull-request preflight, then removes matching local cache files; repository administrator permission is required.
- `issueme_update_comment` and `issueme_delete_comment` edit/delete existing comments only after verifying the parent issue is open and the comment belongs to that issue, then refresh the parent issue cache.
- `issueme_label_issue` can add, remove, or set labels on open or closed issues, preserves the open-only cache policy, and reports partial success when a multi-label removal fails after an earlier removal was acknowledged.
- `issueme_bulk_update_issues` permits `add_labels` for open or closed issues while retaining open-issue guards for its other non-close actions.
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

- Kept TypeScript on the supported `6.0.x` line to avoid the upstream TypeScript 7 / typescript-eslint peer-dependency conflict during lockfile-strict installs.
- Updated CI contract tests to accept full release tags such as `actions/checkout@v7.0.1` as well as major-version tags.
- Fixed list pagination failing with "GitHub pagination URL left the resolved repository boundary" on every second page: GitHub Link headers use `/repositories/<id>/...`, which is now mapped back to `/repos/<owner>/<repo>/...` before the boundary check.
- Fixed `issueme_list_issue_development_links` failing with a forbidden error on manually closed issues under fine-grained tokens: a path-scoped FORBIDDEN on `ClosedEvent.closer` is tolerated (GitHub nulls the field), so the remaining timeline links are returned.
- Fixed `issueme_reorder_sub_issues` compatibility with GitHub's live GraphQL `ReprioritizeSubIssuePayload` by no longer selecting a non-existent `subIssue` payload field and reusing the prevalidated child summary before refreshing relationships.
- Fixed issue label and assignee mutation guards so missing repository labels are rejected before GitHub can auto-create taxonomy, and unassignable users are rejected before GitHub can silently ignore them.

### Security

- Project-local `.env`, Git config, IssueMe config, and issue cache files are honored only in trusted projects.
- Issue directory validation rejects project root, traversal, the active Pi project config directory, `.git`, `.pi`, `node_modules`, and symlink escapes, including explicit cache lookups through symlinked subdirectories; the default `.pi/issues` cache home (and subdirectories under it) is the one allowed exception inside the Pi config directory.
- IssueMe config reads/writes refuse symlinked config files and symlinked config parent directories.
- Issue cache files are ignored by git by default - via the `.pi/issues` default location plus a self-ignoring directory-local `.gitignore` - because they may contain private bodies/comments, while source directories named `issues` under `src/` remain trackable.
- Default labels/assignees and explicit label/assignee tool arrays reject null-byte and multiline values before persistence or mutation, and assignee defaults/tool inputs must be valid GitHub usernames.

> IssueMe intentionally does not use GitHub CLI, shell-based GitHub operations, webhooks, background listeners, or telemetry.
