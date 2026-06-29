# IssueMe public command and tool contracts

This matrix records the public IssueMe surface area for review and regression tests. The machine-readable source of truth is `src/contracts.ts`; `test/public-contracts.test.mjs` fails when a registered tool is missing a contract row or when a row's `executionMode` diverges from registration.

## Result and failure signaling policy

Pi marks a tool result as `isError: true` only when the tool handler throws. IssueMe uses that Pi error channel for validation, trust, repository/token setup, closed-issue refusals, unexpected GitHub/API failures, aborts, and local cache failures that happen before any remote mutation is known to have succeeded.

IssueMe returns normal Pi tool results with `details.result` when the handler can safely describe a domain outcome:

- `success` for successful work, empty read-only results, and idempotent no-ops such as already-closed close requests or already-absent repository-label/milestone deletes.
- `partial_success` when a remote mutation may already have succeeded but local cache refresh/removal, native sub-issue attachment, or another follow-up step failed. These results set `needsSync` and include retry-safe guidance.
- `error` for handled operation-domain failures that are intentionally reported as structured results instead of thrown Pi errors, such as known label/milestone conflicts, native sub-issue operation failures with no body-only fallback, and aggregate bulk runs whose per-item results are the useful output.

Agents and users should check both Pi `isError` and `details.result`/`status` before assuming a mutation succeeded.

## Command contracts

| Command | Trust and mode | Side effects | Failure/coverage |
| --- | --- | --- | --- |
| `/issueme` | Requires trust before reading/saving project config; custom UI only in TUI with UI support. | Opens non-secret config UI or sends a non-TUI fallback message. | Untrusted access returns warning; save failures throw. Covered by command/TUI tests and handler smoke. |
| `/issueme info/help` | Works trusted or untrusted; untrusted ignores local config, `.env`, Git config, and cache files. | Sends safe help/status text only. | Lookup problems are rendered as safe status fields. Covered by command tests and handler smoke. |
| `/issueme start [skill-path]` | Requires trusted project and readable path inside project. | Sends a follow-up/user prompt asking the agent to read the skill. | Invalid/missing/escaping skill paths throw or return info usage guidance. Covered by command tests. |

## Tool contracts

Every `issueme_*` tool requires project trust before using project-local state. `parallel` means Pi's default parallel execution mode; `sequential` means sibling calls are serialized by Pi.

