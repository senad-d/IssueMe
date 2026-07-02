# Plan: SonarQube Issue Remediation Tasks

## Task Description

Create an implementation plan for fixing every active SonarQube/SonarCloud issue currently reported for `senad-d_IssueMe`.

Sonar snapshot captured on 2026-07-02 via AnalyseMe:

- Project: `senad-d_IssueMe`
- Active issues: 291
- Code smells: 285
- Vulnerabilities: 6
- Security hotspots: 0
- Quality gate: none configured

## Objective

Clear all active Sonar issues without suppressing rules, while preserving IssueMe behavior and keeping existing validation green.

## Problem Statement

The project currently has a large Sonar backlog concentrated in security-sensitive release scripts, high-complexity command/tool functions, repeated readability issues, regex concerns, and minor modernization findings. The backlog is too large to fix safely as unrelated one-off edits; it needs an ordered remediation plan that prioritizes vulnerabilities and then groups repeated mechanical fixes by rule and file.

## Solution Approach

Work from highest risk to lowest risk:

1. Fix all vulnerabilities first.
2. Fix reliability-sensitive regex findings.
3. Reduce cognitive complexity in the functions Sonar flagged.
4. Apply repeated readability and modernization fixes in focused file groups.
5. Add or adjust tests with each behavior-affecting refactor.
6. Re-run validation and Sonar analysis until `analyseme_list_issues` returns zero active issues.

## Relevant Files

Use these files to complete the task:

- `scripts/generate-tui-artifacts.mjs` - Security issue for temporary file/directory usage.
- `scripts/publish-npm.mjs` - Security issues for command argument validation and PATH-based command execution, plus top-level await modernization.
- `scripts/*.mjs` - Smoke/check scripts with nested templates, ternaries, promise chains, regex, optional chaining, and complexity findings.
- `dev-shims/pi-coding-agent/index.js` - Empty method code smell.
- `src/commands/*.ts` - Command and TUI complexity/readability findings.
- `src/config/config.ts` - Regex and `Object.hasOwn()` modernization findings.
- `src/errors.ts` - Negated condition, empty object, and regex class findings.
- `src/github/*.ts` - GitHub client, project, repository, transport, GraphQL, and sub-issue findings.
- `src/issues/*.ts` - Issue formatter/store complexity and readability findings.
- `src/tools/*.ts` - Main concentration of tool complexity, nested template, negated condition, ternary, and minor modernization findings.
- `src/utils/*.ts` - Regex, validation, slugging, and safe-read findings.
- `test/*.test.mjs` - Add/update focused tests for every behavior-affecting refactor.
- `package.json` - Validation scripts and possible dependency update if the security fix uses a temporary-file library recommended by Sonar.

### New Files

No new file is required up front. Create helper modules only when they materially reduce repeated complexity, for example shared formatter helpers or secure script helpers.

## Implementation Phases

### Phase 1: Security and Reliability Foundation

- Fix all six vulnerabilities before code-smell work.
- Fix super-linear regex findings that can impact reliability.
- Add tests for changed command/script validation where practical.

### Phase 2: Complexity Refactors

- Extract small helpers from every function flagged by Sonar rule `S3776`.
- Prefer guard clauses, data-driven maps, and pure formatter helpers.
- Keep public tool outputs and error semantics unchanged.

### Phase 3: Mechanical Readability and Modernization

- Apply grouped rule-specific edits for nested ternaries, nested templates, negated conditions, regex APIs, unused imports, re-exports, empty spreads, `Object.hasOwn()`, `replaceAll()`, `flat()`, optional chaining, and top-level await.
- Re-run local validation after each file group.

### Phase 4: Sonar Closure

- Trigger or wait for a fresh Sonar analysis.
- Re-query AnalyseMe pages until no active issues remain.
- If line shifts expose follow-up issues, append them to this spec and continue until zero.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Confirm the Sonar Baseline

- Re-run `analyseme_get_project_summary` before implementation.
- Re-run `analyseme_list_issues` with `limit: 100` for pages 1 through 3.
- Confirm the baseline still shows 291 active issues, or update the appendix inventory if the remote state changed.
- Do not suppress Sonar rules to make the count drop.

