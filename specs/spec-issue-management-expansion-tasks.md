# Plan: IssueMe Issue Management Expansion Tasks

> Use this backlog with the `next-task` skill by setting that skill's `TASK_FILE` variable to `specs/spec-issue-management-expansion-tasks.md`, or by explicitly asking the agent to use this file. Do not run more than one unchecked task per next-task invocation.

## Task Description

Expand IssueMe from core issue CRUD into a fuller GitHub issue-management surface so agents can triage, discover repository metadata, keep project boards current, recover from closed/reopened work, and manage native relationships without dropping to manual GitHub UI work.

## Current Tool Coverage

IssueMe currently registers these tools:

- `issueme_sync_issues`
- `issueme_list_issues`
- `issueme_list_labels`
- `issueme_list_milestones`
- `issueme_list_assignees`
- `issueme_list_projects`
- `issueme_get_project_fields`
- `issueme_add_issue_to_project`
- `issueme_update_project_item`
- `issueme_manage_label`
- `issueme_manage_milestone`
- `issueme_create_issue`
- `issueme_create_sub_issue`
- `issueme_add_sub_issue`
- `issueme_remove_sub_issue`
- `issueme_reorder_sub_issues`
- `issueme_list_sub_issues`
- `issueme_list_issue_development_links`
- `issueme_get_issue`
- `issueme_update_issue`
- `issueme_comment_issue`
- `issueme_update_comment`
- `issueme_delete_comment`
- `issueme_assign_issue`
- `issueme_label_issue`
- `issueme_reopen_issue`
- `issueme_close_issue`

This covers the core development loop plus issue search/listing, repository label discovery/management, milestone discovery/management, assignee/collaborator discovery, GitHub Projects v2 board/field discovery and issue item management, controlled reopen support, close reasons, comment correction/deletion, native sub-issue relationship inspection/refresh/reordering, and linked development reference inspection for issues. Native dependency/blocker/tracked-by relationships are documented as unsupported until GitHub exposes a stable REST or GraphQL API with documented list/add/remove semantics.

## Checkbox Policy

- A top-level task must be a markdown checklist item in this exact form: `- [ ] Task name`.
- A task uses `[ ]` until **all** acceptance criteria for that task are met.
- A task uses `[x]` only when that task is complete and validation has passed.
- Subtasks in `How to resolve` are regular bullets, not checkboxes, so the `next-task` skill selects only top-level task items.
- Execute tasks in order unless the user explicitly names a later unchecked task.

## Global Implementation Rules

- Keep GitHub access direct through REST and GraphQL APIs; do not add GitHub CLI or shell-based GitHub operations.
- Use mocked `fetch`/GraphQL responses in tests; do not require live GitHub calls or live mutations.
- Preserve project-trust, token-redaction, repository-boundary, local-cache, bounded-output, and closed-issue safety rules.
- Every new tool must have a strict schema, prompt metadata, bounded safe `details`, tests, docs, and registration/smoke updates.
- Mutating tools must use `executionMode: "sequential"`.
- Do not silently degrade native GitHub relationship features into body-only references unless a future task explicitly adds an opt-in fallback.

## Step by Step Tasks

- [x] Review current tool coverage and define the expansion backlog

#### Why

The current tool set covers basic issue lifecycle work, but full issue management requires discovery, triage, reopening, project-board updates, metadata management, comment correction, and richer relationship handling.

#### How to resolve

- Review `src/tools/issueme-tools.ts` and the README tool table.
- Compare current tools against common GitHub issue-management workflows.
- Create a new ordered task spec that can be consumed one unchecked task at a time by the `next-task` skill.
- Keep implementation work out of this planning task.

#### Acceptance criteria

- A new spec exists at `specs/spec-issue-management-expansion-tasks.md`.
- The spec lists the current IssueMe tools.
- The spec contains ordered unchecked implementation tasks.
- Every implementation task has `Why`, `How to resolve`, and `Acceptance criteria` sections.

- [x] Add an issue list/search/filter tool

#### Why

