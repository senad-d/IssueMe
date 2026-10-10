# IssueMe Tool Reference

IssueMe registers forty-five `issueme_*` tools. All tools require a trusted project before using project-local IssueMe state.

## Result and failure signaling

Pi marks a tool call as failed only when the handler throws. IssueMe throws for validation, trust, repository/token setup, closed-issue refusal, unexpected GitHub/API failures, aborts, and pre-mutation cache failures.

Handled domain outcomes return normal pi tool results with structured `details.result`:

- `success` for successful work and idempotent no-ops.
- `partial_success` when a remote mutation may have succeeded but cache/follow-up work failed; inspect `needsSync`, `status`, and safe retry guidance. The read-only overview also uses `partial_success` for unavailable sections, with `needsSync: false`.
- `error` for documented structured failures such as known label/milestone conflicts, native sub-issue operation failures without body-only fallback, and aggregate bulk per-item failures.

Agents should check both pi `isError` and IssueMe `details.result`/`status` before assuming a mutation succeeded. The full public contract matrix is in [`public-contracts.md`](public-contracts.md).

## Discovery and read-only tools

| Tool | Behavior |
| --- | --- |
| `issueme_get_overview` | Compact read-only overview of open issues, labels, open milestones, assignable users, and repository-linked open Projects v2 boards. One page per selected section, shared runtime, no cache writes. |
| `issueme_list_issues` | Read-only list/search for current-repository issues by state, labels, assignee, author/creator, mentioned user, milestone, issue `type` (name, or `*`/`none` without a text query), updated-since, sort/direction, and limit. Text search enforces the current repository and excludes pull requests. Closed issues show their recorded reason as `[closed: completed]` or `[closed: not_planned]` when GitHub reports one. |
| `issueme_list_labels` | Read-only repository label discovery with name, description, color, default status, URL, optional filters, limit, and truncation metadata. |
| `issueme_list_milestones` | Read-only milestone discovery with number, title, state, description, due date, issue counts, URL, filters, and truncation metadata. |
| `issueme_list_assignees` | Read-only assignable-user discovery with login, safe ID, profile URL, user type, filters, and truncation metadata. |
| `issueme_list_issue_types` | Read-only discovery of the owning organization's native issue types (id, name, description, color, enabled flag). User-owned repositories return `status: issue_types_unavailable` without an organization request; a 404 on the organization endpoint is reported as `github_issue_types_unsupported`. The only `/orgs/*` request IssueMe makes is the resolved owner's `issue-types` list. |
| `issueme_list_projects` | Read-only GitHub Projects v2 board discovery for repository, organization, or user owner scope. Returns project IDs, numbers, titles, owners, URLs, visibility/state, and truncation metadata. |
| `issueme_get_project_fields` | Read-only Projects v2 field discovery by project ID or scope/number. Returns field IDs, data types, single-select options, iteration options, and truncation metadata. |
| `issueme_list_sub_issues` | Inspect native GitHub parent/sub-issue relationships for one issue. Writes local relationship metadata only when `refreshCache: true` is explicit. |
| `issueme_list_issue_development_links` | Read-only linked-development inspection for one issue through GitHub GraphQL timeline data. Returns bounded PR, branch, commit, closing/reference, URL/state, and truncation metadata without fetching PR bodies. |
| `issueme_list_issue_timeline` | Read-only history for one open or closed issue through GitHub's REST timeline: event name, actor (or a deleted-actor flag), timestamp, and bounded typed metadata for labels, milestones, renames, assignments, state changes with reasons, issue types, sub-issue/parent/dependency edges, comments (ID and URL only, never bodies), cross-references, commits, locks, and reviews. Unfamiliar event kinds keep only the common fields and are flagged; `eventTypes` filters by event name and `after` continues. Timeline completeness is separate from development-link completeness. |

Discovery tools do not refresh or write local cache files except `issueme_list_sub_issues` when called with `refreshCache: true`.

### Continuation

Every discovery tool above except the overview accepts an optional `after` token and returns `details.continuation`:

