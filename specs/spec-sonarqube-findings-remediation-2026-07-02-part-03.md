# Spec: SonarQube Findings Remediation Part 3 of 6

Scope: tasks 101-150 of 271 from the 2026-07-02 AnalyseMe snapshot for `senad-d_IssueMe`.

Common acceptance criteria: fix the referenced rule without suppression, preserve behavior, and confirm the issue key disappears after fresh Sonar analysis.

## Tasks

### 101. Rewrite negated condition in src/issues/format.ts:100

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkp` (`typescript:S7735`) at `src/issues/format.ts:100`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `100`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkp`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkp` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkp`.

### 102. Rewrite negated condition in src/issues/format.ts:101

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkq` (`typescript:S7735`) at `src/issues/format.ts:101`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `101`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkq`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkq` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkq`.

### 103. Rewrite negated condition in src/issues/format.ts:102

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkr` (`typescript:S7735`) at `src/issues/format.ts:102`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `102`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkr`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkr` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkr`.

### 104. Rewrite negated condition in src/issues/format.ts:103

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFks` (`typescript:S7735`) at `src/issues/format.ts:103`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `103`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFks`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFks` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFks`.

### 105. Rewrite negated condition in src/issues/format.ts:110

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkt` (`typescript:S7735`) at `src/issues/format.ts:110`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `110`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkt`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkt` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkt`.

### 106. Rewrite negated condition in src/issues/format.ts:111

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFku` (`typescript:S7735`) at `src/issues/format.ts:111`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `111`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFku`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFku` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFku`.

### 107. Rewrite negated condition in src/issues/format.ts:112

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkv` (`typescript:S7735`) at `src/issues/format.ts:112`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `112`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkv`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkv` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkv`.

### 108. Rewrite negated condition in src/issues/format.ts:143

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkx` (`typescript:S7735`) at `src/issues/format.ts:143`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `143`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkx`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkx` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkx`.

### 109. Rewrite negated condition in src/issues/format.ts:155

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFky` (`typescript:S7735`) at `src/issues/format.ts:155`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `155`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFky`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFky` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFky`.

### 110. Remove nested template literal in src/issues/format.ts:160

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFk0` (`typescript:S4624`) at `src/issues/format.ts:160`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/issues/format.ts`
- Line: `160`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFk0`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpx0gI5cC3g4vWFk0` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFk0`.

### 111. Rewrite negated condition in src/issues/format.ts:160

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkz` (`typescript:S7735`) at `src/issues/format.ts:160`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `160`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkz`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkz` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkz`.

### 112. Rewrite negated condition in src/issues/format.ts:196

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFk1` (`typescript:S7735`) at `src/issues/format.ts:196`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `196`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFk1`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFk1` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFk1`.

### 113. Rewrite negated condition in src/issues/format.ts:197

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFk2` (`typescript:S7735`) at `src/issues/format.ts:197`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `197`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFk2`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFk2` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFk2`.

### 114. Rewrite negated condition in src/issues/format.ts:198

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFk3` (`typescript:S7735`) at `src/issues/format.ts:198`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `198`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFk3`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFk3` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFk3`.

### 115. Extract nested ternary in src/issues/format.ts:225

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFk4` (`typescript:S3358`) at `src/issues/format.ts:225`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/issues/format.ts`
- Line: `225`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFk4`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpx0gI5cC3g4vWFk4` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFk4`.

### 116. Remove nested template literal in src/issues/format.ts:245

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFk5` (`typescript:S4624`) at `src/issues/format.ts:245`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/issues/format.ts`
- Line: `245`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFk5`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpx0gI5cC3g4vWFk5` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFk5`.

### 117. Reduce cognitive complexity in src/issues/store.ts:210

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFk6` (`typescript:S3776`) at `src/issues/store.ts:210`: reduce cognitive complexity from 19 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 19 to 15 or less.

#### Where
- File: `src/issues/store.ts`
- Line: `210`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFk6`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpx0sI5cC3g4vWFk6` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFk6`.

### 118. Reduce cognitive complexity in src/issues/store.ts:388

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFk9` (`typescript:S3776`) at `src/issues/store.ts:388`: reduce cognitive complexity from 19 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 19 to 15 or less.

