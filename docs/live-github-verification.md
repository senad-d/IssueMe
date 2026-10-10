# Opt-in live GitHub verification matrix

IssueMe's default validation is fully mocked and credential-free. Live verification is a separate, opt-in activity for maintainers who want evidence that GitHub currently accepts the REST and GraphQL fields/mutations that mocks can only approximate.

Run live checks only after an operator explicitly asks for them and only against a repository where temporary issues, labels, milestones, and optional project items are acceptable.

## Default/local validation boundary

These commands must remain safe for CI and local development without credentials:

```bash
npm run validate
npm run smoke:handlers
npm run smoke:packaged
npm run smoke:pi-lifecycle
```

They scrub IssueMe environment variables, use temporary directories, and do not call live GitHub or mutate remote issues. Do not add live GitHub checks to these scripts.

## Preflight checklist

Before any live run:

1. Confirm the user explicitly requested live verification for a named repository.
2. Use a disposable or low-risk repository whenever possible.
3. Set `GITHUB_REPOSITORY=owner/repo` or run from a trusted checkout whose Git remote resolves to the intended repository.
4. Provide `GH_TOKEN` or `GITHUB_TOKEN` from a test account. Never paste or log the token value.
5. Confirm the token has the required repository access:
   - metadata/read access for repository discovery;
   - issues read/write access for issue, label, milestone, comment, assignee, close, reopen, bulk, and sub-issue issue-state checks;
   - repository administrator permission for the optional permanent issue-deletion proof;
   - pull-request/contents metadata read access when positive development-link fixtures are used;
   - Projects read/write access only for the optional Projects v2 phase. For a user-owned board this must be a classic token with the `project` scope (plus `repo`); fine-grained tokens cannot access user-owned Projects, a documented GitHub limitation confirmed live on 2026-10-10.
6. Confirm the operator accepts the run-created resource names below and any Projects v2 cleanup limits.
7. Confirm no repository automation will treat `issueme-live-*` or `issueme-e2e-*` labels/milestones as production work.
8. Keep a cleanup ledger with every created issue number, label name, milestone number/title, project item ID, and comment ID.

## Temporary artifact naming

Use one UTC run id for every live resource:

```bash
date -u +%Y%m%d%H%M%S
```

Recommended names:

- Issue title prefix: `[issueme live <run_id>]`
- Primary label: `issueme-live-<run_id>`
- Renamed label: `issueme-live-<run_id>-renamed`
- Missing-label sentinel: `issueme-live-<run_id>-missing-label`
- Invalid-user sentinel: `issueme-live-invalid-user-<run_id>`
- Milestone: `issueme live <run_id>`
- Optional project item note/field text: `issueme live <run_id>`

The existing `.pi/skills/issueme-e2e-test` skill uses the equivalent `issueme-e2e-<run_id>` names. Either prefix is acceptable as long as one run uses one prefix consistently.

## Verification matrix

