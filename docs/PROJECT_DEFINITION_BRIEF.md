# Project Definition Brief

> Current status: IssueMe has a `0.1.0` unreleased runtime implementation. Use `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`, source, and tests for current behavior; use `specs/spec-remediation-tasks.md` for hardening history and `specs/spec-issue-management-expansion-tasks.md` for the expanded issue-management surface. This brief records the approved project definition and historical decisions.

## 1. Bootstrap

- Template source: `/Users/senad/Documents/Code/Moj_git/pi-tmp`
- Target directory: `/Users/senad/Documents/Code/Moj_git/pi-issueme`
- Copy status: Template copied into the target directory. Existing `.git/` and `.pi/` directories were preserved. Runtime IssueMe features are now implemented from the approved specs.

## 2. Project identity

- Package name: `@senad-d/issueme`
- Display name: `IssueMe`
- Exported extension function: `issueMeExtension`
- Repository URL: `https://github.com/senad-d/issueme`
- One-sentence pitch: IssueMe is an agent-friendly GitHub issue management layer that lets LLM agents list/search, sync, create, update, add/edit/delete comments, label, assign, manage repository labels/milestones, update Projects v2 items, reopen, close, bulk-update explicit issue lists, inspect linked development, and inspect/link/reorder native sub-issues through structured Pi tools; native dependency/blocker links are documented as unsupported until GitHub exposes a stable API.

## 3. Users and use cases

- Primary users: Pi users, Pi agents, and GitHub Actions workflows.
- Primary use cases:
  - List/search issues and inspect linked development work before starting implementation.
  - Create GitHub issues.
  - Sync open GitHub issues into local `issues/<issue-number>-<issue-title-slug>.json` files.
  - Refresh one known issue in any state through `issueme_get_issue`.
  - Discover and manage repository labels, milestones, assignees, and GitHub Projects v2 boards/fields.
  - Add open issues to Projects v2 boards and update discovered project item fields.
  - Update, add/edit/delete comments on, label, and assign open issues.
  - Reopen intentionally selected closed issues.
  - Close open issues with optional GitHub close reasons and remove their local issue files.
  - Apply guarded bulk updates to explicit issue-number lists.
  - Inspect, create, attach, remove, and reorder native GitHub sub-issue relationships.
  - Avoid body-only dependency/blocker fallbacks; native dependency/blocker links remain unsupported until GitHub exposes a stable API.
  - Start issue workflows with `/issueme start [skill-path]` using an explicit or configured project-local skill file.
- Non-goals:
  - No GitHub CLI.
  - No webhook listener in the first version.
  - No edits, comment additions/edits/deletions, label changes, assignment changes, or remote close mutations for already closed/resolved issues.
  - No bundled IssueMe skill; `/issueme start` validates a readable skill file inside the trusted project and prompts with a project-relative `@path` reference.

## 4. Pi integration surface