#### Where
- File: `src/issues/store.ts`
- Line: `388`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFk9`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpx0sI5cC3g4vWFk9` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFk9`.

### 119. Rewrite negated condition in src/issues/store.ts:604

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFlA` (`typescript:S7735`) at `src/issues/store.ts:604`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/store.ts`
- Line: `604`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFlA`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0sI5cC3g4vWFlA` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFlA`.

### 120. Rewrite negated condition in src/issues/store.ts:605

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFlB` (`typescript:S7735`) at `src/issues/store.ts:605`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/store.ts`
- Line: `605`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFlB`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0sI5cC3g4vWFlB` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFlB`.

### 121. Rewrite negated condition in src/issues/store.ts:606

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFlC` (`typescript:S7735`) at `src/issues/store.ts:606`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/store.ts`
- Line: `606`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFlC`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0sI5cC3g4vWFlC` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFlC`.

### 122. Rewrite negated condition in src/issues/store.ts:608

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFlD` (`typescript:S7735`) at `src/issues/store.ts:608`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/store.ts`
- Line: `608`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFlD`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0sI5cC3g4vWFlD` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFlD`.

### 123. Rewrite negated condition in src/issues/store.ts:609

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFlE` (`typescript:S7735`) at `src/issues/store.ts:609`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/store.ts`
- Line: `609`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFlE`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0sI5cC3g4vWFlE` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFlE`.

### 124. Rewrite negated condition in src/issues/store.ts:610

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFlF` (`typescript:S7735`) at `src/issues/store.ts:610`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/store.ts`
- Line: `610`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFlF`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0sI5cC3g4vWFlF` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFlF`.

### 125. Extract nested ternary in src/tools/assign-issue.ts:36

- [x] Resolve Sonar issue `AZ8dpxwrI5cC3g4vWFiW` (`typescript:S3358`) at `src/tools/assign-issue.ts:36`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/assign-issue.ts`
- Line: `36`
- Sonar issue: `AZ8dpxwrI5cC3g4vWFiW`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxwrI5cC3g4vWFiW` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwrI5cC3g4vWFiW`.

### 126. Extract nested ternary in src/tools/bulk-issues.ts:298

- [x] Resolve Sonar issue `AZ8dpxxWI5cC3g4vWFjK` (`typescript:S3358`) at `src/tools/bulk-issues.ts:298`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/bulk-issues.ts`
- Line: `298`
- Sonar issue: `AZ8dpxxWI5cC3g4vWFjK`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxxWI5cC3g4vWFjK` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxWI5cC3g4vWFjK`.

### 127. Remove nested template literal in src/tools/bulk-issues.ts:298

- [x] Resolve Sonar issue `AZ8dpxxWI5cC3g4vWFjL` (`typescript:S4624`) at `src/tools/bulk-issues.ts:298`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/bulk-issues.ts`
- Line: `298`
- Sonar issue: `AZ8dpxxWI5cC3g4vWFjL`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxxWI5cC3g4vWFjL` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxWI5cC3g4vWFjL`.

### 128. Extract nested ternary in src/tools/bulk-issues.ts:336

- [x] Resolve Sonar issue `AZ8dpxxWI5cC3g4vWFjM` (`typescript:S3358`) at `src/tools/bulk-issues.ts:336`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/bulk-issues.ts`
- Line: `336`
- Sonar issue: `AZ8dpxxWI5cC3g4vWFjM`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxxWI5cC3g4vWFjM` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxWI5cC3g4vWFjM`.

### 129. Rewrite negated condition in src/tools/bulk-issues.ts:416

- [x] Resolve Sonar issue `AZ8dpxxWI5cC3g4vWFjN` (`typescript:S7735`) at `src/tools/bulk-issues.ts:416`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/bulk-issues.ts`
- Line: `416`
- Sonar issue: `AZ8dpxxWI5cC3g4vWFjN`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxWI5cC3g4vWFjN` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxWI5cC3g4vWFjN`.

### 130. Remove nested template literal in src/tools/close-issue.ts:47

- [x] Resolve Sonar issue `AZ8dpxvVI5cC3g4vWFhH` (`typescript:S4624`) at `src/tools/close-issue.ts:47`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/close-issue.ts`
- Line: `47`
- Sonar issue: `AZ8dpxvVI5cC3g4vWFhH`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxvVI5cC3g4vWFhH` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvVI5cC3g4vWFhH`.

### 131. Remove nested template literal in src/tools/close-issue.ts:59

- [x] Resolve Sonar issue `AZ8dpxvVI5cC3g4vWFhI` (`typescript:S4624`) at `src/tools/close-issue.ts:59`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/close-issue.ts`
- Line: `59`
- Sonar issue: `AZ8dpxvVI5cC3g4vWFhI`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxvVI5cC3g4vWFhI` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvVI5cC3g4vWFhI`.