| API family | IssueMe tools | Live proof | Permissions and prerequisites | Cleanup expectation |
| --- | --- | --- | --- | --- |
| Trust, repository, and token preflight | all tools | `/issueme info` and first tool setup resolve the intended repository and token presence without exposing the token. | Trusted project, explicit repository, token with metadata access. | No remote artifact. Remove local test `.env` after the run. |
| Issue listing, search, sync, and local cache refresh | `issueme_sync_issues`, `issueme_list_issues`, `issueme_get_issue`, `issueme_get_overview` | Sync/list/get a bounded set, read the overview, then refresh one run-created open issue and one closed run-created issue and confirm the recorded close reason (`stateReason`) appears. Exercise one `after` continuation token on a list. | Issues read access. | Close run-created issues and rerun sync so stale open cache files are removed. |
| Repository labels | `issueme_list_labels`, `issueme_manage_label`, `issueme_label_issue`, `issueme_update_issue`, `issueme_bulk_update_issues` `add_labels` | Create, update/rename, clear description, apply, remove/set, label a run-created closed issue directly and through bulk `add_labels`/`remove_labels`, and delete the run label; verify missing-label rejection. | Issues read/write and label administration rights in the repository. | Delete only labels containing the current run id; verify list returns none. |
| Repository milestones | `issueme_list_milestones`, `issueme_manage_milestone`, `issueme_update_issue`, `issueme_bulk_update_issues` `set_milestone` | Create, update, clear due date/description, close, reopen, assign to run issues, and delete the run milestone. | Issues read/write and milestone administration rights. | Delete only milestones containing the current run id; verify list returns none. |
| Assignees | `issueme_list_assignees`, `issueme_assign_issue`, `issueme_create_issue`, `issueme_update_issue`, `issueme_bulk_update_issues` `assign` | Discover assignable users, add/remove/set/clear on run issues, and verify invalid-user rejection. | Issues read/write; at least one assignable user for positive coverage. | Clear or leave only accepted run-state assignments before closing run issues. If no assignable user exists, record partial coverage. |
| Issue create/update/comment/close/reopen | `issueme_create_issue`, `issueme_update_issue`, `issueme_comment_issue`, `issueme_update_comment`, `issueme_delete_comment`, `issueme_close_issue`, `issueme_reopen_issue`, `issueme_bulk_update_issues` `close`/`reopen`/`unassign`/`clear_milestone` | Create run issues, update title/body, create/edit/delete a run comment, close with `completed` and `not_planned`, verify non-label closed-issue mutation refusal, reopen (single and bulk), and close again. | Issues read/write. | Close every run-created issue; never modify pre-existing issues except read-only listing. |
| Comment reads | `issueme_list_issue_comments`, `issueme_get_comment` | Post more comments than one page on a run issue, list with a small `limit` and follow `after`, read one comment by ID, and repeat the list on the closed run issue. | Issues read access. | No remote mutation beyond the run comments, which close with the run issue. |
| Issue types | `issueme_list_issue_types`, `issueme_create_issue` `type`, `issueme_update_issue` `type`/`clearType`, `issueme_list_issues` `type` | On an organization-owned repository with issue types, list types, create a typed run issue, change and clear its type, and filter the list by type. On a user-owned repository, confirm `issue_types_unavailable`. | Push access (types are dropped silently without it); `read:org` on classic tokens. | Clearing the type is optional; the run issue closes normally. Record a dropped type as the documented `partial_success`, not as a failure. |
| Issue templates | `issueme_list_issue_templates` | List the repository's templates, read one by `filename` with a small `bodyLimit` and follow `after`, and confirm an unknown name is refused. | Contents read access. | No remote mutation. |
| Issue history | `issueme_list_issue_timeline` | Read the timeline of a run issue after label, comment, dependency, and close events; verify known events are typed, unknown events are flagged, and no comment bodies are returned. | Issues read access. | No remote mutation. |
| Native dependencies and related issues | `issueme_list_issue_dependencies`, `issueme_add_issue_dependency`, `issueme_remove_issue_dependency`, `issueme_list_related_issues`, `issueme_add_related_issue`, `issueme_remove_related_issue` | Link two open run issues as blocked-by and as related, list both directions, repeat the add as a no-op, and remove both links. | Issues read/write; GitHub must expose the dependency and `relates_to` endpoints for the repository (record `github_issue_dependencies_unsupported` / `github_related_issues_unsupported` as blocked, not failed). | Remove every run-created dependency and related link while both issues are still open, then close the issues. |
| Permanent issue deletion | `issueme_delete_issue` | Create one dedicated run issue, verify `confirmDelete: false` is refused, warn that deletion is irreversible, then delete that exact issue with `confirmDelete: true`; verify remote listing and local cache no longer contain it. | Issues read/write plus repository administrator permission and GraphQL `deleteIssue` support. | Delete only the dedicated run-created candidate. If permission/support is unavailable, record blocked coverage and close the candidate; never substitute another issue. |
| Native sub-issues | `issueme_create_sub_issue`, `issueme_add_sub_issue`, `issueme_remove_sub_issue`, `issueme_reorder_sub_issues`, `issueme_list_sub_issues` | Create parent/child run issues, attach/detach an existing run issue, list children, reorder with every child exactly once, and verify no body-only fallback. | Issues read/write plus repository/account access to GitHub native sub-issue GraphQL fields and mutations. | Detach optional children where possible, then close all run-created parent/child issues. If GitHub rejects the feature or permission, mark blocked with the exact GraphQL error and prerequisite. |
| Development links | `issueme_list_issue_development_links` | Read timeline development metadata for a run issue. A zero-link result proves the query path; a positive linked PR/branch/commit requires an operator-provided temporary fixture. | Issues read access; pull-request/contents metadata read access for positive fixtures. A temporary PR or branch may be needed outside IssueMe because IssueMe does not create PRs. | No IssueMe remote mutation. Close run-created issues; close/delete any operator-created PR/branch fixture outside IssueMe. If no fixture exists, mark positive-link coverage blocked by missing fixture. |
| Projects v2 discovery | `issueme_list_projects`, `issueme_get_project_fields` | Discover an explicit repository/organization/user ProjectV2 board and field/options intended for testing. | Projects read access for the target owner plus visibility of the board. | No remote mutation. If no suitable board or access exists, mark Projects v2 blocked with owner/scope/project prerequisites. |
| Projects v2 item mutation and maintenance | `issueme_add_issue_to_project`, `issueme_update_project_item`, `issueme_list_project_items`, `issueme_get_project_item`, `issueme_clear_project_item_field`, `issueme_archive_project_item`, `issueme_move_project_item`, `issueme_remove_issue_from_project`, `issueme_bulk_update_issues` `add_to_project` | Add two run-created open issues to a disposable board, update one agreed field value, list/get the item and its typed values, move one item after the other and then to the top, clear the field, archive and unarchive the item, then remove both with `confirmRemove: true`. | Projects write access, Issues read/write, a disposable/open ProjectV2 board, and a field whose value can be safely changed. | Remove or archive the run item with IssueMe before or after closing the run issue (closed issues are accepted for these actions); reset the item manually in GitHub UI/API only if the tools fail, and record that. |
| Creator-scope restrictions | create/list/get/mutate flows under `allowedIssueCreator` | In a dedicated run, set `allowedIssueCreator` to the authenticated test user and verify in-scope creates succeed while out-of-scope explicit mutations are refused without rich details. | Test account token and at least one safe out-of-scope issue for read-only/refusal checks. | Restore `.pi/agent/issueme.json` or delete the temporary config; close only run-created issues. |
| Rate-limit and permission errors | GraphQL/REST read-only and mutation families | Confirm permission/unsupported/rate-limit responses are reported safely without tokens when GitHub returns them. Prefer natural failures from missing optional permissions rather than exhausting rate limits deliberately. | Token with intentionally missing optional scope, or repository without native sub-issue/Projects feature. | No special cleanup beyond closing run-created issues. Do not intentionally burn rate limits in shared accounts. |

