# IssueMe Development Guide

This guide collects diagnostics, validation, smoke checks, and publishing notes that used to live in the README.

## Setup

```bash
npm ci
npm run validate
```

Run IssueMe from this checkout in an isolated pi session:

```bash
pi --no-extensions -e .
```

## Validation

Default validation:

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
npm run smoke:handlers
npm run smoke:pi-lifecycle
npm run check:pack
```

What the smoke checks cover:

| Script | Purpose |
| --- | --- |
| `smoke:discover` | Verifies `/issueme` through pi RPC command discovery and verifies all twenty-eight `issueme_*` tool registrations through a local registration probe. |
| `smoke:packaged` | Packs to a temporary directory, installs the tarball in a production-style project, and verifies the packed package registers `/issueme` and the tools. |
| `smoke:handlers` | Safely invokes checkout and packed-package command/tool handler paths with temporary directories, scrubbed IssueMe environment variables, and mocked GitHub fetches. |
| `smoke:pi-lifecycle` | Drives real pi RPC `/issueme info`, `/issueme`, and `/issueme start` command paths in an offline temporary trusted project. |

Discovery smoke checks do not invoke handlers. Handler and lifecycle smoke checks never read project token files, call live GitHub, publish, update dependencies, or mutate remote issues.

## TUI artifacts

Generate deterministic configuration TUI visual artifacts:

```bash
npm run test:tui-artifacts
```

Artifacts are written under:

```text
test/snapshots/tui/issueme-config/
```

Manual terminal-only TUI lifecycle coverage is documented in [`pi-lifecycle-verification.md`](pi-lifecycle-verification.md).

## Live GitHub verification

Live GitHub verification is intentionally separate from local validation and must be explicitly requested by an operator with disposable credentials/repository fixtures.

Use [`live-github-verification.md`](live-github-verification.md) before running `.pi/skills/issueme-e2e-test` or any Projects v2 live checks.

## Package contents

`package.json` publishes the README, license, security policy, changelog, docs, skills, TypeScript source, and TypeScript config. Local state, token files, issue cache files, reports, tarballs, `node_modules`, and build output stay out of the package.

Check package contents with:

```bash
npm run check:pack
npm run pack:dry-run
```

## Publishing

IssueMe publishes to npm as `@senad-d/issueme`. You need an npm account with publish access to the `@senad-d` scope.

Run from a clean working tree after updating `CHANGELOG.md`:

```bash
npm login
npm whoami
node scripts/publish-npm.mjs
```

The publish script requires a clean working tree, asks for the version number, runs validation, updates `package.json` and `package-lock.json`, creates the `v<version>` git tag, publishes with `npm publish --access public`, and offers to push the release commit and tag.

## Implementation references

- [`STRUCTURE.md`](STRUCTURE.md) - source layout and architecture boundaries.
- [`PROJECT_DEFINITION_BRIEF.md`](PROJECT_DEFINITION_BRIEF.md) - project definition and historical context.
- [`public-contracts.md`](public-contracts.md) - public command and tool contracts.
- [`../SECURITY.md`](../SECURITY.md) - security policy.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) - contribution guidelines.
- [`../specs/spec-architecture.md`](../specs/spec-architecture.md) - architecture planning context.
- [`../specs/spec-guidelines.md`](../specs/spec-guidelines.md) - implementation guidelines.
- [`../specs/spec-tasks.md`](../specs/spec-tasks.md) - task plan context.
- [`../specs/spec-remediation-tasks.md`](../specs/spec-remediation-tasks.md) - remediation tasks.
- [`../specs/spec-issue-management-expansion-tasks.md`](../specs/spec-issue-management-expansion-tasks.md) - issue-management expansion tasks.
