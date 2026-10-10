# Plan: IssueMe Tool Coverage Gaps

## Purpose and baseline

Close the highest-value gaps identified by comparing the current working-tree implementation with GitHub's documented APIs. This is a planning document, not a claim that the proposed tools are implemented or released.

- The investigation baseline registers 30 tools in `src/tools/inventory.ts`, including `issueme_get_overview`. Do not reimplement existing tools.
- Core issue CRUD, labels, milestones, assignees, native sub-issues, development-link inspection, Projects v2 add/update, and limited bulk operations already exist.
- GitHub now documents native dependency/blocker and related-issue REST endpoints. The earlier dependency API unavailability decision needs revisiting; this does not establish support for every historical `tracked-by` concept.
- IssueMe pins REST API version `2022-11-28`; the current REST documentation examples use `2026-03-10`. New endpoint compatibility must be established rather than inferred from documentation alone.
- New API capabilities were documentation-verified, not live mutation-tested. The investigation's 15 focused registration, contract, and schema tests passed against the existing implementation.
- GitHub backlog sync during planning failed with `401 Unauthorized`. This list is not deduplicated against current remote issues. Restore credentials and sync before creating GitHub issues or selecting remotely tracked implementation work; do not treat the failed sync as an empty backlog.

## Execution and checkbox policy

- Use this file as `TASK_FILE` for a task-driven workflow: `specs/spec-issue-management-gap-tasks.md`.
- Complete one numbered task at a time. Only its top-level `- [ ]` line is a task checkbox.
- Mark a task `[x]` only after all acceptance criteria and applicable validation pass. Blocked or unsupported implementation work stays unchecked with an explanation.
- Tasks 1–15 are the default ordered implementation track. Task 2 supplies continuation primitives used by subsequent readers.
- Stop after Task 15. Tasks 16–22 are optional and require explicit selection; they are not the automatic continuation of the core track.
- A request to implement a task does not silently authorize broader repository boundaries, new closed-issue mutation exceptions, live GitHub mutations, publishing, or commits.
- Proposed tool names may be refined before implementation to avoid redundant tools and excessive prompt/schema growth; document any change in the selected task.
- Do not modify unrelated working-tree changes or overwrite the completed historical expansion plan.

## Shared implementation requirements

Every implementation task includes these requirements even when not repeated below:

- Keep direct REST/GraphQL access, project trust, token redaction, creator scope, current-repository boundaries, PR rejection for issue mutations, cancellation, and bounded results intact. Avoid nested functions.
- Keep API adapters out of tool handlers. Use strict provider-friendly schemas and named top-level helpers. Remote mutations and cache-writing tools use sequential execution.
- Revalidate exact identities, state, permissions where discoverable, and relationship/item ownership before mutation. A GraphQL node ID alone is not proof of repository or project membership.
- Preserve documented closed-issue protections except for narrowly reviewed exceptions explicitly approved in the relevant task. A policy refusal is not an invitation to reopen an issue automatically.
- Distinguish valid empty results, unavailable features, permission failures, truncation, and malformed responses. Preserve mutation-settlement and retry-safe partial-success behavior; never recommend blindly repeating an uncertain create or mutation.
- Keep read-only discovery free of cache writes unless an explicit, documented cache option is separately approved. Cache format changes require backward-compatible readers or an explicit migration with tests.
- Add mocked transport/client/tool tests for success, empty/no-op, invalid input, repository/creator mismatch, PR refusal, closed policy, permissions, feature unavailability, cancellation, malformed responses, truncation, and applicable partial-success/cache failures. No live calls in normal tests.
- Update registration, inventory, contracts, prompt guidance, schema-budget tests, smoke expectations, tool references, security documentation, and CHANGELOG with each affected feature; do not postpone correctness to the final validation task.
- Relevant shared files include `src/tools/issueme-tools.ts`, `src/tools/inventory.ts`, `src/contracts.ts`, `src/types.ts`, `src/tools/runtime.ts`, `test/extension-registration.test.mjs`, `test/public-contracts.test.mjs`, `test/tool-schema-budget.test.mjs`, `scripts/smoke-*.mjs`, `docs/tool-reference.md`, `docs/public-contracts.md`, `docs/available-tools.md`, `docs/issueme-tools.md`, `docs/STRUCTURE.md`, `README.md`, `SECURITY.md`, and `CHANGELOG.md`.
- Run focused tests while implementing, then `npm run validate` before marking a code task complete. Report unrelated baseline failures rather than changing unrelated code. Live verification is opt-in with explicit fixtures, permissions, and cleanup.

## Core implementation track

### 1. Establish API compatibility and correct the dependency availability decision

- [x] Record supported API versions and feature requirements, and replace outdated dependency API unavailability claims.

#### Why

The README, previous expansion spec, and a registration test encode an outdated claim that GitHub has no documented native dependency API. New features also cannot assume compatibility with the currently pinned REST version.

#### How

- Recheck the authoritative references below and record endpoint/mutation availability, required permissions, feature gates, and version evidence for planned capabilities.
- Decide whether the current REST version can be retained or whether a tested version change is necessary. Do not bump the version solely because examples use a newer header.
- Separate API documentation evidence, mocked compatibility coverage, and any separately authorized live verification. Record unknowns honestly.
- Update current docs to say dependency tools are not implemented yet even though GitHub documents the API. Annotate the historical spec's decision as superseded without unchecking completed historical tasks.
- Replace the test asserting permanent API absence with tests for the current implementation boundary. Do not register placeholder tools.

#### Where

- `src/constants.ts`, `src/github/transport.ts`, `test/github-transport-client.test.mjs`
- `test/extension-registration.test.mjs`, `README.md`, `docs/tool-reference.md`, `docs/STRUCTURE.md`
- `specs/spec-issue-management-expansion-tasks.md`, this spec

#### Acceptance criteria

- A version/permissions/feature matrix distinguishes documented availability from tested compatibility and repository-specific access.
- Current docs and tests no longer claim native dependency APIs do not exist, but still accurately state IssueMe's implementation status.
- Any version change has regression coverage; unresolved compatibility blocks only the affected feature.

#### Outcome (2026-10-09)

- Matrix recorded in `docs/github-api-compatibility.md` with documented / mocked / live evidence levels per capability and an explicit unknowns list.
- REST version decision: `2022-11-28` retained (documented until 2028-03-10). `GITHUB_DOCUMENTED_API_VERSIONS`, `GITHUB_API_VERSION_END_OF_SUPPORT`, and `GITHUB_GRAPHQL_FEATURE_FLAGS` were added to `src/constants.ts`; `test/github-transport-client.test.mjs` asserts the pinned header and feature flag.
- README, `docs/tool-reference.md`, `docs/usage.md`, `docs/STRUCTURE.md`, `docs/PROJECT_DEFINITION_BRIEF.md`, `SECURITY.md`, and `CHANGELOG.md` now say dependency tools are not implemented yet although GitHub documents the endpoints. The historical decision in `specs/spec-issue-management-expansion-tasks.md` is annotated as superseded; its checkbox is unchanged.
- `test/extension-registration.test.mjs` now asserts the current boundary (no dependency tools registered, no "no native API" claim, compatibility doc present) instead of permanent absence. No placeholder tools were registered.
- Not done: live verification. Compatibility of the new endpoints under the pinned version is recorded as unverified; the earlier `401` backlog sync was not retried.