## Recommended run phases

### Phase 0: local baseline

Run local validation before live testing:

```bash
npm run validate
```

This must pass without GitHub credentials.

### Phase 1: non-Projects live E2E skill

Use `.pi/skills/issueme-e2e-test` for the destructive-but-contained non-Projects flow. It covers temporary issues, labels, milestones, comments, assignees when available, close reasons, native sub-issues, development-link listing, bulk issue operations, expected validation failures, and cleanup. Permanent issue deletion should use one dedicated run-created candidate only; if the installed skill version does not yet include that step, run it as a separately approved live check or record it as not covered. The same applies to the newer families (comment reads, issue types, timeline, dependencies, related issues, continuation tokens, bulk `remove_labels`/`unassign`/`clear_milestone`/`reopen`): until the skill covers them, run the matrix rows above as separately approved checks or record them as not covered. A live run on 2026-10-10 covered those rows except Projects v2 mutations; see the run record at the end of this document.

Known exclusions for that skill:

- Projects v2 operations;
- unsafe mutation of pre-existing resources;
- body-only sub-issue or dependency fallbacks.

If a prerequisite fails, record a partial-coverage problem instead of inventing extra live resources. Persist actionable failures under `specs/e2e/` as described by the skill.

### Phase 2: optional Projects v2 manual check

Run only when the operator provides a disposable board or explicitly accepts manual project-item cleanup:

1. Discover the board with `issueme_list_projects` using the intended `scope` and `owner`.
2. Discover fields/options with `issueme_get_project_fields`.
3. Create a run issue with `issueme_create_issue`.
4. Add it with `issueme_add_issue_to_project` and save the returned project item ID.
5. Update one agreed field with `issueme_update_project_item`.
6. Optionally create a second run issue and exercise `issueme_bulk_update_issues` with `action: "add_to_project"`.
7. Close all run-created issues.
8. Archive the item with `issueme_archive_project_item` (`action: "archive"`) or remove it with `issueme_remove_issue_from_project` (`confirmRemove: true`); use `issueme_clear_project_item_field` to reset a changed field when the item should stay. Under the approved project-only metadata exception these work before or after closing the run issue; verify at least one of them on the closed run issue and record it.

If any prerequisite is missing, mark Projects v2 blocked with the exact missing `scope`, `owner`, project ID/number, field ID/option, or token permission.

### Phase 3: optional positive development-link fixture

The non-Projects skill calls `issueme_list_issue_development_links`; a zero-link result is valid query-path coverage. To prove positive link normalization, the operator must create a temporary PR, branch, commit, or closing/reference relationship outside IssueMe that GitHub exposes on the run issue timeline. Record the fixture URL and cleanup action in the ledger.

## Cleanup and failure reporting

Always attempt cleanup even after failed checks:

1. Verify the dedicated permanent-deletion candidate is absent, or close it and record blocked/failed deletion coverage; never delete a substitute issue.
2. Remove run-created dependency and related-issue links with `issueme_remove_issue_dependency` / `issueme_remove_related_issue` while both issues are open, then close every other run-created open issue, parent issues last when sub-issues exist.
3. Delete only labels and milestones containing the current run id.
4. Rerun sync/list checks to verify no open run issues, labels, or milestones remain.
5. Remove local temporary `.env`, `.pi/agent/issueme.json`, and `.pi/issues/` cache files from the disposable project when they are no longer needed.
6. For Projects v2, remove or archive the run item with `issueme_remove_issue_from_project` or `issueme_archive_project_item`; both accept open or closed run issues, so manual cleanup is only a fallback when the tools fail. Then list the board with `issueme_list_project_items`: a board with an auto-add workflow will have added every run issue by itself, and those items must be removed the same way.

If cleanup or verification fails, create an actionable task file under `specs/e2e/` with the run id, repository, leftover resource URLs/names, expected behavior, actual result, and acceptance criteria. Never include token values or private issue bodies in the task file.

## Run record

### 2026-10-10, run id `20261010063443`, repository `senad-d/IssueMe`

Executed through the registered tool handlers (the same code Pi calls) with the token resolved from the project `.env` and the repository from the Git remote. Restricted creator scope `senad-d` was active. All run-created resources were removed; the final listing shows no open run issues, no `issueme-live-*` labels, and no run milestones.

| Family | Result |
| --- | --- |
| Trust, repository, token preflight | Passed; `.env` token resolved without exposure. |
| Overview, list/search, continuation, sync, get/refresh | Passed. `issueme_get_overview` was `partial_success` until the Projects fragment fix below, then `success`. |
| Labels, milestones, assignees | Passed, including rename, due-date clear, close/reopen, missing-label and invalid-user refusals, delete. |
| Issue create/update/comment/close/reopen | Passed. Close reasons `completed`/`not_planned` and reopen reason `reopened` were persisted and shown. |
| Comment reads | Passed: two-page continuation, `get_comment`, ownership refusal, reads on a closed issue. |
| Issue types | User-owned repository: `issue_types_unavailable` and the silent-drop `partial_success` path both passed. Organization behavior not covered. |
| Native sub-issues | Passed: create, add, list, reorder, cache refresh, remove. |
| Dependencies and related issues | Passed: add, no-op repeat, self-dependency refusal, both directions, remove. Live fact: GitHub mirrors `relates_to` links on both issues. |
| Timeline | Passed. Live fact: `relates_to_added`/`relates_to_removed` events exist without a related-issue payload; the normalizer now treats them as known. |
| Bulk | Passed for all nine actions, including `reopen` and the closed-issue refusal of `assign`. |
| Closed-issue policy | Passed: update/comment refused, label change and bulk `add_labels`/`remove_labels` allowed. |
| Permanent deletion | Passed on the dedicated candidate; a later refresh returned GitHub 410. |
| Projects v2 discovery | Repository scope passed after the fragment fix. User scope returned `github_projects_v2_forbidden` with the fine-grained token (fine-grained tokens cannot reach user-owned Projects); passed after switching to a classic token with `project` scope. |
| Projects v2 item mutation and maintenance | Passed on the user board `issueme-testing` with the classic token: fields, add, idempotent re-add, status update, list/get with typed values, clear and already-clear no-op, archive/unarchive and already-archived no-op, bulk `add_to_project`, remove and verified-absent no-op. |
| Approved closed-issue exception | Passed: after closing the run issue, field update, archive/unarchive, clear, and remove succeeded; add-to-project and bulk `add_to_project` were refused. |
| Development links | Passed read-only on an existing issue with one linked pull request. |

