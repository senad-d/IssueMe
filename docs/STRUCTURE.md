# IssueMe Structure Guide

IssueMe is a TypeScript Pi extension package that exposes a REST-only GitHub issue management surface to agents.

## Current layout

```text
src/
├── extension.ts                  # small registration-only entry point
├── commands/
│   └── issueme-command.ts         # /issueme, /issueme info, /issueme start <skill-path>
├── tools/
│   ├── issueme-tools.ts           # tool registration aggregator
│   ├── create-issue.ts
│   ├── sync-issues.ts
│   ├── get-issue.ts
│   ├── update-issue.ts
│   ├── comment-issue.ts
│   ├── assign-issue.ts
│   ├── label-issue.ts
│   ├── close-issue.ts
│   └── runtime.ts                 # shared tool runtime helpers
├── github/
│   ├── client.ts                  # GitHub REST client and mutation guards
│   └── repository.ts              # GITHUB_REPOSITORY/.git/config resolution
├── issues/
│   ├── store.ts                   # safe local issue JSON reads/writes/removes
│   └── format.ts                  # GitHub response normalization and summaries
├── config/
│   └── config.ts                  # non-secret .pi/agent/issueme.json config
├── utils/
│   ├── env.ts                     # .env parsing, token precedence, redaction
│   └── slug.ts                    # issue title slugs and safe paths
├── constants.ts
├── errors.ts
└── types.ts
```

## Module boundaries

- `src/extension.ts` only calls registration functions.
- `src/commands/` owns user commands and workflow kickoff.
- `src/tools/` owns LLM-callable tool definitions, schemas, prompt snippets, and prompt guidelines.
- `src/github/` owns REST API calls and repository resolution.
- `src/issues/` owns local `issues/<issue-number>-<issue-title-slug>.json` files.
- `src/config/` owns `.pi/agent/issueme.json` non-secret settings.
- `src/utils/` owns pure helpers such as `.env` parsing, redaction, slug generation, and path safety.

## Pi extension conventions

- No long-lived processes, file watchers, timers, sockets, HTTP listeners, or webhooks are started from the extension factory.
- Every IssueMe tool includes `promptSnippet` and tool-specific `promptGuidelines`.
- String enum tool schema fields use `StringEnum` from `@earendil-works/pi-ai`.
- Local issue-file mutations use safe path resolution and Pi's file mutation queue helper.
- Large issue output is truncated in tool text while structured details stay concise and secret-free.

## Validation

```bash
npm run typecheck
npm run test
npm run check:pack
npm run validate
pi --no-extensions -e .
```

Use `pi --no-extensions -e .` for isolated manual smoke testing so other configured extensions cannot interfere.