| Surface | Name | Purpose | Notes |
| --- | --- | --- | --- |
| Command | `/issueme` | Open configuration UI | Implemented with a non-secret configuration TUI in TUI mode and safe non-TUI fallback. |
| Command | `/issueme info`/`help`/`--help`/`-h` | Show combined help/status | Implemented; includes repo/auth/cache/trust status without secrets. |
| Command | `/issueme start [skill-path]` | Start skill-guided workflow | Implemented; validates an explicit readable project-local skill file or configured `defaultSkillPath`, then sends an agent prompt with a project-relative `@path` skill reference. |
| Tool | `issueme_sync_issues` | Fetch open issues and update local files | Implemented; removes local files for closed issues. |
| Tool | `issueme_list_issues` | List/search issues in the resolved repository | Implemented with REST list mode and bounded repository-scoped Search API mode. |
| Tool | `issueme_list_labels` | Discover repository labels | Implemented read-only with bounded metadata and filters. |
| Tool | `issueme_list_milestones` | Discover repository milestones | Implemented read-only with state/sort filters and bounded metadata. |
| Tool | `issueme_list_assignees` | Discover assignable repository users | Implemented read-only with bounded login/profile metadata. |
| Tool | `issueme_list_projects` | Discover GitHub Projects v2 boards | Implemented read-only through GraphQL for repository, organization, or user scopes. |
| Tool | `issueme_get_project_fields` | Inspect Projects v2 fields/options | Implemented read-only through GraphQL with bounded field/option metadata. |
| Tool | `issueme_add_issue_to_project` | Add or confirm an open issue as a Projects v2 item | Implemented with GraphQL and open-issue verification. |
| Tool | `issueme_update_project_item` | Update one discovered Projects v2 item field | Implemented with GraphQL and represented-issue state verification. |
| Tool | `issueme_manage_label` | Create/update/explicitly delete repository labels | Implemented with validation; delete requires confirmation and never deletes issue objects. |
| Tool | `issueme_manage_milestone` | Create/update/close/reopen/explicitly delete repository milestones | Implemented with validation; delete requires confirmation and removes milestone associations from issues. |
| Tool | `issueme_create_issue` | Create GitHub issue and cache JSON | Implemented with REST API. |
| Tool | `issueme_create_sub_issue` | Create issue and link native sub-issue | Implemented with REST plus GraphQL `addSubIssue`; no body-only fallback. |
| Tool | `issueme_add_sub_issue` | Attach existing native sub-issue | Implemented with GraphQL `addSubIssue`; no body-only fallback. |
| Tool | `issueme_remove_sub_issue` | Detach native sub-issue relationship | Implemented with GraphQL `removeSubIssue`; never closes/deletes issues. |
| Tool | `issueme_reorder_sub_issues` | Reorder native child issue priority | Implemented with GraphQL `reprioritizeSubIssue`, exact child-list validation, cache refresh, and no body-only ordering fallback. |
| Tool | `issueme_list_sub_issues` | Inspect native parent/sub-issue relationships | Implemented with GraphQL `subIssues` metadata, bounded output, optional `refreshCache`; no body-only fallback. |
| Tool | `issueme_list_issue_development_links` | Inspect linked implementation work | Implemented with GitHub GraphQL timeline metadata for linked PRs, branch names, commits, and closing/reference events; read-only, bounded, no PR bodies, and no body-text guessing. |
| Tool | `issueme_get_issue` | Read issue details from cache or focused remote refresh | Implemented; refreshes one known issue in any state with bounded cache-action details. |
| Tool | `issueme_update_issue` | Update title/body/milestone/etc. for open issues | Implemented; rejects closed issues. |
| Tool | `issueme_comment_issue` | Add comments to open issues | Implemented; rejects closed issues. |
| Tool | `issueme_update_comment` | Edit existing comments on open issues | Implemented; verifies comment-to-issue ownership and rejects closed issues. |
| Tool | `issueme_delete_comment` | Delete existing comments on open issues | Implemented; verifies comment-to-issue ownership and rejects closed issues. |
| Tool | `issueme_assign_issue` | Assign/unassign users | Implemented; rejects closed issues and unassignable users for add/set. |
| Tool | `issueme_label_issue` | Add/remove/set labels | Implemented; rejects closed issues and missing repository labels for add/set. |
| Tool | `issueme_reopen_issue` | Reopen intentionally selected closed issues | Implemented as the only closed-issue mutation exception, with optional reopen comment and cache refresh. |
| Tool | `issueme_close_issue` | Close open issue and remove local file | Implemented with optional GitHub close reason; never deletes remote issues. |
| Tool | `issueme_bulk_update_issues` | Apply guarded bulk actions to explicit issue-number lists | Implemented sequentially with bounded per-issue results and no query-derived mutation targets. |
| Unsupported | Native issue dependency/blocker tools | Manage native depends-on/blocked-by links | Not registered: no stable native GitHub REST/GraphQL API with documented list/add/remove semantics is available; no body-only fallback. |
| Event | Lifecycle only if needed | Status/cleanup | No background listeners, timers, sockets, or webhooks. |
| UI | Config TUI | Configure non-secret settings | Implemented for TUI mode with safe non-TUI fallback. |
| Resource | Project-local skill path | User-supplied workflow guide | No bundled skill; validated path must remain inside the trusted project; prompts use relative `@path` references rather than absolute local paths. |

## 5. Architecture

