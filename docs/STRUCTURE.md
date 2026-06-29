# IssueMe Structure Guide

IssueMe is a TypeScript Pi extension package that exposes direct GitHub REST and GraphQL issue management tools to agents.

> Current behavior source: this guide, `README.md`, `SECURITY.md`, source, and tests describe the implemented runtime. `specs/spec-remediation-tasks.md` tracks hardening remediation, and `specs/spec-issue-management-expansion-tasks.md` tracks the expanded issue-management surface; older planning specs are archived context.

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
│   ├── client.ts                  # public GitHubClient facade and shared mutation guards
│   ├── transport.ts               # authenticated REST transport, pagination/search boundaries, rate-limit errors
│   ├── issues-client.ts           # issue/list/search/comment REST query helpers and validators
│   ├── projects-client.ts         # Projects v2 GraphQL queries, normalizers, owner/item guards
│   ├── sub-issues-client.ts       # native sub-issue GraphQL queries, normalizers, reorder helpers
│   ├── development-links-client.ts # issue development-link GraphQL queries and normalizers
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
│   └── slug.ts                    # issue title slugs and safe paths
├── constants.ts
├── errors.ts
└── types.ts
```

No template placeholder command/tool/lifecycle modules remain.

## Module boundaries

- `src/extension.ts` only calls registration functions.
- `src/commands/` owns user commands, command parsing, configuration TUI rendering, and workflow kickoff, including `defaultSkillPath` fallback for `/issueme start`.
- `src/tools/` owns LLM-callable tool definitions, schemas, prompt snippets, prompt guidelines, tool-level orchestration, and shared creator-scope refusal before rich issue reads or mutations.
- `src/github/client.ts` preserves the public `GitHubClient` facade and shared issue/project mutation guard orchestration while delegating authenticated transport, URL/pagination boundaries, REST query helpers, GraphQL error mapping, Projects v2, native sub-issue, and development-link parsing to focused modules in `src/github/`.
- `src/github/transport.ts` owns authenticated REST/GraphQL request execution, pagination URL validation, repository/search boundary checks, token redaction, response-shape errors, and rate-limit fail-fast metadata.
- `src/github/projects-client.ts`, `src/github/sub-issues-client.ts`, and `src/github/development-links-client.ts` own their GraphQL query builders, response normalizers, and domain-specific validation helpers; repository discovery remains in `src/github/repository.ts`.
- `src/issues/` owns local `issues/<issue-number>-<issue-title-slug>.json` files, repository-aware cache lookups, creator metadata persistence, symlink-escape checks for explicit cache paths, safe removals, and invalid-file diagnostics; `issueme_get_issue` filters local reads through the resolved current repository and configured creator scope, then uses the shared write/remove policy for focused any-state refreshes.
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
- `allowedIssueCreator` is an IssueMe processing scope under `/issueme` Cache settings: `all` preserves legacy behavior, while one GitHub login limits sync/list/search/get, explicit existing-issue operations, project item mutations, bulk operations, create preflights, and native sub-issue flows to issues created by that login. It is not GitHub access control and does not stop public users from opening issues.
- `issueme_add_issue_to_project` adds or confirms open in-scope issues as GitHub Projects v2 items after preflighting that the project ID resolves to an open board in the current repository/current-owner default policy or matching explicit `scope`/`owner`, and `issueme_update_project_item` updates one discovered project-item field after validating field values and verifying the item still belongs to the requested project, current repository, requested issue number, an open issue, and the configured creator scope.
- `issueme_manage_label` mutates repository label taxonomy only; delete requires explicit confirmation and never deletes issue objects, while issue-label assignment remains owned by `issueme_label_issue` and add/set rejects labels missing from repository taxonomy.
- `issueme_manage_milestone` mutates repository milestone planning metadata only; delete requires explicit confirmation and removes milestone associations from existing issues, while issue milestone assignment remains owned by `issueme_update_issue`.
- `issueme_update_comment` and `issueme_delete_comment` verify the requested issue is open and the comment belongs to that issue before editing/deleting the comment; they refresh the parent issue cache afterward.
- `issueme_list_sub_issues` inspects native parent/sub-issue relationships read-only against GitHub, bounds child lists with truncation metadata, enforces creator scope before returning relationship details, and refreshes local relationship metadata only when `refreshCache: true` is explicit; the registration is sequential because that mode writes cache files.
- `issueme_list_issue_development_links` inspects linked pull requests, PR branch names, commits, and closing/reference metadata read-only through GitHub issue timeline GraphQL data when GitHub exposes it; it verifies target issue creator scope, keeps same-number pull requests distinct by URL, bounds results, fetches no PR bodies, writes no local cache, and documents standalone-branch/private-reference limitations.
- `issueme_reorder_sub_issues` reorders native child priority with GitHub's `reprioritizeSubIssue` GraphQL mutation, requires every current child number exactly once, refuses closed or out-of-scope parent/child issues, and refreshes local relationship metadata afterward.
- Native issue dependency/blocker/tracked-by tools are intentionally not registered until GitHub exposes a stable native REST or GraphQL API with documented list/add/remove semantics; IssueMe does not create body-only dependency references as a fallback.
- `issueme_reopen_issue` is the only intentional closed-issue mutation path; `issueme_close_issue` can set GitHub close reason for open issues but treats already-closed issues as local cleanup only, and other existing-issue mutating tools continue to refuse closed issues.
- `issueme_bulk_update_issues` applies one limited action (`add_labels`, `assign`, `set_milestone`, `add_to_project`, or `close`) only to explicit issue-number lists, verifies creator scope per issue, runs sequentially, defaults to stop-on-error, and returns bounded per-issue `bulkResults` without accepting search-query mutation targets.

## Tests and artifacts

- Unit tests cover config/env/repository/path helpers, local issue store behavior, GitHub client boundaries, command parsing, config TUI rendering, extension registration, schema compatibility, and IssueMe tool-schema prompt budget drift.
- `npm run test:tui-artifacts` regenerates deterministic visual captures under `test/snapshots/tui/issueme-config/` for review without launching Pi.

## Validation

```bash
npm run typecheck
npm run format:check
npm run test
npm run smoke:discover
npm run smoke:packaged
npm run check:pack
npm run validate
pi --no-extensions -e .
```

`npm run validate` is the local/CI contract: it runs typecheck, formatting, tests, script checks, the package dry-run contents check, and the packed production-style smoke check. `package.json` intentionally publishes `src/**/*.ts` after placeholder cleanup; `npm run check:pack` compares the dry-run package against local `src` TypeScript files so new runtime modules cannot be silently omitted while specs, local state, `.env`, `.pi`, `issues`, reports, and tarballs remain excluded. CI uses `actions/checkout@v4`, `actions/setup-node@v4`, Node 22.19.0, `npm ci`, and then `npm run validate`.

Use `npm run smoke:discover` for repeatable smoke-test observability: it verifies `/issueme` through Pi RPC `get_commands` with explicit `-e .`, then verifies all twenty-eight `issueme_*` tools through a local `ExtensionAPI` registration probe because Pi RPC does not expose a tool-list command. Use `npm run smoke:packaged` to pack into a temporary directory, install that tarball into a temporary production-style project with IssueMe devDependencies omitted and Pi peer dependencies satisfied, then verify `/issueme` and tool registration from the installed package. The probes load registrations only; they do not invoke handlers, call GitHub, publish, update dependencies, or mutate issues.

Use `pi --no-extensions -e .` for isolated manual startup testing so other configured extensions cannot interfere. Release smoke testing must pair startup checks with command/tool discovery; a no-output startup alone is insufficient.
