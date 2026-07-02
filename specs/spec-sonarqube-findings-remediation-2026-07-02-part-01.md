# Spec: SonarQube Findings Remediation Part 1 of 6

Scope: tasks 001-050 of 271 from the 2026-07-02 AnalyseMe snapshot for `senad-d_IssueMe`.

Common acceptance criteria: fix the referenced rule without suppression, preserve behavior, and confirm the issue key disappears after fresh Sonar analysis.

## Tasks

### 1. Remove redundant intersection type in src/tools/bulk-issues.ts:54

- [x] Resolve Sonar issue `AZ8ijgcxbki--Ps0teFx` (`typescript:S6571`) at `src/tools/bulk-issues.ts:54`: remove the redundant `string` intersection overridden by `reason`, `labels`, `assignees`, `milestoneNumber`, or `projectId`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. The broad `string` type member is overridden by explicit keys, so keeping it adds noise without useful type information.

#### How
Simplify the intersection or mapped type so the explicit fields define the shape without redundant overridden members. Apply the issue-specific remediation: remove the redundant `string` intersection overridden by `reason`, `labels`, `assignees`, `milestoneNumber`, or `projectId`.

#### Where
- File: `src/tools/bulk-issues.ts`
- Line: `54`
- Sonar issue: `AZ8ijgcxbki--Ps0teFx`
- Rule: `typescript:S6571`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: redundant, type-dependent

#### Acceptance criteria
- The flagged intersection no longer contains the redundant overridden `string` member.
- The code change resolves `AZ8ijgcxbki--Ps0teFx` without suppressing `typescript:S6571` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8ijgcxbki--Ps0teFx`.

### 2. Remove redundant intersection type in src/tools/bulk-issues.ts:56

- [x] Resolve Sonar issue `AZ8ijgcxbki--Ps0teFy` (`typescript:S6571`) at `src/tools/bulk-issues.ts:56`: remove the redundant `string` intersection overridden by the explicit bulk issue input keys.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. The broad `string` type member is overridden by explicit keys, so keeping it adds noise without useful type information.

#### How
Simplify the intersection or mapped type so the explicit fields define the shape without redundant overridden members. Apply the issue-specific remediation: remove the redundant `string` intersection overridden by the explicit bulk issue input keys.

#### Where
- File: `src/tools/bulk-issues.ts`
- Line: `56`
- Sonar issue: `AZ8ijgcxbki--Ps0teFy`
- Rule: `typescript:S6571`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: redundant, type-dependent

#### Acceptance criteria
- The flagged intersection no longer contains the redundant overridden `string` member.
- The code change resolves `AZ8ijgcxbki--Ps0teFy` without suppressing `typescript:S6571` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8ijgcxbki--Ps0teFy`.

### 3. Remove redundant intersection type in src/tools/manage-label.ts:28

- [x] Resolve Sonar issue `AZ8ijgbibki--Ps0teFv` (`typescript:S6571`) at `src/tools/manage-label.ts:28`: remove the redundant `string` intersection overridden by label-specific fields.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. The broad `string` type member is overridden by explicit keys, so keeping it adds noise without useful type information.

#### How
Simplify the intersection or mapped type so the explicit fields define the shape without redundant overridden members. Apply the issue-specific remediation: remove the redundant `string` intersection overridden by label-specific fields.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `28`
- Sonar issue: `AZ8ijgbibki--Ps0teFv`
- Rule: `typescript:S6571`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: redundant, type-dependent

#### Acceptance criteria
- The flagged intersection no longer contains the redundant overridden `string` member.
- The code change resolves `AZ8ijgbibki--Ps0teFv` without suppressing `typescript:S6571` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8ijgbibki--Ps0teFv`.

### 4. Remove redundant intersection type in src/tools/manage-label.ts:30

- [x] Resolve Sonar issue `AZ8ijgbibki--Ps0teFw` (`typescript:S6571`) at `src/tools/manage-label.ts:30`: remove the redundant `string` intersection overridden by manage-label input fields.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. The broad `string` type member is overridden by explicit keys, so keeping it adds noise without useful type information.

#### How
Simplify the intersection or mapped type so the explicit fields define the shape without redundant overridden members. Apply the issue-specific remediation: remove the redundant `string` intersection overridden by manage-label input fields.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `30`
- Sonar issue: `AZ8ijgbibki--Ps0teFw`
- Rule: `typescript:S6571`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: redundant, type-dependent

#### Acceptance criteria
- The flagged intersection no longer contains the redundant overridden `string` member.
- The code change resolves `AZ8ijgbibki--Ps0teFw` without suppressing `typescript:S6571` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8ijgbibki--Ps0teFw`.