- `collection`: the collection the token belongs to (`issues`, `issue_search`, `labels`, `milestones`, `assignees`, `projects`, `project_fields`, `sub_issues`, `development_links`).
- `complete`: `true` when the collection was exhausted. `false` with `nextToken` means more pages exist; `false` without `nextToken` means GitHub exposes no further page (for example the issue search result cap).
- `nextToken`: opaque token to pass as `after` on the next call with the **same filters**. Changing `limit` between calls is allowed; changing any filter, the issue number, the project, or the repository is rejected with `continuation_token_invalid`.
- `resumed` and `pagesRead`: whether this call resumed from a token and how many upstream pages it read.

Tokens never contain URLs and are bound to the current repository, the collection, and a fingerprint of the normalized filters; IssueMe builds every request itself. REST collections resume by absolute position, so a call that stopped partway through an upstream page (because of client-side filtering or the limit) resumes at the exact next member. GraphQL connections resume from GitHub cursors. Per-call limits are unchanged. Traversal of a changing GitHub collection is not an atomic snapshot: members added, removed, or reordered between calls can be missed or repeated.

Not paginated by GitHub: single-select options and iteration lists inside a project field. IssueMe bounds them with `optionLimit`/`iterationLimit` (max 25 each) and reports `truncation` per field; there is no continuation for them. Development-link pages are deduplicated per page only, so a pull request referenced by events on several pages appears on each page. `issueme_list_sub_issues` refuses `after` together with `refreshCache: true`; refresh the cache from a first-page read.

### Repository overview

Start with `issueme_get_overview {}` for initial orientation; do not sync the whole issue/comment cache unless local files are needed.

Parameters:
- `sections`: optional unique non-empty selection of `issues`, `labels`, `milestones`, `assignees`, `projects`; defaults to all five.
- `limit`: rows per section, default 10, maximum 25.

The tool resolves trust/config/repository/token once and concurrently reads **at most one page per selected section**, at most five GitHub requests. It reuses REST list readers and a separate Projects v2 GraphQL reader; it does not yet batch these into one GraphQL request. Existing discovery tools may already run in parallel, so the main savings are agent orchestration, compact output, and avoiding unnecessary cache sync/comment requests—not fewer requests than equivalent single-page discovery.

`details.overview` contains `startedAt`, `fetchedAt`, `maxRequests` (a budget, not a measured count), and a status for every section:
- `complete`: the selected collection was exhausted within the page/summary bounds; an empty collection is valid.
- `truncated`: more collection data exists or summary fields were shortened. Zero returned rows can still be truncated, for example when the first page contains only PRs or closed boards.
- `unavailable`: that section failed; its safe error is included, with no false zero count.
- `omitted`: not requested; no API call was made for it.

Each read section reports `returned`, `limit`, and a `drillDown` tool; `displayTruncated` separately flags shortened model-facing text. Summaries are in `details.issues`, `labels`, `milestones`, `assignees`, and `projects`. Overview issue summaries include `updatedAt` and milestone number/title when available. **Returned rows are not repository totals.** Open issues are ordered by most recently updated and restricted by `allowedIssueCreator`; other metadata and GitHub milestone counts are repository-wide, not creator-scoped. Fetch times describe a read window, not an atomic GitHub snapshot.

Independent API/network/shape/Projects permission failures preserve successful sections: `result: partial_success`, `status: overview_partial`, `needsSync: false`. If all selected sections fail, `result: error`, `status: overview_unavailable`. Setup, HTTP authentication, rate limits, cancellation, boundary violations, and unexpected programming failures throw. No overview result requires cache sync; retry only the affected discovery reader after addressing its error.

Bodies/comments are not returned, and no issue-detail/comment, relationship, timeline, or project-field/item requests are made. REST issue list responses may contain bodies internally; they are discarded from output. CI, reviews, releases, complete PR/branch inventories, and unlinked organization/user boards are outside this overview. The overview itself never continues past its single page per section; use the drill-down tools' `after` tokens for complete traversal.

Use `issueme_list_issues` for filtering; `issueme_get_issue` with a known number and `refresh: true` for current detail (this updates cache); `issueme_list_sub_issues` and `issueme_list_issue_development_links` for relationships/work; and `issueme_get_project_fields` for a selected board. Exact discovered IDs may be reused, but existing mutation preflights still revalidate targets.

```json
{"sections": ["issues", "milestones"], "limit": 5}
```

## Cache and issue CRUD tools