### 2. Fix Security Vulnerabilities in Release and Artifact Scripts

- `scripts/generate-tui-artifacts.mjs:31` (`AZ8dpx1cI5cC3g4vWFlR`, `javascript:S5443`): follow Sonar guidance to avoid unsafe publicly writable temporary paths. Use a library such as `tmp` or an equivalent safe temporary file/directory mechanism that creates unpredictable names with appropriate permissions.
- `scripts/publish-npm.mjs:25`, `:41`, `:95` (`AZ8dpx17I5cC3g4vWFlb`, `AZ8dpx17I5cC3g4vWFlc`, `AZ8dpx17I5cC3g4vWFld`, `jssecurity:S8705`): validate every untrusted or variable argument before it reaches `execFileSync`/`spawnSync`. Sonar guidance expects strict input validation before passing data to OS commands.
- `scripts/publish-npm.mjs:56`, `:95` (`AZ8dpx17I5cC3g4vWFlY`, `AZ8dpx17I5cC3g4vWFlZ`, `javascript:S4036`): avoid relying on PATH resolution for OS commands; use fixed command paths or a fixed, trusted, unwritable command lookup strategy.
- Preserve release workflow behavior: clean-tree check, npm login check, semver prompt, duplicate tag/version checks, validation, version bump, publish, and optional push.
- Add script-level tests where possible, or at minimum add focused helpers that can be unit tested without publishing.

### 3. Fix Regex Reliability and Regex API Issues

- Simplify all `S8786` super-linear regexes:
  - `scripts/check-format.mjs:51`
  - `src/github/transport.ts:284`
  - `src/github/repository.ts:26`, `:144`
  - `src/utils/project-root.ts:73`
  - `src/utils/slug.ts:14`, `:17`
- Replace `String#match()` usage with `RegExp.exec()` for all `S6594` findings:
  - `src/commands/config-tui.ts:657`, `:801`, `:807`, `:813`, `:819`, `:852`
  - `src/github/transport.ts:284`
  - `src/github/repository.ts:20`, `:26`, `:133`
  - `src/tools/manage-milestone.ts:218`, `:224`
  - `src/utils/date.ts:2`
  - `src/utils/project-root.ts:73`
  - `src/utils/slug.ts:27`
  - `src/utils/validation.ts:136`
- Replace regex alternations with character classes for `S6035` findings:
  - `src/config/config.ts:210`
  - `src/utils/github-login.ts:30`
  - `src/tools/runtime.ts:418`
  - `src/utils/validation.ts:102`
- Replace `[A-Za-z0-9_]` with concise `\w` where Sonar reports `S6353`:
  - `src/errors.ts:458`, `:459`
  - `src/tools/runtime.ts:1188`, `:1189`
- Add or update tests for slugging, repository parsing, project-root discovery, date parsing, and validation regex behavior.

### 4. Reduce Cognitive Complexity in Flagged Functions

- Refactor each `S3776` function below until Sonar reports complexity <= 15:
  - `scripts/smoke-pi-lifecycle.mjs:92`
  - `src/commands/config-tui.ts:147`
  - `src/commands/issueme-command.ts:105`, `:304`
  - `src/github/client.ts:539`, `:900`
  - `src/github/development-links-client.ts:148`
  - `src/github/graphql-errors.ts:6`
  - `src/github/projects-client.ts:275`, `:397`
  - `src/github/transport.ts:108`, `:152`
  - `src/issues/format.ts:116`
  - `src/issues/store.ts:210`, `:388`, `:456`
  - `src/tools/close-issue.ts:31`
  - `src/tools/development-links.ts:114`
  - `src/tools/get-issue.ts:33`
  - `src/tools/label-issue.ts:28`
  - `src/tools/list-milestones.ts:104`
  - `src/tools/manage-label.ts:95`
  - `src/tools/manage-milestone.ts:65`, `:110`, `:292`
  - `src/tools/runtime.ts:321`, `:686`, `:825`, `:930`, `:973`
  - `src/tools/sync-issues.ts:29`
- Keep refactors behavior-preserving: extract named helpers, split formatting from validation, flatten branches with early returns, and introduce table-driven rendering where existing logic repeats.
- After each file, run focused tests for that module before moving on.