### 5. Remove redundant intersection type in src/tools/manage-milestone.ts:31

- [x] Resolve Sonar issue `AZ8ijgXabki--Ps0teFr` (`typescript:S6571`) at `src/tools/manage-milestone.ts:31`: remove the redundant `string` intersection overridden by milestone-specific fields.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. The broad `string` type member is overridden by explicit keys, so keeping it adds noise without useful type information.

#### How
Simplify the intersection or mapped type so the explicit fields define the shape without redundant overridden members. Apply the issue-specific remediation: remove the redundant `string` intersection overridden by milestone-specific fields.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `31`
- Sonar issue: `AZ8ijgXabki--Ps0teFr`
- Rule: `typescript:S6571`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: redundant, type-dependent

#### Acceptance criteria
- The flagged intersection no longer contains the redundant overridden `string` member.
- The code change resolves `AZ8ijgXabki--Ps0teFr` without suppressing `typescript:S6571` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8ijgXabki--Ps0teFr`.

### 6. Remove redundant intersection type in src/tools/manage-milestone.ts:33

- [x] Resolve Sonar issue `AZ8ijgXabki--Ps0teFs` (`typescript:S6571`) at `src/tools/manage-milestone.ts:33`: remove the redundant `string` intersection overridden by manage-milestone input fields.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. The broad `string` type member is overridden by explicit keys, so keeping it adds noise without useful type information.

#### How
Simplify the intersection or mapped type so the explicit fields define the shape without redundant overridden members. Apply the issue-specific remediation: remove the redundant `string` intersection overridden by manage-milestone input fields.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `33`
- Sonar issue: `AZ8ijgXabki--Ps0teFs`
- Rule: `typescript:S6571`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: redundant, type-dependent

#### Acceptance criteria
- The flagged intersection no longer contains the redundant overridden `string` member.
- The code change resolves `AZ8ijgXabki--Ps0teFs` without suppressing `typescript:S6571` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8ijgXabki--Ps0teFs`.

### 7. Remove redundant intersection type in src/tools/projects.ts:107

- [x] Resolve Sonar issue `AZ8ijgarbki--Ps0teFt` (`typescript:S6571`) at `src/tools/projects.ts:107`: remove the redundant `string` intersection overridden by project field value keys.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. The broad `string` type member is overridden by explicit keys, so keeping it adds noise without useful type information.

#### How
Simplify the intersection or mapped type so the explicit fields define the shape without redundant overridden members. Apply the issue-specific remediation: remove the redundant `string` intersection overridden by project field value keys.

#### Where
- File: `src/tools/projects.ts`
- Line: `107`
- Sonar issue: `AZ8ijgarbki--Ps0teFt`
- Rule: `typescript:S6571`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: redundant, type-dependent

#### Acceptance criteria
- The flagged intersection no longer contains the redundant overridden `string` member.
- The code change resolves `AZ8ijgarbki--Ps0teFt` without suppressing `typescript:S6571` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8ijgarbki--Ps0teFt`.

### 8. Remove redundant intersection type in src/tools/projects.ts:109

- [x] Resolve Sonar issue `AZ8ijgasbki--Ps0teFu` (`typescript:S6571`) at `src/tools/projects.ts:109`: remove the redundant `string` intersection overridden by project item update input fields.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. The broad `string` type member is overridden by explicit keys, so keeping it adds noise without useful type information.

#### How
Simplify the intersection or mapped type so the explicit fields define the shape without redundant overridden members. Apply the issue-specific remediation: remove the redundant `string` intersection overridden by project item update input fields.

#### Where
- File: `src/tools/projects.ts`
- Line: `109`
- Sonar issue: `AZ8ijgasbki--Ps0teFu`
- Rule: `typescript:S6571`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: redundant, type-dependent

#### Acceptance criteria
- The flagged intersection no longer contains the redundant overridden `string` member.
- The code change resolves `AZ8ijgasbki--Ps0teFu` without suppressing `typescript:S6571` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8ijgasbki--Ps0teFu`.

