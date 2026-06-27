# Project Definition Brief

## 1. Bootstrap

- Template source: `/Users/senad/Documents/Code/Moj_git/pi-tmp`
- Target directory: `/Users/senad/Documents/Code/Moj_git/pi-issueme`
- Copy status: Template copied into the target directory. Existing `.git/` and `.pi/` directories were preserved. Runtime IssueMe features are now implemented from the approved specs.

## 2. Project identity

- Package name: `@senad-d/issueme`
- Display name: `IssueMe`
- Exported extension function: `issueMeExtension`
- Repository URL: `https://github.com/senad-d/issueme`
- One-sentence pitch: IssueMe is an agent-friendly GitHub issue management layer that lets LLM agents create, update, comment on, label, assign, close, and track issues through structured Pi tools.

## 3. Users and use cases

- Primary users: Pi users, Pi agents, and GitHub Actions workflows.
- Primary use cases:
  - Create GitHub issues.
  - Sync open GitHub issues into local `issues/<issue-number>-<issue-title-slug>.json` files.
  - Update, comment on, label, and assign open issues.
  - Close open issues and remove their local issue files.
  - Start issue workflows with `/issueme start <skill-path>` using a user-supplied future skill.
- Non-goals:
  - No GitHub CLI.
  - No webhook listener in the first version.
  - No edits, comments, label changes, assignment changes, or close attempts for already closed/resolved issues.
  - No bundled IssueMe skill during preparation.

## 4. Pi integration surface

| Surface | Name | Purpose | Notes |
| --- | --- | --- | --- |
| Command | `/issueme` | Open configuration UI | Implemented; writes non-secret config to `.pi/agent/issueme.json`. |
| Command | `/issueme info` | Show help/status | Implemented; includes repo/auth/cache status without secrets. |
| Command | `/issueme start <skill-path>` | Start future skill-guided workflow | Implemented; sends an agent prompt to load/use the provided skill path. |
| Tool | `issueme_create_issue` | Create GitHub issue and cache JSON | Implemented; REST API only. |
| Tool | `issueme_sync_issues` | Fetch open issues and update local files | Implemented; removes local files for closed issues. |
| Tool | `issueme_get_issue` | Read issue details from cache/remote | Implemented; agent-friendly output. |
| Tool | `issueme_update_issue` | Update title/body/etc. for open issues | Implemented; rejects closed issues. |
| Tool | `issueme_comment_issue` | Add comments to open issues | Implemented; rejects closed issues. |
| Tool | `issueme_assign_issue` | Assign/unassign users | Implemented; rejects closed issues. |
| Tool | `issueme_label_issue` | Add/remove/set labels | Implemented; rejects closed issues. |
| Tool | `issueme_close_issue` | Close open issue and remove local file | Implemented; never deletes remote issues. |
| Event | Lifecycle only if needed | Status/cleanup | No background listeners, timers, sockets, or webhooks. |
| UI | Config dialog | Configure non-secret settings | Planned TUI/RPC-safe behavior where possible. |
| Resource | Future skill path | Documented integration only | No bundled skill in preparation. |

## 5. Architecture

- Planned files:
  - `src/extension.ts`
  - `src/commands/issueme-command.ts`
  - `src/tools/*.ts`
  - `src/github/client.ts`
  - `src/github/repository.ts`
  - `src/issues/store.ts`
  - `src/issues/format.ts`
  - `src/config/config.ts`
  - `src/utils/env.ts`
  - `src/utils/slug.ts`
  - `src/types.ts`
- Module boundaries:
  - Commands handle UI and workflow kickoff.
  - Tools expose structured agent API.
  - GitHub modules handle REST API and repository resolution.
  - Issue modules handle safe local JSON files.
  - Config modules handle `.pi/agent/issueme.json` and environment-derived token lookup.
- Dependencies:
  - Prefer Node built-ins and `fetch`.
  - Keep Pi packages in `peerDependencies` with `"*"`.
  - No GitHub CLI dependency.

## 6. Config, state, and persistence

- Config source: `.pi/agent/issueme.json` for non-secret settings.
- Auth source: `.env` overrides `GH_TOKEN` / `GITHUB_TOKEN`; otherwise process environment.
- Repo source: `GITHUB_REPOSITORY` in GitHub Actions; otherwise local `.git/config` origin URL.
- Session state: minimal; tool results should include useful safe `details`.
- Files written:
  - `.pi/agent/issueme.json`
  - `issues/<issue-number>-<issue-title-slug>.json`
- Cleanup behavior: remove local issue JSON when the issue is closed.

## 7. Security and privacy

- Shell execution: none planned.
- File access/mutation: only `.env`, `.git/config`, `.pi/agent/issueme.json`, and `issues/*.json`.
- Network access: GitHub REST API for the current repository only.
- Credentials/secrets: read only; never write tokens to disk or tool output.
- Telemetry/retention: no telemetry.
- User confirmations: no automatic remote mutation; remote changes happen only through explicit commands/tools.

## 8. Documentation and packaging

- README documents IssueMe overview, implemented usage, commands/tools, auth, and cache behavior.
- SECURITY documents GitHub token handling, `.env`, REST calls, local issue files, no shell, and no webhooks.
- CHANGELOG distinguishes implementation work from preparation work.
- package.json changes: `@senad-d/issueme`, repository URLs, description, keywords, author, MIT license.
- npm/git distribution plan: npm package plus git/local checkout supported by Pi package manifest.

## 9. Validation plan

- Typecheck: `npm run typecheck`
- Tests: preparation-level metadata/spec/config tests now; feature tests later.
- Package dry-run: `npm run check:pack`
- Full validation: `npm run validate`
- Isolated Pi smoke test: `pi --no-extensions -e .`

## 10. Open questions and assumptions

- Questions:
  - Keep existing security contact or use GitHub private vulnerability reporting later?
- Assumptions:
  - MIT license is acceptable.
  - `.env` is project-root only.
  - Closed GitHub issues are read-only to IssueMe.
  - Local `issues/` contains open issues only.
  - `/issueme start <skill-path>` accepts project-relative or absolute skill paths.
- Decisions:
  - REST API only.
  - No webhooks now.
  - No GitHub CLI.
  - No feature implementation during preparation.
  - Keep `specs/spec-configuration-tui-design-standard.md` as a supplemental design standard for the future `/issueme` configuration UI; it is not one of the three required implementation specs.