### 5. Replace Nested Ternaries with Named Statements

- Clear all `S3358` nested ternary findings:
  - `scripts/smoke-handler-execution.mjs:591`
  - `src/commands/config-tui.ts:346`
  - `src/commands/issueme-command.ts:130`
  - `src/github/graphql-errors.ts:57`, `:59`, `:87`
  - `src/github/projects-client.ts:213`, `:222`
  - `src/issues/format.ts:225`
  - `src/tools/assign-issue.ts:36`
  - `src/tools/bulk-issues.ts:298`, `:336`
  - `src/tools/development-links.ts:118`, `:119`, `:124`
  - `src/tools/list-labels.ts:116`
  - `src/tools/manage-label.ts:256`, `:257`
  - `src/tools/manage-milestone.ts:338`, `:339`, `:340`
  - `src/tools/projects.ts:465`
  - `src/tools/sub-issue.ts:492`, `:507`, `:516`
  - `src/utils/slug.ts:92`
- Prefer local variables with descriptive names over inline condition chains.
- Add assertions for any formatter output whose branch rendering changes.

### 6. Remove Nested Template Literals

- Clear all `S4624` nested-template findings in scripts:
  - `scripts/smoke-handler-execution.mjs:770`, `:814`
  - `scripts/smoke-pi-lifecycle.mjs:87`, `:170`
  - `scripts/smoke-packaged-install.mjs:191`
  - `scripts/smoke-observability.mjs:117`
- Clear all `S4624` nested-template findings in source:
  - `src/commands/config-tui.ts:351`
  - `src/tools/runtime.ts:164`
  - `src/issues/format.ts:160`, `:245`
  - `src/tools/bulk-issues.ts:298`
  - `src/tools/close-issue.ts:47`, `:59`
  - `src/tools/comment-issue.ts:54`, `:65`, `:101`, `:112`, `:147`, `:159`
  - `src/tools/development-links.ts:118`, `:125`
  - `src/tools/list-assignees.ts:104`, `:120`
  - `src/tools/list-labels.ts:103`, `:119`
  - `src/tools/list-milestones.ts:146`, `:167`
  - `src/tools/manage-label.ts:260`
  - `src/tools/manage-milestone.ts:343`
  - `src/tools/projects.ts:476`, `:485`, `:492`
  - `src/tools/reopen-issue.ts:80`, `:95`
  - `src/tools/sub-issue.ts:507`
- Convert nested interpolations into named intermediate strings before final template construction.

### 7. Normalize Negated Conditions

- Clear all `S7735` unexpected negated condition findings by making the positive path first where practical:
  - `scripts/smoke-handler-execution.mjs:770`
  - `src/github/development-links-client.ts:170`, `:171`, `:190`, `:191`
  - `src/github/projects-client.ts:519`
  - `src/issues/store.ts:320`, `:321`, `:599`, `:604`, `:605`, `:606`, `:608`, `:609`, `:610`
  - `src/tools/runtime.ts:164`, `:168`, `:230`, `:238`, `:647`, `:676`, `:677`, `:679`, `:703`, `:704`, `:707`, `:708`, `:729`, `:730`, `:731`, `:758`, `:759`, `:791`, `:816`, `:846`, `:848`, `:849`, `:850`, `:851`, `:852`, `:888`, `:889`, `:897`
  - `src/tools/sync-issues.ts:35`
  - `src/utils/safe-read.ts:77`, `:78`
  - `src/github/client.ts:253`, `:254`, `:944`, `:945`
  - `src/issues/format.ts:68`, `:69`, `:70`, `:98`, `:99`, `:100`, `:101`, `:102`, `:103`, `:110`, `:111`, `:112`, `:143`, `:155`, `:160`, `:196`, `:197`, `:198`
  - `src/tools/bulk-issues.ts:416`
  - `src/tools/get-issue.ts:82`
  - `src/tools/list-assignees.ts:85`, `:117`
  - `src/tools/list-issues.ts:77`, `:82`
  - `src/tools/list-milestones.ts:123`, `:124`, `:158`, `:159`
  - `src/tools/manage-label.ts:66`, `:74`, `:75`, `:76`, `:104`, `:105`, `:113`, `:121`, `:122`, `:123`, `:211`
  - `src/tools/manage-milestone.ts:72`, `:73`, `:81`, `:82`, `:83`, `:120`, `:121`, `:122`, `:133`, `:141`, `:142`, `:143`, `:313`, `:314`, `:315`, `:316`, `:342`
  - `src/tools/projects.ts:300`, `:489`
  - `src/errors.ts:381`
