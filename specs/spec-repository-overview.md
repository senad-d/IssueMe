# Repository overview

### 1. Add a bounded, read-only repository overview

- [x] Implement `issueme_get_overview` and verify the acceptance criteria.

#### Why
Initial repository orientation should not require separate discovery calls or a full issue/comment cache sync.

#### How
Reuse one trusted runtime and existing GitHub client readers. Fetch at most one page for each selected section (issues, labels, milestones, assignees, repository-linked projects), concurrently. Return compact summaries with explicit scope, fetch timestamps, truncation, section failures, and drill-down tools. Keep mutations and cache synchronization separate.

#### Where
- `src/tools/overview*.ts`, tool registration/inventory/contracts, shared types
- `src/github/client.ts` and `src/github/transport.ts` internal pagination budgets
- Focused overview tests, public contracts/schema tests, documentation

#### Acceptance criteria
- One call returns the five default sections; a small sections/limit schema permits focused reads.
- At most five GitHub requests, no comment/detail fan-out, no GitHub mutations or cache writes.
- Creator scope applies to issues; metadata and milestone counts are clearly repository-wide.
- Returned counts are not represented as repository totals; omitted, truncated, unavailable, and complete sections are distinguishable.
- Successful sections survive independent GitHub read failures; partial reads never request cache sync. Setup/authentication, rate-limit, boundary, cancellation, and unexpected programming failures remain fatal.
- Model output and structured summaries are bounded; identities and drill-down guidance remain available.
- Existing tools keep their default behavior and mutation preflights; overview-first guidance replaces mandatory sync for initial planning.
- Tests cover request budgets, privacy, partial failures, cancellation, creator scope, output bounds, and registration; lint/typecheck and the test suite pass.

Verification for `0.1.9`: `npm run validate` passed with 437 tests, typecheck, ESLint, formatting, package checks, all 30 checkout/packed-package tool handlers, and the offline Pi lifecycle smoke. `npm run test:coverage` and `npm run smoke:discover` also passed. After fixing six maintainability findings, the fresh Sonar scan passed its quality gate with 96.6% coverage, zero active issues, and zero security hotspots. Regression tests preserve invalid null-section rejection, milestone/label formatting, and fail-fast GraphQL rate limits with mutation settlement. No live GitHub requests were used.

GraphQL batching, persistent overview caching, new pagination tools, project item inspection, and CI/review/release readers are deferred. This first version reduces orchestration and unnecessary sync work, not the request count of the equivalent five single-page discovery reads.