### 2. Add bounded continuation to discovery tools

- [x] Let callers resume truncated REST and GraphQL discovery results without removing per-call limits.

#### Why

A truncation flag without continuation prevents complete triage and can hide recent development links or later sub-issues. Increasing limits alone does not solve this.

#### How

- Define additive page/cursor inputs and continuation metadata for issues, labels, milestones, assignees, projects, project fields, sub-issues, and development links.
- Reuse shared pagination helpers while preserving existing defaults and output bounds. Never accept an arbitrary continuation URL that can bypass request boundaries.
- Preserve position when client-side filtering or a limit stops partway through an upstream page. Bind or validate continuation against the repository, query, filters, and collection it represents.
- Handle nested or non-paginated field-option/iteration collections explicitly; do not pretend GitHub supplies cursors where it does not.
- Keep overview's one-page-per-section/five-request contract unchanged. Do not silently raise the all-children sub-issue reorder limit.
- Document that traversal of changing GitHub collections is not an atomic snapshot.

#### Where

- `src/github/transport.ts`, `src/github/client.ts`, `src/github/shared.ts`
- `src/github/projects-client.ts`, `src/github/sub-issues-client.ts`, `src/github/development-links-client.ts`
- Existing list/project/sub-issue/development-link tools and their pagination tests

#### Acceptance criteria

- Stable mocked multi-page collections can be traversed without skipped or repeated eligible entries, including filtered and partially consumed pages.
- Forged, mismatched, malformed, or out-of-boundary continuation inputs fail safely.
- Every supported collection reports truthful continuation/completeness metadata; unsupported nested continuation has a documented retrieval alternative or explicit limitation.
- Existing default calls and overview request budgets remain compatible.

#### Outcome (2026-10-09)

- New `src/github/continuation.ts`: opaque tokens bound to repository, collection, and a fingerprint of normalized filters with a checksum; REST positions are absolute raw indexes (page/offset derived from the current page size, so `limit` may change between calls), GraphQL positions are page cursor plus consumed-node offset. Tokens never carry URLs; forged, mismatched, malformed, or out-of-bounds tokens throw `continuation_token_invalid` before any request.
- `GitHubTransport.paginateCollection` is the shared REST page loop (issue list, search, labels, milestones, assignees) and reports the exact resume index after filtered or partially consumed pages. Projects list, project fields, sub-issues, and development links resume from GitHub cursors; sub-issue/development-link count heuristics no longer mark resumed pages as truncated.
- Eight discovery tools accept `after` and return `details.continuation` (`collection`, `complete`, `resumed`, `pagesRead`, `nextToken`); `issueme_list_sub_issues` refuses `after` with `refreshCache`. Overview is unchanged (one page per section, no `page`/`after`). Nested field options/iterations are documented as not paginated by GitHub; development-link pages deduplicate per page only.
- Tests: `test/discovery-continuation.test.mjs` (codec failure modes, filtered multi-page traversal without skips/repeats for REST and GraphQL, limit changes between calls, tool-level token binding). Three query-shape assertions and the schema-budget drift baseline were updated deliberately (recorded baseline 3679 tokens for 30 tools; hard cap now per registered tool).
- Docs: tool reference (Continuation section), public contracts, SECURITY, STRUCTURE, README, usage, CHANGELOG.

### 3. Add native dependency inspection and mutation

- [x] Implement `issueme_list_issue_dependencies`, `issueme_add_issue_dependency`, and `issueme_remove_issue_dependency`.

#### Why

Agents need to distinguish work decomposition from prerequisites and manage real blockers without inventing body-text relationships.

#### How

- Read both `blocked_by` and `blocking` REST collections with bounded continuation.
- Use unambiguous mutation inputs such as `issueNumber` and `blockingIssueNumber`. Resolve and validate the blocking issue's numeric database `id`; do not confuse it with an issue number or GraphQL node ID.
- Verify both endpoints are actual issues in the current repository and creator scope. Preserve the approved open-issue mutation policy and reject self-dependencies.
- Handle already-present/absent relationships, GitHub cycle/validation refusals, and uncertain mutation outcomes explicitly. Do not perform unbounded graph traversal to prove acyclicity.
- Keep reads cache-free initially unless a separately documented, backward-compatible dependency cache design is included. Never silently fall back to body text.

#### Where

- New `src/tools/issue-dependencies.ts`, `src/github/issue-dependencies-client.ts`
- `src/github/client.ts`, `src/types.ts`, `src/errors.ts`
- New focused dependency client/tool tests; shared registration and documentation files

#### Acceptance criteria

- Both dependency directions are readable and paginated; add/remove operate on the intended native edge.
- Tests prove ID resolution, direction, self-reference rejection, scope/state/PR guards, idempotency, and API refusal handling.
- Documentation differentiates dependencies, related issues, and sub-issues, and no body-only fallback exists.

#### Outcome (2026-10-09)

- New `src/github/issue-dependencies-client.ts` and `src/tools/issue-dependencies.ts`; `GitHubClient` gained `listIssueDependencies`, `findIssueDependency` (bounded 10-page preflight), `addIssueDependency[ByIssueResponses]`, and `removeIssueDependency[ByIssueResponses]`.
- Identity: the blocking issue's integer database `id` is resolved from its own current-repository REST record and sent as `issue_id`; numbers and node IDs are never used for the edge. Self-dependencies are refused before any request; both endpoints must be open, non-pull-request issues in creator scope (same policy as native sub-issues; no closed-issue exception was added).
- Reads: both directions by default, per-direction limits/truncation, continuation for a single direction, foreign-repository members marked, out-of-scope members omitted and counted; 404/410 on the collection throws `github_issue_dependencies_unsupported`, never an empty list. No cache reads or writes.
- Mutations: already-present/absent edges are success no-ops; GitHub 422 (cycle/validation) and unavailable-feature 404/410 answers return `result: error` with codes `github_issue_dependency_refused` / `github_issue_dependencies_unsupported`; malformed accepted responses are retry-safe `partial_success`; DELETE 404 after a found preflight is reported as an inferred no-op.
- Registered, inventoried, contracted, smoke-covered, and documented (README, tool reference, usage, SECURITY, STRUCTURE, public contracts, available tools, compatibility matrix, project brief, CHANGELOG). Tests: `test/issue-dependencies-tool.test.mjs` (23 scenarios across helpers, list, add, remove, client). Live mutation behavior remains unverified.

### 4. Add read-only project item discovery

- [x] Implement `issueme_list_project_items` and `issueme_get_project_item` with current field values.

#### Why

Field-definition discovery does not reveal which issues are on a board or their current status, priority, dates, or iteration. Reading an existing item should not require calling the add-item mutation.

#### How

- Query `ProjectV2.items` and item `fieldValues`, returning exact project/item/field IDs, issue identity, archive state, and supported typed values.
- Support bounded item and nested field-value continuation. Allow focused lookup by a discovered item ID or an exact issue within a selected project.
- Validate project scope and item identity. Limit issue content to the current repository and creator scope; omit unsupported PR/draft/foreign/inaccessible content with honest completeness metadata.
- Permit read-only inspection of open and closed issues. Avoid fetching issue or PR bodies and do not write cache files.

