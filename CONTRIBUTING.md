# Contributing

IssueMe is a TypeScript Pi extension package for agent-friendly GitHub issue management.

## Development setup

This project requires Node.js `>=22.19.0`.

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

## Before implementing features

Read these files first:

1. `docs/PROJECT_DEFINITION_BRIEF.md`
2. `specs/spec-architecture.md`
3. `specs/spec-guidelines.md`
4. `specs/spec-tasks.md`
5. `specs/spec-configuration-tui-design-standard.md` when working on the configuration UI

Implement `specs/spec-tasks.md` one unchecked task at a time in a separate implementation session.

## Pull requests

- Keep changes focused and explain user-visible behavior.
- Update README/docs/examples when commands, tools, settings, packaging, or security behavior changes.
- Run `npm run validate` before requesting review, or explain why it could not be run.
- Do not commit secrets, local `.pi/` state, generated package tarballs, `node_modules/`, or machine-local paths.
- Do not mark task-spec checkboxes complete unless the acceptance criteria for that task are met.

## Security expectations

Pi extensions run with the user's local permissions. Treat changes that read files, write files, call the network, execute commands, or handle credentials as security-sensitive and document the behavior in `SECURITY.md`.

IssueMe's first implementation must stay REST-only: no GitHub CLI and no webhook listener.
