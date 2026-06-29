# Second-pass Pi extension review tasks

## Review scope and date

- Date: 2026-06-29
- Scope: maintainability, clean-code, type-safety, logic, edge cases, tests, and best-practice risks in the current IssueMe TypeScript Pi extension.
- Review mode: planning only. No implementation files were changed.

## Files or areas reviewed

- Project structure and conventions: `package.json`, `tsconfig.json`, `.github/workflows/ci.yml`, `docs/STRUCTURE.md`, `docs/public-contracts.md`.
- Extension public surface: `src/extension.ts`, `src/commands/*.ts`, `src/tools/*.ts`, `src/tools/inventory.ts`, `src/contracts.ts`.
- Shared internals: `src/github/client.ts`, `src/issues/*.ts`, `src/config/config.ts`, `src/errors.ts`, `src/types.ts`, `src/utils/*.ts`.
- Test and smoke setup: `test/*.test.mjs`, `scripts/check-format.mjs`, `scripts/check-package-contents.mjs`, `scripts/smoke-*.mjs`.
- Pi docs used for best-practice comparison: extension, TUI, and package docs.

## Safe commands run and results

- `npm run typecheck` — passed.
- `npm run format:check` — passed before new review specs were added and again after all three review specs were written (117 files).
- `npm test` — passed, 246 tests.
- `npm run check:pack` — passed.
- `npm audit --audit-level=low` — passed, 0 vulnerabilities.
- `npm run smoke:handlers` — passed.
- `npm run smoke:packaged` — passed.

## Findings summary by severity and category

- Medium / Type Safety: tool handler parameter types are manually mirrored and cast from TypeBox schemas, allowing schema/runtime drift.
- Medium / Architecture: `src/github/client.ts` mixes REST transport, GraphQL operations, validation, normalization, and domain formatting in one large module.
- Medium / Testing: public tool metadata tests ensure prompt metadata exists, but do not ensure agents receive the documented result-policy guidance for `details.result` and partial-success outcomes.
- Low / TUI Maintainability: `src/commands/config-tui.ts` carries bespoke terminal key and ANSI width logic instead of using Pi TUI utilities or documenting why local copies are required.

## Ordered tasks

- [x] Derive tool handler parameter types from schemas or enforce schema-runtime parity tests

#### Why

Many tool files define a TypeBox schema and then separately define an interface such as `ListIssuesToolParams`, `Normalized...Params`, or cast `params as ...`. This duplicates the public schema in TypeScript-only shapes and can hide drift when a schema field is renamed, added, or constrained differently than the runtime normalization expects. This is especially risky for mutation tools because schema validation is part of the safety boundary.

#### How to resolve

- Evaluate using TypeBox static types, a local schema-to-type pattern, or explicit schema field parity tests for each `src/tools/*.ts` parameter object.
- Remove unnecessary `params as ...` casts where the handler can be typed from the schema.
- Add a focused test that compares registered tool schema properties with each normalizer's accepted fields for action-based tools such as `issueme_bulk_update_issues`, `issueme_update_project_item`, `issueme_manage_label`, and `issueme_manage_milestone`.
- Keep provider-compatible schemas: no nullable, union, or literal patterns that existing tests forbid.
- Validate with `npm run typecheck`, `npm test`, and `npm run format:check`.

#### Acceptance criteria

- Tool parameter runtime types cannot silently diverge from registered schemas.
- Existing strict schema/provider compatibility tests remain green.
- Action-specific fields are covered by parity tests or schema-derived types.
- The change is focused on type-safety and does not rewrite unrelated tool logic.

- [x] Split the GitHub client into smaller domain modules with transport kept shared

#### Why

`src/github/client.ts` is over 2,500 lines and combines REST request transport, pagination, GraphQL query construction, Projects v2 logic, native sub-issues, issue development links, repository metadata, response normalization, and error mapping. This concentration makes future changes high-risk because unrelated domains can accidentally affect shared boundary checks or API parsing.

#### How to resolve