#### Where

- `src/tools/projects.ts` or focused new project-reader modules
- `src/github/projects-client.ts`, `src/github/client.ts`, `src/types.ts`
- `test/projects-tool.test.mjs`, `test/github-projects-graphql.test.mjs`, new reader tests

#### Acceptance criteria

- An existing issue's item ID and current project values can be obtained without any mutation.
- Archived items, cleared fields, mixed-content boards, inaccessible content, and multi-page/nested results are handled truthfully.
- Item IDs cannot retrieve unrelated repository issue content, and no cache or remote writes occur.

#### Outcome (2026-10-09)

- New `src/tools/project-items.ts`; `GitHubClient.listProjectV2Items` and `getProjectV2Item` over `ProjectV2.items`/`node(id)`/`Issue.projectItems` with typed `fieldValues` (text, number, date, single select with `optionId`, iteration with `iterationId`); label, milestone, assignee, repository, reviewer, and pull-request values are reported as `kind: unsupported` with their GraphQL type so set values are never mistaken for cleared ones. Absent values mean cleared or unset.
- Content policy: only issue-backed items of the current repository within creator scope expose content; pull request, draft, foreign-repository, out-of-scope, and redacted/inaccessible items are counted and omitted in lists and refused in focused reads. Item IDs must belong to the selected project; closed issues are readable.
- Continuation: items by cursor (`project_items`), nested field values by cursor per item (`project_item_field_values`); a resumed issue-number lookup resolves the item first, then reads by ID so a cursor never crosses connections. An issue with no item on the board is a valid empty result (`project_item_not_found`), including when the bounded 50-item lookup was truncated.
- Registered after the project mutation tools, contracted, smoke-covered, bounded in tool details, and documented. Tests: `test/project-items-tool.test.mjs`. Live GraphQL field-value shapes remain documentation-verified only.

### 5. Define the closed-issue policy for project-only operations

- [x] Document and obtain approval for any narrowly scoped closed-issue exceptions needed by project maintenance.

#### Why

Completed work often needs a final board status or archival, but current project mutations require open issues. Silently weakening the shared closed-issue guard would affect unrelated tools.

#### How

- Specify allowed issue states separately for field updates, field clearing, item removal, archive/unarchive, and item ordering.
- Propose exceptions only for verified board metadata/membership operations that do not mutate issue title, body, comments, labels, assignees, milestones, or lifecycle.
- Identify which shared guards need action-specific handling and define the test matrix before relaxing any behavior.
- Record explicit policy approval. If approval is unavailable, retain current protections and leave this task and dependent exceptions blocked; never reopen issues as a workaround.

#### Where

- `src/github/projects-client.ts`, `src/github/client.ts`, `src/contracts.ts`
- `SECURITY.md`, `docs/public-contracts.md`, this spec
- `test/projects-tool.test.mjs`, `test/tool-failure-semantics.test.mjs`

#### Acceptance criteria

- Each project-only action has a documented state policy and rationale with an approval record for any exception.
- Unrelated closed-issue protections remain unchanged and covered by regression tests if guards are changed.
- New project mutation tasks have an explicit policy to enforce instead of inferring permission from this plan.

#### Status (2026-10-09): blocked on approval; current protections retained

Approval for a closed-issue exception has not been given, so the task stays unchecked and every project-only mutation shipped by Tasks 6 to 8 enforces the existing policy: the backing issue must be open, in the current repository, and in creator scope, verified immediately before mutation (`ensureIssueOpen` plus `assertProjectV2ItemTargetsIssue`). Closed issues are readable through Task 4's tools. No issue is reopened as a workaround.

Proposed exception for review (not enforced):

| Project-only action | Proposed allowed issue states | Rationale |
| --- | --- | --- |
| Field value update (`issueme_update_project_item`) | open and closed | Final board status (for example "Done") is usually set after closing; values are board metadata only. |
| Field clear (`issueme_clear_project_item_field`) | open and closed | Same metadata-only scope as update. |
| Item removal (`issueme_remove_issue_from_project`) | open and closed | Board membership cleanup after completion; the issue, its comments, and other boards are untouched. |
| Archive / unarchive (`issueme_archive_project_item`) | open and closed | Archive is the documented way to retire completed work from a board without losing values. |
| Item ordering (optional Task 17) | open only | Prioritization applies to active work. |

Guards that would need action-specific handling if approved: `GitHubClient.updateProjectV2ItemField`, `removeProjectV2Item`, `clearProjectV2ItemField`, and `archiveProjectV2Item` call `ensureIssueOpen`; `assertProjectV2ItemTargetsIssue` throws `ClosedIssueMutationError` for closed content; `issueme_bulk_update_issues` `add_to_project` would stay open-only. The shared prompt guideline sentence about closed-issue mutations and `SECURITY.md` would gain a "project-only metadata" clause. Test matrix before relaxing: closed issue accepted for each listed action, still refused for add-to-project and all issue-content tools, creator scope and repository checks unchanged, bulk `add_to_project` unchanged, and `ClosedIssueMutationError` still raised for the issue tools in `test/tool-failure-semantics.test.mjs`.

#### Approval record (2026-10-10)

The maintainer approved the full table above (option "O1: approve all four rows") in the implementation session on 2026-10-10. Item ordering remains open-only and stays optional (Task 17).

#### Outcome (2026-10-10)

