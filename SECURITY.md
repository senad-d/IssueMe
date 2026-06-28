# Security Policy

This policy describes the current `0.1.0` unreleased implementation. Historical specs are archived planning context; use this file, `README.md`, and `docs/STRUCTURE.md` for current security behavior.

## Trust model

Pi packages and extensions run with the full local permissions of the user account that starts Pi. Review IssueMe source before installing it, pin versions in sensitive environments, and install only from trusted sources.

```bash
pi install npm:@senad-d/issueme@<version>
pi install git:https://github.com/senad-d/issueme@<tag>
```

IssueMe honors project-local `.env`, local Git config, `.pi/agent/issueme.json`, and issue cache files only when Pi reports the project as trusted through `ctx.isProjectTrusted()`. Help/status commands may report process-token or `GITHUB_REPOSITORY` status without reading project-local files; IssueMe tools require project trust before cache/config operations. In untrusted projects, `/issueme` refuses config editing, `/issueme start` refuses project-local skill-path validation, and `/issueme info` uses default config/cache values instead of local files.

## Security-sensitive behavior

IssueMe may:

- read trusted project-root `.env` for `GH_TOKEN` or `GITHUB_TOKEN`;
- read process environment `GH_TOKEN` or `GITHUB_TOKEN` when a trusted `.env` does not provide a token;
- read local Git metadata (`.git/config`, `.git` gitdir files, and worktree common config) to resolve the current GitHub repository when trusted and `GITHUB_REPOSITORY` is not set;
- read/write non-secret settings at Pi's project config path (standard Pi: `.pi/agent/issueme.json`);
- read/write/remove local JSON files under the configured issue directory (`issues/` by default);
- call GitHub REST APIs for issue listing/search/CRUD, repository label discovery/management, repository milestone discovery/management, assignable-user discovery, and GitHub GraphQL for native sub-issue inspection/mutations/reordering plus Projects v2 discovery/item management in the resolved current repository or selected project owner scope.

IssueMe does not:

- use the GitHub CLI;
- execute shell commands for GitHub operations or repository discovery;
- start webhook listeners, background HTTP servers, timers, sockets, or file watchers;
- send telemetry;
- write tokens to disk;
- silently honor project-local config or `.env` in untrusted projects;
- mutate closed/resolved issues, except through the explicit controlled `issueme_reopen_issue` reopen path;
- silently fall back from native sub-issues to body-only references or body-only ordering;
- create body-only dependency/blocker references as if they were native issue relationships;
- delete remote GitHub issues.

## Credential handling

Token resolution order:

1. trusted project `.env` `GH_TOKEN`;
2. trusted project `.env` `GITHUB_TOKEN`;
3. process `GH_TOKEN`;
4. process `GITHUB_TOKEN`.

The project `.env` parser reads only `GH_TOKEN` and `GITHUB_TOKEN`. It supports common single-line dotenv syntax (`export`, quoted values, escaped double quotes, and inline comments) and intentionally ignores unsupported physical multiline values. Tokens must never be persisted to `.pi/agent/issueme.json`, `issues/*.json`, logs, tool output, or tool `details`. Tool result details and safe error details are bounded and may include stable error codes, categories, recovery hints, repository names, issue numbers/titles/states/URLs, local relative paths, changed field names, comment IDs/URLs, cache status, sync guidance, and truncation metadata; they must not include tokens, `.env` contents, config dumps, issue bodies, or comment bodies. Errors describe missing or invalid credentials without echoing token values.

## Local data and path safety

Local issue JSON files can contain issue bodies and comments. Treat `issues/*.json` as sensitive local artifacts, especially for private repositories. IssueMe bounds cached comments to 100 comments per issue by default and writes `comments_truncated`, `comments_count`, and `comments_fetch_limit` metadata when comment data is incomplete. `issues/` is ignored by git by default and package checks reject local issue-cache files if they ever appear in `npm pack --dry-run` output.

Only commit or share cached issue files after intentionally reviewing and scrubbing private content. Prefer force-adding reviewed files one at a time (`git add -f issues/<file>.json`) over weakening the repository-wide ignore rule, and rerun `npm run check:pack` before publishing.

IssueMe rejects issue-directory settings that resolve to the project root, path traversal, `.git`, `.pi`, `node_modules`, and other protected directories. Existing IssueMe config paths, issue directories, and issue files are checked for symlinks before reads/writes/removes, and explicit local cache lookup paths must still resolve inside the configured issue directory, so IssueMe cannot read or mutate files outside the project through symlink escapes. Local issue reads are filtered to the resolved current repository so cached files from another repository are not returned by title, slug, file, or number lookup; missing explicit cache-file paths report a normal not-found result instead of raw filesystem errors.

Config writes are queued with Pi's file mutation queue, reject null bytes and multiline values in default label/assignee lists, require default assignees to be valid GitHub usernames, and refuse symlinked IssueMe config paths or symlinked config parents. Issue-file writes and removals are queued by their real target path to avoid parallel tool-call races.

## Network boundaries

