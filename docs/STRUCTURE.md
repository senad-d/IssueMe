# IssueMe Structure Guide

IssueMe is a TypeScript Pi extension package that exposes direct GitHub REST and GraphQL issue management tools to agents.

> Current behavior source: this guide, `README.md`, `SECURITY.md`, source, and tests describe the implemented runtime. `specs/spec-remediation-tasks.md` tracks hardening remediation, and `specs/spec-issue-management-expansion-tasks.md` tracks the expanded issue-management surface; older planning specs are archived context.

## Current layout

```text
src/
├── extension.ts                  # small registration-only entry point
├── commands/
│   ├── issueme-command.ts         # /issueme, help/status aliases, /issueme start <skill-path>
│   └── config-tui.ts              # configuration TUI renderer/component and snapshot helper
├── tools/
│   ├── issueme-tools.ts           # tool registration aggregator
│   ├── create-issue.ts
│   ├── sub-issue.ts
│   ├── development-links.ts
│   ├── sync-issues.ts
│   ├── list-issues.ts
│   ├── list-labels.ts
│   ├── list-milestones.ts
│   ├── list-assignees.ts
│   ├── manage-label.ts
│   ├── manage-milestone.ts
│   ├── projects.ts
│   ├── get-issue.ts
│   ├── update-issue.ts
│   ├── comment-issue.ts
│   ├── assign-issue.ts
│   ├── label-issue.ts
│   ├── reopen-issue.ts
│   ├── close-issue.ts
│   ├── bulk-issues.ts             # guarded explicit-list bulk issue operations
│   └── runtime.ts                 # shared tool runtime helpers
├── github/
│   ├── client.ts                  # GitHub REST/GraphQL client, boundaries, errors, guards
│   └── repository.ts              # GITHUB_REPOSITORY/.git config/worktree resolution
├── issues/
│   ├── store.ts                   # repository-aware safe issue JSON reads/writes/removes
│   └── format.ts                  # GitHub response normalization and summaries
├── config/
│   └── config.ts                  # non-secret Pi project config validation/persistence
├── utils/
│   ├── date.ts                    # shared ISO date-only validation
│   ├── env.ts                     # .env parsing, token precedence, redaction
│   ├── mutation-queue.ts          # canonical path helper for Pi file mutation queues
│   ├── project-root.ts            # project root and Git directory discovery without shelling out
│   └── slug.ts                    # issue title slugs and safe paths
├── constants.ts
├── errors.ts
└── types.ts
```

No template placeholder command/tool/lifecycle modules remain.

## Module boundaries

- `src/extension.ts` only calls registration functions.
- `src/commands/` owns user commands, command parsing, configuration TUI rendering, and workflow kickoff.
- `src/tools/` owns LLM-callable tool definitions, schemas, prompt snippets, prompt guidelines, and tool-level orchestration.
- `src/github/` owns REST API calls, native sub-issue GraphQL inspection/mutations/reordering, issue development-link GraphQL inspection, Projects v2 GraphQL discovery/item mutations, pagination validation, response/error handling, mutation guards, and repository resolution.
- `src/issues/` owns local `issues/<issue-number>-<issue-title-slug>.json` files, repository-aware cache lookups, symlink-escape checks for explicit cache paths, safe removals, and invalid-file diagnostics; `issueme_get_issue` filters local reads through the resolved current repository and uses the shared write/remove policy for focused any-state refreshes.
- `src/config/` owns the IssueMe non-secret project config path (standard Pi: `.pi/agent/issueme.json`), validation, queued writes, and symlink-safe config path checks.
- `src/utils/` owns pure/shared helpers such as date-only validation, `.env` parsing, redaction, file-mutation queue path canonicalization, project-root detection, slug generation, and path safety.

## Pi extension conventions