Agents cannot reliably triage or choose work unless they can list and search issues without already knowing an issue number or local cache filename. Relying only on `issueme_sync_issues` and `issueme_get_issue` can interrupt development when the backlog is large, labels are unknown, or closed/all-state issue discovery is needed.

#### How to resolve

- Add a tool such as `issueme_list_issues`.
- Support filters for `state` (`open`, `closed`, `all`), labels, assignee, creator/author, mentioned user, milestone, `since`, sort, direction, result limit, and an optional text/query search.
- Exclude pull requests by default unless an explicit `includePullRequests` option is added and documented.
- Use the safest GitHub API path for each mode:
  - repository issue listing for structured filters when possible;
  - GitHub search API only when text/query search is requested, with an enforced `repo:owner/repo is:issue` boundary.
- Return bounded issue summaries with truncation metadata.
- Decide whether the tool is read-only or can optionally refresh/cache listed issues; document the decision.
- Add tests for filter construction, search boundary enforcement, PR exclusion, pagination/limits, truncation, and safe errors.
- Update README, command/help tool discovery, smoke discovery expectations, and package contents if new files are added.

#### Acceptance criteria

- Agents can list open, closed, or all issues for the current repository without knowing issue numbers in advance.
- Label, assignee, milestone, author/creator, mentioned, since, sort, direction, and limit filters are supported or explicitly documented as unsupported.
- Text/query search cannot escape the resolved repository or include pull requests by default.
- Tool output and `details` are bounded and token/body safe.
- Tests cover REST list mode, search mode, pagination/limit behavior, PR exclusion, and repository-boundary safety.
- README documents usage examples for common triage queries.

- [x] Add single-issue refresh/sync for any issue state

#### Why

The current sync flow caches open issues and removes closed local files. Agents sometimes need to refresh one known closed issue, inspect why it closed, or reconcile one stale issue without syncing the whole open backlog. Without a focused refresh, closed/all-state workflows can require manual GitHub inspection.

#### How to resolve

- Add a tool such as `issueme_refresh_issue` or extend `issueme_get_issue` with clearly documented any-state refresh behavior.
- Accept an issue number and fetch the remote issue plus bounded comments.
- For open issues, write/update the local issue file.
- For closed issues, preserve the current local-cache policy: either remove matching local cache files and return a full safe summary, or introduce an explicitly documented closed-issue cache mode if approved.
- Report local cache action (`created`, `updated`, `renamed`, `removed`, `unchanged`) in details.
- Add tests for open refresh, closed refresh/removal, missing issue, stale title rename, bounded comments, and safe output.

#### Acceptance criteria

- A known issue number can be refreshed without running a full repository sync.
- Closed issue refresh returns useful remote details and does not leave misleading open-cache files behind.
- Open issue refresh updates local cache consistently with `issueme_sync_issues`.
- Tool details report cache actions and removed paths.
- Tests cover open, closed, missing, renamed, and comment-truncated cases.

- [x] Add a controlled issue reopen tool

#### Why

IssueMe intentionally refuses accidental mutations of closed issues, but real development sometimes needs to reopen an issue closed by mistake or reopened by product decision. Without a first-class reopen tool, users must leave IssueMe and use GitHub manually.

#### How to resolve

- Add `issueme_reopen_issue`.
- Require an explicit issue number and optionally a comment/body explaining why the issue is being reopened.
- Fetch the issue first; if it is already open, return an idempotent success/no-op with current state.
- If closed, call GitHub to set `state: "open"` and an appropriate state reason if supported by the API.
- Refresh and write the local issue cache after successful reopen.
- Keep this as the only intentional closed-issue mutation path and document the exception clearly.
- Add tests for reopening a closed issue, already-open no-op, permission/API failure, cache refresh failure partial success, and token-safe errors.

#### Acceptance criteria

- `issueme_reopen_issue` reopens a closed GitHub issue and refreshes its local cache.
- Already-open issues are handled as idempotent no-ops.
- Closed-issue mutation protection remains intact for update/comment/assign/label/close/sub-issue tools.
- Optional reopen comment behavior is documented and tested if implemented.
- Permission/API and cache failures produce clear safe errors or partial-success details.

- [x] Add close reason support

