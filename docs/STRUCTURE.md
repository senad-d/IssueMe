# IssueMe Structure Guide

IssueMe is a TypeScript Pi extension package that exposes direct GitHub REST and GraphQL issue management tools to agents.

> Current behavior source: this guide, `README.md`, `SECURITY.md`, `docs/usage.md`, `docs/configuration.md`, `docs/tool-reference.md`, `docs/development.md`, source, and tests describe the implemented runtime. `specs/spec-remediation-tasks.md` tracks hardening remediation, `specs/spec-issue-management-expansion-tasks.md` tracks the expanded issue-management surface, and `specs/spec-issue-management-gap-tasks.md` tracks the coverage-gap track; older planning specs are archived context. `docs/github-api-compatibility.md` records the pinned GitHub API version and documented-versus-tested capability status.

## Current layout

```text
src/
├── extension.ts                  # small registration-only entry point
├── commands/
│   ├── issueme-command.ts         # /issueme, help/status aliases, /issueme start [skill-path]
│   └── config-tui.ts              # configuration TUI renderer/component and snapshot helper
├── tools/
│   ├── issueme-tools.ts           # tool registration aggregator
│   ├── create-issue.ts
│   ├── sub-issue.ts
│   ├── development-links.ts
│   ├── issue-timeline.ts          # bounded read-only issue history events
│   ├── issue-dependencies.ts      # native blocked-by/blocking inspection and guarded add/remove
│   ├── related-issues.ts          # native relates_to inspection and guarded add/remove
│   ├── sync-issues.ts
│   ├── overview.ts                # bounded multi-section read-only overview
│   ├── overview-format.ts         # section-aware compact output
│   ├── list-issues.ts
│   ├── list-labels.ts
│   ├── list-milestones.ts
│   ├── list-assignees.ts
│   ├── issue-types.ts             # read-only organization issue type discovery
│   ├── manage-label.ts
│   ├── manage-milestone.ts
│   ├── projects.ts
│   ├── project-items.ts           # read-only Projects v2 item/value discovery
│   ├── project-item-maintenance.ts # confirmed item removal, explicit field clearing, archive/unarchive
│   ├── get-issue.ts
│   ├── update-issue.ts
│   ├── comment-issue.ts
│   ├── issue-comments.ts          # read-only paginated comment listing and verified single-comment reads
│   ├── assign-issue.ts
│   ├── label-issue.ts
│   ├── reopen-issue.ts
│   ├── close-issue.ts
│   ├── delete-issue.ts            # confirmed permanent issue deletion
│   ├── bulk-issues.ts             # guarded explicit-list bulk issue operations
│   └── runtime.ts                 # shared tool runtime helpers
├── github/
│   ├── client.ts                  # public GitHubClient facade and shared mutation guards
│   ├── transport.ts               # authenticated REST transport, pagination/search boundaries, rate-limit errors
│   ├── continuation.ts            # opaque, repository/collection/filter-bound continuation tokens for discovery reads
│   ├── issues-client.ts           # issue/list/search/comment REST query helpers and validators
│   ├── delete-issue-client.ts     # GraphQL deleteIssue query/validation helpers
│   ├── projects-client.ts         # Projects v2 GraphQL queries, normalizers, owner/item guards
│   ├── sub-issues-client.ts       # native sub-issue GraphQL queries, normalizers, reorder helpers
│   ├── development-links-client.ts # issue development-link GraphQL queries and normalizers
│   ├── issue-timeline-client.ts   # REST timeline event normalizers with typed, bounded metadata
│   ├── issue-dependencies-client.ts # REST dependency paths, database-id resolution, refusal mapping
│   ├── related-issues-client.ts   # REST relates_to paths, summaries, refusal mapping
│   ├── graphql-errors.ts          # domain-specific GraphQL permission/unsupported-feature errors
│   ├── graphql-normalizers.ts     # shared GraphQL issue/creator state normalizers
│   ├── shared.ts                  # pure connection/object helpers
│   └── repository.ts              # GITHUB_REPOSITORY/.git config/worktree resolution
├── issues/
│   ├── store.ts                   # repository-aware safe issue JSON reads/writes/removes
│   └── format.ts                  # GitHub response normalization and summaries
├── config/
│   └── config.ts                  # non-secret Pi project config validation/persistence
├── utils/
│   ├── date.ts                    # shared ISO date-only validation
│   ├── env.ts                     # .env parsing, token precedence, redaction
│   ├── github-login.ts            # GitHub login and allowed issue creator normalization
│   ├── mutation-queue.ts          # canonical path helper for Pi file mutation queues
│   ├── project-root.ts            # project root and Git directory discovery without shelling out
│   ├── sequential.ts              # ordered, fail-fast async mapping with one operation in flight
│   └── slug.ts                    # issue title slugs and safe paths
├── constants.ts
├── errors.ts
└── types.ts
```