| Tool | Behavior |
| --- | --- |
| `issueme_sync_issues` | Fetch open in-scope issues, write/update/rename local issue files, and remove local files for closed or out-of-scope issues in the current repository. |
| `issueme_get_issue` | Read one current-repository, in-scope issue from cache by number/file/slug/title fragment. With `refresh: true` and an issue number, fetch one GitHub issue in any state, update open cache files, and remove stale files for closed issues. The `State:` line shows GitHub's recorded reason (`completed`, `not_planned`, `duplicate`, `reopened`, or `no recorded reason`) when GitHub reports one; summaries carry it as `stateReason`. |
| `issueme_create_issue` | Create a GitHub issue and write its local JSON file. Omitted labels/assignees use defaults; explicit empty arrays override defaults. Optional `type` sets a native issue type; because GitHub drops types silently without push access, IssueMe verifies the persisted type and reports a dropped type as `partial_success` (`create_issue_type_not_applied`) with the issue still created and cached. |
| `issueme_update_issue` | Update explicit fields on an open issue and refresh the local file. Milestones use `milestoneNumber` or `clearMilestone`; native issue types use `type` or `clearType`, with the persisted type verified after the update (a dropped change is `partial_success` with `update_issue_type_not_applied`). |
| `issueme_comment_issue` | Add a non-empty comment to an open issue and refresh the local file. |
| `issueme_update_comment` | Edit an existing comment after verifying the issue is open and the comment belongs to that issue, then refresh the local file. |
| `issueme_delete_comment` | Delete a specific existing comment after verifying the issue is open and the comment belongs to that issue, then refresh the local file. |
| `issueme_list_issue_comments` | Read-only comment listing for an open or closed in-scope issue with stable comment IDs, author, timestamps, URL, and a bounded body window per comment (`bodyLimit`, default 400 chars). Supports `since` and `after` continuation, so comment 101 and later are reachable without raising the cache cap or syncing. Pull-request numbers are refused. |
| `issueme_get_comment` | Read-only retrieval of one comment by `issueNumber` plus `commentId` after verifying the comment belongs to that issue. Returns up to `bodyLimit` chars (default 4000) and an `after` token for the remainder of long bodies; the token is bound to the comment version, so an edited comment invalidates it. |
| `issueme_assign_issue` | Add, remove, or set assignees on an open issue. Add/set validate that users are assignable; `set` accepts `[]` to clear assignees. |
| `issueme_label_issue` | Add, remove, or set labels on an open or closed issue. Add/set require labels to already exist in repository taxonomy; closed issues remain absent from local cache. |
| `issueme_reopen_issue` | Reopen a closed issue, optionally post a reopen comment, and refresh/write its local JSON file. Already-open issues are idempotent no-ops. |
| `issueme_close_issue` | Close an open issue, optionally set close reason `completed` or `not_planned`, and remove its local JSON file. The result reports the state reason GitHub actually recorded. Already-closed issues are reported as already closed and are not mutated again. |
| `issueme_delete_issue` | Permanently delete one exact open or closed GitHub issue through GraphQL and remove its local JSON file. Requires explicit irreversible-delete intent, `confirmDelete: true`, and repository administrator permission; pull request numbers are refused. |

Closed issues remain protected from normal mutations. Label changes through `issueme_label_issue` or bulk `add_labels`/`remove_labels`, project-only board metadata changes (`issueme_update_project_item`, `issueme_clear_project_item_field`, `issueme_remove_issue_from_project`, `issueme_archive_project_item`; approved 2026-10-10), explicit reopen (single or bulk `reopen`), and confirmed permanent deletion are the documented exceptions. `issueme_add_issue_to_project` and bulk `add_to_project` still require an open issue. Comment reads (`issueme_list_issue_comments`, `issueme_get_comment`) work on open and closed in-scope issues and never touch the cache; the issue summary and cache keep their existing limits (five shown comments, 100 cached).

## Repository taxonomy tools

| Tool | Behavior |
| --- | --- |
| `issueme_manage_label` | Create, update, or explicitly delete repository labels. Create requires name and hex color; update can rename/recolor/change description; delete requires `confirmDelete: true` and does not delete issue objects. |
| `issueme_manage_milestone` | Create, update, close, reopen, or explicitly delete repository milestones. Create requires title; update can change title/description/due date; delete requires `confirmDelete: true` and removes milestone associations from existing issues. |

Use these tools only when the user wants repository taxonomy/planning metadata changed. Issue label assignment remains in `issueme_label_issue`; issue milestone assignment remains in `issueme_update_issue`.

