# IssueMe

IssueMe is an agent-friendly GitHub issue management layer for [Pi](https://pi.dev). It lets Pi agents manage GitHub issues through structured tools while keeping one local JSON file per open issue.

## Capabilities

- **GitHub REST API only:** no GitHub CLI dependency and no shell execution for GitHub operations.
- **Current repository scope:** resolves the repository from `GITHUB_REPOSITORY` or local `.git/config` `origin`.
- **Agent tools:** create, sync, get, update, comment, assign, label, and close issues.
- **Local issue files:** open issues are cached as `issues/<issue-number>-<issue-title-slug>.json` by default.
- **Closed issue safety:** closed issues cannot be updated, commented on, labeled, assigned, or closed again; closing removes local cache files.
- **Workflow kickoff:** `/issueme start <skill-path>` sends a prompt asking the agent to use the supplied skill with IssueMe tools.

## Commands

| Command | Behavior |
| --- | --- |
| `/issueme` | Edit non-secret IssueMe config as JSON and save `.pi/agent/issueme.json`. |
| `/issueme info` | Show help, repo/auth/cache status, and tool names without secrets. |
| `/issueme start <skill-path>` | Ask the agent to read/use the supplied skill path and IssueMe tools. |

## Tools

| Tool | Behavior |
| --- | --- |
| `issueme_sync_issues` | Fetch open issues, write/update local issue files, and remove local files for closed issues. |
| `issueme_create_issue` | Create a GitHub issue and write its local JSON file. |
| `issueme_get_issue` | Read one issue from cache and optionally refresh from GitHub. |
| `issueme_update_issue` | Update explicit fields on an open issue and refresh the local file. |
| `issueme_comment_issue` | Add a comment to an open issue and refresh the local file. |
| `issueme_assign_issue` | Add, remove, or set assignees on an open issue. |
| `issueme_label_issue` | Add, remove, or set labels on an open issue. |
| `issueme_close_issue` | Close an open issue and remove its local JSON file. |

## Configuration and authentication

Non-secret settings are stored project-locally in:

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

GitHub tokens are read, never written, from this precedence order:

1. project-root `.env` `GH_TOKEN`;
2. project-root `.env` `GITHUB_TOKEN`;
3. process `GH_TOKEN`;
4. process `GITHUB_TOKEN`.

Tokens are never persisted to config files, issue files, logs, tool output, or tool `details`.

## Local issue files

IssueMe writes one human/LLM-readable JSON file per open issue:

```text
issues/<issue-number>-<issue-title-slug>.json
```

Local files include the issue title, state, body, labels, assignees, milestone, comments, URL, timestamps, and sync time. Treat them as potentially sensitive because issue bodies and comments can contain private project information.

## Development

```bash
npm install
npm run validate
```

Useful commands:

```bash
npm run typecheck
npm run test
npm run check:pack
pi --no-extensions -e .
```

Use isolated Pi smoke testing while developing:

```bash
pi --no-extensions -e .
```

## Security

Pi extensions run with the local permissions of the user account that starts Pi. Read [`SECURITY.md`](SECURITY.md) for credential handling, local file access, REST API behavior, and reporting guidance.

## License

MIT
