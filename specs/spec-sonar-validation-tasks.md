# Sonar and test validation

### 1. Remediate the fresh scan findings

- [x] Fix the active Sonar findings and verify the working tree with tests and a fresh scan.

#### Why

The initial local validation passed all 515 tests, but a fresh Sonar analysis reported 23 findings and failed the quality gate.

#### How

Simplify ambiguous issue-template regexes, preserve NUL removal without a control-character regex, clarify formatting, and reuse the sequential mapper for bounded template reads. Add regression tests for metadata, decoding, output, ordering, failures, and cancellation. Preserve existing unrelated changes; do not commit or run live GitHub mutations.

#### Where

- `src/github/issue-templates-client.ts`
- `src/github/client.ts`
- `src/tools/issue-templates.ts`
- `test/issue-templates-tool.test.mjs`
- `CHANGELOG.md`

#### Acceptance criteria

- Focused regressions and `npm run validate` pass.
- `npm run test:coverage` regenerates the scan's coverage report.
- A fresh scan completes processing with a passing quality gate and no active issues or security hotspots.

#### Verification

- `npm run validate`: passed; 522 tests, zero failures, and all lint/package/handler/lifecycle checks passed.
- `npm run test:coverage`: passed; LCOV reports 98.84% lines and 90.35% branches.
- Fresh Sonar analysis (2026-10-10, CE task `AaEk8j-77SjlPX3CHto7`): quality gate OK; zero active issues, bugs, code smells, vulnerabilities, or security hotspots; combined Sonar coverage 96.7%.
- No rules were disabled and no source was excluded. Missing-blame warnings are expected for uncommitted working-tree changes.
- Scanner-generated tracked output was restored and the thirteen newly generated graph files removed. Existing unrelated edits remain intact; no commit was created.
