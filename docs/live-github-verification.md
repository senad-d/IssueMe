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
   - pull-request/contents metadata read access when positive development-link fixtures are used;
   - Projects read/write access only for the optional Projects v2 phase.
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
| Issue listing, search, sync, and local cache refresh | `issueme_sync_issues`, `issueme_list_issues`, `issueme_get_issue` | Sync/list/get a bounded set, then refresh one run-created open issue and one closed run-created issue. | Issues read access. | Close run-created issues and rerun sync so stale open cache files are removed. |
| Repository labels | `issueme_list_labels`, `issueme_manage_label`, `issueme_label_issue`, `issueme_update_issue`, `issueme_bulk_update_issues` `add_labels` | Create, update/rename, clear description, apply, remove/set, and delete the run label; verify missing-label rejection. | Issues read/write and label administration rights in the repository. | Delete only labels containing the current run id; verify list returns none. |
| Repository milestones | `issueme_list_milestones`, `issueme_manage_milestone`, `issueme_update_issue`, `issueme_bulk_update_issues` `set_milestone` | Create, update, clear due date/description, close, reopen, assign to run issues, and delete the run milestone. | Issues read/write and milestone administration rights. | Delete only milestones containing the current run id; verify list returns none. |
| Assignees | `issueme_list_assignees`, `issueme_assign_issue`, `issueme_create_issue`, `issueme_update_issue`, `issueme_bulk_update_issues` `assign` | Discover assignable users, add/remove/set/clear on run issues, and verify invalid-user rejection. | Issues read/write; at least one assignable user for positive coverage. | Clear or leave only accepted run-state assignments before closing run issues. If no assignable user exists, record partial coverage. |
| Issue create/update/comment/close/reopen | `issueme_create_issue`, `issueme_update_issue`, `issueme_comment_issue`, `issueme_update_comment`, `issueme_delete_comment`, `issueme_close_issue`, `issueme_reopen_issue`, `issueme_bulk_update_issues` `close` | Create run issues, update title/body, create/edit/delete a run comment, close with `completed` and `not_planned`, verify closed-issue mutation refusal, reopen, and close again. | Issues read/write. | Close every run-created issue; never modify pre-existing issues except read-only listing. |
| Native sub-issues | `issueme_create_sub_issue`, `issueme_add_sub_issue`, `issueme_remove_sub_issue`, `issueme_reorder_sub_issues`, `issueme_list_sub_issues` | Create parent/child run issues, attach/detach an existing run issue, list children, reorder with every child exactly once, and verify no body-only fallback. | Issues read/write plus repository/account access to GitHub native sub-issue GraphQL fields and mutations. | Detach optional children where possible, then close all run-created parent/child issues. If GitHub rejects the feature or permission, mark blocked with the exact GraphQL error and prerequisite. |
| Development links | `issueme_list_issue_development_links` | Read timeline development metadata for a run issue. A zero-link result proves the query path; a positive linked PR/branch/commit requires an operator-provided temporary fixture. | Issues read access; pull-request/contents metadata read access for positive fixtures. A temporary PR or branch may be needed outside IssueMe because IssueMe does not create PRs. | No IssueMe remote mutation. Close run-created issues; close/delete any operator-created PR/branch fixture outside IssueMe. If no fixture exists, mark positive-link coverage blocked by missing fixture. |
| Projects v2 discovery | `issueme_list_projects`, `issueme_get_project_fields` | Discover an explicit repository/organization/user ProjectV2 board and field/options intended for testing. | Projects read access for the target owner plus visibility of the board. | No remote mutation. If no suitable board or access exists, mark Projects v2 blocked with owner/scope/project prerequisites. |
| Projects v2 item mutation | `issueme_add_issue_to_project`, `issueme_update_project_item`, `issueme_bulk_update_issues` `add_to_project` | Add a run-created open issue to a disposable board and update one disposable or agreed field value using discovered IDs/options. | Projects write access, Issues read/write, a disposable/open ProjectV2 board, and a field whose value can be safely changed. | Close run-created issues. IssueMe does not register a remove-project-item tool, so use a disposable board or remove/reset the item manually in GitHub UI/API after the run. If that cleanup is unacceptable, leave this phase blocked. |
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

Use `.pi/skills/issueme-e2e-test` for the destructive-but-contained non-Projects flow. It already covers temporary issues, labels, milestones, comments, assignees when available, close reasons, native sub-issues, development-link listing, bulk issue operations, expected validation failures, and cleanup.

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
8. Remove or reset project items manually if the board is not disposable.

If any prerequisite is missing, mark Projects v2 blocked with the exact missing `scope`, `owner`, project ID/number, field ID/option, or token permission.

### Phase 3: optional positive development-link fixture

The non-Projects skill calls `issueme_list_issue_development_links`; a zero-link result is valid query-path coverage. To prove positive link normalization, the operator must create a temporary PR, branch, commit, or closing/reference relationship outside IssueMe that GitHub exposes on the run issue timeline. Record the fixture URL and cleanup action in the ledger.

## Cleanup and failure reporting

Always attempt cleanup even after failed checks:

1. Close every run-created open issue, parent issues last when sub-issues exist.
2. Delete only labels and milestones containing the current run id.
3. Rerun sync/list checks to verify no open run issues, labels, or milestones remain.
4. Remove local temporary `.env`, `.pi/agent/issueme.json`, and `issues/` cache files from the disposable project when they are no longer needed.
5. For Projects v2, remove/reset the project item manually when the board is not disposable.

If cleanup or verification fails, create an actionable task file under `specs/e2e/` with the run id, repository, leftover resource URLs/names, expected behavior, actual result, and acceptance criteria. Never include token values or private issue bodies in the task file.