## Projects v2 tools

| Tool | Behavior |
| --- | --- |
| `issueme_add_issue_to_project` | Add or confirm an open issue as a GitHub Projects v2 item using a discovered ProjectV2 ID. Verifies the board is open and owned by the current repository/current owner by default, or by matching `scope`/`owner` for organization/user boards. |
| `issueme_update_project_item` | Update one issue-backed Projects v2 item field after verifying the item belongs to the requested project, current repository, and issue number; the issue may be open or closed (board metadata only). Supports single-select option IDs, iteration IDs, date (`YYYY-MM-DD`), text, and number values. |
| `issueme_list_project_items` | Read-only item discovery for a board by `projectId` or scope/`projectNumber`: item IDs, archive state, the backing issue, and current typed field values (text, number, date, single-select option, iteration). Only issue-backed items of the current repository within creator scope are returned; pull request, draft, foreign-repository, out-of-scope, and inaccessible items are counted and omitted. Supports `after` continuation for items; nested field values beyond `valueLimit` are flagged per item. |
| `issueme_remove_issue_from_project` | Remove one issue-backed item from a board with `deleteProjectV2Item` after revalidating project, item, current repository, issue identity (open or closed), and creator scope. Requires `confirmRemove: true` because the item's board values are discarded. A stale `itemId` whose issue is still on the board under another item is refused with the current item ID; a verified absent item is a no-op. Never deletes, closes, or uncaches the issue. |
| `issueme_clear_project_item_field` | Clear one project-owned text, number, date, single-select, or iteration value with `clearProjectV2ItemFieldValue`. Validates that the field belongs to the project and is a clearable type (issue-owned labels/assignees/milestone and system fields are refused), reads the value back, treats an already-clear field as a no-op, and reports an unverified read-back as `partial_success`. |
| `issueme_archive_project_item` | Archive or unarchive one item (`action`) with the native mutations; field values are preserved. Already-archived/already-active states are no-ops, and a returned state that does not match the request is `partial_success`. |
| `issueme_get_project_item` | Read one item by `projectId` plus `itemId` or `issueNumber` without calling the add mutation. Returns the item ID, archive state, issue identity, and typed values with `after` continuation for field values. Refuses items from another project, non-issue content, other repositories, or out-of-scope issues; an issue that is not on the board returns `status: project_item_not_found`. Open and closed issues are readable. |

All project-only mutations (field update, clear, removal, archive) enforce the same policy as other issue mutations: the backing issue must be open, in the current repository, and in creator scope. The proposed closed-issue exception for board metadata is recorded in `specs/spec-issue-management-gap-tasks.md` (Task 5) and is not approved or enforced. Project item field updates use GitHub's stable `ProjectV2FieldValue` inputs. Assignee-style project fields are not exposed through that input today; use `issueme_assign_issue` for issue assignees. Item reads report label, milestone, assignee, repository, reviewer, and pull-request field values as `kind: unsupported` with the GraphQL value type, so a set value is never mistaken for an empty one; a field absent from `fieldValues` has no current value.

## Native sub-issue tools

| Tool | Behavior |
| --- | --- |
| `issueme_create_sub_issue` | Create a normal GitHub issue, then attach it under `parentNumber` with GitHub's native `addSubIssue` GraphQL mutation. Refreshes created child and parent cache files. |
| `issueme_add_sub_issue` | Attach an existing `childNumber` under `parentNumber` with GitHub's native `addSubIssue` GraphQL mutation and refresh both local cache files. |
| `issueme_remove_sub_issue` | Detach an existing child issue from a parent with GitHub's native `removeSubIssue` GraphQL mutation and refresh both local cache files. |
| `issueme_reorder_sub_issues` | Reorder/prioritize all current native child issues under an open parent with GitHub's `reprioritizeSubIssue` GraphQL mutation. Requires every current child issue number exactly once. |

IssueMe does not create body-only parent references or body-only ordering fallbacks when native sub-issue GraphQL operations are forbidden or unsupported.

## Bulk tool