### 9. Reduce cognitive complexity in src/commands/config-tui.ts:147

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkV` (`typescript:S3776`) at `src/commands/config-tui.ts:147`: reduce cognitive complexity from 21 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 21 to 15 or less.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `147`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkV`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkV` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkV`.

### 10. Use RegExp.exec in src/commands/config-tui.ts:807

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkg` (`typescript:S6594`) at `src/commands/config-tui.ts:807`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `807`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkg`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkg` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkg`.

### 11. Use RegExp.exec in src/commands/config-tui.ts:813

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkh` (`typescript:S6594`) at `src/commands/config-tui.ts:813`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `813`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkh`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkh` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkh`.

### 12. Use RegExp.exec in src/commands/config-tui.ts:852

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkj` (`typescript:S6594`) at `src/commands/config-tui.ts:852`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `852`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkj`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkj` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkj`.

### 13. Extract nested ternary in src/commands/config-tui.ts:346

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFka` (`typescript:S3358`) at `src/commands/config-tui.ts:346`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `346`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFka`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpx0VI5cC3g4vWFka` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFka`.

### 14. Use RegExp.exec in src/commands/config-tui.ts:801

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkf` (`typescript:S6594`) at `src/commands/config-tui.ts:801`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `801`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkf`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkf` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkf`.

### 15. Use RegExp.exec in src/commands/config-tui.ts:819

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFki` (`typescript:S6594`) at `src/commands/config-tui.ts:819`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `819`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFki`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpx0VI5cC3g4vWFki` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFki`.

### 16. Reduce cognitive complexity in src/commands/issueme-command.ts:105

- [x] Resolve Sonar issue `AZ8dpx0KI5cC3g4vWFkS` (`typescript:S3776`) at `src/commands/issueme-command.ts:105`: reduce cognitive complexity from 17 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 17 to 15 or less.

#### Where
- File: `src/commands/issueme-command.ts`
- Line: `105`
- Sonar issue: `AZ8dpx0KI5cC3g4vWFkS`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpx0KI5cC3g4vWFkS` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0KI5cC3g4vWFkS`.

### 17. Use Object.hasOwn in src/config/config.ts:222

- [x] Resolve Sonar issue `AZ8dpx0AI5cC3g4vWFkR` (`typescript:S6653`) at `src/config/config.ts:222`: use `Object.hasOwn()` instead of `Object.prototype.hasOwnProperty.call()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `Object.hasOwn()` is the modern, clearer standard-library API for own-property checks.

#### How
Replace `Object.prototype.hasOwnProperty.call(object, key)` with `Object.hasOwn(object, key)` and keep null-safety intact. Apply the issue-specific remediation: use `Object.hasOwn()` instead of `Object.prototype.hasOwnProperty.call()`.

#### Where
- File: `src/config/config.ts`
- Line: `222`
- Sonar issue: `AZ8dpx0AI5cC3g4vWFkR`
- Rule: `typescript:S6653`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: es2022

#### Acceptance criteria
- The flagged own-property check uses `Object.hasOwn()`.
- The code change resolves `AZ8dpx0AI5cC3g4vWFkR` without suppressing `typescript:S6653` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0AI5cC3g4vWFkR`.

### 18. Reduce cognitive complexity in src/github/client.ts:539

- [x] Resolve Sonar issue `AZ8dpxzHI5cC3g4vWFjw` (`typescript:S3776`) at `src/github/client.ts:539`: reduce cognitive complexity from 19 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 19 to 15 or less.

#### Where
- File: `src/github/client.ts`
- Line: `539`
- Sonar issue: `AZ8dpxzHI5cC3g4vWFjw`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxzHI5cC3g4vWFjw` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzHI5cC3g4vWFjw`.

### 19. Reduce cognitive complexity in src/github/client.ts:900

- [x] Resolve Sonar issue `AZ8dpxzHI5cC3g4vWFjz` (`typescript:S3776`) at `src/github/client.ts:900`: reduce cognitive complexity from 23 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 23 to 15 or less.