### 132. Remove nested template literal in src/tools/comment-issue.ts:54

- [x] Resolve Sonar issue `AZ8dpxwHI5cC3g4vWFh3` (`typescript:S4624`) at `src/tools/comment-issue.ts:54`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/comment-issue.ts`
- Line: `54`
- Sonar issue: `AZ8dpxwHI5cC3g4vWFh3`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwHI5cC3g4vWFh3` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwHI5cC3g4vWFh3`.

### 133. Remove nested template literal in src/tools/comment-issue.ts:65

- [x] Resolve Sonar issue `AZ8dpxwHI5cC3g4vWFh4` (`typescript:S4624`) at `src/tools/comment-issue.ts:65`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/comment-issue.ts`
- Line: `65`
- Sonar issue: `AZ8dpxwHI5cC3g4vWFh4`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwHI5cC3g4vWFh4` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwHI5cC3g4vWFh4`.

### 134. Remove nested template literal in src/tools/comment-issue.ts:101

- [x] Resolve Sonar issue `AZ8dpxwHI5cC3g4vWFh5` (`typescript:S4624`) at `src/tools/comment-issue.ts:101`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/comment-issue.ts`
- Line: `101`
- Sonar issue: `AZ8dpxwHI5cC3g4vWFh5`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwHI5cC3g4vWFh5` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwHI5cC3g4vWFh5`.

### 135. Remove nested template literal in src/tools/comment-issue.ts:112

- [x] Resolve Sonar issue `AZ8dpxwHI5cC3g4vWFh6` (`typescript:S4624`) at `src/tools/comment-issue.ts:112`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/comment-issue.ts`
- Line: `112`
- Sonar issue: `AZ8dpxwHI5cC3g4vWFh6`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwHI5cC3g4vWFh6` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwHI5cC3g4vWFh6`.

### 136. Remove nested template literal in src/tools/comment-issue.ts:147

- [x] Resolve Sonar issue `AZ8dpxwHI5cC3g4vWFh7` (`typescript:S4624`) at `src/tools/comment-issue.ts:147`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/comment-issue.ts`
- Line: `147`
- Sonar issue: `AZ8dpxwHI5cC3g4vWFh7`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwHI5cC3g4vWFh7` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwHI5cC3g4vWFh7`.

### 137. Remove nested template literal in src/tools/comment-issue.ts:159

- [x] Resolve Sonar issue `AZ8dpxwHI5cC3g4vWFh8` (`typescript:S4624`) at `src/tools/comment-issue.ts:159`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/comment-issue.ts`
- Line: `159`
- Sonar issue: `AZ8dpxwHI5cC3g4vWFh8`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwHI5cC3g4vWFh8` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwHI5cC3g4vWFh8`.

### 138. Reduce cognitive complexity in src/tools/development-links.ts:114

- [x] Resolve Sonar issue `AZ8dpxw8I5cC3g4vWFia` (`typescript:S3776`) at `src/tools/development-links.ts:114`: reduce cognitive complexity from 22 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 22 to 15 or less.

#### Where
- File: `src/tools/development-links.ts`
- Line: `114`
- Sonar issue: `AZ8dpxw8I5cC3g4vWFia`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxw8I5cC3g4vWFia` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxw8I5cC3g4vWFia`.

### 139. Extract nested ternary in src/tools/development-links.ts:118

- [x] Resolve Sonar issue `AZ8dpxw8I5cC3g4vWFib` (`typescript:S3358`) at `src/tools/development-links.ts:118`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/development-links.ts`
- Line: `118`
- Sonar issue: `AZ8dpxw8I5cC3g4vWFib`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxw8I5cC3g4vWFib` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxw8I5cC3g4vWFib`.

### 140. Remove nested template literal in src/tools/development-links.ts:118

- [x] Resolve Sonar issue `AZ8dpxw8I5cC3g4vWFic` (`typescript:S4624`) at `src/tools/development-links.ts:118`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/development-links.ts`
- Line: `118`
- Sonar issue: `AZ8dpxw8I5cC3g4vWFic`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxw8I5cC3g4vWFic` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxw8I5cC3g4vWFic`.

### 141. Extract nested ternary in src/tools/development-links.ts:119

