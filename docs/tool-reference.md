# IssueMe Tool Reference

IssueMe registers twenty-nine `issueme_*` tools. All tools require a trusted project before using project-local IssueMe state.

## Result and failure signaling

Pi marks a tool call as failed only when the handler throws. IssueMe throws for validation, trust, repository/token setup, closed-issue refusal, unexpected GitHub/API failures, aborts, and pre-mutation cache failures.

Handled domain outcomes return normal pi tool results with structured `details.result`:

- `success` for successful work and idempotent no-ops.
- `partial_success` when a remote mutation may have succeeded but cache/follow-up work failed; inspect `needsSync`, `status`, and safe retry guidance.
- `error` for documented structured failures such as known label/milestone conflicts, native sub-issue operation failures without body-only fallback, and aggregate bulk per-item failures.

Agents should check both pi `isError` and IssueMe `details.result`/`status` before assuming a mutation succeeded. The full public contract matrix is in [`public-contracts.md`](public-contracts.md).

## Discovery and read-only tools

| Tool | Behavior |
| --- | --- |
| `issueme_list_issues` | Read-only list/search for current-repository issues by state, labels, assignee, author/creator, mentioned user, milestone, updated-since, sort/direction, and limit. Text search enforces the current repository and excludes pull requests. |
| `issueme_list_labels` | Read-only repository label discovery with name, description, color, default status, URL, optional filters, limit, and truncation metadata. |
| `issueme_list_milestones` | Read-only milestone discovery with number, title, state, description, due date, issue counts, URL, filters, and truncation metadata. |
| `issueme_list_assignees` | Read-only assignable-user discovery with login, safe ID, profile URL, user type, filters, and truncation metadata. |
| `issueme_list_projects` | Read-only GitHub Projects v2 board discovery for repository, organization, or user owner scope. Returns project IDs, numbers, titles, owners, URLs, visibility/state, and truncation metadata. |
| `issueme_get_project_fields` | Read-only Projects v2 field discovery by project ID or scope/number. Returns field IDs, data types, single-select options, iteration options, and truncation metadata. |
| `issueme_list_sub_issues` | Inspect native GitHub parent/sub-issue relationships for one issue. Writes local relationship metadata only when `refreshCache: true` is explicit. |
| `issueme_list_issue_development_links` | Read-only linked-development inspection for one issue through GitHub GraphQL timeline data. Returns bounded PR, branch, commit, closing/reference, URL/state, and truncation metadata without fetching PR bodies. |

Discovery tools do not refresh or write local cache files except `issueme_list_sub_issues` when called with `refreshCache: true`.

## Cache and issue CRUD tools

| Tool | Behavior |
| --- | --- |
| `issueme_sync_issues` | Fetch open in-scope issues, write/update/rename local issue files, and remove local files for closed or out-of-scope issues in the current repository. |
| `issueme_get_issue` | Read one current-repository, in-scope issue from cache by number/file/slug/title fragment. With `refresh: true` and an issue number, fetch one GitHub issue in any state, update open cache files, and remove stale files for closed issues. |
| `issueme_create_issue` | Create a GitHub issue and write its local JSON file. Omitted labels/assignees use defaults; explicit empty arrays override defaults. |
| `issueme_update_issue` | Update explicit fields on an open issue and refresh the local file. Milestones use `milestoneNumber` or `clearMilestone`. |
| `issueme_comment_issue` | Add a non-empty comment to an open issue and refresh the local file. |
| `issueme_update_comment` | Edit an existing comment after verifying the issue is open and the comment belongs to that issue, then refresh the local file. |
| `issueme_delete_comment` | Delete a specific existing comment after verifying the issue is open and the comment belongs to that issue, then refresh the local file. |
| `issueme_assign_issue` | Add, remove, or set assignees on an open issue. Add/set validate that users are assignable; `set` accepts `[]` to clear assignees. |
| `issueme_label_issue` | Add, remove, or set labels on an open issue. Add/set require labels to already exist in repository taxonomy. |
| `issueme_reopen_issue` | Reopen a closed issue, optionally post a reopen comment, and refresh/write its local JSON file. Already-open issues are idempotent no-ops. |
| `issueme_close_issue` | Close an open issue, optionally set close reason `completed` or `not_planned`, and remove its local JSON file. Already-closed issues are reported as already closed and are not mutated again. |
| `issueme_delete_issue` | Permanently delete one exact open or closed GitHub issue through GraphQL and remove its local JSON file. Requires explicit irreversible-delete intent, `confirmDelete: true`, and repository administrator permission; pull request numbers are refused. |

Closed issues are not mutated again except through explicit `issueme_reopen_issue` or confirmed `issueme_delete_issue` operations.

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
| `issueme_update_project_item` | Update one issue-backed Projects v2 item field after verifying the item belongs to the requested project, current repository, issue number, and open issue. Supports single-select option IDs, iteration IDs, date (`YYYY-MM-DD`), text, and number values. |

Project item field updates use GitHub's stable `ProjectV2FieldValue` inputs. Assignee-style project fields are not exposed through that input today; use `issueme_assign_issue` for issue assignees.

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
| `issueme_bulk_update_issues` | Apply one limited action (`add_labels`, `assign`, `set_milestone`, `add_to_project`, or `close`) to an explicit list of issue numbers. Executes sequentially, refuses search/query targets, defaults to stop-on-error, and returns bounded per-issue success/failure details. |

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

## Dependency and blocker limitations

IssueMe does not currently register dependency/blocker tools such as `issueme_add_issue_dependency`, `issueme_remove_issue_dependency`, or `issueme_list_issue_dependencies`.

Until GitHub publishes a stable native API for dependency, blocker, or tracked-by links, IssueMe does not create body-only `blocked by`, `depends on`, or `tracked by` references as a silent fallback. Use native sub-issues for parent/child breakdowns, Projects v2 fields for planning status/priority, or GitHub's UI for dependency/blocker links.