#### Why

Closing an issue without distinguishing `completed` from `not_planned` weakens issue history and triage quality. Development workflows often need to know whether work was finished or deliberately declined.

#### How to resolve

- Extend `issueme_close_issue` with an optional close reason input such as `reason: "completed" | "not_planned"`.
- Map the reason to GitHub's supported `state_reason` field.
- Preserve current already-closed idempotent behavior.
- Update tool prompt guidelines so agents choose `not_planned` only when explicitly appropriate.
- Add tests for completed close, not-planned close, omitted reason default, already-closed no-op, and invalid schema rejection.
- Update README examples and troubleshooting notes.

#### Acceptance criteria

- Closing an issue can set GitHub close reason when requested.
- Omitting reason preserves existing behavior or uses a documented safe default.
- Already-closed issues are not mutated again.
- Tool schema remains provider-friendly and strict.
- Tests prove both close reasons and no-regression behavior for current close flows.

- [x] Add repository label discovery

#### Why

Agents can apply labels today, but they cannot discover valid repository labels. This leads to invalid label attempts, inconsistent taxonomy, and unnecessary interruptions during triage.

#### How to resolve

- Add `issueme_list_labels`.
- Fetch repository labels with pagination and a configurable/ bounded limit.
- Return label name, description, color, default status, and URL when GitHub provides them.
- Support optional text/name filtering client-side or API-side.
- Keep output bounded and avoid returning issue bodies/comments.
- Add tests for pagination, filtering, truncation, empty repository labels, and API failures.
- Update README with examples showing how to discover labels before applying them.

#### Acceptance criteria

- Agents can list available labels before calling `issueme_label_issue` or create/update tools.
- Label output includes enough metadata to choose labels safely.
- Large label sets are bounded with truncation metadata.
- Tests cover normal, empty, paginated, filtered, and failure cases.
- README documents label discovery workflow.

- [x] Add repository label management

#### Why

Some repositories expect agents to create or adjust labels during issue hygiene. Without label management, users must manually create labels before IssueMe can apply them.

#### How to resolve

- Add tools or one action-based tool for label create/update/delete, for example `issueme_manage_label`.
- Support creating labels with name, color, and optional description.
- Support updating name, color, and description.
- Support deleting labels only with explicit action and clear warning text in docs.
- Treat duplicate label/404 cases with clear idempotency decisions.
- Keep delete operations sequential and safe; never delete issue objects.
- Add tests for create, update, delete, duplicate, missing label, validation, and safe errors.
- Update README and SECURITY to document label deletion behavior.

#### Acceptance criteria

- Labels can be created and updated through IssueMe.
- Label deletion is explicit, documented, and tested.
- Invalid colors/names are rejected before remote calls when possible.
- API conflicts and missing labels return actionable safe results.
- Existing issue-label assignment behavior continues unchanged.

- [x] Add milestone discovery

#### Why

`issueme_update_issue` can set a milestone by number, but agents cannot discover valid milestone numbers. This can block planning/sprint work and cause invalid updates.

#### How to resolve

- Add `issueme_list_milestones`.
- Support state filtering (`open`, `closed`, `all`), sort/direction where GitHub supports it, and bounded pagination.
- Return number, title, state, description, due date, open/closed issue counts, and URL when available.
- Add tests for state filters, pagination, truncation, no milestones, and API errors.
- Update README with examples for listing milestones before updating an issue.

#### Acceptance criteria

- Agents can discover milestone numbers and titles before assigning milestones.
- Open, closed, and all milestone listing is supported or documented according to GitHub API capability.
- Output is bounded and safe.
- Tests cover normal, empty, paginated, filtered, and failure cases.
- README documents milestone discovery workflow.

- [x] Add milestone management

#### Why

Development planning often requires creating a release/sprint milestone, updating due dates, or closing completed milestones. Without this, IssueMe cannot manage the full issue planning loop.

#### How to resolve

