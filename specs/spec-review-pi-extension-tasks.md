# Pi extension review tasks

## Review identity

- **Target:** `@senad-d/issueme` 0.1.3 TypeScript Pi extension
- **Review mode:** Comprehensive baseline
- **Current target:** branch `main` at `e4d44448584ad418177403759b7c04f9b23122c1`; the reviewed working tree already had unstaged `package.json` and `package-lock.json` changes that select TypeScript 6.0.3 instead of 7.0.2
- **Previous baseline:** N/A
- **Primary entry points:** `src/extension.ts`, `src/commands/issueme-command.ts`, `src/tools/issueme-tools.ts`

## Vertical-slice coverage

| Slice or shared area | Entry point and execution path | Important scenarios/tests | Status | Notes |
| --- | --- | --- | --- | --- |
| Extension registration and result policy | `src/extension.ts` → command/tool registrars → strict TypeBox schemas → Pi result adapter | Duplicate inventory, execution modes, prompt guidance, packaged discovery | Reviewed | All 28 tools and `/issueme` were mapped. |
| `/issueme` config, info, and start | `issueme-command.ts` → config/TUI, repository/token/cache status, or project-local skill validation → Pi UI/message | Trusted/untrusted, TUI/RPC, quoted paths, symlinks, invalid config, narrow rendering | Partial | Source and automated tests were reviewed; a real interactive terminal session was not run. REV-001 and REV-003 apply. |
| Runtime bootstrap, trust, repository, authentication, and transport | tool execute → `createIssueMeRuntime` → config/repository/token resolution → `GitHubClient`/`GitHubTransport` | Missing/invalid token, unsafe Git metadata, off-boundary URL, pagination, rate limit, abort | Reviewed | No live GitHub request was made. |
| Local cache sync and lookup | sync/get tools → issue formatting/store → safe read, atomic write, mutation queue, stale cleanup | Corrupt files, repository collisions, rename, closed removal, abort, comment bounds | Reviewed | File and symlink paths were traced end to end. |
| Read-only discovery | issue/label/milestone/assignee list tools → REST adapters → bounded summaries | Empty, filtered, paginated, malformed dependency data, abort | Reviewed | REV-004 applies to malformed collection members. |
| Issue and comment lifecycle | create/update/comment/assign/label/reopen/close tools → REST preflight/mutation → cache refresh/result policy | Closed issues, creator scope, partial cache success, idempotent no-op, cancellation | Reviewed | REV-002 and REV-005 apply. |
| Repository label and milestone taxonomy | manage tools → action-specific validation → REST mutation → structured conflict/no-op result | Invalid fields, explicit delete confirmation, 404/422, permission failure | Reviewed | Delete safeguards and result semantics were inspected. |
| Native sub-issues and development links | sub-issue/development-link tools → REST identity checks → GraphQL query/mutation → optional relationship cache | Add/remove/reorder/list, creator scope, truncation, permission, partial cache, abort | Reviewed | REV-002 applies to pre-settlement catches. |
| Projects v2 | project tools → owner/ID/value validation → REST issue check and GraphQL preflight/mutation → bounded output | Scope/owner mismatch, closed project/issue, item mismatch, pagination, field variants | Reviewed | REV-002 and REV-004 apply. |
| Bulk issue operations | bulk schema → sequential per-issue guard/mutation → cache/project result aggregation | Stop/continue, skipped items, closed issues, partial cache, already-aborted signal | Reviewed | REV-002 and REV-005 apply. |

## Production-source classification