#### Where
- File: `src/github/client.ts`
- Line: `900`
- Sonar issue: `AZ8dpxzHI5cC3g4vWFjz`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxzHI5cC3g4vWFjz` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzHI5cC3g4vWFjz`.

### 20. Reduce cognitive complexity in src/github/development-links-client.ts:148

- [x] Resolve Sonar issue `AZ8dpxz3I5cC3g4vWFkL` (`typescript:S3776`) at `src/github/development-links-client.ts:148`: reduce cognitive complexity from 17 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 17 to 15 or less.

#### Where
- File: `src/github/development-links-client.ts`
- Line: `148`
- Sonar issue: `AZ8dpxz3I5cC3g4vWFkL`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxz3I5cC3g4vWFkL` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxz3I5cC3g4vWFkL`.

### 21. Rewrite negated condition in src/github/development-links-client.ts:170

- [x] Resolve Sonar issue `AZ8dpxz3I5cC3g4vWFkM` (`typescript:S7735`) at `src/github/development-links-client.ts:170`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/github/development-links-client.ts`
- Line: `170`
- Sonar issue: `AZ8dpxz3I5cC3g4vWFkM`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxz3I5cC3g4vWFkM` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxz3I5cC3g4vWFkM`.

### 22. Rewrite negated condition in src/github/development-links-client.ts:171

- [x] Resolve Sonar issue `AZ8dpxz3I5cC3g4vWFkN` (`typescript:S7735`) at `src/github/development-links-client.ts:171`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/github/development-links-client.ts`
- Line: `171`
- Sonar issue: `AZ8dpxz3I5cC3g4vWFkN`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxz3I5cC3g4vWFkN` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxz3I5cC3g4vWFkN`.

### 23. Rewrite negated condition in src/github/development-links-client.ts:190

- [x] Resolve Sonar issue `AZ8dpxz3I5cC3g4vWFkO` (`typescript:S7735`) at `src/github/development-links-client.ts:190`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/github/development-links-client.ts`
- Line: `190`
- Sonar issue: `AZ8dpxz3I5cC3g4vWFkO`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxz3I5cC3g4vWFkO` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxz3I5cC3g4vWFkO`.

### 24. Rewrite negated condition in src/github/development-links-client.ts:191

- [x] Resolve Sonar issue `AZ8dpxz3I5cC3g4vWFkP` (`typescript:S7735`) at `src/github/development-links-client.ts:191`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/github/development-links-client.ts`
- Line: `191`
- Sonar issue: `AZ8dpxz3I5cC3g4vWFkP`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxz3I5cC3g4vWFkP` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxz3I5cC3g4vWFkP`.

### 25. Reduce cognitive complexity in src/github/graphql-errors.ts:6

- [x] Resolve Sonar issue `AZ8dpxy6I5cC3g4vWFjo` (`typescript:S3776`) at `src/github/graphql-errors.ts:6`: reduce cognitive complexity from 17 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 17 to 15 or less.

#### Where
- File: `src/github/graphql-errors.ts`
- Line: `6`
- Sonar issue: `AZ8dpxy6I5cC3g4vWFjo`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxy6I5cC3g4vWFjo` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxy6I5cC3g4vWFjo`.

### 26. Extract nested ternary in src/github/graphql-errors.ts:57

- [x] Resolve Sonar issue `AZ8dpxy6I5cC3g4vWFjp` (`typescript:S3358`) at `src/github/graphql-errors.ts:57`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/github/graphql-errors.ts`
- Line: `57`
- Sonar issue: `AZ8dpxy6I5cC3g4vWFjp`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxy6I5cC3g4vWFjp` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxy6I5cC3g4vWFjp`.

### 27. Extract nested ternary in src/github/graphql-errors.ts:59

- [x] Resolve Sonar issue `AZ8dpxy6I5cC3g4vWFjq` (`typescript:S3358`) at `src/github/graphql-errors.ts:59`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/github/graphql-errors.ts`
- Line: `59`
- Sonar issue: `AZ8dpxy6I5cC3g4vWFjq`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxy6I5cC3g4vWFjq` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxy6I5cC3g4vWFjq`.

### 28. Extract nested ternary in src/github/graphql-errors.ts:87

