<p align="center">
  <img alt="IssueMe logo" src="img/icon.png" width="128">
</p>

<p align="center">
  <a href="https://pi.dev"><img alt="pi package" src="https://img.shields.io/badge/pi-package-6f42c1?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/@senad-d/issueme"><img alt="npm" src="https://img.shields.io/npm/v/%40senad-d%2Fissueme?style=flat-square" /></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
</p>

<p align="center">
  Agent-friendly GitHub issue management for <a href="https://pi.dev">pi</a>.
  <br />List, search, discover/manage labels and milestones, discover assignees and Projects v2 boards/fields, update project items, create, sync, update, label, assign, bulk-update explicit issue lists, add/edit/delete comments, reopen, close, and inspect/link/reorder native sub-issues through structured tools. Native dependency/blocker links are documented as unsupported until GitHub exposes a stable API.
</p>

---

IssueMe is a Pi extension that gives LLM agents a safe, structured GitHub issue management layer. It uses GitHub APIs directly (REST for issue CRUD and GraphQL for native sub-issue inspection/mutations/reordering plus Projects v2 discovery/item management), resolves the current repository without shelling out, and keeps one local JSON cache file per open issue so agents can inspect and manage issue state without oversized tool results.

<table align="center">
  <tr>
    <th>IssueMe demo</th>
  </tr>
  <tr>
    <td align="center">
      <img src="img/demo.gif" alt="IssueMe demo: manage GitHub issues from Pi" title="IssueMe demo" width="760">
    </td>
  </tr>
</table>

- **Native GitHub API operations:** no GitHub CLI dependency and no shell execution for GitHub issue work; native sub-issues and Projects v2 discovery/item management use GitHub GraphQL.
- **Current-repository scope:** resolves `owner/repo` from `GITHUB_REPOSITORY` or trusted local Git metadata.
- **Agent tools:** list/search, label and milestone discovery/management, assignee and Projects v2 discovery/item management, sync, create, get, update, add/edit/delete comments, assign, label, reopen, close, explicit-list bulk updates, and native sub-issue inspection/linking/reordering tools.
- **Local issue files:** caches open issues as `issues/<issue-number>-<issue-title-slug>.json` by default.
- **Closed issue safety:** closed issues are not mutated again except through explicit `issueme_reopen_issue`, and stale local files are removed.
- **Pi-native TUI:** `/issueme` opens a non-secret configuration TUI when interactive, with safe status output elsewhere.
- **Skill-guided workflows:** best used with a project `SKILL.md` that teaches the agent your GitHub issue process; `/issueme start [skill-path]` validates and starts that workflow, using `defaultSkillPath` when omitted.

> **Status:** `0.1.0` is unreleased. Source, tests, this README, [`SECURITY.md`](SECURITY.md), and [`docs/STRUCTURE.md`](docs/STRUCTURE.md) describe current implemented behavior.