- Preserve explicit error-first guard clauses if changing them would harm clarity; otherwise restructure the branch so Sonar clears the issue.

### 8. Apply Minor Modernization and Style Fixes

- Remove unused imports:
  - `src/github/client.ts:12` (`FetchLike`)
  - `src/github/issues-client.ts:3` (`GitHubMilestoneResponse`)
  - `src/github/sub-issues-client.ts:3` (`IssueRelationshipSummary`)
- Use direct re-exports for `S7763`:
  - `src/github/projects-client.ts:637` (`connectionEndCursor`, `connectionHasNextPage`, `extractConnectionNodes`)
  - `src/github/sub-issues-client.ts:255` (`NativeSubIssueReorderResult`)
- Use `Object.hasOwn()` for `S6653`:
  - `src/config/config.ts:222`
  - `src/tools/runtime.ts:138`
- Use `String#replaceAll()` and raw regex/string literal improvements in `src/github/issues-client.ts:172` (`S7781`, `S7780`).
- Replace useless empty object spreads for `S7744`:
  - `src/utils/validation.ts:45`, `:56`, `:79`, `:83`, `:113`, `:121`
  - `src/errors.ts:423`
  - `src/tools/sub-issue.ts:620`, `:647`
  - `src/tools/runtime.ts:309`, `:494`, `:777`, `:1003`
- Prefer `Array#flat()` over flattening `flatMap()` for `S7751`:
  - `src/tools/bulk-issues.ts:440`
  - `src/tools/manage-label.ts:143`
  - `src/tools/manage-milestone.ts:177`
  - `src/tools/projects.ts:340`
- Prefer direct iteration without `Array.from()` for `S7747`:
  - `src/github/client.ts:845`, `:861`
- Convert promise chains to top-level await for `S7785`:
  - `scripts/smoke-pi-lifecycle.mjs:276`
  - `scripts/smoke-handler-execution.mjs:879`
  - `scripts/smoke-packaged-install.mjs:291`
  - `scripts/smoke-observability.mjs:197`
  - `scripts/publish-npm.mjs:146`
- Use optional chaining for `S6582`:
  - `scripts/smoke-packaged-install.mjs:54`
  - `scripts/smoke-observability.mjs:37`
- Simplify boolean literal conditional at `src/commands/config-tui.ts:668` (`S6644`).
- Replace repeated `Array#push()` calls at `src/commands/config-tui.ts:224`, `:225`, `:241`, `:242` (`S7778`).
- Move `listFilteredValues` out of its containing function in `scripts/smoke-handler-execution.mjs:316` (`S7721`).
- Replace the `active` control parameter in `src/commands/config-tui.ts:544` with separate methods or clearer action-specific functions (`S2301`).
- Give `dev-shims/pi-coding-agent/index.js:12` empty `invalidate` method an intentional implementation/comment or remove it if unused (`S1186`).

### 9. Update Tests Alongside Refactors

- Add or update tests for every public behavior touched in:
  - command parsing and TUI rendering;
  - GitHub client error handling and pagination;
  - issue formatting/store behavior;
  - each tool formatter or mutation helper changed by complexity/readability refactors;
  - validation, slugging, repository, project-root, and date helpers;
  - publish script argument validation if helpers are extracted.
- For mechanical formatting changes, compare exact expected markdown/text output where existing tests already assert output.
- For security fixes, add negative tests for rejected invalid arguments and positive tests for valid semver/tag/branch/package values.

### 10. Validate and Close the Sonar Backlog

- Run all local validation commands listed below.
- Trigger or wait for a fresh Sonar analysis of the updated branch.
- Re-run AnalyseMe issue listing until all pages are empty.
- If Sonar reports new issues from refactoring, add them to this spec under the matching rule group and fix them before completion.