- Add tools or an action-based tool for milestone create/update/close/reopen/delete, for example `issueme_manage_milestone`.
- Support title, description, due date, and state fields that GitHub accepts.
- Decide whether delete is included now; if included, require explicit action and document that issues lose the milestone association.
- Add validation for empty titles and date formats before remote calls.
- Add tests for create, update, close, reopen, optional delete, validation, permission/API failures, and no live calls.
- Update README and SECURITY for milestone mutation behavior.

#### Acceptance criteria

- Milestones can be created and updated through IssueMe.
- Milestones can be closed/reopened if supported by the implemented API path.
- Delete behavior is either implemented with explicit safeguards or intentionally deferred with documentation.
- Invalid inputs are rejected safely before remote mutation when possible.
- Tests prove milestone mutations and safe error handling.

- [x] Add assignee/collaborator discovery

#### Why

Agents can assign users, but cannot discover who is assignable. This causes invalid assignee attempts and interrupts work when usernames are unknown.

#### How to resolve

- Add `issueme_list_assignees` or `issueme_list_collaborators` with clear semantics.
- Prefer GitHub's issue assignees endpoint when available for assignable users.
- Support optional text/login filtering and bounded pagination.
- Return login, ID if safe/useful, profile URL, and type when available.
- Add tests for pagination, filtering, empty results, permission failures, and output bounding.
- Update README with an assignment workflow example.

#### Acceptance criteria

- Agents can discover assignable users before calling `issueme_assign_issue`.
- Output is bounded and does not expose credentials or private config.
- Permission failures are clear and actionable.
- Tests cover normal, empty, paginated, filtered, and failure cases.
- README documents assignee discovery.

- [x] Add comment edit and delete tools

#### Why

Agents can add comments but cannot correct a typo, remove an accidental duplicate, or delete an incorrect progress note. This can leave confusing issue history and force manual GitHub UI cleanup.

#### How to resolve

- Add `issueme_update_comment` and `issueme_delete_comment`, or one action-based comment management tool.
- Require `issueNumber` plus `commentId` so the tool can verify the target issue context before mutating a comment.
- Fetch/verify the issue and comment before mutation.
- Preserve closed-issue safety: either refuse comment edits/deletes on closed issues or explicitly document an approved exception.
- Refresh the parent issue cache after successful edit/delete.
- Add tests for edit, delete, wrong issue/comment mismatch, missing comment, closed issue policy, cache refresh, and safe errors.
- Update README with comment correction examples.

#### Acceptance criteria

- Existing comments can be edited when policy allows it.
- Existing comments can be deleted only through an explicit delete action/tool.
- A comment cannot be accidentally mutated against the wrong issue number.
- Closed-issue comment policy is documented and enforced.
- Tests cover edit, delete, mismatch, missing, closed-policy, and cache-refresh behavior.

- [x] Add GitHub Projects v2 discovery tools

#### Why

Many teams run development through GitHub Projects. IssueMe can manage issues, but without project discovery an agent cannot know project IDs, fields, statuses, priorities, or iteration options. This can interrupt development when project-board state is required for planning.

#### How to resolve

- Add read-only discovery tools such as `issueme_list_projects` and `issueme_get_project_fields`.
- Use GitHub GraphQL Projects v2 APIs and repository/organization/user project scopes as needed.
- Return project title, number, owner, URL, field names, field IDs, data types, single-select options, iteration options, and safe metadata.
- Keep results bounded and include truncation metadata.
- Handle permission failures with actionable errors explaining required project access/scopes.
- Add tests with mocked GraphQL responses for repository/org/user projects, field types, truncation, and forbidden errors.
- Update README with a project discovery workflow.

#### Acceptance criteria

- Agents can discover relevant Projects v2 boards for the current repository or configured owner scope.
- Agents can inspect project fields/options before attempting project mutations.
- GraphQL permission failures are clear and token-safe.
- Output is bounded for large projects/field sets.
- Tests cover discovery, field parsing, truncation, and forbidden responses.

- [x] Add GitHub Projects v2 issue item management

#### Why

If a repository uses GitHub Projects as the source of truth for development status, IssueMe must be able to add issues to projects and update status/priority/iteration/custom fields. Otherwise agents can create/update issues but leave project boards stale.

#### How to resolve

