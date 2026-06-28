# Contributing

IssueMe is a TypeScript Pi extension package for agent-friendly GitHub issue management.

Current user-visible behavior is documented in `README.md`, current security behavior in `SECURITY.md`, and current module layout in `docs/STRUCTURE.md`. Historical specs preserve implementation context but do not supersede the active remediation and issue-management expansion task specs.

## Development setup

This project requires Node.js `>=22.19.0`.

```bash
npm install
npm run validate
```

Useful commands:

```bash
npm run typecheck
npm run format:check
npm run test
npm run test:tui-artifacts
npm run smoke:discover
npm run check:pack
pi --no-extensions -e .
```

## Source of truth before implementing

Read these files first:

1. `specs/spec-remediation-tasks.md` — remediation/hardening backlog.
2. `specs/spec-issue-management-expansion-tasks.md` — issue-management expansion backlog.
3. `docs/PROJECT_DEFINITION_BRIEF.md` — approved identity, scope, and decisions.
4. `specs/spec-architecture.md` — original architecture and module boundaries.
5. `specs/spec-guidelines.md` — coding, Pi, package, testing, and security rules.
6. `specs/spec-configuration-tui-design-standard.md` when working on the configuration UI.

`specs/spec-tasks.md` is historical implementation-pass evidence unless a future spec explicitly reactivates it.

## Pull requests

- Keep changes focused and explain user-visible behavior.
- Update README/docs/examples when commands, tools, settings, packaging, tests, or security behavior changes.
- Run `npm run validate` before requesting review, or explain why it could not be run.
- Regenerate TUI visual captures with `npm run test:tui-artifacts` when the configuration TUI renderer changes.
- Do not commit secrets, local `.pi/` state, generated package tarballs, `node_modules/`, or machine-local paths.
- Do not mark task-spec checkboxes complete unless the acceptance criteria for that task are met.

## Security expectations

Pi extensions run with the user's local permissions. Treat changes that read files, write files, call the network, execute commands, or handle credentials as security-sensitive and document the behavior in `SECURITY.md`.

IssueMe must stay on direct GitHub REST/GraphQL APIs: no GitHub CLI, no shell-based GitHub operations, and no webhook listener.