- [x] Resolve Sonar issue `AZ8dpxw8I5cC3g4vWFid` (`typescript:S3358`) at `src/tools/development-links.ts:119`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/development-links.ts`
- Line: `119`
- Sonar issue: `AZ8dpxw8I5cC3g4vWFid`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxw8I5cC3g4vWFid` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxw8I5cC3g4vWFid`.

### 142. Extract nested ternary in src/tools/development-links.ts:124

- [x] Resolve Sonar issue `AZ8dpxw8I5cC3g4vWFie` (`typescript:S3358`) at `src/tools/development-links.ts:124`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/development-links.ts`
- Line: `124`
- Sonar issue: `AZ8dpxw8I5cC3g4vWFie`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxw8I5cC3g4vWFie` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxw8I5cC3g4vWFie`.

### 143. Remove nested template literal in src/tools/development-links.ts:125

- [x] Resolve Sonar issue `AZ8dpxw8I5cC3g4vWFif` (`typescript:S4624`) at `src/tools/development-links.ts:125`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/development-links.ts`
- Line: `125`
- Sonar issue: `AZ8dpxw8I5cC3g4vWFif`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxw8I5cC3g4vWFif` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxw8I5cC3g4vWFif`.

### 144. Reduce cognitive complexity in src/tools/get-issue.ts:33

- [x] Resolve Sonar issue `AZ8dpxxyI5cC3g4vWFjS` (`typescript:S3776`) at `src/tools/get-issue.ts:33`: reduce cognitive complexity from 30 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 30 to 15 or less.

#### Where
- File: `src/tools/get-issue.ts`
- Line: `33`
- Sonar issue: `AZ8dpxxyI5cC3g4vWFjS`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxxyI5cC3g4vWFjS` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxyI5cC3g4vWFjS`.

### 145. Rewrite negated condition in src/tools/get-issue.ts:82

- [x] Resolve Sonar issue `AZ8dpxxyI5cC3g4vWFjT` (`typescript:S7735`) at `src/tools/get-issue.ts:82`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/get-issue.ts`
- Line: `82`
- Sonar issue: `AZ8dpxxyI5cC3g4vWFjT`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxyI5cC3g4vWFjT` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxyI5cC3g4vWFjT`.

### 146. Reduce cognitive complexity in src/tools/label-issue.ts:28

- [x] Resolve Sonar issue `AZ8dpxxfI5cC3g4vWFjP` (`typescript:S3776`) at `src/tools/label-issue.ts:28`: reduce cognitive complexity from 17 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 17 to 15 or less.

#### Where
- File: `src/tools/label-issue.ts`
- Line: `28`
- Sonar issue: `AZ8dpxxfI5cC3g4vWFjP`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxxfI5cC3g4vWFjP` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxfI5cC3g4vWFjP`.

### 147. Rewrite negated condition in src/tools/list-assignees.ts:85

- [x] Resolve Sonar issue `AZ8dpxwPI5cC3g4vWFh9` (`typescript:S7735`) at `src/tools/list-assignees.ts:85`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/list-assignees.ts`
- Line: `85`
- Sonar issue: `AZ8dpxwPI5cC3g4vWFh9`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwPI5cC3g4vWFh9` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwPI5cC3g4vWFh9`.

### 148. Remove nested template literal in src/tools/list-assignees.ts:104

- [x] Resolve Sonar issue `AZ8dpxwPI5cC3g4vWFh-` (`typescript:S4624`) at `src/tools/list-assignees.ts:104`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/list-assignees.ts`
- Line: `104`
- Sonar issue: `AZ8dpxwPI5cC3g4vWFh-`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwPI5cC3g4vWFh-` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwPI5cC3g4vWFh-`.

### 149. Rewrite negated condition in src/tools/list-assignees.ts:117

- [x] Resolve Sonar issue `AZ8dpxwPI5cC3g4vWFh_` (`typescript:S7735`) at `src/tools/list-assignees.ts:117`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/list-assignees.ts`
- Line: `117`
- Sonar issue: `AZ8dpxwPI5cC3g4vWFh_`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwPI5cC3g4vWFh_` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwPI5cC3g4vWFh_`.

### 150. Remove nested template literal in src/tools/list-assignees.ts:120

- [x] Resolve Sonar issue `AZ8dpxwPI5cC3g4vWFiA` (`typescript:S4624`) at `src/tools/list-assignees.ts:120`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/list-assignees.ts`
- Line: `120`
- Sonar issue: `AZ8dpxwPI5cC3g4vWFiA`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwPI5cC3g4vWFiA` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwPI5cC3g4vWFiA`.