- Add tools such as `issueme_add_issue_to_project` and `issueme_update_project_item`.
- Require project and field identifiers discovered by Task 11, or support safe lookup by project number/title plus field/option names.
- Support adding an issue to a project.
- Support updating common field types: single-select status/priority, iteration, date, text, number, and assignees if GitHub supports them.
- Return project item IDs and changed fields in bounded safe details.
- Handle already-added/idempotent cases clearly.
- Add tests for add item, already-added, update single-select, update iteration/date/text/number, invalid field/option, forbidden errors, and no live calls.
- Update README with project-board update examples.

#### Acceptance criteria

- An issue can be added to a GitHub Projects v2 board through IssueMe.
- Common project fields can be updated using discovered IDs or documented lookup inputs.
- Already-added and invalid option cases are safe and actionable.
- Permission failures explain required project access/scopes.
- Tests cover successful add/update flows, idempotency, invalid inputs, and GraphQL failures.

- [x] Add native sub-issue list and relationship refresh

#### Why

IssueMe can create, attach, and remove native sub-issues, but local relationship metadata is only as fresh as the last operation. Agents need a reliable way to inspect current parent/sub-issue relationships before planning work.

#### How to resolve

- Add a read-only tool such as `issueme_list_sub_issues`, or extend `issueme_get_issue refresh` to fetch native relationship metadata through GraphQL.
- Given an issue number, return parent issue metadata, child sub-issues, total counts, and URLs/states when available.
- Optionally refresh local cache metadata for the parent and children if a `refreshCache` option is explicitly provided.
- Bound large sub-issue lists and include truncation metadata.
- Handle GitHub GraphQL feature/permission failures clearly.
- Add tests for parent-only, child-only, issue with many sub-issues, no relationships, cache refresh, and forbidden/unsupported responses.
- Update README with relationship inspection examples.

#### Acceptance criteria

- Agents can inspect native parent/sub-issue relationships without mutating them.
- Local relationship metadata can be refreshed intentionally.
- Large sub-issue lists are bounded with truncation metadata.
- Permission or feature failures are clear and do not fall back to body-only references.
- Tests cover relationship shapes, cache refresh, truncation, and failures.

- [x] Add native sub-issue reorder/prioritize support if GitHub exposes it

#### Why

Sub-issue ordering can represent implementation priority. If GitHub exposes native reorder/prioritize APIs, IssueMe should support them so agents can keep parent issue task order accurate. If GitHub does not expose a stable API, IssueMe should document that clearly instead of inventing unsafe body-only ordering.

#### How to resolve

- Research the current GitHub GraphQL/REST support for native sub-issue ordering.
- If a stable mutation exists, add a tool such as `issueme_reorder_sub_issues`.
- Require explicit parent number and ordered child issue numbers.
- Verify all children belong to the parent before reordering when possible.
- Refresh local relationship metadata after reorder.
- If no supported API exists, add a documented unsupported decision and do not add a fake fallback.
- Add tests for successful reorder if implemented, invalid child list, missing child, permission failure, cache refresh, and unsupported decision behavior.

#### Acceptance criteria

- If GitHub exposes native sub-issue reordering, IssueMe can reorder sub-issues safely and refresh cache metadata.
- If GitHub does not expose native reordering, the unsupported decision is documented and no misleading body-only fallback is added.
- Invalid child lists are rejected before mutation when possible.
- Tests cover the implemented path or the documented unsupported decision.
- README accurately describes reorder support or lack of support.

- [x] Investigate and implement native issue dependency/blocker relationships if available

#### Why

Development can be interrupted when an issue depends on another issue or is blocked by work elsewhere. If GitHub exposes native dependency/blocker relationships, IssueMe should manage them. If not, IssueMe should avoid pretending body text references are native relationships.

#### How to resolve

- Research current GitHub APIs for native issue dependencies, blockers, or tracked-by relationships.
- If stable APIs exist, add tools such as `issueme_add_issue_dependency`, `issueme_remove_issue_dependency`, and `issueme_list_issue_dependencies`.
- Require explicit parent/blocker/dependent numbers and verify issue state/repository boundaries.
- Refresh local cache relationship metadata if data is stored locally.
- If no stable native API exists, document the unsupported decision in README or a small ADR/spec note.
- Do not create body-only dependency references unless a future task adds an explicit opt-in fallback.
- Add tests for supported API flows or unsupported decision behavior.