No template placeholder command/tool/lifecycle modules remain.

## Module boundaries

- `src/extension.ts` only calls registration functions.
- `src/commands/` owns user commands, command parsing, configuration TUI rendering, and workflow kickoff, including `defaultSkillPath` fallback for `/issueme start`.
- `src/tools/` owns LLM-callable tool definitions, schemas, prompt snippets, prompt guidelines, tool-level orchestration, and shared creator-scope refusal before rich issue reads or mutations. `overview.ts` composes existing readers with one shared runtime and one page per selected section; `overview-format.ts` reserves output space for every section. Independent section failures return partial read results with `needsSync: false`.
- `src/github/client.ts` preserves the public `GitHubClient` facade and shared issue/project mutation guard orchestration while delegating authenticated transport, URL/pagination boundaries, REST query helpers, GraphQL error mapping, Projects v2, native sub-issue, and development-link parsing to focused modules in `src/github/`.
- `src/github/transport.ts` owns authenticated REST/GraphQL request execution, pagination URL validation, repository/search boundary checks, token redaction, response-shape errors, and rate-limit fail-fast metadata.
- `src/github/projects-client.ts`, `src/github/sub-issues-client.ts`, and `src/github/development-links-client.ts` own their GraphQL query builders, response normalizers, and domain-specific validation helpers; repository discovery remains in `src/github/repository.ts`.
- `src/issues/` owns local `.pi/issues/<issue-number>-<issue-title-slug>.json` files (self-ignored from git, with one-shot copy migration from the legacy `issues/` location), repository-aware cache lookups, creator metadata persistence, symlink-escape checks for explicit cache paths, safe removals, and invalid-file diagnostics; `issueme_get_issue` filters local reads through the resolved current repository and configured creator scope, then uses the shared write/remove policy for focused any-state refreshes.
- `src/config/` owns the IssueMe non-secret project config path (standard Pi: `.pi/agent/issueme.json`), validation including `allowedIssueCreator`, queued writes, and symlink-safe config path checks.
- `src/utils/` owns pure/shared helpers such as date-only validation, GitHub login validation, `.env` parsing, redaction, file-mutation queue path canonicalization, project-root detection, slug generation, and path safety.

## Pi extension conventions