Defects found and fixed in the same session: the `Repository` inline fragment inside `ProjectV2Owner` (rejected by GitHub as `cannotSpreadFragment`, which broke every Projects v2 tool), a fragment definition nested inside the fields-by-id query body (`Field 'fragment' doesn't exist on type 'Query'`), a deleted item id answered by GitHub as a GraphQL `NOT_FOUND` error instead of a null node (the verified-absent no-op never triggered), unknown `relates_to_*` timeline events, and a noisy `(no recorded reason)` suffix on open issues. `test/graphql-document-shape.test.mjs` now checks every GraphQL document's structure offline. One transient: a `list_issues state=open` call immediately after a bulk close still listed one closed run issue; a refresh seconds later showed it closed.

### 2026-10-10, run id `20261010073343`, repository `senad-d/IssueMe`, classic token

Full re-run of every phase above with a classic personal access token (`repo`, `project`) after the fine-grained run. All 45 tools were exercised through the registered handlers; every non-refusal call succeeded and every refusal was an expected one (missing label, invalid user, self-dependency, closed-issue content mutations, add-to-project on a closed issue, stale item ids, unconfirmed deletion, read of a deleted issue). Projects v2 discovery, fields, item add/update/list/get/clear/archive/remove, bulk `add_to_project`, and the approved closed-issue exception all passed on `issueme-testing`. Cleanup verified: no open run issues, no run labels or milestones, the permanent-deletion candidate returns 410. One observation: the board's own auto-add workflow had added four run issues as they were opened, independent of IssueMe. They were removed afterwards with `issueme_remove_issue_from_project` while closed (another live proof of the approved exception), leaving the board empty.

Token conclusion: both token types work for everything except user-owned Projects v2 boards, which only the classic token with `project` scope can reach. See the README section "GitHub token types".

### 2026-10-10, Task 17 addendum, run id `20261010073343`, classic token

`issueme_move_project_item` on `issueme-testing` with two run issues (#31, #32): move #31 after #32 (verified position 2 of 2), move #31 to the top (verified position 1 of 2), self-anchor and stale-anchor refusals before mutation, closed-issue refusal after closing #32, field values and archive state unchanged, both items removed and both issues closed afterwards; the board ended empty. One transient: the item list fetched immediately after the second add showed only one item; the next read showed both.

### 2026-10-10, Task 21 addendum, classic token

`issueme_list_issue_templates` on this repository: listed the four YAML issue forms in `.github/ISSUE_TEMPLATE` with names, suggested titles, labels, element counts, and required-field labels, plus `config.yml` (blank issues disabled, no contact links); read `agent_task.yml` in 200-character windows with `after` continuation; refused an unknown file name before any request. Read-only, no cache writes. GitHub's GraphQL `issueTemplates` field returned an empty list for the same repository, which is why the tool reads the contents endpoint.

### 2026-10-10, run id `20261010083833`, full re-run with 47 tools, classic token

Complete end-to-end run after Tasks 17 and 21: 181 tool calls, all 47 registered tools exercised, 0 unexpected results, 0 script crashes. Every failure was an expected refusal (missing label, invalid user, self-dependency, closed-issue content mutations, add-to-project on a closed issue, self and stale move anchors, stale item ids, unknown template name, unconfirmed deletion, read of a deleted issue). Cleanup verified: no open run issues, no run labels or milestones, the board's auto-added run items removed through `issueme_remove_issue_from_project`, board empty, local cache directory empty.