| Paths or bounded glob | Classification | Covered by | Notes |
| --- | --- | --- | --- |
| `src/extension.ts`, `src/contracts.ts`, `src/tools/inventory.ts`, `src/tools/issueme-tools.ts` | Reviewed | Registration and result policy | Default export, inventory parity, proxy registration, contracts, and execution modes inspected. |
| `src/commands/config-tui.ts`, `src/commands/issueme-command.ts`, `src/config/config.ts` | Reviewed | `/issueme` slice | All command parsing, config persistence, rendering, and skill-path paths inspected. |
| `src/issues/format.ts`, `src/issues/store.ts`, `src/tools/sync-issues.ts`, `src/tools/get-issue.ts` | Reviewed | Cache sync and lookup | Includes safe read/write, validation, cleanup, and output bounds. |
| `src/tools/list-issues.ts`, `src/tools/list-labels.ts`, `src/tools/list-milestones.ts`, `src/tools/list-assignees.ts` | Reviewed | Read-only discovery | Schema, filtering, adapters, malformed data, and output reviewed. |
| `src/tools/create-issue.ts`, `src/tools/update-issue.ts`, `src/tools/comment-issue.ts`, `src/tools/assign-issue.ts`, `src/tools/label-issue.ts`, `src/tools/reopen-issue.ts`, `src/tools/close-issue.ts` | Reviewed | Issue and comment lifecycle | Remote mutation, state guard, cache follow-up, and partial-success paths inspected. |
| `src/tools/manage-label.ts`, `src/tools/manage-milestone.ts` | Reviewed | Taxonomy management | Action matrices, destructive confirmation, and handled API outcomes inspected. |
| `src/tools/sub-issue.ts`, `src/tools/development-links.ts`, `src/github/sub-issues-client.ts`, `src/github/development-links-client.ts` | Reviewed | Native relationships and development links | GraphQL shapes, state transitions, reorder planning, and bounds inspected. |
| `src/tools/projects.ts`, `src/github/projects-client.ts` | Reviewed | Projects v2 | Discovery, field normalization, owner policy, item preflight, and mutations inspected. |
| `src/tools/bulk-issues.ts` | Reviewed | Bulk operations | All actions, aggregation, stop/continue, and cancellation branches inspected. |
| `src/github/client.ts`, `src/github/issues-client.ts`, `src/github/transport.ts`, `src/github/repository.ts`, `src/github/graphql-errors.ts`, `src/github/graphql-normalizers.ts`, `src/github/shared.ts` | Shared infrastructure | All network-backed slices | REST/GraphQL boundary, response parsing, repository resolution, pagination, and errors reviewed. |
| `src/tools/runtime.ts`, `src/constants.ts`, `src/errors.ts`, `src/types.ts` | Shared infrastructure | All slices | Trust, creator scope, result bounding, error taxonomy, and shared contracts reviewed. |
| `src/utils/abort.ts`, `src/utils/date.ts`, `src/utils/env.ts`, `src/utils/github-login.ts`, `src/utils/mutation-queue.ts`, `src/utils/project-root.ts`, `src/utils/safe-read.ts`, `src/utils/safe-write.ts`, `src/utils/slug.ts`, `src/utils/validation.ts` | Shared infrastructure | Commands, cache, runtime, and network slices | Every utility source path was inspected. |

## Cross-slice checks

| Concern | Status | Evidence or blocker |
| --- | --- | --- |
| Schema, parser, type, documentation, and runtime consistency | Reviewed | Config fail-closed drift is REV-001; unbounded collections are REV-005. |
| Trust, secrets, paths, and rendering boundaries | Reviewed | Repository/token and filesystem boundaries were traced; terminal control handling is REV-003. |
| Error, partial-success, and cancellation semantics | Reviewed | Pre/post-mutation settlement is inconsistent across tools; see REV-002. |
| External response validation | Reviewed | Strict issue/sub-issue paths contrast with silently filtered discovery entries; see REV-004. |
| Cache ownership, concurrency, and cleanup | Reviewed | Pi sequential modes and canonical file mutation queues cover shared writes; abort/cache tests passed. |
| Architecture and duplicated policy | Reviewed | Repeated validators were compared; only repeated drift with concrete impact was promoted to tasks. |
| Material performance and output bounds | Reviewed | Outputs are bounded; unbounded input-driven API fan-out is REV-005. |
| Tests, CI, and package publication | Reviewed | Full local validation, package contents, packed install, mocked handlers, and Pi RPC lifecycle passed. |
| Dependency state and vulnerability data | Partial | Local dependency resolution passed; no network-backed vulnerability audit was run. |

## Commands and results