Decision: no stable native GitHub REST or GraphQL API with documented dependency/blocker/tracked-by list/add/remove semantics is available in the public issue API surface IssueMe uses today. IssueMe therefore documents dependency/blocker support as unsupported, registers no dependency tools, and adds no body-only fallback.

#### Acceptance criteria

- Native dependency/blocker support is either implemented with tests or explicitly documented as unsupported.
- No body-only fallback is introduced silently.
- Implemented dependency tools enforce repository boundaries and safe closed-issue policy.
- Permission/API failures are actionable and token-safe.
- README documents how agents should handle dependencies/blockers with IssueMe.

- [x] Add linked pull request and development reference inspection

#### Why

Issue-driven development often depends on knowing whether an issue already has linked pull requests, branches, commits, or closing references. Without this, agents can duplicate work or miss in-progress implementation.

#### How to resolve

- Add a read-only tool such as `issueme_list_issue_development_links` if GitHub exposes the needed data through REST/GraphQL.
- Return linked pull requests, PR states, URLs, branch names when available, and closing/reference metadata.
- Keep output bounded and avoid fetching unrelated PR bodies unless explicitly needed.
- Handle missing/unsupported API data by documenting limitations.
- Add tests with mocked GraphQL/REST responses for no links, one PR, many PRs/truncation, closed PRs, and permission failures.
- Update README with guidance to inspect linked development before starting work on an issue.

#### Acceptance criteria

- Agents can inspect whether an issue already has linked implementation work when GitHub exposes that data.
- Output is bounded, safe, and read-only.
- Unsupported API limitations are documented instead of hidden.
- Tests cover no links, linked PRs, truncation, and failures.
- README documents when to use the tool in development workflows.

- [x] Add bulk issue operations with explicit safety guards

#### Why

Triage often requires applying the same label, assignee, milestone, project status, or close action to multiple issues. Without bulk operations, agents may perform many sequential calls manually, increasing context usage and inconsistency risk.

#### How to resolve

- Add a bulk tool only after the underlying single-issue operations are stable.
- Support a limited set of actions such as add labels, assign, set milestone, add to project, or close with reason.
- Require explicit issue numbers; do not run bulk operations from an unconstrained search query without user confirmation/design approval.
- Execute sequentially and report per-issue success/failure summaries.
- Stop or continue-on-error according to an explicit input option with a safe default.
- Add tests for all-success, partial failure, closed issue refusal, bounded details, no token leaks, and idempotent cases.
- Update README with warnings and examples.

#### Acceptance criteria

- Bulk operations are available only for explicitly listed issue numbers.
- Results include per-issue success/failure without unbounded output.
- Partial failures are clear and do not hide successful remote mutations.
- Closed-issue and permission safeguards remain intact.
- Tests cover success, partial success, failure policy, and bounded details.

- [x] Update docs, smoke discovery, and release notes for the expanded issue-management surface

#### Why

New tools are only useful if agents and users can discover them. Smoke tests and docs must track the expanded tool surface, otherwise regressions can hide until runtime.

#### How to resolve

- Update README tool tables and usage examples for all newly implemented tools.
- Update SECURITY for any new network, mutation, delete, project, or relationship behavior.
- Update docs/STRUCTURE and docs/context-router.yaml when new modules/routes are added.
- Update smoke discovery expected tool names.
- Update extension-registration tests for prompt metadata, strict schemas, and sequential mutating tools.
- Update CHANGELOG with the new capabilities.
- Run the repository validation command required by the selected implementation tasks.

#### Acceptance criteria

- Documentation lists every registered IssueMe tool and its intended use.
- Smoke discovery verifies `/issueme` and every `issueme_*` tool.
- Security docs describe any new delete/project/relationship mutation behavior.
- Extension registration tests include every new tool.
- CHANGELOG summarizes the expanded issue-management functionality.
