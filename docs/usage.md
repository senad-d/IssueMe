# IssueMe Usage Guide

IssueMe provides the tools; your project skill provides the workflow. Use this guide to wire IssueMe into a repository-specific GitHub Issues process without keeping all workflow detail in the README.

## Daily workflow

1. Start pi from a trusted GitHub repository checkout.
2. Confirm setup with `/issueme info`.
3. Run `issueme_sync_issues` when the open backlog matters.
4. Use read-only discovery tools before mutation when labels, milestones, assignees, Projects v2 boards, or field options are unknown.
5. Read issue detail with `issueme_get_issue` before updating an existing issue.
6. Check development links with `issueme_list_issue_development_links` before starting implementation on an issue that may already have linked PRs, branches, commits, or closing references.
7. Mutate only explicit targets: one issue number, one comment ID, one known project item ID, or a confirmed list of issue numbers for bulk operations.
8. Sync again after partial results, manual GitHub UI changes, or uncertain local cache state.

## Recommended project skill

Create a project-local skill such as:

```text
.pi/skills/github-issues/SKILL.md
```

Starter skill:

````markdown
---
name: github-issues
description: Manage this repository's GitHub issues with IssueMe. Use when syncing, triaging, creating, updating, labeling, assigning, commenting on, linking, or closing issues.
---

# GitHub Issues Workflow

- Start with `issueme_sync_issues` when the open backlog matters.
- Use `issueme_get_issue` before updating an existing issue; use `refresh: true` with a known number to reconcile one issue in any state.
- Use `issueme_list_issue_development_links` before implementation when linked work might already exist.
- Use `issueme_list_labels` before applying labels when the taxonomy is unknown.
- Use `issueme_list_milestones` before setting `milestoneNumber` when milestone numbers are unknown.
- Use `issueme_list_assignees` before assigning a user when the exact GitHub username is unknown.
- Use `issueme_list_projects` and `issueme_get_project_fields` before project-board changes.
- Use `issueme_add_issue_to_project` and `issueme_update_project_item` only after the issue is known to be open and required project/item/field IDs are known.
- Use `issueme_manage_label` only when the user explicitly wants repository label taxonomy changed.
- Use `issueme_manage_milestone` only when the user explicitly wants repository milestone planning metadata changed.
- Do not update, comment on, label, assign, close, bulk-update, change project items for, or change native sub-issue relationships for closed issues.
- Use `issueme_reopen_issue` only when the user explicitly wants a closed issue reopened.
- Use `issueme_delete_issue` only for one exact mistakenly created issue after explicit confirmation and an irreversibility warning; prefer closing when repository history should remain.
- Do not create body-only `blocked by`, `depends on`, or `tracked by` text references as if they were native dependencies.
- Prefer local `issues/*.json` files for reading full bodies/comments after sync.
- Close issues only when requested; use close reason `completed` for verified finished work and `not_planned` only when work is explicitly declined, obsolete, or duplicate.
- Use `issueme_bulk_update_issues` only when exact issue numbers are explicit and confirmed; never infer a bulk mutation directly from an unconstrained search query.
````

Start the workflow with:

```text
/issueme start .pi/skills/github-issues/SKILL.md
```

If `defaultSkillPath` is configured in `/issueme`, `/issueme start` can be run without an argument. IssueMe validates that the skill path is readable, inside the trusted project, and sends the agent a project-relative `@path` reference rather than an absolute local checkout path.

## Common prompt examples

### Sync and inspect

```text
Use issueme_sync_issues to sync open issues, then summarize the top five stale bugs.
```

```text
Use issueme_list_issues with state "open", labels ["bug"], sort "updated", direction "desc", and limit 10 to find current bugs.
```

```text
Use issueme_get_issue with number 123 before drafting an update.
```

```text
Use issueme_get_issue with number 123 and refresh true to reconcile this one issue without syncing the whole backlog.
```

### Discover taxonomy and people

```text
Use issueme_list_labels with query "bug" and limit 10 to discover matching labels before applying labels.
```

```text
Use issueme_list_milestones with state "all", sort "due_on", direction "asc", and limit 10 to discover milestone numbers.
```

```text
Use issueme_list_assignees with login "oct" and limit 10 to discover assignable GitHub users.
```

### Manage repository taxonomy