- [x] Resolve Sonar issue `AZ8dpxy6I5cC3g4vWFjr` (`typescript:S3358`) at `src/github/graphql-errors.ts:87`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/github/graphql-errors.ts`
- Line: `87`
- Sonar issue: `AZ8dpxy6I5cC3g4vWFjr`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxy6I5cC3g4vWFjr` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxy6I5cC3g4vWFjr`.

### 29. Use String.replaceAll in src/github/issues-client.ts:172

- [x] Resolve Sonar issue `AZ8dpxziI5cC3g4vWFkA` (`typescript:S7781`) at `src/github/issues-client.ts:172`: prefer `String#replaceAll()` over `String#replace()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `RELIABILITY:LOW, MAINTAINABILITY:LOW`. `String#replaceAll()` communicates all-occurrence replacement directly and avoids regex pitfalls.

#### How
Replace the global replacement with `replaceAll()` while preserving the exact replacement behavior. Apply the issue-specific remediation: prefer `String#replaceAll()` over `String#replace()`.

#### Where
- File: `src/github/issues-client.ts`
- Line: `172`
- Sonar issue: `AZ8dpxziI5cC3g4vWFkA`
- Rule: `typescript:S7781`
- Severity/impact: `MINOR`; `RELIABILITY:LOW, MAINTAINABILITY:LOW`
- Tags: editable-source, es2021, readability

#### Acceptance criteria
- The flagged replacement uses `String#replaceAll()`.
- The code change resolves `AZ8dpxziI5cC3g4vWFkA` without suppressing `typescript:S7781` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxziI5cC3g4vWFkA`.

### 30. Use String.replaceAll in src/github/issues-client.ts:172

- [x] Resolve Sonar issue `AZ8dpxziI5cC3g4vWFkB` (`typescript:S7781`) at `src/github/issues-client.ts:172`: prefer `String#replaceAll()` over `String#replace()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `RELIABILITY:LOW, MAINTAINABILITY:LOW`. `String#replaceAll()` communicates all-occurrence replacement directly and avoids regex pitfalls.

#### How
Replace the global replacement with `replaceAll()` while preserving the exact replacement behavior. Apply the issue-specific remediation: prefer `String#replaceAll()` over `String#replace()`.

#### Where
- File: `src/github/issues-client.ts`
- Line: `172`
- Sonar issue: `AZ8dpxziI5cC3g4vWFkB`
- Rule: `typescript:S7781`
- Severity/impact: `MINOR`; `RELIABILITY:LOW, MAINTAINABILITY:LOW`
- Tags: editable-source, es2021, readability

#### Acceptance criteria
- The flagged replacement uses `String#replaceAll()`.
- The code change resolves `AZ8dpxziI5cC3g4vWFkB` without suppressing `typescript:S7781` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxziI5cC3g4vWFkB`.

### 31. Use String.raw in src/github/issues-client.ts:172

- [x] Resolve Sonar issue `AZ8dpxziI5cC3g4vWFkC` (`typescript:S7780`) at `src/github/issues-client.ts:172`: use `String.raw` to avoid escaping backslashes.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `String.raw` avoids double escaping and makes backslash-heavy strings easier to read.

#### How
Convert the flagged string literal to `String.raw` while preserving the exact runtime value. Apply the issue-specific remediation: use `String.raw` to avoid escaping backslashes.

#### Where
- File: `src/github/issues-client.ts`
- Line: `172`
- Sonar issue: `AZ8dpxziI5cC3g4vWFkC`
- Rule: `typescript:S7780`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, es2015, readability

#### Acceptance criteria
- The flagged backslash-heavy string uses `String.raw` or an equivalent clearer representation.
- The code change resolves `AZ8dpxziI5cC3g4vWFkC` without suppressing `typescript:S7780` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxziI5cC3g4vWFkC`.

### 32. Extract nested ternary in src/github/projects-client.ts:213