| Tool | Read-only | GitHub API family | Local side effects | Mode | Failure and partial behavior | Focused coverage |
| --- | --- | --- | --- | --- | --- | --- |
| `issueme_sync_issues` | No | REST issues/comments | Writes/renames/removes cache files | sequential | Throws setup/API/unexpected cache failures; returns invalid-file diagnostics for corrupt cache entries | sync, integration |
| `issueme_list_issues` | Yes | REST issues/search | None | parallel | Throws setup/validation/API failures; empty lists are success | list, integration |
| `issueme_list_labels` | Yes | REST labels | None | parallel | Throws setup/validation/API failures; empty lists are success | label list, integration, handler smoke |
| `issueme_list_milestones` | Yes | REST milestones | None | parallel | Throws setup/validation/API failures; empty lists are success | milestone list, integration |
| `issueme_list_assignees` | Yes | REST assignees | None | parallel | Throws setup/validation/API failures; empty lists are success | assignee list, integration |
| `issueme_list_projects` | Yes | GraphQL Projects v2 | None | parallel | Throws setup/validation/GraphQL failures; empty lists are success | projects, integration |
| `issueme_get_project_fields` | Yes | GraphQL Projects v2 | None | parallel | Throws setup/validation/GraphQL failures; bounded/truncated fields are success | projects, integration |
| `issueme_add_issue_to_project` | No | REST issue check + GraphQL Projects v2 | None | sequential | Throws validation/closed-issue/API failures; already-present item is success | projects, integration |
| `issueme_update_project_item` | No | REST issue check + GraphQL Projects v2 | None | sequential | Throws validation/closed-issue/target-mismatch/API failures | projects, integration |
| `issueme_manage_label` | No | REST labels | None | sequential | Known 404/422 conflicts return `result:error`; already-absent delete is success no-op; unexpected failures throw | manage label, integration, failure semantics |
| `issueme_manage_milestone` | No | REST milestones | None | sequential | Known 404/422 conflicts return `result:error`; already-absent delete is success no-op; unexpected failures throw | manage milestone, integration |
| `issueme_create_issue` | No | REST issues | Writes created issue cache file | sequential | Throws before remote create; cache write failure after create returns `partial_success` | sanitization, integration, partial success, failure semantics |
| `issueme_create_sub_issue` | No | REST issues + GraphQL native sub-issues | Writes child/relationship cache files | sequential | Throws before child create; created-child attach/cache failures return `partial_success` with retry guidance | sub-issue, integration |
| `issueme_add_sub_issue` | No | REST checks + GraphQL native sub-issues | Refreshes relationship cache | sequential | Closed-issue refusal throws; handled native attach failure returns `result:error`; cache refresh failure returns `partial_success` | sub-issue, integration |
| `issueme_remove_sub_issue` | No | REST checks + GraphQL native sub-issues | Refreshes relationship cache | sequential | Closed-issue refusal throws; handled native remove failure returns `result:error`; cache refresh failure returns `partial_success` | sub-issue, integration |
| `issueme_reorder_sub_issues` | No | GraphQL native sub-issues | Refreshes relationship cache | sequential | Native reorder no-op is success; handled native failures return `result:error`; cache refresh failure returns `partial_success` | sub-issue, integration |
| `issueme_list_sub_issues` | Yes | GraphQL native sub-issues | None unless `refreshCache: true` | sequential | Inspection failures throw; refresh cache failure after inspection returns `partial_success` | sub-issue, integration |
| `issueme_list_issue_development_links` | Yes | GraphQL issue timeline | None | parallel | Throws setup/validation/GraphQL failures; no links is success | development links |
| `issueme_get_issue` | Yes | Local cache; optional REST refresh | Optional refresh writes/removes cache files | sequential | Throws ambiguous/setup/API failures; missing explicit local file returns structured not-found | get, integration |
| `issueme_update_issue` | No | REST issue update/comments refresh | Writes/renames cache file | sequential | Throws before remote update; cache refresh failure after update returns `partial_success` | sanitization, integration, detail consistency, partial success |
| `issueme_comment_issue` | No | REST comment create | Refreshes cache file | sequential | Throws before remote comment create; cache refresh failure after create returns `partial_success` | comment, integration, detail consistency |
| `issueme_update_comment` | No | REST comment check/update | Refreshes cache file | sequential | Throws before remote edit; cache refresh failure after edit returns `partial_success` | comment, integration |
| `issueme_delete_comment` | No | REST comment check/delete | Refreshes cache file | sequential | Throws before remote delete; cache refresh failure after delete returns `partial_success` | comment, integration |
| `issueme_assign_issue` | No | REST assignees | Refreshes cache file | sequential | Add/set reject unassignable users before remote assignee change; cache refresh failure returns `partial_success` | assign, integration, partial success |
| `issueme_label_issue` | No | REST labels | Refreshes cache file | sequential | Add/set reject missing repository labels; missing-label removal no-op is success; cache refresh failure after change returns `partial_success` | label, integration, partial success |
| `issueme_reopen_issue` | No | REST issue reopen/comment | Writes/refreshed cache file | sequential | Already-open issue is success no-op; cache refresh failure after reopen/comment returns `partial_success` | reopen, integration |
| `issueme_close_issue` | No | REST issue close | Removes cache files | sequential | Already-closed issue is success no-op; cache removal failure after close/detection returns `partial_success` | close, integration |
| `issueme_bulk_update_issues` | No | REST issue mutations + optional GraphQL Projects v2 | Refreshes/removes cache for issue actions | sequential | Setup/validation failures throw before run; per-item failures return aggregate `bulkResults` with `success`, `partial_success`, `failed`, or `skipped` statuses | bulk, integration |