## Testing Strategy

- Prefer focused unit tests for extracted helpers before broad integration tests.
- Use existing `node --test` suites and add tests next to related tool behavior.
- Keep release-script tests safe: do not run `npm publish`, `npm version`, or `git push` in tests.
- Validate formatter refactors with exact output snapshots/assertions where possible.
- Validate security fixes with both allowed and rejected inputs.
- Use local validation first, then Sonar re-analysis as the final source of truth for issue closure.

## Acceptance Criteria

- `analyseme_get_project_summary` reports `vulnerabilities: 0` and `code_smells: 0` after the final Sonar analysis.
- `analyseme_list_issues` returns zero active issues for the project.
- No Sonar issue is resolved by rule suppression or excluding source files unless separately approved.
- `npm run validate` passes locally.
- Existing IssueMe behavior remains compatible with the README and test suite.
- Security-sensitive script changes include validation tests or clearly testable helper coverage.

## Validation Commands

Execute these commands to validate the task is complete:

- `npm run typecheck` - TypeScript compile validation.
- `npm run lint:eslint` - ESLint validation with zero warnings.
- `npm run format:check` - Repository formatting validation.
- `npm run test` - Unit/integration test suite.
- `npm run check` - Script syntax/package checks.
- `npm run test:coverage` - Coverage-aware test run.
- `npm run validate` - Full project validation pipeline.

After Sonar analysis completes, re-run AnalyseMe:

- `analyseme_get_project_summary`
- `analyseme_list_issues` with `limit: 100`, starting at page 1 and continuing until no active issues are returned.

## Notes

- Line numbers are from the 2026-07-02 Sonar snapshot and may shift as files are edited.
- Many repeated findings should disappear together when shared rendering/validation helpers are extracted.
- Do security fixes first; do not bury vulnerability remediation inside broad formatting commits.
- For vulnerability remediation, the guidance in this spec follows Sonar-provided rule guidance from `analyseme_get_issue`.

## Appendix A: Sonar Issue Inventory Covered by This Spec

This appendix groups every active issue by file/rule/line from the captured three AnalyseMe pages. Each line/rule pair maps to at least one active Sonar issue.