- No long-lived processes, file watchers, timers, sockets, HTTP listeners, or webhooks are started from the extension factory.
- Every IssueMe tool includes concise `promptSnippet` and tool-specific `promptGuidelines`; shared IssueMe terms and the result-policy reminder are centralized to avoid repeating logic across tools.
- String enum tool schema fields use `StringEnum` from `@earendil-works/pi-ai`.
- Tools that can mutate GitHub or local issue-cache files use `executionMode: "sequential"`; this includes conditional cache refresh modes in `issueme_get_issue` and `issueme_list_sub_issues`.
- Local config and issue-file mutations use safe path resolution and Pi's file mutation queue helper, with abort checkpoints before long-running refresh flows enter local write/remove phases.
- Large issue output and structured details are bounded/truncated and secret-free; tool details share `result`, repository, issue/path/change/cache/sync fields, optional comment ID/URL fields, bounded bulk per-issue `bulkResults`, and safe error metadata with stable codes, categories, and recovery hints.
- Label and assignee arrays are normalized through shared helpers; values must be single-line, assignees must match GitHub username syntax before defaults are persisted or tool mutations are sent, and `allowedIssueCreator` must be `all` or one valid GitHub username; invalid explicit loaded values fail closed instead of defaulting to `all`.
- `issueme_list_milestones` discovers repository milestone numbers/titles read-only so agents can safely choose `milestoneNumber` before `issueme_update_issue`.
- `issueme_list_assignees` discovers repository users who can be assigned to issues before agents call `issueme_assign_issue` or create/update issues with assignees; assignee add/set rejects users that GitHub reports as unassignable.
- `issueme_list_projects` and `issueme_get_project_fields` discover GitHub Projects v2 board IDs/numbers plus field IDs/options read-only before project item mutations are attempted.
- `issueme_list_project_items` and `issueme_get_project_item` read Projects v2 items with typed field values and archive state; they expose only issue-backed items of the current repository within creator scope, count and omit pull request/draft/foreign/inaccessible content, refuse item IDs from other projects, write no cache, and never call the add-item mutation to discover an item.
- `issueme_remove_issue_from_project` (confirmed), `issueme_clear_project_item_field`, and `issueme_archive_project_item` mutate board membership/metadata only after revalidating project, item, current repository, issue identity, and creator scope; removal verifies absence through the issue's own project items before reporting a no-op, clearing validates field ownership/type and reads the value back, and archive preflights the current state. Under the approved project-only metadata exception (gap spec Task 5, 2026-10-10) these three tools and `issueme_update_project_item` accept closed issues; `PROJECT_V2_ITEM_ISSUE_STATE_POLICY` in `src/github/projects-client.ts` records the per-action policy, and `issueme_add_issue_to_project` stays open-only.
- `issueme_move_project_item` reorders one item with `updateProjectV2ItemPosition` (top, or directly after an anchor on the same board) after validating the moved item like the other item tools and the anchor as an accessible same-board item; it is open-only, verifies the new position against the returned order window, and reports an unverifiable accepted move as retry-safe partial success.
- `issueme_list_issue_comments` and `issueme_get_comment` read comments for open or closed in-scope issues without cache writes: listing paginates with `since`/`after` beyond the 100-comment cache cap, focused reads verify comment ownership before returning content, and long bodies are windowed with a continuation token bound to the comment version.
- `issueme_list_issue_types` reads the owning organization's native issue types through the only permitted `/orgs/*` request (the resolved owner's `issue-types` list); user-owned repositories report types as unavailable. `issueme_create_issue`/`issueme_update_issue` accept `type` (and `clearType`), verify the persisted type because GitHub drops it silently without push access, and report a dropped type as partial success; `issueme_list_issues` filters by `type`; cache records keep `issue_type` with backward-compatible validation.
- `issueme_list_issue_templates` (`src/tools/issue-templates.ts`, `src/github/issue-templates-client.ts`) reads this repository's `.github/ISSUE_TEMPLATE` directory (or a legacy `ISSUE_TEMPLATE.md`) through the contents endpoint, parses Markdown front matter and issue-form headers with a bounded line parser (no YAML dependency), returns previews or windowed full text with continuation, reports organization defaults as unresolved, and never creates issues or writes files.
- Cache records and summaries retain GitHub's `state_reason` (`completed`, `not_planned`, `duplicate`, `reopened`, or `null`) as `state_reason`/`stateReason`; unfamiliar values are omitted rather than defaulted, legacy files without the field still validate, and get/list/close/reopen reads show the recorded reason without extra requests.
- `issueme_list_related_issues`, `issueme_add_related_issue`, and `issueme_remove_related_issue` use GitHub's native REST `relates_to` endpoints with the same identity, open-issue, pull-request, creator-scope, preflight, and refusal handling as the dependency tools; IssueMe reports only the requested issue's collection; GitHub itself mirrors each link on both issues (live-verified 2026-10-10), so IssueMe never has to write the reverse edge.
- `issueme_list_issue_timeline` reads GitHub's REST issue timeline read-only for open or closed in-scope issues: event, actor, timestamp, and typed metadata per known event kind, unfamiliar kinds flagged without raw payloads, comment bodies never included, `eventTypes` filtering, and continuation; it does not replace or change `issueme_list_issue_development_links`.
- Discovery tools (`issueme_list_issues`, `issueme_list_labels`, `issueme_list_milestones`, `issueme_list_assignees`, `issueme_list_projects`, `issueme_get_project_fields`, `issueme_list_sub_issues`, `issueme_list_issue_development_links`) accept an `after` continuation token and report `details.continuation`; tokens are bound to repository, collection, and normalized filters, REST reads resume by absolute position, GraphQL reads by cursor, and per-call limits plus the overview's one-page budget are unchanged.
- `allowedIssueCreator` is an IssueMe processing scope under `/issueme` Cache settings: `all` preserves legacy behavior, while one GitHub login limits sync/list/search/get, explicit existing-issue operations, project item mutations, bulk operations, create preflights, and native sub-issue flows to issues created by that login. It is not GitHub access control and does not stop public users from opening issues.
- `issueme_add_issue_to_project` adds or confirms open in-scope issues as GitHub Projects v2 items after preflighting that the project ID resolves to an open board in the current repository/current-owner default policy or matching explicit `scope`/`owner`, and `issueme_update_project_item` updates one discovered project-item field after validating field values and verifying the item still belongs to the requested project, current repository, requested issue number (open or closed), and the configured creator scope.
- `issueme_manage_label` mutates repository label taxonomy only; delete requires explicit confirmation and never deletes issue objects, while issue-label assignment remains owned by `issueme_label_issue`, accepts open or closed issues, and add/set rejects labels missing from repository taxonomy.
- `issueme_manage_milestone` mutates repository milestone planning metadata only; delete requires explicit confirmation and removes milestone associations from existing issues, while issue milestone assignment remains owned by `issueme_update_issue`.
- `issueme_update_comment` and `issueme_delete_comment` verify the requested issue is open and the comment belongs to that issue before editing/deleting the comment; they refresh the parent issue cache afterward.
- `issueme_list_sub_issues` inspects native parent/sub-issue relationships read-only against GitHub, bounds child lists with truncation metadata, enforces creator scope before returning relationship details, and refreshes local relationship metadata only when `refreshCache: true` is explicit; the registration is sequential because that mode writes cache files.
- `issueme_list_issue_development_links` inspects linked pull requests, PR branch names, commits, and closing/reference metadata read-only through GitHub issue timeline GraphQL data when GitHub exposes it; it verifies target issue creator scope, keeps same-number pull requests distinct by URL, bounds results, fetches no PR bodies, writes no local cache, and documents standalone-branch/private-reference limitations.
- `issueme_reorder_sub_issues` reorders native child priority with GitHub's `reprioritizeSubIssue` GraphQL mutation, requires every current child number exactly once, refuses closed or out-of-scope parent/child issues, and refreshes local relationship metadata afterward.
- `issueme_list_issue_dependencies`, `issueme_add_issue_dependency`, and `issueme_remove_issue_dependency` use GitHub's native REST `blocked_by`/`blocking` endpoints; mutations require both open, non-pull-request, in-scope issues, identify the blocker by database id, refuse self-dependencies, preflight existing edges, and surface GitHub 422 refusals or unavailable features as structured results. Dependencies are not cached and IssueMe never creates body-only dependency references.
- Issue-label changes, `issueme_reopen_issue`, and `issueme_delete_issue` are the intentional closed-issue mutation exceptions. Label changes preserve the open-only cache policy. Permanent deletion requires one exact issue number, explicit intent plus an irreversibility warning, `confirmDelete: true`, creator-scope validation, a non-pull-request target, and GitHub repository administrator permission; it uses GraphQL `deleteIssue` and removes matching local cache files after remote success. `issueme_close_issue` can set GitHub close reason for open issues but treats already-closed issues as local cleanup only.
- `issueme_bulk_update_issues` applies one limited action (`add_labels`, `remove_labels`, `assign`, `unassign`, `set_milestone`, `clear_milestone`, `add_to_project`, `close`, or `reopen`) only to explicit issue-number lists, permits `add_labels`/`remove_labels` for open or closed issues, treats `reopen` as an explicit action with already-open no-ops, verifies creator scope per issue, runs sequentially, defaults to stop-on-error, and returns bounded per-issue `bulkResults` without accepting search-query mutation targets.