- No long-lived processes, file watchers, timers, sockets, HTTP listeners, or webhooks are started from the extension factory.
- Every IssueMe tool includes concise `promptSnippet` and tool-specific `promptGuidelines`; shared IssueMe terms are centralized in one loaded prompt guideline to avoid repeating them across tools.
- String enum tool schema fields use `StringEnum` from `@earendil-works/pi-ai`.
- Mutating tools use `executionMode: "sequential"` to avoid parallel remote mutation races.
- Local config and issue-file mutations use safe path resolution and Pi's file mutation queue helper.
- Large issue output and structured details are bounded/truncated and secret-free; tool details share `result`, repository, issue/path/change/cache/sync fields, optional comment ID/URL fields, bounded bulk per-issue `bulkResults`, and safe error metadata with stable codes, categories, and recovery hints.
- Label and assignee arrays are normalized through shared helpers; values must be single-line, and assignees must match GitHub username syntax before defaults are persisted or tool mutations are sent.
- `issueme_list_milestones` discovers repository milestone numbers/titles read-only so agents can safely choose `milestoneNumber` before `issueme_update_issue`.
- `issueme_list_assignees` discovers repository users who can be assigned to issues before agents call `issueme_assign_issue` or create/update issues with assignees.
- `issueme_list_projects` and `issueme_get_project_fields` discover GitHub Projects v2 board IDs/numbers plus field IDs/options read-only before project item mutations are attempted.
- `issueme_add_issue_to_project` adds or confirms open issues as GitHub Projects v2 items, and `issueme_update_project_item` updates one discovered project-item field after validating field values and verifying the item still belongs to the requested project, current repository, requested issue number, and an open issue.
- `issueme_manage_label` mutates repository label taxonomy only; delete requires explicit confirmation and never deletes issue objects, while issue-label assignment remains owned by `issueme_label_issue`.
- `issueme_manage_milestone` mutates repository milestone planning metadata only; delete requires explicit confirmation and removes milestone associations from existing issues, while issue milestone assignment remains owned by `issueme_update_issue`.
- `issueme_update_comment` and `issueme_delete_comment` verify the requested issue is open and the comment belongs to that issue before editing/deleting the comment; they refresh the parent issue cache afterward.
- `issueme_list_sub_issues` inspects native parent/sub-issue relationships read-only against GitHub, bounds child lists with truncation metadata, and refreshes local relationship metadata only when `refreshCache: true` is explicit.
- `issueme_list_issue_development_links` inspects linked pull requests, PR branch names, commits, and closing/reference metadata read-only through GitHub issue timeline GraphQL data when GitHub exposes it; it keeps same-number pull requests distinct by URL, bounds results, fetches no PR bodies, writes no local cache, and documents standalone-branch/private-reference limitations.
- `issueme_reorder_sub_issues` reorders native child priority with GitHub's `reprioritizeSubIssue` GraphQL mutation, requires every current child number exactly once, refuses closed parent/child issues, and refreshes local relationship metadata afterward.
- Native issue dependency/blocker/tracked-by tools are intentionally not registered until GitHub exposes a stable native REST or GraphQL API with documented list/add/remove semantics; IssueMe does not create body-only dependency references as a fallback.
- `issueme_reopen_issue` is the only intentional closed-issue mutation path; `issueme_close_issue` can set GitHub close reason for open issues but treats already-closed issues as local cleanup only, and other existing-issue mutating tools continue to refuse closed issues.
- `issueme_bulk_update_issues` applies one limited action (`add_labels`, `assign`, `set_milestone`, `add_to_project`, or `close`) only to explicit issue-number lists, runs sequentially, defaults to stop-on-error, and returns bounded per-issue `bulkResults` without accepting search-query mutation targets.

## Tests and artifacts

- Unit tests cover config/env/repository/path helpers, local issue store behavior, GitHub client boundaries, command parsing, config TUI rendering, extension registration, schema compatibility, and IssueMe tool-schema prompt budget drift.
- `npm run test:tui-artifacts` regenerates deterministic visual captures under `test/snapshots/tui/issueme-config/` for review without launching Pi.

## Validation

```bash
npm run typecheck
npm run format:check
npm run test
npm run smoke:discover
npm run check:pack
npm run validate
pi --no-extensions -e .
```

`npm run validate` is the local/CI contract: it runs typecheck, formatting, tests, script checks, and the package dry-run contents check. `package.json` intentionally publishes `src/**/*.ts` after placeholder cleanup; `npm run check:pack` compares the dry-run package against local `src` TypeScript files so new runtime modules cannot be silently omitted while specs, local state, `.env`, `.pi`, `issues`, reports, and tarballs remain excluded. CI uses `actions/checkout@v4`, `actions/setup-node@v4`, Node 22.19.0, `npm ci`, and then `npm run validate`.

Use `npm run smoke:discover` for repeatable smoke-test observability: it verifies `/issueme` through Pi RPC `get_commands` with explicit `-e .`, then verifies all twenty-eight `issueme_*` tools through a local `ExtensionAPI` registration probe because Pi RPC does not expose a tool-list command. The probe loads registrations only; it does not invoke handlers, call GitHub, or mutate issues.

Use `pi --no-extensions -e .` for isolated manual startup testing so other configured extensions cannot interfere. Release smoke testing must pair startup checks with command/tool discovery; a no-output startup alone is insufficient.