- Policy is explicit in code: `PROJECT_V2_ITEM_ISSUE_STATE_POLICY` in `src/github/projects-client.ts` maps `add_to_project` to `open_only` and `update_field`, `clear_field`, `remove_item`, `archive_item` to `open_or_closed`. `assertProjectV2ItemTargetsIssue` takes the policy (default `open_only`), and `GitHubClient` uses `ensureIssueForProjectItemMutation` so the four approved actions fetch the issue without the open-state guard while `addIssueToProjectV2` keeps `ensureIssueOpen`.
- Tools: `issueme_update_project_item`, `issueme_clear_project_item_field`, `issueme_remove_issue_from_project`, and `issueme_archive_project_item` run the creator-scope preflight with `requireOpen: false`; repository, item identity, project membership, and creator-scope checks are unchanged. Bulk `add_to_project` and all issue-content tools are untouched.
- Tests: `test/project-item-closed-issue-policy.test.mjs` (policy map, shared assertion default versus approved policy, closed acceptance for each action with no REST mutation or cache write, add/bulk-add refusal, creator-scope refusal, issue-content refusal); `test/project-item-maintenance-tool.test.mjs` closed case now asserts acceptance; `test/tool-integration.test.mjs` keeps the closed refusal list for the remaining tools; `test/tool-failure-semantics.test.mjs` asserts `ClosedIssueMutationError` for update/comment.
- Docs: SECURITY, README, tool reference, public contracts, usage, STRUCTURE, live verification, contracts, and CHANGELOG record the exception and its limits.
- Live-verified 2026-10-10 on the user board `issueme-testing` (run id `20261010063443`, issue #24 closed with `completed`): field update, archive/unarchive, clear, and remove all succeeded on the closed issue; `issueme_add_issue_to_project` and bulk `add_to_project` were refused with `closed_issue_mutation_refused`.

### 6. Add project item removal

- [x] Implement `issueme_remove_issue_from_project` without deleting the issue itself.

#### Why

An accidentally added project item cannot currently be removed, and live verification requires manual cleanup.

#### How

- Use `deleteProjectV2Item` with exact discovered project/item/issue identities and explicit removal confirmation because project-specific values are lost.
- Apply Task 5's approved policy, revalidate membership and creator scope, and distinguish verified absence from inaccessible or mismatched identities.
- Return a bounded removal receipt. Do not call issue deletion or remove the issue's local cache merely because project membership ended.
- Update live verification instructions to use the new cleanup path.

#### Where

- `src/tools/projects.ts`, `src/github/projects-client.ts`, `src/github/client.ts`
- Project client/tool tests, `docs/live-github-verification.md`

#### Acceptance criteria

- Only the intended board item is removed; the issue, comments, and unrelated project memberships remain untouched.
- Confirmation, scope/state checks, safe no-op behavior, permissions, and uncertain settlement are tested.
- The supported live project workflow no longer requires manual item removal.

#### Outcome (2026-10-09)

- `issueme_remove_issue_from_project` (`src/tools/project-item-maintenance.ts`, `GitHubClient.removeProjectV2Item`) requires `confirmRemove: true`, re-checks the open issue and creator scope, validates that the item belongs to the project, current repository, and issue, then calls `deleteProjectV2Item` and checks `deletedItemId`. An unresolvable item ID is reported as absent only when the issue's own project items prove the board no longer holds it; a different current item ID is refused with that ID, and a truncated lookup refuses rather than guesses. The issue, its comments, other boards, and the local cache are untouched.
- Policy: the existing open-issue rule is enforced (Task 5 is unapproved). `docs/live-github-verification.md` now archives or removes the run item through IssueMe before closing run issues. Tests: `test/project-item-maintenance-tool.test.mjs`.

### 7. Add explicit project field clearing

- [x] Add a clear-field operation to the project tool surface.

#### Why

Setting text, number, date, status, or iteration does not provide a safe way to remove an existing value. Empty text and zero are not substitutes for clearing a field.

#### How

- Use `clearProjectV2ItemFieldValue` through an explicit action on the existing update tool or a focused `issueme_clear_project_item_field` tool.
- Validate project/item/issue/field membership and use only supported project-owned field types. Do not indirectly clear issue-owned labels, assignees, or milestones.
- Reject ambiguous set-and-clear requests and enforce Task 5's approved policy.
- Read back the targeted field or otherwise verify settlement; report unknown follow-up results without inviting unsafe retries.

#### Where

- `src/tools/projects.ts`, `src/github/projects-client.ts`, `src/github/client.ts`
- Project field validation, client, and tool tests

#### Acceptance criteria

- Supported project-owned values can be explicitly cleared without changing other fields or issue metadata.
- Already-empty fields, foreign fields/options, unsupported types, invalid combinations, and state policies are tested.
- Existing field-setting calls remain backward compatible.

#### Outcome (2026-10-09)

- Focused `issueme_clear_project_item_field` (`GitHubClient.clearProjectV2ItemField`): validates the field node belongs to the project and has a clearable project-owned type (`TEXT`, `NUMBER`, `DATE`, `SINGLE_SELECT`, `ITERATION`; labels, assignees, milestone, repository, reviewers, linked PRs, and system fields are refused), validates the item against project/repository/issue/open state, preflights `fieldValueByName` so an already-clear field is a no-op, then runs `clearProjectV2ItemFieldValue` and reads the value back in the mutation payload; a read-back that still shows a value is retry-safe `partial_success`. The tool schema has no value inputs, so set-and-clear requests cannot be expressed. `issueme_update_project_item` is unchanged.

### 8. Add project item archive and unarchive

- [x] Implement an explicit archive/unarchive project item operation.

#### Why

Board cleanup should preserve project values when permanent removal is unnecessary, and completed work must be recoverable from the archive.

#### How

- Use `archiveProjectV2Item` and `unarchiveProjectV2Item` with discovered identities and a strict action enum.
- Revalidate the same membership, repository, creator, and state conditions as other project-only operations under Task 5.
- Inspect archive state for safe idempotent outcomes and verify the returned item when possible.

#### Where

- Project tool/client modules and project reader output from Task 4
- `test/projects-tool.test.mjs`, `test/github-projects-graphql.test.mjs`

#### Acceptance criteria

- Archive and unarchive preserve the issue and its project field values.
- Already-archived/already-active outcomes, inaccessible items, identity mismatches, approved closed-state behavior, and settlement failures are tested.
- Project readers expose the resulting archive state.

#### Outcome (2026-10-09)

- `issueme_archive_project_item` with `action: archive | unarchive` (`GitHubClient.setProjectV2ItemArchived`): the item validation query now returns `isArchived`, so already-matching states are no-ops without a mutation; otherwise `archiveProjectV2Item`/`unarchiveProjectV2Item` run and the returned `item.isArchived` must match the request or the result is retry-safe `partial_success`. Values are preserved; Task 4's readers expose `isArchived` per item. Same open-issue, repository, identity, and creator-scope guards as the other project-only operations.
- Shared updates for Tasks 6 to 8: inventory, registration, contracts, smoke scenarios, schema budget (per-tool caps), README, tool reference, public contracts, available tools, SECURITY, STRUCTURE, compatibility matrix, CHANGELOG.

### 9. Add paginated comment reading and focused comment retrieval

- [x] Implement `issueme_list_issue_comments` and `issueme_get_comment` without requiring cache sync.

#### Why

The issue summary shows five comments and the cache caps fetching at 100. Later discussion and exact comment identities cannot be reliably inspected through the current tool surface.

#### How

- Reuse existing `listComments` and `getIssueComment` client capabilities, adding continuation and supported `since` filtering.
- Return stable comment IDs, author, timestamps, URL, and bounded body text. Define a bounded continuation strategy for oversized single-comment content rather than silently losing the remainder.
- Require issue context for focused comment retrieval and verify comment ownership before returning content. Allow reads of open and closed in-scope issues.
- Keep these tools read-only with no cache writes or changes to the current cache cap.

#### Where

- `src/tools/comment-issue.ts` or a new focused comment-reader module
- `src/github/client.ts`, `src/github/issues-client.ts`, `src/types.ts`
- Comment tool/client tests and new pagination fixtures

#### Acceptance criteria

- Comment 101 and later can be reached without increasing cache limits or syncing the backlog.
- A selected comment can be read by verified ID, including content continuation when needed.
- Wrong-issue comments, closed-issue reads, empty threads, filters, truncation, and safe errors are covered.

#### Outcome (2026-10-09)

- New `src/tools/issue-comments.ts`; `GitHubClient.listIssueComments` (continuation-aware, `since`, bound to `issue_comments`) and `getIssueCommentForIssue` (ownership verified with the existing `commentBelongsToIssue` check; open or closed issues). The cache path still uses `listComments` with the 100-comment cap, and no read tool writes cache files.
- `issueme_list_issue_comments` returns stable IDs, author, timestamps, URL, and a per-comment body window (`bodyLimit`, default 400, max 4000) with per-comment truncation flags, GitHub's total from the issue record, and `after` continuation, so comment 101 and later are reachable. `issueme_get_comment` returns up to `bodyLimit` (default 4000) characters and a body-continuation token (`readTextWindow` in `src/github/continuation.ts`) bound to the issue, comment ID, and `updated_at`, so an edited comment invalidates the token instead of returning a stale offset.
- Pull-request numbers and out-of-scope issues are refused before any comment read; malformed members and GitHub failures throw. Tests: `test/issue-comments-tool.test.mjs` (130-comment traversal, since binding, empty threads, closed issues, ownership mismatch, version-bound continuation).

### 10. Add issue type discovery and existing-tool support

- [x] Implement `issueme_list_issue_types` and extend create/update/list/get for native issue types.

#### Why

Native Bug/Task/Feature classification is not equivalent to labels. Agents need valid type discovery and type-aware issue handling.

#### How

- Resolve the current repository's organization and read its available types through the API selected in Task 1. Handle user-owned repositories and unavailable features explicitly.
- If REST organization discovery is used, add only a narrowly verified organization endpoint allowance; do not permit arbitrary `/orgs/*` requests.
- Extend existing tool inputs with type selection and an explicit clear operation, plus supported filtering and output/cache metadata. Avoid duplicating CRUD tools.
- Verify the persisted type after mutation because GitHub documents silently ignored type changes for insufficient push access. A dropped type is not full success.
- Keep organization-wide type create/update/delete outside this task.

#### Where

- `src/tools/create-issue.ts`, `src/tools/update-issue.ts`, `src/tools/list-issues.ts`, `src/tools/get-issue.ts`
- New type discovery adapter/tool; `src/github/transport.ts`, `src/types.ts`, `src/issues/format.ts`, `src/issues/store.ts`
- Discovery, mutation, boundary, and cache compatibility tests

#### Acceptance criteria

- Valid types can be discovered, assigned, cleared, filtered, and read where supported.
- Missing permissions, ignored writes, disabled/unknown types, and non-organization repositories have explicit tested outcomes.
- Cache compatibility and repository/organization boundaries are preserved; no organization taxonomy mutation is introduced.

#### Outcome (2026-10-09)

- Discovery: `issueme_list_issue_types` (`src/tools/issue-types.ts`, `GitHubClient.listRepositoryIssueTypes`) resolves the owner account type through `GET /repos/{owner}/{repo}` and reads `GET /orgs/{owner}/issue-types` only for organization owners. The transport boundary now allows exactly the repository root and `/orgs/<resolved owner>/issue-types`; every other `/orgs/*` path is still refused (tested). User-owned repositories return `status: issue_types_unavailable` with no organization request; 404/410 throws `github_issue_types_unsupported`; disabled types are listed with `isEnabled: false`.
- Existing tools: `issueme_create_issue` accepts `type`; `issueme_update_issue` accepts `type` or `clearType` (mutually exclusive); both verify the persisted type from the mutation response and return `partial_success` (`create_issue_type_not_applied` / `update_issue_type_not_applied`, `needsSync: false`, cache still written) when GitHub silently dropped the change. `issueme_list_issues` gained a `type` filter (REST `type` with `*`/`none`; search uses a `type:` qualifier and rejects wildcards). Issue summaries carry `issueType` (string, null, or absent); cache records carry `issue_type` with backward-compatible validation (absent, null, or a non-empty name) and the writer persists it.
- No organization type create/update/delete was added. Tests: `test/issue-types.test.mjs`.

### 11. Add full issue timeline inspection

- [x] Implement `issueme_list_issue_timeline` as a bounded read-only history tool.

#### Why

Development-link inspection intentionally omits most issue history. Agents cannot explain who changed labels, assignments, milestones, titles, or lifecycle state.

#### How

- Use the documented issue timeline API with continuation and safe summaries for relevant event types.
- Return event type, actor, timestamp, and bounded event-specific metadata; handle unfamiliar event types without dumping arbitrary raw payloads.
- Distinguish timeline completeness from development-link completeness and preserve the existing specialized development-link tool.
- Verify the issue scope and permit closed-issue reads; avoid unrelated bodies or cache writes.

#### Where

- New `src/tools/issue-timeline.ts`, `src/github/issue-timeline-client.ts`
- `src/github/client.ts`, `src/types.ts`, new timeline client/tool tests

#### Acceptance criteria

- Label, assignment, milestone, rename, close, and reopen history can be inspected with continuation where GitHub exposes it.
- Unknown events, deleted actors, missing optional metadata, large histories, and permission failures are handled safely.
- Existing development-link behavior remains unchanged.

#### Outcome (2026-10-09)

- New `src/github/issue-timeline-client.ts` and `src/tools/issue-timeline.ts`; `GitHubClient.listIssueTimeline` reads `GET /issues/{n}/timeline` with continuation (`issue_timeline`, bound to the issue and the normalized `eventTypes` filter).
- Each event becomes `event`, `actor` (or `actorDeleted`), `createdAt`, and a typed bounded `metadata` map for the modeled kinds: labeled/unlabeled, milestoned/demilestoned, renamed, assigned/unassigned, closed/reopened with `state_reason`, commented (comment ID and URL only, never the body), cross-referenced, issue type changes, sub-issue/parent/blocked-by/blocking edges, committed, referenced, review events, locks, and project-card events. Unfamiliar kinds are flagged and carry only the common fields; raw payloads are never emitted. Strings are capped at 200 characters.
- Open and closed in-scope issues are readable; pull requests and out-of-scope issues are refused before the timeline request. `issueme_list_issue_development_links` is unchanged. Tests: `test/issue-timeline-tool.test.mjs`.

### 12. Add native related-issue relationships

- [x] Implement list/add/remove tools for GitHub's native `relates_to` relationships.

#### Why

Some issues are related without being blockers or parent/child work. Body references should not be misrepresented as native relationships.

#### How

- Use the documented `relates_to` REST endpoints after Task 1 establishes compatibility and availability.
- Reuse dependency identity/number-to-ID validation patterns, but preserve the distinct semantics of related issues.
- Enforce current-repository, creator, PR, and approved state rules; reject self-relations and handle already-present/absent relations explicitly.
- Keep inspection paginated and cache-free unless a separate relationship persistence design is included.

#### Where

- New related-issue tool/client modules alongside the dependency adapters
- `src/github/client.ts`, `src/types.ts`, focused relationship tests

#### Acceptance criteria

- Native related issues can be listed, attached, and detached without changing dependency or sub-issue relationships.
- Direction/symmetry behavior follows the documented API rather than assumptions.
- Tests cover identities, pagination, scope/state guards, feature refusal, no-ops, and mutation settlement; no body fallback exists.

#### Outcome (2026-10-09)

- New `src/github/related-issues-client.ts` and `src/tools/related-issues.ts`; `GitHubClient.listRelatedIssues`, `findRelatedIssue`, `addRelatedIssue[ByIssueResponses]`, `removeRelatedIssue[ByIssueResponses]` over `GET/POST /issues/{n}/relates_to` and `DELETE .../relates_to/{issue_id}`, reusing the dependency identity helpers (database id, pull-request refusal, member validation) while keeping distinct error codes (`github_related_issues_unsupported`, `github_related_issue_refused`) and statuses.
- Semantics: GitHub documents one `relates_to` collection per issue without stating symmetry, so IssueMe reports only the requested issue's collection and never assumes the reverse link. Live run 2026-10-10 (senad-d/IssueMe #21 ↔ #19): GitHub mirrors the link, the reverse side lists it immediately, and the timeline records `relates_to_added`/`relates_to_removed` without a related-issue payload. Both ends must be open, in-scope, non-pull-request issues (same policy as dependencies); self-relations are refused; already-present/absent links are no-ops; 422 and unavailable-feature answers are structured results; reads are cache-free and continuation-aware. Dependency and sub-issue relationships are untouched (tested). Tests: `test/related-issues-tool.test.mjs`.

### 13. Preserve close reasons in issue records and reads

- [x] Expose close reasons consistently through issue normalization, cache, and tool summaries.

#### Why

IssueMe can set a close reason, but its current issue record does not retain `state_reason`. Reading a closed issue cannot reliably distinguish completed work from declined work.

#### How

- Normalize documented state-reason values and preserve absent/null semantics without inventing a reason.
- Add backward-compatible record validation and bounded summary fields used by get/list/refresh/overview where appropriate.
- Preserve closed-issue cache removal and overview request budgets. Do not add a new tool for this metadata.

#### Where

- `src/types.ts`, `src/issues/format.ts`, `src/issues/store.ts`, `src/tools/runtime.ts`
- `src/tools/get-issue.ts`, `src/tools/list-issues.ts`, `src/tools/overview.ts`
- Get/list/close/reopen/overview and cache compatibility tests

#### Acceptance criteria

- Completed versus not-planned reasons survive API normalization and are visible in relevant reads.
- Legacy cache files still load, and missing or unfamiliar reasons do not become fabricated defaults.
- Reopening and closed-cache cleanup remain correct without additional overview requests.

#### Outcome (2026-10-10)

- `IssueStateReason` type; `GitHubIssueResponse.state_reason`, `IssueRecord.state_reason?: IssueStateReason | null`, `ToolIssueSummary.stateReason`. `normalizeIssueStateReason` keeps `completed`/`not_planned`/`duplicate`/`reopened`, preserves `null`, and omits unknown or missing values instead of inventing one. `issueResponseToSafeSummary` carries the same field for relationship summaries.
- Store: `validateIssueRecordCore` accepts absent, `null`, or documented values (`issue_file_state_reason_invalid` otherwise); `orderIssueRecord` persists `state_reason` after `state`; legacy files without the field load unchanged.
- Reads: `formatIssueSummary` prints `State: closed (completed)` / `(no recorded reason)`; `issueme_list_issues` rows show `[closed: not_planned]`; `issueme_close_issue` reports the recorded reason GitHub returned; `issueme_reopen_issue` and bulk results carry `stateReason: "reopened"`. The overview keeps its open-only single-page requests and unchanged rows; closed-issue cache removal is unchanged. No new tool.
- Tests: `test/close-reasons.test.mjs` (normalization, cache persistence/legacy/invalid, list/get-refresh, close/reopen); docs, contracts, compatibility row, and CHANGELOG updated.

### 14. Extend bulk actions symmetrically

- [x] Extend `issueme_bulk_update_issues` with selected existing single-issue operations instead of adding more bulk tools.

#### Why

Bulk add-label, assign, set-milestone, and close have no corresponding remove-label, unassign, clear-milestone, or reopen actions.

#### How

- Add `remove_labels`, `unassign`, `clear_milestone`, and `reopen`, reusing the single-issue semantics and guards.
- Retain explicit unique issue numbers, bounded arrays, action-specific validation, sequential execution, per-run metadata preflights, and default stop-on-error behavior.
- Preserve cache refresh/removal and per-item settlement receipts. Reopen must remain an explicit action, never a repair step for another mutation.
- Defer heterogeneous project-field bulk updates until a separate request defines per-item field/value identities and the approved project state policy.

#### Where

- `src/tools/bulk-issues.ts`, shared mutation helpers in `src/github/client.ts`
- `test/bulk-issues-tool.test.mjs`, `test/tool-integration.test.mjs`, action/schema parity tests

#### Acceptance criteria

- Each new action matches the corresponding single-issue behavior, including state, creator, labels/assignees, and cache rules.
- Partial results identify exactly which items succeeded, failed, or were skipped, and retries do not repeat earlier work blindly.
- Existing bulk actions and the schema/prompt budget remain compatible.

#### Outcome (2026-10-10)

- `BULK_ISSUE_ACTIONS` now enumerates `add_labels`, `remove_labels`, `assign`, `unassign`, `set_milestone`, `clear_milestone`, `add_to_project`, `close`, `reopen`; `BULK_ISSUE_ACTION_FIELDS` maps the new actions (`remove_labels`→`labels`, `unassign`→`assignees`, `clear_milestone`/`reopen`→none) so the field-parity test and `assertNoUnexpectedActionFields` reject stray fields such as `reason` on `reopen`.
- Semantics mirror the single-issue tools: `remove_labels` accepts open or closed issues, issues one DELETE per label, treats missing labels as no-ops, and reports `partial_success` (`remote_partial_success`) when a later removal fails after earlier ones; `unassign` uses `removeAssignees` on open issues without assignable preflight; `clear_milestone` sends `{ milestone: null }` on open issues; `reopen` runs the per-issue creator check, returns a no-change success for already-open issues, PATCHes `state: open, state_reason: reopened`, and refreshes/writes the cache. Sequential execution, explicit unique numbers, per-run preflights, stop-on-error, and per-item settlement receipts are unchanged; reopen is never used as a repair step.
- Tests: four new cases in `test/bulk-issues-tool.test.mjs`; matrix mock gained `removeLabel`/`removeAssignees`/`reopenIssue` and the bulk success matrix covers all nine actions; registration enum assertion updated; schema budget unchanged (description text unchanged). Docs, contracts, SECURITY, README, usage, STRUCTURE, live-verification, and CHANGELOG updated.

### 15. Verify the integrated core tool surface and documentation

- [x] Validate the completed core expansion and reconcile all public tool contracts and workflows.

#### Why

New tools must work together without drifting from inventory, documentation, safety policy, package behavior, or prompt-size constraints.

#### How

- Run the full validation suite and packaged/handler/lifecycle smokes included by `npm run validate`.
- Audit inventory, registrations, contracts, strict schemas, execution modes, result policy, tool descriptions, and model-context budget.
- Add mocked end-to-end workflow coverage for dependency planning, board discovery/update/clear/archive/remove, later-comment reading, and issue-type/history inspection.
- Update live verification and cleanup instructions. Run live cases only if separately authorized; record unavailable permissions/features as unverified rather than successful.
- Confirm that historical unavailability statements are clearly superseded and deferred features are not advertised as shipped.

#### Where

- `test/`, `scripts/smoke-*.mjs`, shared inventory/contracts/documentation files
- `docs/live-github-verification.md`, `CHANGELOG.md`

#### Acceptance criteria

- Full validation passes or unrelated blockers are explicitly reported; no affected feature is marked complete with failing acceptance tests.
- Registered tools, docs, contracts, schema budgets, and package contents agree.
- Mocked workflow coverage demonstrates safe composition and cleanup; any live claims have explicit evidence.
- The default task workflow stops here unless an optional task is explicitly selected.

#### Outcome (2026-10-10)

- `npm run validate` passes (typecheck, eslint, format, 493 tests, package check, packaged install smoke, handler smoke for all 45 tools, Pi lifecycle smoke). Inventory order, registrations, `src/contracts.ts`, `docs/public-contracts.md`, strict schemas, execution modes, enum/required assertions, and the per-tool description/schema budget are enforced by `test/extension-registration.test.mjs` and `test/tool-schema-budget.test.mjs`; every inventory tool has a handler smoke scenario.
- Added `test/workflow-composition.test.mjs`: four mocked end-to-end workflows over one stateful fake GitHub (REST + GraphQL): dependency planning (create → link → list both directions → timeline → unlink → bulk close with recorded reasons), board discovery/add/update/get/clear/archive/list/remove with the issue and cache untouched until an explicit close, later-comment reading through list continuation and `get_comment` on open and closed issues, and issue-type discovery/typed create/refresh/list filter/timeline. Each workflow ends with cleanup and asserts no token leakage.
- Documentation reconciled: README, `docs/tool-reference.md`, `docs/STRUCTURE.md`, and `docs/development.md` now say forty-five tools; `docs/live-github-verification.md` gained matrix rows for comment reads, issue types, timeline, dependencies/related issues, project item maintenance (replacing the stale "no remove-project-item tool" note), bulk symmetry, overview/continuation/close reasons, plus cleanup steps for dependency/related links; all new families are recorded as mocked-only and live-unverified. `docs/github-api-compatibility.md` states what is implemented versus deferred (project item position, custom fields, duplicate close reason) so deferred features are not advertised. CHANGELOG updated.
- Live verification (2026-10-10, maintainer-authorized, run id `20261010063443` on `senad-d/IssueMe`, token from `.env`): every non-Projects family passed end to end with cleanup; see the run record in `docs/live-github-verification.md`. It exposed five defects that mocks could not catch, all fixed with regression tests: an invalid `Repository` fragment inside `ProjectV2Owner` that broke every Projects v2 query, a fragment nested inside the fields-by-id query body, GitHub's `NOT_FOUND` answer for deleted item ids, unknown `relates_to_*` timeline events, and a noisy open-issue state suffix. Projects v2 was first blocked because fine-grained tokens cannot access user-owned Projects; with a classic `project`-scoped token every Projects tool passed on the `issueme-testing` board, including the Task 5 closed-issue exception. All 45 tools were exercised live.
- Not done by design: no commit/push. Tasks 16–22 were not selected.

## Optional track — explicit selection required

### 16. Add native issue custom field discovery and values

- [ ] Add organization field discovery and issue field read/set/clear operations where supported.

#### Why

Organization-defined issue fields are distinct from Projects v2 fields and currently cannot be inspected or maintained through IssueMe.

#### How

- Recheck feature availability and permissions, then reuse the narrowly scoped organization discovery boundary from Task 10.
- Discover definitions/options and use the documented issue-field-value APIs for text, number, date, and single-select values.
- Make additive, replace-all, and explicit clear behavior unambiguous. Guard empty-array behavior because it can clear existing values; never infer destructive replacement from omitted input.
- Keep organization-wide field creation/update/deletion deferred and preserve the existing issue state policy.

#### Where

- New issue-field discovery/value tool and client modules
- `src/github/transport.ts`, `src/types.ts`, focused field/boundary/mutation tests

#### Acceptance criteria

- Fields and values are discoverable, typed values can be changed intentionally, and destructive clearing/replacement is explicit.
- Unsupported repositories, missing access, invalid options/types, and accidental empty-array clearing are tested.
- No project field or organization-wide taxonomy is changed as a side effect.

### 17. Add project item prioritization

- [x] Add a bounded project item move operation using native position updates.

#### Why

Board ordering can represent implementation priority independently of field values or sub-issue order.

#### How

- Use `updateProjectV2ItemPosition` with exact project, moving item, and optional anchor identities from Task 4.
- Verify moving and anchor items belong to the same allowed board/scope and enforce Task 5's approved policy.
- Prefer a single-item move over an unbounded whole-board reorder; describe what can be verified when concurrent edits occur.

#### Where

- Project tool/client modules, project identity guards, focused ordering tests

#### Acceptance criteria

- One item can be repositioned using documented native ordering semantics.
- Foreign anchors, self-anchors, unsupported content, state refusals, and partial settlement fail safely.
- The operation does not change issue relationships or unrelated project fields.

#### Outcome (2026-10-10)

- `issueme_move_project_item` (`src/tools/project-item-maintenance.ts`) over `GitHubClient.moveProjectV2Item` and `updateProjectV2ItemPosition` (`buildMoveProjectV2ItemMutation`). Schema introspection confirmed `afterId` omitted or null moves the item to the top and the payload's `items` connection is the new order. Single-item moves only; no whole-board reorder.
- Guards: `PROJECT_V2_ITEM_ISSUE_STATE_POLICY.move_item = "open_only"` (Task 5 table); the moved item is validated like the other item tools (project, repository, issue number, open state, creator scope); the anchor must differ from the item and resolve (`assertProjectV2AnchorItem`) to an accessible item on the same board, with GitHub's `NOT_FOUND` tolerated as inaccessible. Self, foreign, and inaccessible anchors fail before mutation.
- Verification: `normalizeMoveProjectV2ItemResult` checks the returned order window (first 50 items) for the item at the top or directly after the anchor; anything else, including a concurrent edit or a longer board, is an accepted-but-unverified mutation reported as retry-safe `partial_success`, because repeating the move is safe. Fields, archive state, relationships, and the issue are untouched (asserted in tests).
- Tests: `test/project-item-move-tool.test.mjs` (builder/verifier unit cases, top and anchored moves, anchor refusals, closed/scope/identity guards, unverifiable and malformed payloads); policy map and closed-issue matrix updated; GraphQL document shape test covers the new mutation. Registration, contracts, budget, smoke, docs, SECURITY, compatibility matrix, and CHANGELOG updated (46 tools).
- Live-verified 2026-10-10 on `issueme-testing` (run id `20261010073343`, issues #31/#32): move after anchor (position 2 of 2), move to top (position 1 of 2), self-anchor, stale-anchor, and closed-issue refusals, field values untouched, both items removed afterwards.

### 18. Add issue conversation lock and unlock

- [ ] Add explicit issue lock/unlock operations with documented reason and state policies.

#### Why

Maintainers need to stop or resume discussion without deleting an issue or its comments.

#### How

- Use GitHub's lock/unlock REST endpoints, validate supported lock reasons, and distinguish conversation lock state from open/closed lifecycle state.
- Document and obtain approval for any closed-issue exception separately; Task 5's project-only approval does not cover moderation.
- Require exact in-scope issue identity, preserve idempotent outcomes, and never implicitly close or reopen an issue.

#### Where

- New moderation tool/client helpers, issue summary normalization, moderation tests, `SECURITY.md`

#### Acceptance criteria

- Lock/unlock changes only the intended conversation lock state and reports the result.
- Reasons, permissions, scope, PR refusal, already-matching states, and approved lifecycle policies are tested.
- Existing closed-issue guards are not relaxed globally.

### 19. Add issue and comment pin management

- [ ] Add pin/unpin operations for issues and verified issue comments where the selected API supports them.

#### Why

Pinning highlights important issues or authoritative discussion without rewriting content.

#### How

- Recheck issue and comment pin API availability independently; do not assume they use the same endpoints or permission model.
- Provide read/discovery metadata for current pins before mutation. Verify repository, issue, and comment ownership and document applicable pin limits.
- Use explicit actions and reviewed state policies. Do not evict unrelated pins automatically to satisfy a request.

#### Where

- New pin tools/adapters; existing comment ownership helpers
- Issue/comment summaries, focused pin tests, public contracts

#### Acceptance criteria

- Supported targets can be pinned/unpinned with exact identity and safe already-matching outcomes.
- Full pin capacity, unsupported APIs, wrong-issue comments, permission failures, and state rules are explicit.
- No unrelated pin or issue/comment content is changed.

### 20. Add issue and comment reactions

- [ ] Add bounded reaction discovery and explicit add/remove operations.

#### Why

Agents sometimes need to acknowledge discussion or inspect feedback without posting duplicate comments.

#### How

- Use documented issue/comment reaction APIs with a strict supported-content enum and paginated reads.
- Verify the parent issue and comment before accessing reactions. Require an exact discovered reaction ID for removal.
- Define removal ownership and closed-issue policies explicitly; do not infer permission to delete another user's reaction or silently relax existing guards.

#### Where

- New reaction tool/client modules; comment ownership validation; focused reaction tests

#### Acceptance criteria

- Reactions can be listed and intentionally added/removed for supported in-scope targets.
- Duplicate reactions, foreign reaction/comment IDs, ownership rules, unsupported values, and lifecycle policies are tested.
- Read operations do not mutate cache or remote state.

### 21. Add issue template discovery

- [x] Expose bounded repository issue template discovery before issue creation.

#### Why

Agents should be able to inspect repository reporting expectations rather than inventing issue formats or missing required information.

#### How

- Recheck GitHub's template metadata support and choose a narrowly scoped read-only API path.
- Distinguish Markdown templates, issue forms, and inherited organization defaults; document unsupported formats or inheritance instead of pretending they are fully resolved.
- Return bounded template metadata/content with a retrieval path for truncated material. Treat template instructions as untrusted repository data.
- Do not automatically create issues, modify defaults, apply labels, or claim server-side form validation from discovery alone.

#### Where

- New template discovery tool/client modules; create-issue prompt guidance
- Template discovery, content-boundary, and truncation tests

#### Acceptance criteria

- Available supported templates can be inspected without changing repository files or GitHub state.
- Missing templates, unsupported forms/inheritance, large content, and API permission errors are explicit.
- Documentation separates template discovery from validated form submission or automatic issue creation.

#### Outcome (2026-10-10)

- API path: the REST repository contents endpoint (`/repos/{owner}/{repo}/contents/.github/ISSUE_TEMPLATE`, then per-file reads, then the legacy `.github/ISSUE_TEMPLATE.md`, `ISSUE_TEMPLATE.md`, `docs/ISSUE_TEMPLATE.md`). GitHub's GraphQL `Repository.issueTemplates` was rechecked live and returned an empty list for this repository's four YAML forms, so it cannot be the source. Organization default templates live in the owner's `.github` repository, outside the request boundary, and are reported as unresolved.
- `issueme_list_issue_templates` (`src/tools/issue-templates.ts`, `src/github/issue-templates-client.ts`, `GitHubClient.listIssueTemplates`/`readIssueTemplate`): classifies `markdown`, `issue_form`, `config`, and `unsupported` files; parses Markdown front matter and form top-level keys plus element headers (type, id, label, required) with a bounded line parser because the package has no YAML dependency; never validates forms. Files over 100 KB are listed without content. List mode returns bounded previews (default 300 chars); `filename` returns windowed full text (default 4000, max 8000) with `after` continuation bound to repository, path, and size. Plain file names only; 403 is rewrapped as an explicit Contents-permission error; absent templates are `issue_templates_none`. Runtime bounding redacts token-like text and truncates summaries. No issue is created, no label applied, no file written; `issueme_create_issue` guidance points to the tool.
- Tests: `test/issue-templates-tool.test.mjs` (parsers, directory listing with forms/markdown/config/unsupported/oversized/subdirectory, previews, single-file windows and continuation, unsafe and unknown names, legacy fallback, none, 403). Registration, contracts, budget, smoke, docs, SECURITY, compatibility matrix, usage, and CHANGELOG updated (47 tools).

### 22. Add gated issue suggestion review

- [ ] Add list/approve/dismiss tools only for repositories where GitHub's issue suggestions feature is available.

#### Why

Maintainers may need to review agent-proposed issue changes without applying every suggestion automatically.

#### How

- Recheck the feature gate and documented list/approve/dismiss endpoints and permissions before implementation.
- List bounded pending/history suggestions; validate that an exact suggestion belongs to the selected in-scope issue and reread its current action/state before mutation.
- Make approval and dismissal explicit. Do not automatically approve suggestions or assume approval means the proposed change has already been applied.
- Reconcile issue/cache state after an applied change, especially closure, and preserve settlement-safe partial results.

#### Where

- New suggestion review tool/client modules; cache reconciliation helpers
- Feature-gate, stale-suggestion, action/state, permission, and partial-success tests

#### Acceptance criteria

- Unavailable features are reported as unavailable, never as an empty successful suggestion list.
- Selected suggestions can be reviewed and explicitly approved/dismissed with verified identity and action-aware safety.
- Pending, applied, approved, dismissed, stale, and invalidated outcomes follow documented semantics; cache state does not falsely claim an unapplied change.

## Deferred scope — no automatic implementation

- Cross-repository issue transfer: requires explicit destination authorization, redesigned repository boundaries, identity/URL reconciliation, and source/destination cache handling.
- Organization-wide issue type/field administration: affects repositories beyond the current checkout and needs separate scope and destructive-change approval.
- Full Projects v2 board/field administration, draft-item workflows, and heterogeneous project-field bulk updates: separate product scope, not prerequisites for repairing the issue-backed item workflow.
- Native duplicate management: do not invent a mutation or silently substitute a comment/body convention without verified API semantics and an explicit design.
- PR/branch/CI lifecycle tooling: retain the boundary with dedicated extensions rather than duplicating their tool surfaces here.
- Webhooks, background watchers, telemetry, and shell/GitHub CLI wrappers remain outside this plan.

## Authoritative API references

Recheck these during Task 1 and each affected optional task; current documentation is not proof of token/repository feature access.

- Dependencies: https://docs.github.com/en/rest/issues/issue-dependencies
- Issues, types on issues, locking, related issues, and suggestions: https://docs.github.com/en/rest/issues/issues
- Organization issue types: https://docs.github.com/en/rest/orgs/issue-types
- Organization issue fields: https://docs.github.com/en/rest/orgs/issue-fields
- Issue field values: https://docs.github.com/en/rest/issues/issue-field-values
- Comments: https://docs.github.com/en/rest/issues/comments
- Timeline: https://docs.github.com/en/rest/issues/timeline
- Reactions: https://docs.github.com/en/rest/reactions/reactions
- Projects v2 API guide: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects
- GitHub REST OpenAPI descriptions: https://github.com/github/rest-api-description
- Published GraphQL schema reference used in the investigation: https://github.com/octokit/graphql-schema