| File | Findings to clear |
| --- | --- |
| `scripts/generate-tui-artifacts.mjs` | `S5443` at 31 |
| `scripts/publish-npm.mjs` | `S8705` at 25, 41, 95; `S4036` at 56, 95; `S7785` at 146 |
| `scripts/check-format.mjs` | `S8786` at 51 |
| `scripts/smoke-handler-execution.mjs` | `S7721` at 316; `S3358` at 591; `S7735` at 770; `S4624` at 770, 814; `S7785` at 879 |
| `scripts/smoke-pi-lifecycle.mjs` | `S4624` at 87, 170; `S3776` at 92; `S7785` at 276 |
| `scripts/smoke-packaged-install.mjs` | `S6582` at 54; `S4624` at 191; `S7785` at 291 |
| `scripts/smoke-observability.mjs` | `S6582` at 37; `S4624` at 117; `S7785` at 197 |
| `dev-shims/pi-coding-agent/index.js` | `S1186` at 12 |
| `src/commands/config-tui.ts` | `S3776` at 147; `S7778` at 224, 225, 241, 242; `S3358` at 346; `S4624` at 351; `S2301` at 544; `S6594` at 657, 801, 807, 813, 819, 852; `S6644` at 668 |
| `src/commands/issueme-command.ts` | `S3776` at 105, 304; `S3358` at 130 |
| `src/config/config.ts` | `S6035` at 210; `S6653` at 222 |
| `src/errors.ts` | `S7735` at 381; `S7744` at 423; `S6353` at 458, 459 |
| `src/github/client.ts` | `S1128` at 12; `S7735` at 253, 254, 944, 945; `S3358` at 353; `S3776` at 539, 900; `S7747` at 845, 861 |
| `src/github/development-links-client.ts` | `S3776` at 148; `S7735` at 170, 171, 190, 191 |
| `src/github/graphql-errors.ts` | `S3776` at 6; `S3358` at 57, 59, 87 |
| `src/github/issues-client.ts` | `S1128` at 3; `S7781` at 172 twice; `S7780` at 172 |
| `src/github/projects-client.ts` | `S3358` at 213, 222; `S3776` at 275, 397; `S7735` at 519; `S7763` at 637 three times |
| `src/github/repository.ts` | `S6594` at 20, 26, 133; `S8786` at 26, 144 |
| `src/github/sub-issues-client.ts` | `S1128` at 3; `S7763` at 255 |
| `src/github/transport.ts` | `S3776` at 108, 152; `S6594` at 284; `S8786` at 284 |
| `src/issues/format.ts` | `S7735` at 68, 69, 70, 98, 99, 100, 101, 102, 103, 110, 111, 112, 143, 155, 160, 196, 197, 198; `S3776` at 116; `S4624` at 160, 245; `S3358` at 225 |
| `src/issues/store.ts` | `S3776` at 210, 388, 456; `S7735` at 320, 321, 599, 604, 605, 606, 608, 609, 610 |
| `src/tools/assign-issue.ts` | `S3358` at 36 |
| `src/tools/bulk-issues.ts` | `S3358` at 298, 336; `S4624` at 298; `S7735` at 416; `S7751` at 440 |
| `src/tools/close-issue.ts` | `S3776` at 31; `S4624` at 47, 59 |
| `src/tools/comment-issue.ts` | `S4624` at 54, 65, 101, 112, 147, 159 |
| `src/tools/development-links.ts` | `S3776` at 114; `S3358` at 118, 119, 124; `S4624` at 118, 125 |
| `src/tools/get-issue.ts` | `S3776` at 33; `S7735` at 82 |
| `src/tools/label-issue.ts` | `S3776` at 28 |
| `src/tools/list-assignees.ts` | `S7735` at 85, 117; `S4624` at 104, 120 twice |
| `src/tools/list-issues.ts` | `S7735` at 77, 82 |
| `src/tools/list-labels.ts` | `S4624` at 103, 119; `S3358` at 116 |
| `src/tools/list-milestones.ts` | `S3776` at 104; `S7735` at 123, 124, 158, 159; `S4624` at 146, 167 |
| `src/tools/manage-label.ts` | `S7735` at 66, 74, 75, 76, 104, 105, 113 three times, 121, 122, 123, 211; `S3776` at 95; `S7751` at 143; `S3358` at 256, 257; `S4624` at 260 |
| `src/tools/manage-milestone.ts` | `S3776` at 65, 110, 292; `S7735` at 72, 73, 81, 82, 83, 120, 121, 122 twice, 133 twice, 141, 142, 143, 313, 314, 315, 316, 342; `S7751` at 177; `S6594` at 218, 224; `S3358` at 338, 339 twice, 340; `S4624` at 343 |
| `src/tools/projects.ts` | `S7735` at 300, 489; `S7751` at 340; `S3358` at 465; `S4624` at 476, 485, 492 |
| `src/tools/reopen-issue.ts` | `S4624` at 80, 95 |
| `src/tools/runtime.ts` | `S6653` at 138; `S7735` at 164, 168, 230, 238, 647, 676, 677, 679, 703, 704, 707, 708, 729, 730, 731, 758, 759, 791, 816, 846, 848, 849, 850, 851, 852, 888, 889, 897; `S4624` at 164; `S7744` at 309, 494, 777, 1003; `S3776` at 321, 686, 825, 930, 973; `S6035` at 418; `S6353` at 1188, 1189 |
| `src/tools/sub-issue.ts` | `S3358` at 492, 507, 516; `S4624` at 507; `S7744` at 620, 647 |
| `src/tools/sync-issues.ts` | `S3776` at 29; `S7735` at 35 |
| `src/utils/date.ts` | `S6594` at 2 |
| `src/utils/github-login.ts` | `S6035` at 30 |
| `src/utils/project-root.ts` | `S6594` at 73; `S8786` at 73 |
| `src/utils/safe-read.ts` | `S7735` at 77, 78 |
| `src/utils/slug.ts` | `S8786` at 14, 17; `S6594` at 27; `S3358` at 92 |
| `src/utils/validation.ts` | `S7744` at 45, 56, 79, 83, 113, 121; `S6035` at 102; `S6594` at 136 |