| Command | Result | Relevant evidence or blocker |
| --- | --- | --- |
| `git rev-parse HEAD; git branch --show-current; git status --short` | Passed | Identified commit, branch, and the two pre-existing dirty manifest files. |
| `npm run validate` | Passed | Type-check, ESLint, format/check scripts, 363 tests, package-content check, packed install, all 28 mocked handlers, and offline Pi RPC lifecycle passed. |
| `npm ls --depth=0` | Passed | Local dependency tree resolved without missing/invalid top-level packages. |
| Temporary config/TUI probe importing production modules | Reproduced | `[]` loaded as defaults with `allowedIssueCreator: "all"`; an ESC control sequence was accepted in `issueDirectory` and emitted by the TUI renderer. |
| Temporary API/result probe importing production tools | Reproduced | REST `[{}]` became successful empty label discovery; a `201 Created` body `{}` from create-issue became a thrown `github_issue_shape_invalid` error. |
| `npm run test:coverage` | Blocked | It writes generated `coverage/` state, which this review was not authorized to change. |
| Live GitHub end-to-end checks | Blocked | They require credentials and real remote mutations; the review used source analysis and non-live tests only. |

## Findings summary

| Severity | Count | Categories |
| --- | ---: | --- |
| Critical | 0 | — |
| High | 0 | — |
| Medium | 5 | Validation (2), Correctness (1), Security (1), Performance (1) |
| Low | 0 | — |

## Tasks

- [x] **REV-001 · Medium · Validation — Fail closed on non-object configuration roots**

  **Slice:** `/issueme` configuration and shared runtime bootstrap.

  **Evidence:** `src/config/config.ts:27-40,76-95` parses JSON and sends it to `normalizeIssueMeConfig`; line 85 returns a cloned all-default config whenever the root is not an object. A temporary production-module probe wrote `[]` and observed a successful load with `allowedIssueCreator: "all"` and `issueDirectory: "issues"`.

  **Violated contract or scenario:** A malformed but syntactically valid config must not silently become a broader processing policy. An array, `null`, number, or string currently disables a previously intended creator restriction and lets all tools proceed under the legacy `all` scope instead of surfacing a config error.

  #### Why

  `allowedIssueCreator` gates listing, caching, and mutations across every issue tool. Treating an invalid root as a missing legacy field makes a configuration mistake look valid and can expose or mutate issues outside the intended scope.

  #### How to resolve

  - Require loaded and saved config roots to be plain objects before field normalization.
  - Preserve defaults only for an absent config file and preserve the legacy `allowedIssueCreator: "all"` behavior only for a valid object where that key is absent.
  - Surface the existing safe config-error path in `/issueme info` and fail tool runtime creation before repository or GitHub work.
  - Add focused config, command, and runtime tests for arrays, `null`, numbers, and strings.

  #### Acceptance criteria

  - Non-object JSON roots fail with a stable config error and never produce `allowedIssueCreator: "all"` runtime state.
  - `/issueme info` reports config unavailable and does not scan cache files for these malformed roots.
  - Tools make no GitHub request when loaded config has a non-object root.
  - Legacy object configs with no `allowedIssueCreator` still load as `all`.
  - Type-check, lint, config tests, command tests, and runtime tests pass.