> **Security:** Pi packages run with your full system permissions. IssueMe reads GitHub tokens from trusted project `.env` or process environment, calls GitHub REST and GraphQL APIs for the current repository, and writes non-secret config plus local issue-cache files. It is not an OS sandbox. Read [`SECURITY.md`](SECURITY.md).

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Best Used with a GitHub Issues SKILL.md](#best-used-with-a-github-issues-skillmd)
- [How IssueMe Works](#how-issueme-works)
- [Configuration and Authentication](#configuration-and-authentication)
- [Commands](#commands)
- [Tools](#tools)
- [Local Issue Files](#local-issue-files)
- [GitHub Request Policy](#github-request-policy)
- [Troubleshooting](#troubleshooting)
- [Diagnostics](#diagnostics)
- [Update and Uninstall](#update-and-uninstall)
- [Development](#development)
- [Publishing](#publishing)
- [License](#license)

---

## Quick Start

```bash
pi install npm:@senad-d/issueme
```

Provide a GitHub token with issue permissions. For a trusted project, you can use project-root `.env`:

```dotenv
GH_TOKEN=github_pat_...
# Optional when local Git metadata is unavailable:
# GITHUB_REPOSITORY=owner/repo
```

Start Pi, trust the project if prompted, and open IssueMe:

```bash
pi
```

```text
/issueme
```

Use the TUI to review non-secret settings such as issue directory, default labels, default assignees, and default skill path. Then ask the agent to sync issues:

```text
Use issueme_sync_issues to sync the current repository issues.
```

Recommended workflow kickoff:

```text
/issueme start .pi/skills/github-issues/SKILL.md
```

If you saved `defaultSkillPath` in `/issueme`, you can run `/issueme start` without an argument.

If the npm package is unavailable before a public release, use the source-checkout workflow below.

---

## Installation

| Scope | Command | Notes |
| --- | --- | --- |
| Global | `pi install npm:@senad-d/issueme` | Loads in every trusted Pi project. |
| Project-local | `pi install npm:@senad-d/issueme -l` | Writes to `.pi/settings.json` in the current project. |
| One run | `pi -e npm:@senad-d/issueme` | Try without changing settings. |
| Git | `pi install git:github.com/senad-d/issueme@<tag>` | Pin a tag or commit. |
| Local checkout | `pi --no-extensions -e .` | Develop or test this repository in isolation. |

Source checkout:

```bash
git clone https://github.com/senad-d/issueme.git issueme
cd issueme
npm install
npm run validate
pi --no-extensions -e .
```

Use the checkout globally while developing:

```bash
pi install /absolute/path/to/issueme
```

IssueMe has no npm install-time setup step. Missing config files are valid: the extension uses safe defaults at runtime. To create or edit project config, run `/issueme` from a trusted project.

---

## Best Used with a GitHub Issues SKILL.md

IssueMe provides the tools; a `SKILL.md` provides your team's process. The extension is best used with a project-local skill that tells the agent how to triage, plan, create, update, and close GitHub issues in your repository.

IssueMe does **not** bundle a workflow skill. Create one in your project, for example:

```text
.pi/skills/github-issues/SKILL.md
```

Minimal example:

````markdown
---
name: github-issues
description: Manage this repository's GitHub issues with IssueMe. Use when syncing, triaging, creating, updating, labeling, assigning, adding/editing/deleting comments, or closing issues.
---

# GitHub Issues Workflow

- Start with `issueme_sync_issues` when the open backlog matters.
- Use `issueme_get_issue` before updating an existing issue, or with `refresh: true` and a number to reconcile one known issue in any state.
- Use `issueme_list_issue_development_links` before starting implementation when an issue may already have linked pull requests, branches, commits, or closing references.
- Use `issueme_list_labels` before applying labels when the repository taxonomy is unknown.
- Use `issueme_list_milestones` before setting `milestoneNumber` when milestone numbers are unknown.
- Use `issueme_list_assignees` before assigning a user when the correct GitHub username is unknown.
- Use `issueme_list_projects` and `issueme_get_project_fields` before planning project-board changes when a Projects v2 board, field ID, status, priority, or iteration option is unknown.
- Use `issueme_add_issue_to_project` and `issueme_update_project_item` only after confirming the represented issue is open and the required project/item/field IDs are known; IssueMe verifies update item IDs still belong to the requested project, current repository, and issue number before mutation.
- Use `issueme_manage_label` only when the user explicitly wants repository label taxonomy changed.
- Use `issueme_manage_milestone` only when the user explicitly wants repository milestone planning metadata changed.
- Create clear titles, actionable bodies, and narrow labels.
- Do not update, add/edit/delete comments on, label, assign, or close closed issues.
- Use `issueme_reopen_issue` only when a user explicitly wants a closed issue reopened, and include a reopen comment when helpful.
- Do not create body-only `blocked by`, `depends on`, or `tracked by` text references as if they were native dependencies; IssueMe documents native dependency/blocker links as unsupported until GitHub exposes a stable API.
- Prefer local `issues/*.json` files for reading full bodies/comments after sync.
- Close issues only when requested; use close reason `completed` for verified finished work and `not_planned` only when work is explicitly declined, obsolete, or duplicate.
- Use `issueme_bulk_update_issues` only when the exact issue numbers are explicit and confirmed; never infer a bulk mutation directly from an unconstrained search query.
````

Start the workflow with:

```text
/issueme start .pi/skills/github-issues/SKILL.md
```

`/issueme start` accepts project-relative paths or absolute paths that resolve inside the trusted project. When no path is provided, it uses `defaultSkillPath` from `.pi/agent/issueme.json`; if neither exists, it shows guidance to pass a path or configure the default. It validates that the skill file is readable, then sends a prompt asking the agent to load that skill through a project-relative `@path` reference and use IssueMe tools, without exposing the local absolute checkout path.

---

## How IssueMe Works

IssueMe registers one slash command and twenty-eight LLM-callable tools:

1. Resolve the trusted project root.
2. Resolve the current GitHub repository from `GITHUB_REPOSITORY` or trusted Git metadata.
3. Read a token from trusted project `.env` or process environment.
4. Call GitHub REST API endpoints plus native sub-issue inspection/mutation/reordering, issue development-link inspection, and Projects v2 GraphQL operations for the resolved repository or selected project owner scope.
5. Write or refresh bounded local issue JSON files for open issues; a focused refresh of a closed issue removes matching stale local files while returning safe remote details.
6. Return concise, secret-free tool output with structured `details` metadata.

Tools that can mutate GitHub or local issue-cache files are registered with Pi `executionMode: "sequential"` so sibling update/comment/edit-comment/delete-comment/assign/label/reopen/close/sub-issue, bulk-update, project-item, repository label/milestone management, `issueme_get_issue` refresh, and `issueme_list_sub_issues` refresh calls cannot race. `issueme_list_sub_issues` and `issueme_list_issue_development_links` are read-only against GitHub by default; `issueme_list_sub_issues` writes local files only when `refreshCache: true` is explicitly requested, while `issueme_list_issue_development_links` never writes local cache files. `issueme_reorder_sub_issues` mutates native sub-issue priority with GitHub's GraphQL `reprioritizeSubIssue` mutation and refreshes relationship cache metadata afterward. Before mutating an existing issue or issue-backed project item, IssueMe re-checks the issue state and refuses accidental closed-issue mutations. Comment edit/delete tools also verify the comment belongs to the requested open issue before changing it; `issueme_delete_comment` deletes only that issue comment, never an issue object. `issueme_manage_label` changes repository label taxonomy only; deletion requires `action: "delete"` plus `confirmDelete: true` and never deletes issue objects. `issueme_manage_milestone` changes repository milestone planning metadata only; deletion requires `action: "delete"` plus `confirmDelete: true` and GitHub removes that milestone association from existing issues. `issueme_add_issue_to_project` adds or confirms an open issue as a Projects v2 item, and `issueme_update_project_item` updates one discovered project-item field only after verifying the item belongs to the requested project, current repository, requested issue number, and an open issue. `issueme_bulk_update_issues` applies one limited action to explicitly listed issue numbers only; it never accepts a search query as the mutation target, executes per issue sequentially, defaults to stopping after the first failed/partial issue, and reports bounded per-issue results. `issueme_reopen_issue` is the only intentional closed-issue mutation path; it reopens closed issues and can add an optional reopen comment. `issueme_close_issue` never deletes remote issues; it closes open issues, can set GitHub close reason `completed` or `not_planned`, and removes matching local cache files. Omitting close reason preserves the existing/GitHub default close behavior.

Tool results are bounded and include machine-readable truncation metadata when needed. Full issue bodies and cached comments live in local issue JSON files instead of oversized tool responses.

---

## Configuration and Authentication

Non-secret settings are stored project-locally at the standard Pi config path:

```text
.pi/agent/issueme.json
```

Supported settings:

```json
{
  "issueDirectory": "issues",
  "defaultLabels": [],
  "defaultAssignees": [],
  "defaultSkillPath": null
}
```

IssueMe validates config before saving:

- rejects secret-like keys at any nesting level;
- rejects path traversal, project-root issue directories, and protected directories such as `.git`, `.pi`, and `node_modules`;
- refuses symlinked IssueMe config files or config parent directories that could escape the project;
- deduplicates and trims labels/assignees;
- rejects null bytes and multiline entries in default labels/assignees;
- requires default assignees to be valid GitHub usernames;
- keeps default skill paths project-local and usable by `/issueme start` when no explicit path is provided.

GitHub tokens are read, never written, from this precedence order:

1. trusted project-root `.env` `GH_TOKEN`;
2. trusted project-root `.env` `GITHUB_TOKEN`;
3. process `GH_TOKEN`;
4. process `GITHUB_TOKEN`.

The project `.env` reader only inspects `GH_TOKEN` and `GITHUB_TOKEN`. It supports common single-line dotenv syntax including optional `export`, whitespace around `=`, single/double quotes, escaped double quotes, and inline comments. Physical multiline values are intentionally unsupported and ignored; use a single-line token value.

### Project trust policy

Project-local `.env`, Git config, `.pi/agent/issueme.json`, skills, and issue cache files are honored only when Pi reports the project as trusted.

- All `issueme_*` tools require project trust before using project-local IssueMe state.
- `/issueme info` in an untrusted project ignores local config, `.env`, Git config, and cache files; it can still report process-token status and `GITHUB_REPOSITORY` when present.
- `/issueme` and `/issueme start [skill-path]` refuse project-local config or skill handling until the project is trusted.

Tokens are never persisted to config files, issue files, logs, tool output, or tool `details`.

---

## Commands

| Command | Description |
| --- | --- |
| `/issueme` | Open the non-secret configuration TUI for `.pi/agent/issueme.json` in TUI mode. Non-TUI modes show the config path and current config instead. |
| `/issueme info` | Show the combined help/status view without secrets. |
| `/issueme help`, `/issueme --help`, `/issueme -h` | Aliases for `/issueme info`. |
| `/issueme start [skill-path]` | Ask the agent to read/use an explicit readable project-local skill file, or the configured `defaultSkillPath` when omitted, and IssueMe tools. |

The help/status view includes usage, tool names, project trust status, repository status, token presence/error status, config path, issue directory, default skill path, cache count, invalid cache-file count, and troubleshooting hints.

---

## Tools

| Tool | Behavior |
| --- | --- |
| `issueme_sync_issues` | Fetch open issues, write/update/rename local issue files, and remove local files for closed issues in the current repository. |
| `issueme_list_issues` | Read-only list/search for current-repository issues by state, labels, assignee, author/creator, mentioned user, milestone, updated-since, sort/direction, and limit. Text search uses GitHub Search with `repo:<owner>/<repo> is:issue` enforced and pull requests excluded. |
| `issueme_list_labels` | Read-only repository label discovery with label name, description, color, default status, URL, optional name/text filters, limit, and truncation metadata. |
| `issueme_list_milestones` | Read-only repository milestone discovery with milestone number, title, state, description, due date, open/closed issue counts, URL, state/sort/direction filters, limit, and truncation metadata. |
| `issueme_list_assignees` | Read-only assignable-user discovery with login, safe ID, profile URL, user type, optional login/text filters, limit, and truncation metadata. |
| `issueme_list_projects` | Read-only GitHub Projects v2 board discovery for the resolved repository or selected organization/user owner scope, including project ID, number, title, owner, URL, visibility/state, optional query, limit, and truncation metadata. |
| `issueme_get_project_fields` | Read-only GitHub Projects v2 field discovery by project ID or scope/number, including field IDs, data types, single-select options, iteration options, limits, and truncation metadata. |
| `issueme_add_issue_to_project` | Add or confirm an open issue as a GitHub Projects v2 item using a discovered ProjectV2 ID. Returns the project item ID; GitHub returns the existing item when already added. |
| `issueme_update_project_item` | Update one issue-backed Projects v2 item field after verifying the item belongs to the requested project, current repository, issue number, and open issue. Supports single-select option IDs, iteration IDs, valid date (`YYYY-MM-DD`), text, and number values. |
| `issueme_manage_label` | Create, update, or explicitly delete repository labels. Create requires name and hex color; update can rename/recolor/change description; delete requires `confirmDelete: true` and does not delete issue objects. |
| `issueme_manage_milestone` | Create, update, close, reopen, or explicitly delete repository milestones. Create requires title; update can change title/description/due date; close/reopen set milestone state; delete requires `confirmDelete: true` and removes milestone associations from existing issues. |
| `issueme_create_issue` | Create a GitHub issue and write its local JSON file. Omitted labels/assignees use defaults; explicit empty arrays override defaults. |
| `issueme_create_sub_issue` | Create a normal GitHub issue, then attach it under `parentNumber` with GitHub's native `addSubIssue` GraphQL mutation. The created issue and parent cache files are refreshed; no body-only fallback is used. |
| `issueme_add_sub_issue` | Attach an existing `childNumber` under `parentNumber` with GitHub's native `addSubIssue` GraphQL mutation and refresh both local cache files. |
| `issueme_remove_sub_issue` | Detach an existing child issue from a parent with GitHub's native `removeSubIssue` GraphQL mutation and refresh both local cache files. |
| `issueme_reorder_sub_issues` | Reorder/prioritize all current native child issues under an open parent with GitHub's `reprioritizeSubIssue` GraphQL mutation. Requires every current child issue number exactly once and refreshes relationship cache metadata; no body-only ordering fallback is used. |
| `issueme_list_sub_issues` | Read native GitHub parent/sub-issue relationships for one issue, including parent metadata, child issue summaries, counts, URLs/states, truncation metadata, and optional intentional cache refresh with `refreshCache: true`. |
| `issueme_list_issue_development_links` | Read-only linked-development inspection for one issue using GitHub GraphQL timeline data when available, returning linked PR numbers/states/URLs, PR branch names, commit references, closing/reference metadata, limits, and truncation metadata without fetching PR bodies. |
| `issueme_get_issue` | Read one current-repository issue from cache by number/file/slug/title fragment. With `refresh: true` and an issue number, fetch one GitHub issue in any state without a full sync: open issues create/update/rename the local file, closed issues remove matching stale local files, and details report the cache action plus removed paths. Ambiguous or cross-repository local lookups are refused. |
| `issueme_update_issue` | Update explicit fields on an open issue and refresh the local file. Milestones use `milestoneNumber` or `clearMilestone`. |
| `issueme_comment_issue` | Add a non-empty comment to an open issue and refresh the local file. |
| `issueme_update_comment` | Edit an existing comment after verifying `issueNumber` is open and `commentId` belongs to that issue, then refresh the local file. |
| `issueme_delete_comment` | Delete a specific existing comment after verifying `issueNumber` is open and `commentId` belongs to that issue, then refresh the local file. |
| `issueme_assign_issue` | Add, remove, or set assignees on an open issue. `set` accepts `[]` to clear assignees. |
| `issueme_label_issue` | Add, remove, or set labels on an open issue. Removing a missing label is treated as an idempotent no-op. |
| `issueme_reopen_issue` | Reopen a closed issue, optionally post a reopen comment, and refresh/write its local JSON file. Already-open issues are idempotent no-ops and are not commented on. |
| `issueme_close_issue` | Close an open issue, optionally set close reason `completed` or `not_planned`, and remove its local JSON file. Already-closed issues are reported as already closed and are not mutated again. Omitting reason preserves existing/GitHub default close behavior. |
| `issueme_bulk_update_issues` | Apply one limited action (`add_labels`, `assign`, `set_milestone`, `add_to_project`, or `close`) to an explicit list of issue numbers. It executes sequentially, refuses unconstrained search/query targets, defaults to stop-on-error, and returns bounded per-issue success/failure details. |

Project item field updates use GitHub's stable `ProjectV2FieldValue` inputs. Assignee-style project fields are not exposed through that input today; use `issueme_assign_issue` for issue assignees and update project fields only when GitHub exposes an ID-based supported value type.

Example triage prompts:

```text
Use issueme_list_labels with query "bug" and limit 10 to discover matching repository labels before applying labels.
```

```text
Use issueme_manage_label with action "create", name "triage", color "fbca04", and description "Needs initial review" to add a repository label before applying it.
```

```text
Use issueme_manage_label with action "delete", name "obsolete", and confirmDelete true only after warning that GitHub removes the label from repository taxonomy and existing issue associations.
```

```text
Use issueme_list_milestones with state "all", sort "due_on", direction "asc", and limit 10 to discover milestone numbers before setting milestoneNumber on an issue.
```

```text
Use issueme_list_assignees with login "oct" and limit 10 to discover assignable GitHub users before calling issueme_assign_issue.
```

```text
Use issueme_list_projects with scope "repository", query "Roadmap", and limit 5 to discover linked GitHub Projects v2 boards before project-board work.
```

```text
Use issueme_get_project_fields with projectId "PVT_..." to inspect status, priority, iteration, and custom field IDs/options before updating project items.
```

```text
Use issueme_add_issue_to_project with issueNumber 123 and projectId "PVT_..." to add or confirm the issue on the Projects v2 board and capture the returned project item ID.
```

```text
Use issueme_update_project_item with projectId "PVT_...", itemId "PVTI_...", issueNumber 123, fieldId "PVTSSF_...", valueType "single_select", and singleSelectOptionId "..." to update project status after verifying field options.
```

```text
Use issueme_manage_milestone with action "create", title "v1.2", description "Release planning", and dueOn "2026-09-01" to create a repository milestone.
```

```text
Use issueme_manage_milestone with action "close" and number 3 when the milestone is complete, or action "reopen" if planning resumes.
```

```text
Use issueme_manage_milestone with action "delete", number 3, and confirmDelete true only after warning that GitHub removes the milestone association from existing issues.
```

```text
Use issueme_list_issues with state "open", labels ["bug"], sort "updated", direction "desc", and limit 10 to find current bugs.
```

```text
Use issueme_list_issues with query "rate limit", state "all", author "octocat", and limit 5 to search this repository's issues without including pull requests.
```

```text
Use issueme_list_issue_development_links with issueNumber 123 and limit 20 before starting implementation to check for linked pull requests, branches, commits, or closing references.
```

`issueme_list_labels`, `issueme_list_milestones`, `issueme_list_assignees`, `issueme_list_projects`, `issueme_get_project_fields`, `issueme_list_issues`, `issueme_list_sub_issues`, and `issueme_list_issue_development_links` are read-only against GitHub; the list/discovery tools do not refresh or write local cache files unless `issueme_list_sub_issues` is called with `refreshCache: true` (the tool is still registered sequentially because that mode can write). `issueme_list_issue_development_links` uses GraphQL issue timeline events and may not show standalone branches or private/cross-repository references that GitHub does not expose to the token. `issueme_reorder_sub_issues` mutates only native sub-issue ordering and refreshes the parent/child relationship cache. `issueme_add_issue_to_project` and `issueme_update_project_item` mutate GitHub Projects v2 board state only and do not write local issue cache files. `issueme_bulk_update_issues` is a guarded bulk mutation wrapper for explicit issue-number lists only; supported actions reuse the same open-issue, closed-issue, project, close, and cache-refresh safeguards as the corresponding single-issue tools. `issueme_manage_label` mutates repository label definitions only, and `issueme_manage_milestone` mutates repository milestone definitions only; issue label assignment remains in `issueme_label_issue`, and issue milestone assignment remains in `issueme_update_issue`. Run `issueme_sync_issues` afterward when you need full local bodies/comments for selected open issues.

To reconcile one known stale issue without syncing the whole backlog, use `issueme_get_issue` with `number: 123` and `refresh: true`; it refreshes open issues into the local cache and removes stale local files when GitHub says the issue is closed. The tool is registered sequentially because this refresh mode can write or remove cache files.

Example comment correction prompts:

```text
Use issueme_update_comment with issueNumber 123, commentId 456789, and body "Corrected progress note..." to fix that open-issue comment.
```

```text
Use issueme_delete_comment with issueNumber 123 and commentId 456789 only after the user confirms that exact accidental comment should be removed.
```

Example close prompt:

```text
Use issueme_close_issue with number 123 and reason "completed" after the fix is verified. Use reason "not_planned" only when the user explicitly declines or de-scopes the work.
```

Example bulk prompt:

```text
Use issueme_bulk_update_issues with issueNumbers [101, 102, 103], action "add_labels", labels ["triage"], and leave continueOnError omitted so the run stops if any issue fails.
```

Bulk operations require explicitly listed issue numbers. Do not pass a search query or ask IssueMe to mutate every search result without separately confirming the exact issue number list. Inspect `details.bulkResults` before retrying because earlier issues may have succeeded remotely even when a later issue failed.

Example native sub-issue prompts:

```text
Use issueme_list_sub_issues with issueNumber 42 and limit 20 before changing parent/child relationships; add refreshCache true only when local IssueMe cache metadata should be updated.
```

```text
Use issueme_create_sub_issue to create a sub-issue under #42 titled "Add retry tests" with body "Cover rate-limit retry guidance." and labels ["tests"].
```

```text
Use issueme_add_sub_issue with parentNumber 42 and childNumber 77 to attach the existing issue as a native GitHub sub-issue.
```

```text
Use issueme_remove_sub_issue with parentNumber 42 and childNumber 77 to detach the native sub-issue relationship without closing either issue.
```

```text
Use issueme_reorder_sub_issues with parentNumber 42 and orderedChildNumbers [81, 77, 79] after issueme_list_sub_issues confirms those are every current child issue under the parent.
```

If GitHub returns `FORBIDDEN` or an unsupported-field error for native sub-issue GraphQL operations, IssueMe reports the permission/feature problem clearly and does not create body-only parent references or body-only ordering as a fallback.

### Issue dependencies and blockers

IssueMe does not currently register dependency/blocker tools such as `issueme_add_issue_dependency`, `issueme_remove_issue_dependency`, or `issueme_list_issue_dependencies`. The current public GitHub issue APIs used by IssueMe expose native sub-issue fields/mutations and Projects v2 item fields, but no stable native GitHub REST or GraphQL API for issue dependency, blocker, or tracked-by links with documented list/add/remove semantics.

Until GitHub publishes a stable native API, IssueMe does not create body-only `blocked by`, `depends on`, or `tracked by` references as a silent fallback. Agents should use native sub-issues for parent/child breakdowns, use Projects v2 fields for planning status/priority when appropriate, or ask the user to manage dependency/blocker links in GitHub's UI.

Label and assignee arrays are trimmed, de-duplicated, single-line validated, and checked before GitHub mutations; assignee inputs must be valid GitHub usernames.

Tool text and structured details are bounded with machine-readable `truncated`/`truncation` metadata. Tool `details` use a shared safe shape: `result` (`success`, `partial_success`, or `error`), `repository`, concise `issue` summaries when available, project/project-item summaries when available, bounded `developmentLinks` when linked PR/commit inspection is requested, bounded per-issue `bulkResults` for explicit-list bulk operations, `paths`, `removedPaths`, `changedFields`, `cacheUpdated`, `needsSync`, optional `comment` `{ id, html_url }`, and safe `error` metadata. Error details never include tokens, `.env` contents, config dumps, issue bodies, or comment bodies.

---

## Local Issue Files

IssueMe writes one human/LLM-readable JSON file per open issue:

```text
issues/<issue-number>-<issue-title-slug>.json
```

Local files include issue title, state, body, labels, assignees, milestone, native sub-issue metadata when IssueMe has it (`parent_issue`, `sub_issues`, `sub_issues_count`), bounded comments, comment-fetch metadata, URL, timestamps, and sync time. IssueMe caches at most 100 comments per issue by default; when GitHub reports more comments, local files set `comments_truncated`, `comments_count`, and `comments_fetch_limit`, and tool output/details report the truncation.

Treat local issue files as potentially sensitive because issue bodies and comments can contain private project information. `issues/` is ignored by git by default and excluded from package dry-runs.

If you intentionally need to commit or share cached issue files, scrub private bodies/comments first, confirm the target repository or archive is appropriate for that data, and force-add only reviewed files, for example:

```bash
git add -f issues/<file>.json
npm run check:pack
```

IssueMe avoids local cache footguns by:

- filtering cache operations and local issue lookups by the resolved current repository;
- refusing ambiguous local lookups;
- preserving `synced_at` when remote content is unchanged;
- reporting corrupt/invalid local JSON files without deleting them;
- checking cancellation before long-running refresh flows enter local write/remove phases;
- rejecting symlinked config, issue directories/files, symlink-escaped cache lookup paths, and unsafe paths;
- reporting missing explicit cache-file lookups as normal not-found results instead of raw filesystem errors.

---

## GitHub Request Policy

IssueMe sends a safe `User-Agent` and validates pagination/request URLs before following them. REST calls are constrained to the resolved repository path; issue text search may use GitHub `/search/issues` only with `repo:<owner>/<repo> is:issue` enforced for the resolved repository, label discovery/management uses the current repository's `/labels` endpoint, milestone discovery/management uses the current repository's `/milestones` endpoint, assignable-user discovery uses the current repository's `/assignees` endpoint, and comment add/edit/delete uses the current repository's issue comment endpoints after issue/comment verification. Native sub-issue inspection, mutations, and reordering use GitHub GraphQL `/graphql` with the `sub_issues` feature header; add/remove/reorder mutations use issue node IDs returned by GitHub for the same repository, and relationship inspection returns bounded parent/child metadata without body-only fallbacks. Linked development inspection also uses GitHub GraphQL `/graphql` for bounded issue timeline events and returns only PR/commit/reference metadata; it does not fetch PR bodies or guess from issue body text when GitHub omits data. Projects v2 discovery and item management use GitHub GraphQL `/graphql` for repository, organization, or user project owner scopes; item mutations require discovered project/item/field IDs, verify update item IDs still belong to the requested project, current repository, requested issue number, and an open issue, return bounded project item metadata, and require appropriate Projects access/read-write permissions. Comment fetching is intentionally bounded to 100 comments per issue to control API usage and local cache growth. API calls are fail-fast: IssueMe does not automatically retry 5xx responses, primary rate limits, or secondary rate limits. Rate-limit errors include safe reset/retry-after metadata when GitHub provides it; wait before rerunning the tool or run `issueme_sync_issues` later.

IssueMe intentionally does not use GitHub CLI, shell-based GitHub operations, body-only sub-issue inspection/linking/ordering fallbacks, body-only dependency/blocker fallbacks, webhooks, background listeners, or telemetry.

---

## Troubleshooting

| Problem | Try |
| --- | --- |
| `/issueme` refuses to open config | Trust the project first. Project-local config is ignored until Pi reports the project as trusted. |
| Token is missing | Set `GH_TOKEN` or `GITHUB_TOKEN` in trusted project `.env` or process environment. |
| Repository cannot be resolved | Set `GITHUB_REPOSITORY=owner/repo` or run from a trusted GitHub repository checkout. |
| Local issue files look stale | Run `issueme_sync_issues` for the open backlog, or `issueme_get_issue` with `refresh: true` and a known issue number for a focused any-state refresh. |
| Unsure whether an issue already has implementation work | Use `issueme_list_issue_development_links` with the issue number before starting; if GitHub omits timeline development data, inspect the GitHub UI instead of guessing from body text. |
| A local issue lookup is ambiguous | Use the issue number or exact local file path instead of a title/slug fragment. |
| A mutation is refused | Check whether the issue is closed. IssueMe does not update, add/edit/delete comments on, label, assign, close, bulk-update, change project item fields for, or change sub-issue relationships/order for closed issues again; `issueme_close_issue` only performs local stale-cache cleanup for already-closed issues. Use `issueme_reopen_issue` only for an explicit reopen. |
| Native sub-issue inspection/linking/reordering is forbidden or unsupported | Use a token/user with access and permission for GitHub native sub-issues, and confirm the repository/API exposes the native sub-issue GraphQL fields/mutations; IssueMe will not silently fall back to body-only references or ordering. |
| Unknown label name or taxonomy | Use `issueme_list_labels` with `name`, `query`, and a small `limit` before applying labels. |
| Unknown milestone number | Use `issueme_list_milestones` with `state`, `sort`, `direction`, and a small `limit` before setting `milestoneNumber`. |
| Unknown assignee username | Use `issueme_list_assignees` with `login`, `query`, and a small `limit` before assigning users. |
| Unknown Projects v2 board, item, or field option | Use `issueme_list_projects` to discover board IDs/numbers, `issueme_add_issue_to_project` to get/confirm the project item ID, then `issueme_get_project_fields` to inspect status/priority/iteration/custom field options before `issueme_update_project_item`. |
| Repository milestone is missing or wrong | Use `issueme_manage_milestone` to create/update/close/reopen it; delete milestones only with explicit user confirmation because GitHub removes milestone associations from existing issues. |
| Repository label is missing or wrong | Use `issueme_manage_label` to create/update it; delete labels only with explicit user confirmation because GitHub removes them from existing issue associations. |
| Label removal partially succeeded | Run `issueme_sync_issues` before retrying so the agent sees current remote state. |
| Bulk update stopped or partially succeeded | Inspect `details.bulkResults` for per-issue success/failure/skipped entries, run `issueme_sync_issues` when cache state is uncertain, and retry only the issue numbers that still need the action. |
| `/issueme start` rejects a skill path | Use a readable file inside the trusted project, such as `.pi/skills/github-issues/SKILL.md`, or fix the configured `defaultSkillPath`. |

---

## Diagnostics

Use `/issueme info` to inspect safe runtime status:

```text
/issueme info
```

It reports project trust, repository resolution, token presence/error status, config path, issue directory, cached issue count, invalid cache-file count, and registered tool names without exposing secrets.

Validation from a source checkout:

```bash
npm run validate
```

Useful focused checks:

```bash
npm run typecheck
npm run format:check
npm run test
npm run smoke:discover
npm run smoke:packaged
npm run check:pack
```

`smoke:discover` verifies `/issueme` through Pi RPC command discovery and verifies all twenty-eight `issueme_*` tool registrations through a local registration probe. `smoke:packaged` packs to a temporary directory, installs the tarball in a temporary production-style project with IssueMe devDependencies omitted and documented Pi peer dependencies satisfied, then verifies the packed package registers `/issueme` and the tools. Neither smoke check invokes handlers, calls GitHub, publishes, updates dependencies, or mutates issues.

For manual isolated startup checks:

```bash
pi --no-extensions -e .
```

TUI visual artifacts are generated under `test/snapshots/tui/issueme-config/` with:

```bash
npm run test:tui-artifacts
```

---

## Update and Uninstall

```bash
pi update --extensions                  # update installed pi packages
pi update npm:@senad-d/issueme          # update IssueMe only
pi remove npm:@senad-d/issueme          # remove global install
pi remove npm:@senad-d/issueme -l       # remove project-local install
```

Removing the package does not automatically delete `.pi/agent/issueme.json` or local issue cache files. Review those files before deleting them manually.

---

## Development

```bash
npm ci
npm run typecheck
npm run format:check
npm run test
npm run smoke:discover
npm run smoke:packaged
npm run check:pack
npm run validate
```

Run IssueMe from this checkout in an isolated Pi session:

```bash
pi --no-extensions -e .
```

Additional checks:

```bash
npm run test:tui-artifacts
npm run smoke:discover
npm run smoke:packaged
```

Implementation references:

- [`docs/PROJECT_DEFINITION_BRIEF.md`](docs/PROJECT_DEFINITION_BRIEF.md)
- [`docs/STRUCTURE.md`](docs/STRUCTURE.md)
- [`SECURITY.md`](SECURITY.md)
- [`specs/spec-architecture.md`](specs/spec-architecture.md)
- [`specs/spec-guidelines.md`](specs/spec-guidelines.md)
- [`specs/spec-tasks.md`](specs/spec-tasks.md)
- [`specs/spec-remediation-tasks.md`](specs/spec-remediation-tasks.md)
- [`specs/spec-issue-management-expansion-tasks.md`](specs/spec-issue-management-expansion-tasks.md)

---

## Publishing

IssueMe publishes to npm as `@senad-d/issueme`. You need an npm account with publish access to the `@senad-d` scope.

```bash
npm login
npm whoami
node scripts/publish-npm.mjs
```

The publish script requires a clean working tree, asks for the version number, runs validation, updates `package.json` and `package-lock.json` with `npm version <version>`, creates the `v<version>` git tag, publishes with `npm publish --access public`, and then offers to push the release commit and tag.

Run it only from a clean working tree after updating `CHANGELOG.md`.

## License

MIT
