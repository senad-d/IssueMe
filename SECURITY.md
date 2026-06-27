# Security Policy

## Trust model

Pi packages and extensions run with the full local permissions of the user account that starts Pi. Review IssueMe source before installing it, pin versions in sensitive environments, and install only from trusted sources.

```bash
pi install npm:@senad-d/issueme@<version>
pi install git:https://github.com/senad-d/issueme@<tag>
```

## Security-sensitive behavior

IssueMe may:

- read project-root `.env` for `GH_TOKEN` or `GITHUB_TOKEN`;
- read process environment `GH_TOKEN` or `GITHUB_TOKEN` when `.env` does not provide a token;
- read local `.git/config` to resolve the current GitHub repository when `GITHUB_REPOSITORY` is not set;
- write non-secret settings to `.pi/agent/issueme.json`;
- write one local JSON file per open issue under the configured issue directory (`issues/` by default);
- call the GitHub REST API for the resolved current repository.

IssueMe does not:

- use the GitHub CLI;
- execute shell commands for GitHub operations or repository discovery;
- start webhook listeners, background HTTP servers, timers, sockets, or file watchers;
- send telemetry;
- write tokens to disk;
- mutate closed/resolved issues;
- delete remote GitHub issues.

## Credential handling

Token resolution order:

1. project `.env` `GH_TOKEN`;
2. project `.env` `GITHUB_TOKEN`;
3. process `GH_TOKEN`;
4. process `GITHUB_TOKEN`.

Tokens must never be persisted to `.pi/agent/issueme.json`, `issues/*.json`, logs, tool output, or tool `details`. Errors describe missing or invalid credentials without echoing token values.

## Local data

Local issue JSON files can contain issue bodies and comments. Treat `issues/*.json` as sensitive local artifacts, especially for private repositories.

## Closed issue protection

Before every remote mutation of an existing issue, IssueMe re-checks the issue state through GitHub REST. If the issue is closed, the operation is refused before sending the mutation payload.

## Reporting vulnerabilities

Please report suspected security vulnerabilities privately by email: <senad.dizdarevic@proton.me>.

For non-sensitive issues, use the repository issue tracker:

<https://github.com/senad-d/issueme/issues>

Do not open public issues for security-sensitive reports that include exploit details, private repository contents, secrets, credentials, or private issue content.

## Secure development checklist

- Do not commit secrets, tokens, local `.pi/` state, or generated artifacts.
- Document any file, shell, network, credential, or persistence behavior added by the extension.
- Avoid starting background resources in the extension factory.
- Re-check GitHub issue state before every remote mutation.
- Refuse to update, comment on, label, assign, or close already closed issues.
- Keep package contents minimal with `npm run check:pack`.
- Use isolated smoke tests with `pi --no-extensions -e .`.
