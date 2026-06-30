# IssueMe Configuration and Authentication

This guide covers non-secret project config, GitHub token resolution, project trust, local issue files, and GitHub request boundaries.

## Requirements

- pi with Node.js 22.19.0 or newer.
- A trusted project checkout.
- `GH_TOKEN` or `GITHUB_TOKEN` with repository issue access. Copy `.env.example` to `.env` for safe local placeholders.
- Additional GitHub permissions/features for Projects v2, native sub-issues, and linked-development GraphQL inspection when those tools are used.

## Config file

IssueMe stores non-secret settings project-locally at the standard pi config path:

```text
.pi/agent/issueme.json
```

Default shape:

```json
{
  "issueDirectory": "issues",
  "allowedIssueCreator": "all",
  "defaultLabels": [],
  "defaultAssignees": [],
  "defaultSkillPath": null
}
```

Supported settings:

| Setting | Purpose |
| --- | --- |
| `issueDirectory` | Project-relative directory for local issue JSON files. Defaults to `issues`. |
| `allowedIssueCreator` | `all` or one GitHub username. Limits which issues IssueMe processes; it is not GitHub access control. |
| `defaultLabels` | Labels used by create tools when labels are omitted. Explicit `[]` overrides defaults. |
| `defaultAssignees` | Assignees used by create tools when assignees are omitted. Explicit `[]` overrides defaults. |
| `defaultSkillPath` | Project-local skill path used by `/issueme start` when no path is provided. |

IssueMe validates config before saving:

- rejects secret-like keys at any nesting level;
- rejects path traversal, project-root issue directories, and protected directories such as `.git`, the pi config directory, `node_modules`, `dist`, `build`, and `coverage`;
- refuses symlinked IssueMe config files or config parent directories that could escape the project;
- deduplicates and trims labels/assignees;
- rejects null bytes and multiline entries in default labels/assignees;
- requires default assignees to be valid GitHub usernames;
- accepts `allowedIssueCreator` as `all` or one valid GitHub username;
- fails closed on manually edited invalid `allowedIssueCreator` values while preserving the legacy default when the key is absent;
- keeps default skill paths project-local and usable by `/issueme start`.

## Configuration UI

Run `/issueme` in a trusted project to open the non-secret configuration UI.

Keyboard controls:

- `↑`/`↓` or `j`/`k` move through categories/settings.
- `Tab` switches panes in wide layouts.
- `Enter` opens a category, starts editing a setting, or applies the current edit buffer.
- `/` searches settings.
- `Esc` clears search or cancels an edit.
- `Esc`, `q`, or `Ctrl-C` exits and auto-saves modified config.
- `s` saves immediately.
- `Ctrl-U` clears the current edit buffer.

The UI shows **Allowed issue creator** under **Cache**. Leave it as `all` to process all repository issues, or set one GitHub login to make IssueMe list, sync, read, mutate, and cache only issues created by that user. Matching is case-insensitive. This setting does not moderate GitHub and does not stop public users from opening issues.

## Authentication

Use the root `.env.example` as the starting template for local authentication values; it contains only safe placeholders and documents optional repository override configuration.

GitHub tokens are read, never written, from this precedence order:

1. trusted project `GH_TOKEN`;
2. trusted project `GITHUB_TOKEN`;
3. process `GH_TOKEN`;
4. process `GITHUB_TOKEN`.

The trusted project token reader only inspects `GH_TOKEN` and `GITHUB_TOKEN`. It supports common single-line dotenv syntax including optional `export`, whitespace around `=`, single/double quotes, escaped double quotes, and inline comments. Physical multiline values are intentionally unsupported and ignored; use a single-line token value.

Tokens are never persisted to config files, issue files, logs, tool output, or tool `details`.

## Repository resolution

IssueMe resolves the current GitHub repository from:

1. `GITHUB_REPOSITORY=owner/repo`, or
2. trusted local Git metadata.

Repository resolution is scoped to trusted projects. IssueMe does not shell out to Git or the GitHub CLI for repository discovery.

## Project trust policy

Project-local token files, Git config, `.pi/agent/issueme.json`, skills, and issue cache files are honored only when pi reports the project as trusted.

- All `issueme_*` tools require project trust before using project-local IssueMe state.
- `/issueme info` in an untrusted project ignores local config, local token files, Git config, and cache files; it can still report process-token status and `GITHUB_REPOSITORY` when present.
- `/issueme` and `/issueme start [skill-path]` refuse project-local config or skill handling until the project is trusted.

## Local issue files

IssueMe writes one human/LLM-readable JSON file per open in-scope issue:

```text
issues/<issue-number>-<issue-title-slug>.json
```

Local files can include issue title, state, creator login when known, body, labels, assignees, milestone, native sub-issue metadata, bounded comments, comment-fetch metadata, URL, timestamps, and sync time.

Treat local issue files as potentially sensitive because issue bodies and comments can contain private project information. `issues/` is ignored by git by default and excluded from package dry-runs.

If you intentionally need to commit or share cached issue files, scrub private bodies/comments first, confirm the target repository or archive is appropriate for that data, and force-add only reviewed files:

```bash
git add -f issues/<file>.json
npm run check:pack
```

IssueMe avoids local cache footguns by:

- filtering cache operations and local issue lookups by the resolved current repository and configured creator scope;
- refusing ambiguous or out-of-scope local lookups;
- preserving `synced_at` when remote content is unchanged;
- reporting corrupt/invalid local JSON files without deleting them;
- checking cancellation before long-running refresh flows enter local write/remove phases;
- treating legacy cache records without creator metadata as out of scope when `allowedIssueCreator` is restricted;
- rejecting symlinked config, issue directories/files, symlink-escaped cache lookup paths, and unsafe paths;
- reporting missing explicit cache-file lookups as normal not-found results instead of raw filesystem errors.

## GitHub request policy

IssueMe sends a safe `User-Agent` and validates pagination/request URLs before following them.

REST calls are constrained to the resolved repository path. Issue text search may use GitHub `/search/issues` only with `repo:<owner>/<repo> is:issue` enforced, pull requests excluded, and configured creator scope applied. Label, milestone, assignee, issue, and comment operations use current-repository endpoints.

Native sub-issue inspection, mutations, and reordering use GitHub GraphQL with the `sub_issues` feature header. Linked-development inspection also uses GraphQL issue timeline data and returns only bounded PR/commit/reference metadata; it does not fetch PR bodies or guess from issue body text.

Projects v2 discovery and item management use GitHub GraphQL for repository, organization, or user project owner scopes. Item mutations require discovered project/item/field IDs and verify the item belongs to the requested project, current repository, requested issue number, an open issue, and the configured creator scope.

API calls are fail-fast. IssueMe does not automatically retry 5xx responses, primary rate limits, or secondary rate limits. Rate-limit errors include safe reset/retry-after metadata when GitHub provides it; wait before rerunning the tool or run `issueme_sync_issues` later.

IssueMe intentionally does not use GitHub CLI, shell-based GitHub operations, body-only sub-issue inspection/linking/ordering fallbacks, body-only dependency/blocker fallbacks, webhooks, background listeners, or telemetry.

## Diagnostics

Use `/issueme info` to inspect safe runtime status:

```text
/issueme info
```

It reports project trust, repository resolution, token presence/error status, config path, issue directory, allowed issue creator, default skill path, cached issue count, invalid cache-file count, and registered tool names without exposing secrets.

For security details, read [`../SECURITY.md`](../SECURITY.md). For exact command and tool contracts, read [`public-contracts.md`](public-contracts.md).
