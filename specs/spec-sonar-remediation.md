# SonarQube and test remediation

### 1. Resolve fresh analysis findings without changing safety contracts

- [x] Fix the findings from the fresh Sonar analysis and verify the full test/packaging pipeline.

#### Why

The initial 2026-10-10 scan reported 18 active issues (two sorting findings and 16 maintainability findings). All 503 tests and the full validation pipeline passed; fresh LCOV line coverage was 98.81%.

#### How

- Make sorting explicit while preserving version-1 continuation token canonicalization.
- Extract focused normalization and validation helpers; simplify nested output expressions.
- Reuse ordered async iteration for bulk label removals, preserving fail-fast and partial-success receipts.
- Escape the intentional Unicode replacement character in the test assertion to avoid the scanner's encoding warning.
- Add regression coverage, regenerate LCOV, and rerun validation and Sonar analysis.

#### Where

- `src/github/continuation.ts`, `src/github/issue-timeline-client.ts`, `src/github/issues-client.ts`, `src/github/projects-client.ts`
- `src/issues/store.ts`, `src/tools/`, and focused tests under `test/`

#### Acceptance criteria

- Existing continuation tokens, cache validation diagnostics, tool output, and mutation safety semantics remain compatible.
- Bulk label removals remain ordered with one mutation in flight and stop before later labels after a failure.
- `npm run validate` and `npm run test:coverage` pass.
- Fresh Sonar analysis passes the quality gate and reports zero active issues, without disabling rules or excluding source.

#### Verification

- `npm run validate`: passed; 506 tests, zero failures, lint, package checks, packed handlers, and Pi lifecycle smoke passed.
- `npm run test:coverage`: passed; LCOV reports 98.82% lines and 90.19% branches.
- Fresh Sonar analysis (2026-10-10, CE task `AaEkzj5fqxZKWC9KsN25`): quality gate OK; zero bugs, code smells, vulnerabilities, security hotspots, or active issues; Sonar combined coverage 96.6%.
- Scanner encoding warning cleared. Missing-blame warnings are expected for uncommitted local edits; no commit was requested.
- Scanner-generated tracked artifacts were restored and newly generated graph files removed so only remediation source, tests, changelog, and this task record remain changed.