- [x] Resolve Sonar issue `AZ8dpxztI5cC3g4vWFkD` (`typescript:S3358`) at `src/github/projects-client.ts:213`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/github/projects-client.ts`
- Line: `213`
- Sonar issue: `AZ8dpxztI5cC3g4vWFkD`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxztI5cC3g4vWFkD` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxztI5cC3g4vWFkD`.

### 33. Extract nested ternary in src/github/projects-client.ts:222

- [x] Resolve Sonar issue `AZ8dpxztI5cC3g4vWFkE` (`typescript:S3358`) at `src/github/projects-client.ts:222`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/github/projects-client.ts`
- Line: `222`
- Sonar issue: `AZ8dpxztI5cC3g4vWFkE`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxztI5cC3g4vWFkE` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxztI5cC3g4vWFkE`.

### 34. Reduce cognitive complexity in src/github/projects-client.ts:275

- [x] Resolve Sonar issue `AZ8dpxztI5cC3g4vWFkF` (`typescript:S3776`) at `src/github/projects-client.ts:275`: reduce cognitive complexity from 19 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 19 to 15 or less.

#### Where
- File: `src/github/projects-client.ts`
- Line: `275`
- Sonar issue: `AZ8dpxztI5cC3g4vWFkF`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxztI5cC3g4vWFkF` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxztI5cC3g4vWFkF`.

### 35. Reduce cognitive complexity in src/github/projects-client.ts:397

- [x] Resolve Sonar issue `AZ8dpxztI5cC3g4vWFkG` (`typescript:S3776`) at `src/github/projects-client.ts:397`: reduce cognitive complexity from 16 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 16 to 15 or less.

#### Where
- File: `src/github/projects-client.ts`
- Line: `397`
- Sonar issue: `AZ8dpxztI5cC3g4vWFkG`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxztI5cC3g4vWFkG` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxztI5cC3g4vWFkG`.

### 36. Rewrite negated condition in src/github/projects-client.ts:519

- [x] Resolve Sonar issue `AZ8dpxztI5cC3g4vWFkH` (`typescript:S7735`) at `src/github/projects-client.ts:519`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/github/projects-client.ts`
- Line: `519`
- Sonar issue: `AZ8dpxztI5cC3g4vWFkH`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxztI5cC3g4vWFkH` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxztI5cC3g4vWFkH`.

### 37. Use direct re-export in src/github/projects-client.ts:637

- [x] Resolve Sonar issue `AZ8dpxztI5cC3g4vWFkI` (`typescript:S7763`) at `src/github/projects-client.ts:637`: use `export … from` to re-export `connectionEndCursor`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Direct `export … from` syntax is clearer for pass-through re-exports.

#### How
Replace the import-then-export pattern with a direct re-export from the source module. Apply the issue-specific remediation: use `export … from` to re-export `connectionEndCursor`.

#### Where
- File: `src/github/projects-client.ts`
- Line: `637`
- Sonar issue: `AZ8dpxztI5cC3g4vWFkI`
- Rule: `typescript:S7763`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: convention, editable-source, es2015

#### Acceptance criteria
- The flagged symbol is re-exported with `export … from` syntax.
- The code change resolves `AZ8dpxztI5cC3g4vWFkI` without suppressing `typescript:S7763` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxztI5cC3g4vWFkI`.

### 38. Use direct re-export in src/github/projects-client.ts:637

- [x] Resolve Sonar issue `AZ8dpxztI5cC3g4vWFkJ` (`typescript:S7763`) at `src/github/projects-client.ts:637`: use `export … from` to re-export `connectionHasNextPage`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Direct `export … from` syntax is clearer for pass-through re-exports.

#### How
Replace the import-then-export pattern with a direct re-export from the source module. Apply the issue-specific remediation: use `export … from` to re-export `connectionHasNextPage`.

#### Where
- File: `src/github/projects-client.ts`
- Line: `637`
- Sonar issue: `AZ8dpxztI5cC3g4vWFkJ`
- Rule: `typescript:S7763`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: convention, editable-source, es2015