## Tests and artifacts

- Unit tests cover config/env/repository/path helpers, local issue store behavior, GitHub client boundaries, command parsing, config TUI rendering, extension registration, schema compatibility, same-turn Pi session scheduling/file-mutation races, and IssueMe tool-schema prompt budget drift.
- `npm run test:tui-artifacts` regenerates deterministic visual captures under `test/snapshots/tui/issueme-config/` for review without launching Pi.
- `npm run smoke:pi-lifecycle` drives real Pi RPC command lifecycle checks for `/issueme info`, `/issueme`, and `/issueme start`; the remaining terminal-only config TUI key/save/close lifecycle is documented for manual verification in `docs/pi-lifecycle-verification.md`.

## Validation

```bash
npm run typecheck
npm run format:check
npm run test
npm run smoke:discover
npm run smoke:packaged
npm run smoke:pi-lifecycle
npm run check:pack
npm run validate
pi --no-extensions -e .
```

`npm run validate` is the local/CI contract: it runs typecheck, formatting, tests, script checks, the package dry-run contents check, the packed production-style smoke check, packed handler smoke, and the real Pi RPC lifecycle smoke. `package.json` intentionally publishes `src/**/*.ts` after placeholder cleanup; `npm run check:pack` compares the dry-run package against local `src` TypeScript files so new runtime modules cannot be silently omitted while specs, local state, `.env`, `.pi`, `issues`, reports, and tarballs remain excluded. CI uses `actions/checkout@v4`, `actions/setup-node@v4`, Node 22.19.0, `npm ci`, and then `npm run validate`.