- [x] **REV-002 · Medium · Correctness — Preserve mutation settlement across abort and response-processing failures**

  **Slice:** Issue lifecycle, native sub-issues, Projects v2, and bulk mutations.

  **Evidence:** `src/tools/create-issue.ts:36-47` normalizes the create response before entering its partial-success boundary. A probe returned `201 Created` with `{}` and observed a thrown `github_issue_shape_invalid` after one create request, even though the remote endpoint had reported success. Conversely, `src/tools/sub-issue.ts:156-220,674-699` converts broad add/remove/reorder catches, including aborts and unexpected API failures, into normal structured results with `needsSync: false`; `src/tools/bulk-issues.ts:128-157` similarly aggregates an already-aborted operation instead of propagating cancellation. This conflicts with the abort and partial-success policy in `docs/public-contracts.md:5-17`.

  **Violated contract or scenario:** Failures before a remote mutation is known to have succeeded must throw and stop cancellation; failures after a 2xx/mutation settlement must not be presented as a retry-safe ordinary failure. The current split can encourage duplicate issue creation after malformed success data and can hide indeterminate sub-issue/bulk outcomes.

  #### Why

  Callers need to know whether retrying a mutation is safe. A generic thrown error after confirmed create success invites duplicates, while a normal `result:error` with `needsSync: false` after an aborted request can falsely imply that no remote state changed.

  #### How to resolve

  - Define or preserve an explicit mutation-settlement phase through transport/client/tool boundaries: not started, no remote success known, remote success known, or indeterminate.
  - Narrow broad catches so pre-settlement aborts and unexpected network/API failures throw; keep structured handled outcomes only for explicitly documented domain failures.
  - Return `partial_success`/sync guidance when response parsing, normalization, cache work, or another follow-up fails after the server has accepted a mutation.
  - Search and protect all create, close/reopen, sub-issue, Projects v2, taxonomy, and bulk mutation variants rather than fixing only create-issue.

  #### Acceptance criteria

  - A signal aborted before any mutation throws `github_request_aborted` and no later bulk item is attempted, regardless of `continueOnError`.
  - Expected native-domain refusals retain their documented structured result, while aborts, 5xx, and unexpected pre-settlement failures use Pi's error channel.
  - A successful HTTP/GraphQL mutation followed by malformed response data returns an explicitly indeterminate or partial result with retry-safe guidance, not a generic retryable throw.
  - Post-mutation cache aborts remain `partial_success` with `needsSync: true`.
  - Focused tests cover create issue, add/remove/reorder sub-issue, one Projects v2 mutation, close/reopen, and bulk before/after-settlement cases.

- [x] **REV-003 · Medium · Security — Reject terminal control data before custom TUI rendering**

  **Slice:** `/issueme` configuration TUI.

  **Evidence:** `src/config/config.ts:84-94,165-217` rejects selected null/newline cases but allows ESC and other C0/C1 controls in path and label text. `src/commands/config-tui.ts:361-370,660-672` can return a short path value verbatim in component output. A probe loaded `issueDirectory: "issues/\u001b[2Jspoof"` successfully and confirmed that `renderConfigTuiSnapshot` emitted the control sequence. Pi's `docs/tui.md` specifies that component lines may contain ANSI styling and are written as rendered, with only resets appended by the TUI.

  **Violated contract or scenario:** Persisted project data must not be able to inject arbitrary terminal control sequences into a trusted custom component. Opening `/issueme` on a manually edited config can currently clear, reposition, or otherwise manipulate the terminal display.

  #### Why

  Project trust permits reading the config; it does not turn every config string into trusted terminal markup. The renderer intentionally preserves ANSI emitted by the theme, so data and styling need a clear boundary.

  #### How to resolve

  - Add shared one-line/control-character validation for every persisted string rendered by the config UI, including `issueDirectory`, `defaultSkillPath`, and default label entries.
  - Reject ESC, BEL, C0/C1 controls, and multiline path values on both load and save while retaining normal Unicode.
  - Add a defensive display escaping/sanitization layer so future persisted fields cannot bypass validation and become terminal markup.
  - Keep theme-generated ANSI styling functional and separate from data text.

  #### Acceptance criteria

  - Config load/save rejects CSI, OSC, BEL, C0/C1, and newline payloads in every user-visible config string with safe field-specific errors.
  - With a plain theme, rendered config data contains no terminal controls even when a defensive test constructs an invalid in-memory config.
  - Legitimate Unicode paths, labels, and grapheme-width behavior continue to work.
  - Config, command/TUI interaction, renderer, snapshot, type-check, and lint tests pass.