IssueMe uses GitHub REST API endpoints for the resolved current repository with a safe `User-Agent`. Pagination links and REST request URLs are validated before use and must stay on the expected GitHub API host and repository path. Issue text search may use GitHub `/search/issues` only when IssueMe has enforced `repo:<owner>/<repo> is:issue` for the resolved repository and refused pull-request boundary qualifiers. Repository label discovery uses the current repository's `/labels` endpoint in read-only mode and returns bounded metadata without issue bodies or comments. Repository milestone discovery uses the current repository's `/milestones` endpoint in read-only mode and returns bounded metadata without issue bodies or comments. Assignable-user discovery uses the current repository's `/assignees` endpoint in read-only mode and returns bounded user login/profile metadata without credentials or private config. Repository label management uses the same `/labels` boundary for explicit create/update/delete operations; delete requires `confirmDelete: true`, never deletes issue objects, and GitHub may remove the label from existing issue associations. Repository milestone management uses the same `/milestones` boundary for explicit create/update/close/reopen/delete operations; delete requires `confirmDelete: true`, never deletes issue objects, and GitHub removes that milestone association from existing issues. Comment add/edit/delete uses the current repository's issue comment endpoints; edit/delete first verify the parent issue is open and the comment belongs to that issue number. Native sub-issue inspection, relationship mutations, and reordering use GitHub GraphQL `/graphql` and the `sub_issues` feature header; add/remove/reorder mutations use issue node IDs resolved from the same repository, while inspection returns bounded parent/child relationship metadata and writes local cache files only when `refreshCache: true` is explicit. `issueme_reorder_sub_issues` requires every currently visible child issue number exactly once before using GitHub's `reprioritizeSubIssue` mutation and then refreshes relationship cache metadata. Linked development inspection uses GitHub GraphQL `/graphql` issue timeline data in read-only mode to return bounded pull request, branch-name, commit, and closing/reference metadata without PR bodies, local cache writes, or body-text guessing; standalone branches or private/cross-repository references may be absent when GitHub does not expose them to the token. Native issue dependency/blocker/tracked-by links are intentionally unsupported until GitHub publishes a stable native REST or GraphQL API with documented list/add/remove semantics; IssueMe does not register dependency tools and does not create body-only dependency references as a fallback. Projects v2 discovery and item management use GitHub GraphQL `/graphql` for repository, organization, or user project owner scopes; discovery returns bounded project IDs/numbers, owner metadata, fields, single-select options, and iteration options without issue bodies/comments, while item updates require discovered project/item/field IDs, validate date values as real `YYYY-MM-DD` dates, and verify the item still belongs to the requested project, current repository, requested issue number, and an open issue before changing fields. `issueme_bulk_update_issues` is a guarded sequential wrapper around the same repository-scoped issue label, assignee, milestone, project item, and close APIs; it accepts only explicit issue number arrays, never search/query targets, defaults to stop-on-error, and returns bounded per-issue `bulkResults`. Permission/unsupported-feature failures for native sub-issue operations, linked development inspection, Projects v2 discovery/item management, and bulk issue actions are reported clearly; IssueMe does not downgrade to body-only references, ordering, dependencies, development links, or unconstrained bulk mutations. Comment fetching is bounded to avoid unbounded API usage and local cache growth. The client surfaces rate-limit metadata safely and does not retry transient 5xx failures, primary rate limits, or secondary rate limits automatically; retry/sync decisions stay explicit.

## Closed issue protection

Before every remote mutation of an existing issue or issue-backed project item, IssueMe re-checks the issue state through GitHub REST. If the issue is closed, normal mutating tools refuse the change before sending a mutation payload. `issueme_update_comment` and `issueme_delete_comment` also fetch the target comment and refuse mismatched issue/comment pairs before editing or deleting a comment. `issueme_add_issue_to_project` adds or confirms only open issues as Projects v2 items, and `issueme_update_project_item` requires the represented issue number so it can verify the issue is still open and the item still targets the requested project/current-repository issue before changing board fields. `issueme_reorder_sub_issues` requires an open parent and open child issues before reordering native sub-issue priority. `issueme_reopen_issue` is the only intentional closed-issue mutation path: it requires an explicit issue number, sets the issue back to open with GitHub's reopen state reason, optionally posts a reopen explanation only when a closed issue was actually reopened, and refreshes the local cache. Existing-issue mutating tools use Pi `executionMode: "sequential"` so sibling update/comment/edit-comment/delete-comment/assign/label/reopen/close/bulk-update/project-item/sub-issue calls are ordered instead of racing the same GitHub issue. `issueme_bulk_update_issues` applies one action at a time to the explicit issue numbers, records per-issue success/failure/skipped entries, and stops by default after the first failed or partial issue so successful earlier remote mutations are not hidden. `issueme_close_issue` can set GitHub close reason `completed` or `not_planned` for open issues, treats an already-closed issue as a no-op, and only removes matching stale local cache files in that already-closed case.

## Reporting vulnerabilities

Please report suspected security vulnerabilities privately by email: <senad.dizdarevic@proton.me>.

For non-sensitive issues, use the repository issue tracker:

<https://github.com/senad-d/issueme/issues>

Do not open public issues for security-sensitive reports that include exploit details, private repository contents, secrets, credentials, or private issue content.

## Secure development checklist

- Do not commit secrets, tokens, local `.pi/` state, generated package tarballs, `node_modules/`, machine-local paths, or unsanitized `issues/*.json` cache files.
- Document any file, shell, network, credential, or persistence behavior added by the extension.
- Avoid starting background resources in the extension factory.
- Re-check GitHub issue state before every remote mutation.
- Refuse to update, add/edit/delete comments on, label, assign, close, change project item fields for, or change native sub-issue relationships/order for already closed issues; keep `issueme_reopen_issue` as the only explicit reopen exception.
- Do not add body-only dependency/blocker references unless a future explicit opt-in fallback is designed, documented, and tested.
- Keep package contents minimal with `npm run check:pack`.
- Use isolated smoke tests with `pi --no-extensions -e .` and verify command/tool discovery.