- Keep one shared transport/boundary layer for authenticated GitHub requests, pagination URL checks, rate-limit parsing, and token redaction.
- Move domain-specific logic into focused modules, for example `issues-client`, `labels-client`, `milestones-client`, `projects-client`, `sub-issues-client`, and `development-links-client`, or an equivalent structure that preserves the public `GitHubClient` facade.
- Move GraphQL query builders and normalizers next to the domain that uses them.
- Preserve existing public method names initially to avoid a broad tool rewrite.
- Add or keep tests proving repository-boundary checks, rate-limit handling, response-shape errors, and domain operations still pass.
- Validate with `npm run typecheck`, `npm test`, `npm run check:pack`, and `npm run smoke:handlers`.

#### Acceptance criteria

- GitHub transport/security boundary code is isolated from domain-specific parsers and mutations.
- Domain modules are independently reviewable and covered by existing or new focused tests.
- The public tools behave the same after the refactor.
- Package dry-run still includes every new source module and validation commands pass.

- [x] Centralize shared IssueMe result-policy prompt guidance across all tools

#### Why

`docs/public-contracts.md` correctly explains that IssueMe may return normal Pi tool results with `details.result: "partial_success"` or `"error"`, but the registered tool prompt guidelines are per-tool and do not consistently remind agents to inspect `details.result`, `status`, and `needsSync`. Because Pi only sets `isError` when handlers throw, this prompt gap can cause agents to treat structured failures as ordinary success.

#### How to resolve

- Add a shared result-policy guideline generator that includes the concrete tool name, satisfying the existing metadata test requirement that each guideline names its tool.
- Apply it consistently to tools that can return `partial_success` or structured `result:error`, especially bulk, label/milestone management, sub-issue tools, close/reopen, and cache-refresh tools.
- Update `test/extension-registration.test.mjs` or add a new test to assert that relevant tools include result-policy guidance.
- Keep prompt text concise enough to preserve the existing schema/prompt budget test.
- Validate with `npm test` and `npm run smoke:packaged`.

#### Acceptance criteria

- Agents receive tool-specific guidance to inspect `details.result`, `status`, and `needsSync` for non-throwing failures.
- Prompt metadata tests prove the guidance is present for all relevant tools.
- Prompt budget tests remain within limits.
- No tool behavior changes are bundled with the prompt metadata update.

- [x] Either adopt Pi TUI utilities for the config TUI or document and test the local terminal helpers

#### Why

`src/commands/config-tui.ts` implements custom key detection, ANSI truncation, visible-width calculation, grapheme segmentation, emoji width, and layout clipping. The Pi TUI docs recommend helpers such as `matchesKey()`, `truncateToWidth()`, `visibleWidth()`, and existing components where practical. Local terminal logic can be correct, but it is hard to maintain and easy to break with multi-byte input, pasted text, or terminal key variants.

#### How to resolve

- Evaluate replacing local key and width helpers with Pi TUI utilities while respecting package dependency rules.
- If direct Pi TUI imports are avoided intentionally, add a short code comment or docs note explaining why local helpers remain necessary.
- Add targeted tests for key variants (`enter`, `escape`, arrows, backspace/delete), pasted multi-character printable input, zero-width joiners, combining marks, CJK/fullwidth characters, and ANSI style reset behavior.
- Keep the existing visual snapshot tests and width-bound guarantees.
- Validate with `npm run typecheck`, `npm test`, and `npm run format:check`.

#### Acceptance criteria

- The config TUI key/width strategy is either aligned with Pi TUI utilities or explicitly justified.
- Tests cover the terminal/input cases most likely to regress.
- Rendered lines remain width-bounded in wide, narrow, and tiny modes.
- The task does not change IssueMe config semantics outside TUI input/render handling.

## Blocked checks or areas not reviewed

- No live terminal interaction was performed; TUI behavior was reviewed through code, docs, and tests/snapshots.
- No live GitHub behavior was exercised; API behavior was reviewed through mocks and unit tests.
- Some existing planning specs were sampled rather than fully re-audited because current source, README, SECURITY, and contracts are the stated source of truth.