#### Acceptance criteria
- The flagged symbol is re-exported with `export … from` syntax.
- The code change resolves `AZ8dpxztI5cC3g4vWFkJ` without suppressing `typescript:S7763` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxztI5cC3g4vWFkJ`.

### 39. Use direct re-export in src/github/projects-client.ts:637

- [x] Resolve Sonar issue `AZ8dpxztI5cC3g4vWFkK` (`typescript:S7763`) at `src/github/projects-client.ts:637`: use `export … from` to re-export `extractConnectionNodes`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Direct `export … from` syntax is clearer for pass-through re-exports.

#### How
Replace the import-then-export pattern with a direct re-export from the source module. Apply the issue-specific remediation: use `export … from` to re-export `extractConnectionNodes`.

#### Where
- File: `src/github/projects-client.ts`
- Line: `637`
- Sonar issue: `AZ8dpxztI5cC3g4vWFkK`
- Rule: `typescript:S7763`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: convention, editable-source, es2015

#### Acceptance criteria
- The flagged symbol is re-exported with `export … from` syntax.
- The code change resolves `AZ8dpxztI5cC3g4vWFkK` without suppressing `typescript:S7763` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxztI5cC3g4vWFkK`.

### 40. Use direct re-export in src/github/sub-issues-client.ts:255

- [x] Resolve Sonar issue `AZ8dpxyxI5cC3g4vWFjn` (`typescript:S7763`) at `src/github/sub-issues-client.ts:255`: use `export … from` to re-export `NativeSubIssueReorderResult`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Direct `export … from` syntax is clearer for pass-through re-exports.

#### How
Replace the import-then-export pattern with a direct re-export from the source module. Apply the issue-specific remediation: use `export … from` to re-export `NativeSubIssueReorderResult`.

#### Where
- File: `src/github/sub-issues-client.ts`
- Line: `255`
- Sonar issue: `AZ8dpxyxI5cC3g4vWFjn`
- Rule: `typescript:S7763`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: convention, editable-source, es2015

#### Acceptance criteria
- The flagged symbol is re-exported with `export … from` syntax.
- The code change resolves `AZ8dpxyxI5cC3g4vWFjn` without suppressing `typescript:S7763` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyxI5cC3g4vWFjn`.

### 41. Reduce cognitive complexity in src/github/transport.ts:108

- [x] Resolve Sonar issue `AZ8dpxzZI5cC3g4vWFj7` (`typescript:S3776`) at `src/github/transport.ts:108`: reduce cognitive complexity from 18 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 18 to 15 or less.

#### Where
- File: `src/github/transport.ts`
- Line: `108`
- Sonar issue: `AZ8dpxzZI5cC3g4vWFj7`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxzZI5cC3g4vWFj7` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzZI5cC3g4vWFj7`.

### 42. Reduce cognitive complexity in src/github/transport.ts:152

- [x] Resolve Sonar issue `AZ8dpxzZI5cC3g4vWFj8` (`typescript:S3776`) at `src/github/transport.ts:152`: reduce cognitive complexity from 19 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 19 to 15 or less.

#### Where
- File: `src/github/transport.ts`
- Line: `152`
- Sonar issue: `AZ8dpxzZI5cC3g4vWFj8`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxzZI5cC3g4vWFj8` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzZI5cC3g4vWFj8`.

### 43. Simplify backtracking regex in src/github/transport.ts:284

- [x] Resolve Sonar issue `AZ8dpxzZI5cC3g4vWFj-` (`typescript:S8786`) at `src/github/transport.ts:284`: simplify the regex to avoid super-linear backtracking.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `RELIABILITY:MEDIUM`. Super-linear regex backtracking can become a reliability or denial-of-service risk on crafted input.

#### How
Rewrite the regex to avoid ambiguous nested quantifiers or overlapping alternatives, and add focused tests for representative and adversarial inputs when practical. Apply the issue-specific remediation: simplify the regex to avoid super-linear backtracking.

#### Where
- File: `src/github/transport.ts`
- Line: `284`
- Sonar issue: `AZ8dpxzZI5cC3g4vWFj-`
- Rule: `typescript:S8786`
- Severity/impact: `MAJOR`; `RELIABILITY:MEDIUM`
- Tags: performance, regex

#### Acceptance criteria
- The flagged regex no longer has super-linear backtracking behavior and keeps the same intended matches.
- The code change resolves `AZ8dpxzZI5cC3g4vWFj-` without suppressing `typescript:S8786` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzZI5cC3g4vWFj-`.

### 44. Use RegExp.exec in src/github/transport.ts:284