Use `npm run smoke:discover` for repeatable smoke-test observability: it verifies `/issueme` through Pi RPC `get_commands` with explicit `-e .`, then verifies all forty-seven `issueme_*` tools through a local `ExtensionAPI` registration probe because Pi RPC does not expose a tool-list command. Use `npm run smoke:packaged` to pack into a temporary directory, install that tarball into a temporary production-style project with IssueMe devDependencies omitted and Pi peer dependencies satisfied, then verify `/issueme` and tool registration from the installed package. Use `npm run smoke:pi-lifecycle` to drive `/issueme info`, `/issueme`, and `/issueme start` through real Pi RPC in an offline temporary trusted project with IssueMe environment variables scrubbed; `docs/pi-lifecycle-verification.md` records the manual blocker and steps for terminal-only config TUI lifecycle checks. Discovery probes load registrations only; handler and lifecycle smokes do not call live GitHub, publish, update dependencies, or mutate issues.

Live GitHub verification is outside the default validation contract. `docs/live-github-verification.md` defines the opt-in matrix, credential preflights, temporary artifact naming, cleanup ledger, Projects v2 prerequisites, and blocked-feature reporting for maintainers who explicitly request live API evidence.

Use `pi --no-extensions -e .` for isolated manual startup testing so other configured extensions cannot interfere. Release smoke testing must pair startup checks with command/tool discovery; a no-output startup alone is insufficient.