| Tool | Behavior |
| --- | --- |
| `issueme_bulk_update_issues` | Apply one limited action (`add_labels`, `remove_labels`, `assign`, `unassign`, `set_milestone`, `clear_milestone`, `add_to_project`, `close`, or `reopen`) to an explicit list of issue numbers. Each action reuses the matching single-issue semantics: `add_labels`/`remove_labels` accept open or closed issues, `reopen` is explicit and treats open issues as no-ops, and the other mutations require open issues. Executes sequentially, refuses search/query targets, defaults to stop-on-error, and returns bounded per-issue success/failure details. |

Bulk operations require explicit issue numbers. Inspect `details.bulkResults` before retrying because earlier issues may have succeeded remotely even when a later issue failed.

## Tool examples

### Label discovery before mutation

```text
Use issueme_list_labels with query "bug" and limit 10 before calling issueme_label_issue.
```

### Focused stale issue refresh

```text
Use issueme_get_issue with number 123 and refresh true to update local cache for that one issue.
```

### Comment correction

```text
Use issueme_update_comment with issueNumber 123, commentId 456789, and body "Corrected progress note...".
```

### Permanent issue deletion

```text
After warning that deletion is irreversible and confirming exact issue #123, use issueme_delete_issue with number 123 and confirmDelete true.
```

Use `issueme_close_issue` instead when the issue should remain in repository history. Deletion requires repository administrator permission and cannot target pull requests.

### Projects v2 status update

```text
Use issueme_list_projects and issueme_get_project_fields first, then use issueme_add_issue_to_project to get the item ID before issueme_update_project_item.
```

### Native sub-issue reorder

```text
Use issueme_list_sub_issues with issueNumber 42 before issueme_reorder_sub_issues, then pass every current child number exactly once in the desired order.
```

## Native issue dependency tools

| Tool | Behavior |
| --- | --- |
| `issueme_list_issue_dependencies` | Read-only inspection of GitHub's native `blocked_by` and `blocking` collections for one issue (`direction` defaults to `both`). Accepts open or closed issues, refuses pull-request numbers, omits and counts members outside the configured creator scope, marks the member repository, and supports `after` continuation for a single direction. A 404/410 on the dependency collection is reported as `github_issue_dependencies_unsupported`, never as an empty list. |
| `issueme_add_issue_dependency` | Marks `issueNumber` as blocked by `blockingIssueNumber`. Both must be open, non-pull-request issues in the current repository and creator scope; the blocking issue's GitHub database id is resolved from its REST record (never its number or node ID); self-dependencies are refused; an existing edge is a success no-op. GitHub 422 refusals (cycles, validation) and unavailable-feature answers return `result: error`. |
| `issueme_remove_issue_dependency` | Removes the `blocked_by` edge between two open, in-scope issues. A verified or GitHub-reported absent edge is a success no-op. |

Dependencies are prerequisites: `A blocked by B` means B should finish before A. They are separate from native sub-issues (decomposition under a parent) and from related issues (below). Dependencies are not stored in local cache records, so these tools write no cache files, and IssueMe never parses or writes body-text `blocked by` / `depends on` / `tracked by` references. [`github-api-compatibility.md`](github-api-compatibility.md) records that the endpoints are documentation-verified and mocked but not live-verified under the pinned API version. Related-issue (`relates_to`) tools are listed next.

## Native related-issue tools

| Tool | Behavior |
| --- | --- |
| `issueme_list_related_issues` | Read-only inspection of GitHub's native `relates_to` collection for one open or closed issue, with `after` continuation, creator-scope omission counts, and member repository. A 404/410 on the collection is `github_related_issues_unsupported`, never an empty list. |
| `issueme_add_related_issue` | Links `issueNumber` to `relatedIssueNumber` through `POST .../relates_to` with the related issue's database id. Both must be open, non-pull-request issues in the current repository and creator scope; self-relations are refused; an existing link is a no-op; GitHub 422 refusals and unavailable-feature answers return `result: error`. |
| `issueme_remove_related_issue` | Removes the link through `DELETE .../relates_to/{issue_id}`; a verified or GitHub-reported absent link is a no-op. |

GitHub documents one `relates_to` collection per issue and does not state whether links are mirrored on the other issue, so IssueMe reports only what GitHub returns for the requested issue and never assumes the reverse link. Related issues are not dependencies or sub-issues, are not cached, and never fall back to body text.

```text
Use issueme_list_issue_dependencies with issueNumber 42 before planning; use issueme_add_issue_dependency with issueNumber 42 and blockingIssueNumber 17 only when #17 is a real prerequisite of #42.
```