- [x] Resolve Sonar issue `AZ8dpxzZI5cC3g4vWFj9` (`typescript:S6594`) at `src/github/transport.ts:284`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/github/transport.ts`
- Line: `284`
- Sonar issue: `AZ8dpxzZI5cC3g4vWFj9`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpxzZI5cC3g4vWFj9` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzZI5cC3g4vWFj9`.

### 45. Reduce cognitive complexity in src/issues/format.ts:116

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkw` (`typescript:S3776`) at `src/issues/format.ts:116`: reduce cognitive complexity from 24 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 24 to 15 or less.

#### Where
- File: `src/issues/format.ts`
- Line: `116`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkw`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkw` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkw`.

### 46. Reduce cognitive complexity in src/issues/store.ts:456

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFk-` (`typescript:S3776`) at `src/issues/store.ts:456`: reduce cognitive complexity from 40 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 40 to 15 or less.

#### Where
- File: `src/issues/store.ts`
- Line: `456`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFk-`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpx0sI5cC3g4vWFk-` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFk-`.

### 47. Rewrite negated condition in src/issues/store.ts:599

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFk_` (`typescript:S7735`) at `src/issues/store.ts:599`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/store.ts`
- Line: `599`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFk_`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0sI5cC3g4vWFk_` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFk_`.

### 48. Use Array.flat in src/tools/bulk-issues.ts:440

- [x] Resolve Sonar issue `AZ8dpxxWI5cC3g4vWFjO` (`typescript:S7751`) at `src/tools/bulk-issues.ts:440`: prefer `Array#flat()` over `Array#flatMap()` when only flattening.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:MEDIUM`. `Array#flat()` expresses flatten-only operations more clearly than `flatMap()` with an identity callback.

#### How
Replace identity `flatMap()` usage with `flat()` at the equivalent depth and preserve item ordering. Apply the issue-specific remediation: prefer `Array#flat()` over `Array#flatMap()` when only flattening.

#### Where
- File: `src/tools/bulk-issues.ts`
- Line: `440`
- Sonar issue: `AZ8dpxxWI5cC3g4vWFjO`
- Rule: `typescript:S7751`
- Severity/impact: `MINOR`; `MAINTAINABILITY:MEDIUM`
- Tags: editable-source, es2019, readability

#### Acceptance criteria
- The flagged flatten-only operation uses `Array#flat()`.
- The code change resolves `AZ8dpxxWI5cC3g4vWFjO` without suppressing `typescript:S7751` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxWI5cC3g4vWFjO`.

### 49. Use Array.flat in src/tools/manage-label.ts:143

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiR` (`typescript:S7751`) at `src/tools/manage-label.ts:143`: prefer `Array#flat()` over `Array#flatMap()` when only flattening.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:MEDIUM`. `Array#flat()` expresses flatten-only operations more clearly than `flatMap()` with an identity callback.

#### How
Replace identity `flatMap()` usage with `flat()` at the equivalent depth and preserve item ordering. Apply the issue-specific remediation: prefer `Array#flat()` over `Array#flatMap()` when only flattening.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `143`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiR`
- Rule: `typescript:S7751`
- Severity/impact: `MINOR`; `MAINTAINABILITY:MEDIUM`
- Tags: editable-source, es2019, readability

#### Acceptance criteria
- The flagged flatten-only operation uses `Array#flat()`.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiR` without suppressing `typescript:S7751` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiR`.

### 50. Use Array.flat in src/tools/manage-milestone.ts:177

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhZ` (`typescript:S7751`) at `src/tools/manage-milestone.ts:177`: prefer `Array#flat()` over `Array#flatMap()` when only flattening.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:MEDIUM`. `Array#flat()` expresses flatten-only operations more clearly than `flatMap()` with an identity callback.

#### How
Replace identity `flatMap()` usage with `flat()` at the equivalent depth and preserve item ordering. Apply the issue-specific remediation: prefer `Array#flat()` over `Array#flatMap()` when only flattening.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `177`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhZ`
- Rule: `typescript:S7751`
- Severity/impact: `MINOR`; `MAINTAINABILITY:MEDIUM`
- Tags: editable-source, es2019, readability

#### Acceptance criteria
- The flagged flatten-only operation uses `Array#flat()`.
- The code change resolves `AZ8dpxveI5cC3g4vWFhZ` without suppressing `typescript:S7751` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhZ`.
