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
  <br />Sync issues, cache local context, and let agents manage GitHub Issues through safe structured tools.
</p>

---

IssueMe is a pi extension that gives LLM agents a repository-scoped GitHub Issues layer. It uses GitHub REST and GraphQL APIs, keeps bounded local JSON cache files for open issues, and exposes tools for syncing, triage, labels, milestones, comments, assignees, Projects v2, native sub-issues, linked-development inspection, and explicit bulk updates.

<table align="center">
  <tr>
    <th>IssueMe</th>
  </tr>
  <tr>
    <td align="center">
      <img src="img/demo.gif" alt="IssueMe demo: manage GitHub issues from pi" title="IssueMe" width="760">
    </td>
  </tr>
</table>

- **GitHub API native:** no GitHub CLI dependency and no shell execution for GitHub issue operations.
- **Repository scoped:** resolves the current `owner/repo` from trusted project context and validates GitHub request boundaries.
- **Agent tool suite:** registers twenty-eight `issueme_*` tools for issue, label, milestone, assignee, Projects v2, comment, sub-issue, development-link, and bulk workflows.
- **Local issue cache:** writes open issues to `issues/<number>-<title-slug>.json` so agents can inspect full bodies/comments without oversized tool results.
- **Safety-aware:** honors pi project trust, keeps tokens out of config/cache/tool output, protects closed issues, bounds results, and requires explicit confirmation for destructive taxonomy operations.
- **Workflow friendly:** `/issueme` opens a non-secret configuration UI and `/issueme start [skill-path]` kicks off your project issue-management skill.

> **Status:** `0.1.0` is unreleased. Source, tests, this README, [`SECURITY.md`](SECURITY.md), and the files under [`docs/`](docs/) describe current implemented behavior.

> **Security:** pi packages run with your full system permissions. IssueMe reads GitHub tokens from trusted project or process environment, calls GitHub APIs for the current repository, and writes non-secret config plus local issue-cache files. It is not an OS sandbox. Read [`SECURITY.md`](SECURITY.md).

## Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Daily Usage](#daily-usage)
- [Commands](#commands)
- [Agent Tools](#agent-tools)
- [Configuration and Authentication](#configuration-and-authentication)
- [Safety Model](#safety-model)
- [Troubleshooting](#troubleshooting)
- [Update and Uninstall](#update-and-uninstall)
- [Development](#development)
- [Publishing](#publishing)
- [More Documentation](#more-documentation)
- [License](#license)

---

## Quick Start

```bash
pi install npm:@senad-d/issueme
cd /path/to/your/github/repo
```

Create a local `.env` from the example and provide a token with repository issue access:

```bash
cp .env.example .env
$EDITOR .env
```

`.env.example` documents the supported variables (`GH_TOKEN` or `GITHUB_TOKEN`, plus optional `GITHUB_REPOSITORY`) with safe placeholders.

Start pi and open IssueMe:

```bash
pi
```

```text
/issueme
```

Review non-secret settings, then sync the current repository issues:

```text
Use issueme_sync_issues to sync the current repository issues.
```

Recommended workflow kickoff:

```text
/issueme start .pi/skills/github-issues/SKILL.md
```

If the npm package is unavailable before a public release, use the source checkout workflow below. See [`docs/configuration.md`](docs/configuration.md) for token/config details and [`docs/usage.md`](docs/usage.md) for workflow examples.

---

## Installation

| Scope | Command | Notes |
| --- | --- | --- |
| Global | `pi install npm:@senad-d/issueme` | Loads in every trusted pi project. |
| Project-local | `pi install npm:@senad-d/issueme -l` | Writes to `.pi/settings.json` in the current project. |
| One run | `pi -e npm:@senad-d/issueme` | Try without changing settings. |
| Git | `pi install git:github.com/senad-d/IssueMe@<tag>` | Pin a tag or commit. |
| Local checkout | `pi --no-extensions -e .` | Develop or test this repository. |

Requirements:

- pi with Node.js 22.19.0 or newer.
- A trusted project checkout.
- `GH_TOKEN` or `GITHUB_TOKEN` with repository issue access. Projects v2, native sub-issues, and linked-development inspection require the matching GitHub permissions/features.

Source checkout:

```bash
git clone https://github.com/senad-d/IssueMe.git
cd IssueMe
npm ci
npm run validate
pi --no-extensions -e .
```

Use a checkout globally while developing:

```bash
pi install /absolute/path/to/IssueMe
```

---

## Daily Usage

Inside a trusted GitHub repository, run one of these in pi:

```text
/issueme
/issueme info
/issueme start .pi/skills/github-issues/SKILL.md
/issueme start
```

Recommended first run:

1. Add a GitHub token through trusted project or process environment.
2. Start pi from the repository checkout and trust the project if prompted.
3. Run `/issueme info` to confirm repository, token, config, and cache status without exposing secrets.
4. Run `/issueme` to review config such as issue directory, defaults, creator scope, and default skill path.
5. Ask the agent to call `issueme_sync_issues` before backlog work.
6. Start your project workflow with `/issueme start [skill-path]`.

IssueMe provides tools; your project `SKILL.md` should describe your team's issue process. See [`docs/usage.md`](docs/usage.md) for a starter skill and prompt examples.

---

## Commands

| Command | Description |
| --- | --- |
| `/issueme` | Open the non-secret configuration UI in TUI mode; non-TUI modes show safe config/status output. |
| `/issueme info` | Show help, runtime status, registered tool names, cache counts, and troubleshooting hints without secrets. |
| `/issueme help`, `/issueme --help`, `/issueme -h` | Aliases for `/issueme info`. |
| `/issueme start [skill-path]` | Ask the agent to load a readable project-local issue workflow skill, or the configured `defaultSkillPath` when omitted. |

---

## Agent Tools

IssueMe registers twenty-eight `issueme_*` tools. The most common flow is:

1. Discover: `issueme_list_labels`, `issueme_list_milestones`, `issueme_list_assignees`, `issueme_list_projects`, `issueme_get_project_fields`.
2. Inspect: `issueme_sync_issues`, `issueme_list_issues`, `issueme_get_issue`, `issueme_list_sub_issues`, `issueme_list_issue_development_links`.
3. Mutate explicitly: create/update/comment/assign/label/reopen/close issues, manage label/milestone taxonomy, add/update Projects v2 items, manage native sub-issues, or bulk-update a confirmed list of issue numbers.

Use the detailed references when building agent workflows:

- [`docs/tool-reference.md`](docs/tool-reference.md) for the full tool catalog and examples.
- [`docs/public-contracts.md`](docs/public-contracts.md) for read/write behavior, execution modes, and result semantics.
- [`docs/usage.md`](docs/usage.md) for skill-guided workflow prompts.

---

## Configuration and Authentication

Project config is non-secret and stored at:

```text
.pi/agent/issueme.json
```

Supported settings include `issueDirectory`, `allowedIssueCreator`, `defaultLabels`, `defaultAssignees`, and `defaultSkillPath`. The optional `allowedIssueCreator` setting is an IssueMe processing scope only; it limits what IssueMe lists, syncs, reads, mutates, and caches, but it does not change GitHub repository permissions.

Token precedence:

1. trusted project `GH_TOKEN`;
2. trusted project `GITHUB_TOKEN`;
3. process `GH_TOKEN`;
4. process `GITHUB_TOKEN`.

Tokens are read but never written to config, cache files, tool output, or logs. Full configuration, trust, local cache, and request-boundary details are in [`docs/configuration.md`](docs/configuration.md).

---

## Safety Model

- IssueMe honors project-local config, tokens, Git metadata, skills, and cache files only when pi reports the project as trusted.
- Closed issues are not mutated again except through explicit `issueme_reopen_issue`.
- Remote GitHub issues are never deleted.
- Repository label and milestone deletion require explicit delete actions and confirmation flags.
- Bulk updates accept only explicit issue number lists, never unconstrained search targets.
- Native sub-issues use GitHub GraphQL; IssueMe does not silently create body-only parent/dependency/blocker fallbacks.
- Tool results are bounded and include `details.result`/status metadata; agents should check both pi tool errors and IssueMe result details.
- IssueMe starts no webhooks, listeners, background servers, timers, file watchers, telemetry, or GitHub CLI processes.

### Issue dependencies and blockers

IssueMe does not register issue dependency/blocker tools today. GitHub exposes native sub-issues and Projects v2 APIs, but there is no stable native GitHub REST or GraphQL API for issue dependency, blocker, or tracked-by links with documented list/add/remove semantics. IssueMe does not create body-only `blocked by`, `depends on`, or `tracked by` references as a silent fallback; use native sub-issues, Projects v2 fields, or GitHub's UI instead.

Read [`SECURITY.md`](SECURITY.md) before installing in sensitive environments.

---

## Troubleshooting

| Problem | Try |
| --- | --- |
| `/issueme` refuses config editing | Trust the project first; project-local state is ignored until pi reports trust. |
| Token is missing | Set `GH_TOKEN` or `GITHUB_TOKEN` in trusted project or process environment. |
| Repository cannot be resolved | Set `GITHUB_REPOSITORY=owner/repo` or start pi from a trusted GitHub checkout. |
| Local issue files look stale | Run `issueme_sync_issues`, or `issueme_get_issue` with `refresh: true` for one known issue. |
| Expected issue is missing or refused | Check `/issueme info` for **Allowed issue creator** and update it in `/issueme` if needed. |
| Unknown label, milestone, assignee, project, or field | Use the matching read-only discovery tool before mutating. |
| Mutation is refused | Confirm the issue is open, in creator scope, and the target IDs/labels/users exist. |
| Bulk update stopped | Inspect `details.bulkResults`, sync if cache state is uncertain, then retry only remaining explicit issue numbers. |

More troubleshooting notes live in [`docs/configuration.md`](docs/configuration.md), [`docs/tool-reference.md`](docs/tool-reference.md), and [`SECURITY.md`](SECURITY.md).

---

## Update and Uninstall

```bash
pi update --extensions
pi update npm:@senad-d/issueme
pi remove npm:@senad-d/issueme
pi remove npm:@senad-d/issueme -l
```

Removing the package does not automatically delete `.pi/agent/issueme.json` or local issue cache files. Review them before deleting manually.

---

## Development

```bash
npm ci
npm run validate
```

Useful checks:

```bash
npm run typecheck
npm run format:check
npm run test
npm run smoke:discover
npm run smoke:packaged
npm run smoke:handlers
npm run smoke:pi-lifecycle
npm run check:pack
pi --no-extensions -e .
```

Development, diagnostics, smoke-test, and live-verification notes are in [`docs/development.md`](docs/development.md).

---

## Publishing

IssueMe publishes to npm as `@senad-d/issueme`. Run from a clean working tree after updating `CHANGELOG.md`.

```bash
npm login
npm whoami
node scripts/publish-npm.mjs
```

The publish script validates, versions, tags, publishes with `npm publish --access public`, and offers to push the release commit and tag.

---

## More Documentation

- [`docs/usage.md`](docs/usage.md) - daily workflows, starter `SKILL.md`, and prompt examples.
- [`docs/configuration.md`](docs/configuration.md) - config schema, auth, trust policy, local cache files, and GitHub request policy.
- [`docs/tool-reference.md`](docs/tool-reference.md) - complete tool catalog, result semantics, examples, and limitations.
- [`docs/development.md`](docs/development.md) - diagnostics, validation, smoke tests, and release workflow.
- [`docs/public-contracts.md`](docs/public-contracts.md) - public command/tool contract matrix.
- [`docs/STRUCTURE.md`](docs/STRUCTURE.md) - source layout and architecture boundaries.
- [`docs/live-github-verification.md`](docs/live-github-verification.md) - opt-in live GitHub verification plan.
- [`docs/pi-lifecycle-verification.md`](docs/pi-lifecycle-verification.md) - manual pi lifecycle checks.
- [`SECURITY.md`](SECURITY.md) - security policy and threat model.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - contribution guidelines.
- [`CHANGELOG.md`](CHANGELOG.md) - release history.

---

## License

MIT
