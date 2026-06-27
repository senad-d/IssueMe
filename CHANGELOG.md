# Changelog

## 0.1.0 - Unreleased

- Implemented `/issueme`, `/issueme info`, and `/issueme start <skill-path>`.
- Implemented IssueMe tools for syncing, creating, reading, updating, commenting, assigning, labeling, and closing GitHub issues.
- Added REST-only GitHub client with token redaction, pagination, abort support, and closed-issue mutation guards.
- Added project `.env` token precedence, repository resolution from `GITHUB_REPOSITORY` or `.git/config`, non-secret config persistence, slug/path safety, and local issue JSON storage.
- Added tests for helpers, GitHub REST behavior, token safety, repository parsing, path safety, config, and local issue files.
- Prepared IssueMe project identity for `@senad-d/issueme` with architecture, guidelines, and task specs.

> IssueMe intentionally does not use GitHub CLI, shell-based GitHub operations, webhooks, background listeners, or telemetry.
