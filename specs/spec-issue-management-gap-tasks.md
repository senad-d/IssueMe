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

- [ ] Record supported API versions and feature requirements, and replace outdated dependency API unavailability claims.

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

### 2. Add bounded continuation to discovery tools

- [ ] Let callers resume truncated REST and GraphQL discovery results without removing per-call limits.

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

### 3. Add native dependency inspection and mutation

- [ ] Implement `issueme_list_issue_dependencies`, `issueme_add_issue_dependency`, and `issueme_remove_issue_dependency`.

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

### 4. Add read-only project item discovery

- [ ] Implement `issueme_list_project_items` and `issueme_get_project_item` with current field values.

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

### 5. Define the closed-issue policy for project-only operations

- [ ] Document and obtain approval for any narrowly scoped closed-issue exceptions needed by project maintenance.

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

### 6. Add project item removal

- [ ] Implement `issueme_remove_issue_from_project` without deleting the issue itself.

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

### 7. Add explicit project field clearing

- [ ] Add a clear-field operation to the project tool surface.

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

### 8. Add project item archive and unarchive

- [ ] Implement an explicit archive/unarchive project item operation.

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

### 9. Add paginated comment reading and focused comment retrieval

- [ ] Implement `issueme_list_issue_comments` and `issueme_get_comment` without requiring cache sync.

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

### 10. Add issue type discovery and existing-tool support

- [ ] Implement `issueme_list_issue_types` and extend create/update/list/get for native issue types.

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

### 11. Add full issue timeline inspection

- [ ] Implement `issueme_list_issue_timeline` as a bounded read-only history tool.

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

### 12. Add native related-issue relationships

- [ ] Implement list/add/remove tools for GitHub's native `relates_to` relationships.

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

### 13. Preserve close reasons in issue records and reads

- [ ] Expose close reasons consistently through issue normalization, cache, and tool summaries.

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

### 14. Extend bulk actions symmetrically

- [ ] Extend `issueme_bulk_update_issues` with selected existing single-issue operations instead of adding more bulk tools.

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

### 15. Verify the integrated core tool surface and documentation

- [ ] Validate the completed core expansion and reconcile all public tool contracts and workflows.

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

- [ ] Add a bounded project item move operation using native position updates.

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

- [ ] Expose bounded repository issue template discovery before issue creation.

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