- Current files:
  - `src/extension.ts`
  - `src/commands/issueme-command.ts`
  - `src/commands/config-tui.ts`
  - `src/tools/*.ts`
  - `src/github/client.ts`
  - `src/github/repository.ts`
  - `src/issues/store.ts`
  - `src/issues/format.ts`
  - `src/config/config.ts`
  - `src/utils/env.ts`
  - `src/utils/mutation-queue.ts`
  - `src/utils/project-root.ts`
  - `src/utils/slug.ts`
  - `src/types.ts`
- Module boundaries:
  - Commands handle UI and workflow kickoff.
  - Tools expose structured agent API.
  - GitHub modules handle REST and GraphQL API calls plus repository resolution.
  - Issue modules handle safe local JSON files.
  - Config modules handle `.pi/agent/issueme.json` and environment-derived token lookup.
- Dependencies:
  - Prefer Node built-ins and `fetch`.
  - Keep Pi packages in `peerDependencies` with `"*"`.
  - No GitHub CLI dependency.

## 6. Config, state, and persistence

- Config source: `.pi/agent/issueme.json` for non-secret settings.
- Auth source: trusted project-root `.env` `GH_TOKEN`, trusted project-root `.env` `GITHUB_TOKEN`, process `GH_TOKEN`, then process `GITHUB_TOKEN`.
- Repo source: `GITHUB_REPOSITORY` first; otherwise trusted local Git metadata (`.git/config`, `.git` files, worktrees, and nested cwd discovery) without shelling out.
- Session state: minimal; tool results should include useful safe `details`.
- Files written:
  - `.pi/agent/issueme.json`
  - `issues/<issue-number>-<issue-title-slug>.json`
- Cleanup behavior: remove local issue JSON when the issue is closed.

## 7. Security and privacy

- Shell execution: none.
- File access/mutation: reads trusted project `.env`, Git metadata, `.pi/agent/issueme.json`, and configured issue JSON files; writes only `.pi/agent/issueme.json` and configured issue-cache JSON files.
- Network access: GitHub REST and GraphQL APIs for the current repository plus selected GitHub Projects v2 owner scopes only.
- Credentials/secrets: read only; never write tokens to disk or tool output.
- Telemetry/retention: no telemetry.
- User confirmations: no automatic remote mutation; remote changes happen only through explicit commands/tools.

## 8. Documentation and packaging

- README documents IssueMe overview, implemented usage, commands/tools, auth, and cache behavior.
- SECURITY documents GitHub token handling, `.env`, REST/GraphQL calls, local issue files, no shell, and no webhooks.
- CHANGELOG distinguishes implementation work from preparation work.
- package.json changes: `@senad-d/issueme`, repository URLs, description, keywords, author, MIT license.
- npm/git distribution plan: npm package plus git/local checkout supported by Pi package manifest.

## 9. Validation plan

- Typecheck: `npm run typecheck`
- Tests: helper, command, TUI renderer, GitHub client, extension registration, and package-content tests run without live GitHub calls.
- Package dry-run: `npm run check:pack`
- Packed package smoke: `npm run smoke:packaged`
- Full validation: `npm run validate`
- Isolated Pi smoke test: `pi --no-extensions -e .`, plus checkout and packed-package command/tool discovery verification before release.

## 10. Open questions and assumptions

- Questions:
  - Keep existing security contact or use GitHub private vulnerability reporting later?
- Assumptions:
  - MIT license is acceptable.
  - `.env` is project-root only and honored only in trusted projects.
  - Closed GitHub issues are read-only to IssueMe except through explicit `issueme_reopen_issue`.
  - Local `issues/` contains open issues only.
  - `/issueme start [skill-path]` accepts project-relative paths or absolute paths only when they resolve inside the trusted project, uses configured `defaultSkillPath` when the argument is omitted, and sends project-relative skill references to the agent.
- Decisions:
  - REST and GraphQL APIs are used directly; native sub-issues use GitHub GraphQL inspection/mutations.
  - Native dependency/blocker links are documented as unsupported until GitHub exposes a stable API; no body-only fallback is provided.
  - No webhooks now.
  - No GitHub CLI.
  - Project-local IssueMe state is honored only in trusted projects.
  - `specs/spec-configuration-tui-design-standard.md` remains the implemented supplemental design standard for the `/issueme` configuration TUI.