- [x] **REV-004 · Medium · Validation — Distinguish malformed discovery payloads from valid empty results**

  **Slice:** Read-only repository and Projects v2 discovery.

  **Evidence:** `src/tools/list-labels.ts:43,72-97`, `src/tools/list-milestones.ts:48,106-134`, and `src/tools/list-assignees.ts:43,72-104` normalize then silently filter invalid REST members. `src/github/client.ts:316-326` does the same for ProjectV2 nodes. A production-tool probe returned REST `[{}]` to `issueme_list_labels` and received `details.result: "success"`, `returned: 0`, and `labels: []`.

  **Violated contract or scenario:** Empty dependency data and malformed dependency data must remain distinguishable. Shape drift or a broken proxy currently looks like a valid repository with no labels, milestones, assignees, or projects.

  #### Why

  Agents can make unsafe follow-up decisions from false emptiness, such as attempting duplicate taxonomy creation, concluding that no assignee exists, or selecting the wrong project workflow. Other slices already reject malformed issue/sub-issue responses, so discovery semantics are inconsistent.

  #### How to resolve

  - Validate every expected collection member at the GitHub adapter boundary before tool formatting.
  - Throw `github_response_shape_invalid` when any label, milestone, assignee, or ProjectV2 node lacks its required identity fields.
  - Keep intentional filters, such as closed-project filtering and user query matching, separate from shape validation.
  - Add malformed-member contract tests alongside valid empty-list tests for every listed discovery family.

  #### Acceptance criteria

  - `[{}]` and mixed valid/invalid REST discovery arrays fail with `github_response_shape_invalid` rather than returning empty or partial success.
  - Malformed ProjectV2 nodes fail instead of disappearing from results.
  - Valid `[]` responses remain successful empty results.
  - Filters and pagination still return only valid matching entries and preserve truncation metadata.
  - Client, discovery-tool, contract, type-check, and lint tests pass.

- [x] **REV-005 · Medium · Performance — Bound collection inputs and repeated GitHub preflight fan-out**

  **Slice:** Create/update/assign/label/sub-issue and bulk tool inputs.

  **Evidence:** Collection schemas such as `src/tools/create-issue.ts:11-12`, `src/tools/update-issue.ts:14-15`, `src/tools/assign-issue.ts:13`, `src/tools/label-issue.ts:11`, `src/tools/sub-issue.ts:36-37`, and `src/tools/bulk-issues.ts:42-43` have no `maxItems`; `src/config/config.ts:200-217` also leaves default arrays unbounded. `src/github/client.ts:902-927` performs one sequential repository request per distinct label or assignee, and bulk operations repeat those preflights for as many as 50 issues.

  **Violated contract or scenario:** Agent/config inputs and network fan-out must be predictably bounded. One call can currently submit an arbitrary collection, while bulk calls can multiply the same validation into hundreds or thousands of GitHub requests and exhaust rate limits before the mutation work completes.

  #### Why

  Output truncation does not protect the network path. The repeated sequential preflights make latency and rate-limit consumption depend on unbounded model input and duplicate the same repository validation for every bulk issue.

  #### How to resolve

  - Establish documented maximum counts for labels, assignees, and other string collections.
  - Enforce the limits in TypeBox schemas, runtime normalizers/injected-call paths, and loaded config defaults.
  - Reuse one repository label/assignee preflight per distinct value during a bulk run, or otherwise cap the total request budget before starting mutations.
  - Preserve explicit empty-array semantics for set/clear actions and current de-duplication behavior.

  #### Acceptance criteria

  - Over-limit schema and direct/injected runtime inputs fail before repository or GitHub work.
  - Over-limit loaded config defaults fail closed instead of being partially applied.
  - A 50-issue bulk operation with repeated labels/assignees validates each distinct repository value only once per run, or rejects before mutation when the documented request budget would be exceeded.
  - Boundary, empty-set, duplicate, abort, and rate-limit-oriented tests cover single and bulk tools.
  - Public tool descriptions/contracts document the limits, and type-check, lint, tool-matrix, and schema-budget tests pass.

## Blocked or deferred coverage

- **Interactive TUI runtime:** The actual terminal key, focus, and ANSI behavior was not exercised in a real TTY. Source, Pi TUI documentation, renderer tests, and mocked `ctx.ui.custom` flows were inspected; run the documented manual lifecycle check after REV-003.
- **Live GitHub behavior:** REST/GraphQL permissions, rate limits, Projects v2, native sub-issues, and remote settlement were not exercised against an account because that requires credentials and real mutations. Use the dedicated live verification workflow in a disposable repository after fixes.
- **Coverage report generation:** `npm run test:coverage` was not run because it writes generated `coverage/` files. The ordinary 363-test suite passed.
- **Dependency vulnerability audit:** No registry-backed audit was run; `npm ls --depth=0` only verified the installed top-level dependency state.
- **Production source:** No `src/**/*.ts` path was deferred; all 52 production TypeScript paths were classified above. Reviewed status does not assert exhaustive defect discovery.