```text
Use issueme_manage_label with action "create", name "triage", color "fbca04", and description "Needs initial review" to add a repository label.
```

```text
Use issueme_manage_milestone with action "create", title "v1.2", description "Release planning", and dueOn "2026-09-01" to create a repository milestone.
```

Deletion of labels or milestones must be explicit and confirmed because GitHub removes those associations from existing issues.

### Projects v2

```text
Use issueme_list_projects with scope "repository", query "Roadmap", and limit 5 to discover linked GitHub Projects v2 boards.
```

```text
Use issueme_get_project_fields with projectId "PVT_..." to inspect status, priority, iteration, and custom field IDs/options.
```

```text
Use issueme_add_issue_to_project with issueNumber 123, projectId "PVT_...", and matching scope/owner when needed to add or confirm the issue on the Projects v2 board.
```

```text
Use issueme_update_project_item with projectId "PVT_...", itemId "PVTI_...", issueNumber 123, fieldId "PVTSSF_...", valueType "single_select", and singleSelectOptionId "..." to update project status.
```

### Comments

```text
Use issueme_comment_issue with number 123 and body "Progress update..." to add a comment to the open issue.
```

```text
Use issueme_update_comment with issueNumber 123, commentId 456789, and body "Corrected progress note..." to fix that open-issue comment.
```

```text
Use issueme_delete_comment with issueNumber 123 and commentId 456789 only after the user confirms that exact accidental comment should be removed.
```

### Native sub-issues

```text
Use issueme_list_sub_issues with issueNumber 42 and limit 20 before changing parent/child relationships; add refreshCache true only when local cache metadata should be updated.
```

```text
Use issueme_create_sub_issue to create a sub-issue under #42 titled "Add retry tests" with body "Cover rate-limit retry guidance." and labels ["tests"].
```

```text
Use issueme_add_sub_issue with parentNumber 42 and childNumber 77 to attach the existing issue as a native GitHub sub-issue.
```

```text
Use issueme_reorder_sub_issues with parentNumber 42 and orderedChildNumbers [81, 77, 79] after issueme_list_sub_issues confirms those are every current child issue under the parent.
```

If GitHub returns a permission or unsupported-feature error for native sub-issue GraphQL operations, IssueMe reports it and does not create body-only parent references or body-only ordering fallbacks.

### Close, reopen, delete, and bulk update

```text
Use issueme_close_issue with number 123 and reason "completed" after the fix is verified. Use reason "not_planned" only when the user explicitly declines or de-scopes the work.
```

```text
Use issueme_reopen_issue with number 123 and comment "Reopening because the bug still reproduces on 1.2.3." only after the user explicitly requests reopening.
```

```text
Warn that permanent deletion is irreversible, confirm exact issue #123, then use issueme_delete_issue with number 123 and confirmDelete true only when the issue was created by mistake.
```

Permanent deletion accepts open or closed issues, refuses pull request numbers, requires repository administrator permission, and removes the local cache after GitHub confirms deletion. Prefer closing unless the issue truly should disappear from repository history.

```text
Use issueme_bulk_update_issues with issueNumbers [101, 102, 103], action "add_labels", labels ["triage"], and leave continueOnError omitted so the run stops if any issue fails.
```

Bulk operations require explicitly listed issue numbers. Do not pass a search query or ask IssueMe to mutate every search result without separately confirming the exact issue number list.

## Unsupported dependency/blocker links

IssueMe does not currently register dependency or blocker tools such as `issueme_add_issue_dependency`, `issueme_remove_issue_dependency`, or `issueme_list_issue_dependencies`.

The GitHub APIs used by IssueMe expose native sub-issue fields/mutations and Projects v2 item fields, but no stable native REST or GraphQL API for issue dependency, blocker, or tracked-by links with documented list/add/remove semantics. Until GitHub publishes a stable native API, IssueMe does not create body-only `blocked by`, `depends on`, or `tracked by` references as a silent fallback.

Use native sub-issues for parent/child breakdowns, Projects v2 fields for planning status/priority when appropriate, or ask the user to manage dependency/blocker links in GitHub's UI.

## Result handling

Agents should check both the pi tool error channel and IssueMe's structured `details.result`/`status` fields before assuming a mutation succeeded. See [`public-contracts.md`](public-contracts.md) for the exact result and failure signaling contract.
