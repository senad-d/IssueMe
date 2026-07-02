# Spec: SonarQube Findings Remediation Part 4 of 6

Scope: tasks 151-200 of 271 from the 2026-07-02 AnalyseMe snapshot for `senad-d_IssueMe`.

Common acceptance criteria: fix the referenced rule without suppression, preserve behavior, and confirm the issue key disappears after fresh Sonar analysis.

## Tasks

### 151. Remove nested template literal in src/tools/list-assignees.ts:120

- [x] Resolve Sonar issue `AZ8dpxwPI5cC3g4vWFiB` (`typescript:S4624`) at `src/tools/list-assignees.ts:120`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/list-assignees.ts`
- Line: `120`
- Sonar issue: `AZ8dpxwPI5cC3g4vWFiB`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwPI5cC3g4vWFiB` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwPI5cC3g4vWFiB`.

### 152. Rewrite negated condition in src/tools/list-issues.ts:77

- [x] Resolve Sonar issue `AZ8dpxxpI5cC3g4vWFjQ` (`typescript:S7735`) at `src/tools/list-issues.ts:77`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/list-issues.ts`
- Line: `77`
- Sonar issue: `AZ8dpxxpI5cC3g4vWFjQ`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxpI5cC3g4vWFjQ` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxpI5cC3g4vWFjQ`.

### 153. Rewrite negated condition in src/tools/list-issues.ts:82

- [x] Resolve Sonar issue `AZ8dpxxpI5cC3g4vWFjR` (`typescript:S7735`) at `src/tools/list-issues.ts:82`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/list-issues.ts`
- Line: `82`
- Sonar issue: `AZ8dpxxpI5cC3g4vWFjR`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxpI5cC3g4vWFjR` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxpI5cC3g4vWFjR`.

### 154. Remove nested template literal in src/tools/list-labels.ts:103

- [x] Resolve Sonar issue `AZ8dpxwzI5cC3g4vWFiX` (`typescript:S4624`) at `src/tools/list-labels.ts:103`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/list-labels.ts`
- Line: `103`
- Sonar issue: `AZ8dpxwzI5cC3g4vWFiX`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwzI5cC3g4vWFiX` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwzI5cC3g4vWFiX`.

### 155. Extract nested ternary in src/tools/list-labels.ts:116

- [x] Resolve Sonar issue `AZ8dpxwzI5cC3g4vWFiY` (`typescript:S3358`) at `src/tools/list-labels.ts:116`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/list-labels.ts`
- Line: `116`
- Sonar issue: `AZ8dpxwzI5cC3g4vWFiY`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxwzI5cC3g4vWFiY` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwzI5cC3g4vWFiY`.

### 156. Remove nested template literal in src/tools/list-labels.ts:119

- [x] Resolve Sonar issue `AZ8dpxwzI5cC3g4vWFiZ` (`typescript:S4624`) at `src/tools/list-labels.ts:119`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/list-labels.ts`
- Line: `119`
- Sonar issue: `AZ8dpxwzI5cC3g4vWFiZ`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwzI5cC3g4vWFiZ` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwzI5cC3g4vWFiZ`.

### 157. Reduce cognitive complexity in src/tools/list-milestones.ts:104

- [x] Resolve Sonar issue `AZ8dpxvoI5cC3g4vWFhn` (`typescript:S3776`) at `src/tools/list-milestones.ts:104`: reduce cognitive complexity from 19 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 19 to 15 or less.

#### Where
- File: `src/tools/list-milestones.ts`
- Line: `104`
- Sonar issue: `AZ8dpxvoI5cC3g4vWFhn`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxvoI5cC3g4vWFhn` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvoI5cC3g4vWFhn`.

### 158. Rewrite negated condition in src/tools/list-milestones.ts:123

- [x] Resolve Sonar issue `AZ8dpxvoI5cC3g4vWFho` (`typescript:S7735`) at `src/tools/list-milestones.ts:123`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/list-milestones.ts`
- Line: `123`
- Sonar issue: `AZ8dpxvoI5cC3g4vWFho`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvoI5cC3g4vWFho` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvoI5cC3g4vWFho`.

### 159. Rewrite negated condition in src/tools/list-milestones.ts:124

- [x] Resolve Sonar issue `AZ8dpxvoI5cC3g4vWFhp` (`typescript:S7735`) at `src/tools/list-milestones.ts:124`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/list-milestones.ts`
- Line: `124`
- Sonar issue: `AZ8dpxvoI5cC3g4vWFhp`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvoI5cC3g4vWFhp` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvoI5cC3g4vWFhp`.

### 160. Remove nested template literal in src/tools/list-milestones.ts:146

- [x] Resolve Sonar issue `AZ8dpxvoI5cC3g4vWFhq` (`typescript:S4624`) at `src/tools/list-milestones.ts:146`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/list-milestones.ts`
- Line: `146`
- Sonar issue: `AZ8dpxvoI5cC3g4vWFhq`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxvoI5cC3g4vWFhq` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvoI5cC3g4vWFhq`.

### 161. Rewrite negated condition in src/tools/list-milestones.ts:158

- [x] Resolve Sonar issue `AZ8dpxvoI5cC3g4vWFhr` (`typescript:S7735`) at `src/tools/list-milestones.ts:158`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/list-milestones.ts`
- Line: `158`
- Sonar issue: `AZ8dpxvoI5cC3g4vWFhr`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvoI5cC3g4vWFhr` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvoI5cC3g4vWFhr`.

### 162. Rewrite negated condition in src/tools/list-milestones.ts:159

- [x] Resolve Sonar issue `AZ8dpxvoI5cC3g4vWFhs` (`typescript:S7735`) at `src/tools/list-milestones.ts:159`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/list-milestones.ts`
- Line: `159`
- Sonar issue: `AZ8dpxvoI5cC3g4vWFhs`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvoI5cC3g4vWFhs` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvoI5cC3g4vWFhs`.

### 163. Remove nested template literal in src/tools/list-milestones.ts:167

- [x] Resolve Sonar issue `AZ8dpxvoI5cC3g4vWFht` (`typescript:S4624`) at `src/tools/list-milestones.ts:167`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/list-milestones.ts`
- Line: `167`
- Sonar issue: `AZ8dpxvoI5cC3g4vWFht`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxvoI5cC3g4vWFht` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvoI5cC3g4vWFht`.

### 164. Rewrite negated condition in src/tools/manage-label.ts:66

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiE` (`typescript:S7735`) at `src/tools/manage-label.ts:66`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `66`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiE`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiE` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiE`.

### 165. Rewrite negated condition in src/tools/manage-label.ts:74

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiF` (`typescript:S7735`) at `src/tools/manage-label.ts:74`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `74`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiF`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiF` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiF`.

### 166. Rewrite negated condition in src/tools/manage-label.ts:75

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiG` (`typescript:S7735`) at `src/tools/manage-label.ts:75`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `75`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiG`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiG` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiG`.

### 167. Rewrite negated condition in src/tools/manage-label.ts:76

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiH` (`typescript:S7735`) at `src/tools/manage-label.ts:76`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `76`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiH`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiH` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiH`.

### 168. Reduce cognitive complexity in src/tools/manage-label.ts:95

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiI` (`typescript:S3776`) at `src/tools/manage-label.ts:95`: reduce cognitive complexity from 30 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 30 to 15 or less.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `95`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiI`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiI` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiI`.

### 169. Rewrite negated condition in src/tools/manage-label.ts:104

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiJ` (`typescript:S7735`) at `src/tools/manage-label.ts:104`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `104`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiJ`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiJ` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiJ`.

### 170. Rewrite negated condition in src/tools/manage-label.ts:105

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiK` (`typescript:S7735`) at `src/tools/manage-label.ts:105`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `105`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiK`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiK` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiK`.

### 171. Rewrite negated condition in src/tools/manage-label.ts:113

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiL` (`typescript:S7735`) at `src/tools/manage-label.ts:113`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `113`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiL`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiL` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiL`.

### 172. Rewrite negated condition in src/tools/manage-label.ts:113

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiM` (`typescript:S7735`) at `src/tools/manage-label.ts:113`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `113`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiM`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiM` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiM`.

### 173. Rewrite negated condition in src/tools/manage-label.ts:113

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiN` (`typescript:S7735`) at `src/tools/manage-label.ts:113`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `113`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiN`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiN` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiN`.

### 174. Rewrite negated condition in src/tools/manage-label.ts:121

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiO` (`typescript:S7735`) at `src/tools/manage-label.ts:121`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `121`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiO`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiO` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiO`.

### 175. Rewrite negated condition in src/tools/manage-label.ts:122

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiP` (`typescript:S7735`) at `src/tools/manage-label.ts:122`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `122`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiP`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiP` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiP`.

### 176. Rewrite negated condition in src/tools/manage-label.ts:123

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiQ` (`typescript:S7735`) at `src/tools/manage-label.ts:123`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `123`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiQ`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiQ` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiQ`.

### 177. Rewrite negated condition in src/tools/manage-label.ts:211

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiS` (`typescript:S7735`) at `src/tools/manage-label.ts:211`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `211`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiS`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiS` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiS`.

### 178. Extract nested ternary in src/tools/manage-label.ts:256

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiT` (`typescript:S3358`) at `src/tools/manage-label.ts:256`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `256`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiT`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiT` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiT`.

### 179. Extract nested ternary in src/tools/manage-label.ts:257

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiU` (`typescript:S3358`) at `src/tools/manage-label.ts:257`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `257`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiU`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiU` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiU`.

### 180. Remove nested template literal in src/tools/manage-label.ts:260

- [x] Resolve Sonar issue `AZ8dpxwiI5cC3g4vWFiV` (`typescript:S4624`) at `src/tools/manage-label.ts:260`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/manage-label.ts`
- Line: `260`
- Sonar issue: `AZ8dpxwiI5cC3g4vWFiV`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxwiI5cC3g4vWFiV` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwiI5cC3g4vWFiV`.

### 181. Reduce cognitive complexity in src/tools/manage-milestone.ts:65

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhJ` (`typescript:S3776`) at `src/tools/manage-milestone.ts:65`: reduce cognitive complexity from 22 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 22 to 15 or less.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `65`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhJ`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxveI5cC3g4vWFhJ` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhJ`.

### 182. Rewrite negated condition in src/tools/manage-milestone.ts:72

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhK` (`typescript:S7735`) at `src/tools/manage-milestone.ts:72`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `72`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhK`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhK` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhK`.

### 183. Rewrite negated condition in src/tools/manage-milestone.ts:73

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhL` (`typescript:S7735`) at `src/tools/manage-milestone.ts:73`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `73`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhL`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhL` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhL`.

### 184. Rewrite negated condition in src/tools/manage-milestone.ts:81

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhM` (`typescript:S7735`) at `src/tools/manage-milestone.ts:81`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `81`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhM`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhM` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhM`.

### 185. Rewrite negated condition in src/tools/manage-milestone.ts:82

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhN` (`typescript:S7735`) at `src/tools/manage-milestone.ts:82`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `82`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhN`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhN` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhN`.

### 186. Rewrite negated condition in src/tools/manage-milestone.ts:83

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhO` (`typescript:S7735`) at `src/tools/manage-milestone.ts:83`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `83`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhO`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhO` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhO`.

### 187. Reduce cognitive complexity in src/tools/manage-milestone.ts:110

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhP` (`typescript:S3776`) at `src/tools/manage-milestone.ts:110`: reduce cognitive complexity from 46 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 46 to 15 or less.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `110`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhP`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxveI5cC3g4vWFhP` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhP`.

### 188. Rewrite negated condition in src/tools/manage-milestone.ts:120

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhQ` (`typescript:S7735`) at `src/tools/manage-milestone.ts:120`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `120`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhQ`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhQ` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhQ`.

### 189. Rewrite negated condition in src/tools/manage-milestone.ts:121

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhR` (`typescript:S7735`) at `src/tools/manage-milestone.ts:121`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `121`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhR`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhR` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhR`.

### 190. Rewrite negated condition in src/tools/manage-milestone.ts:122

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhS` (`typescript:S7735`) at `src/tools/manage-milestone.ts:122`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `122`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhS`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhS` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhS`.

### 191. Rewrite negated condition in src/tools/manage-milestone.ts:122

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhT` (`typescript:S7735`) at `src/tools/manage-milestone.ts:122`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `122`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhT`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhT` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhT`.

### 192. Rewrite negated condition in src/tools/manage-milestone.ts:133

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhU` (`typescript:S7735`) at `src/tools/manage-milestone.ts:133`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `133`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhU`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhU` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhU`.

### 193. Rewrite negated condition in src/tools/manage-milestone.ts:133

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhV` (`typescript:S7735`) at `src/tools/manage-milestone.ts:133`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `133`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhV`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhV` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhV`.

### 194. Rewrite negated condition in src/tools/manage-milestone.ts:141

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhW` (`typescript:S7735`) at `src/tools/manage-milestone.ts:141`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `141`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhW`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhW` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhW`.

### 195. Rewrite negated condition in src/tools/manage-milestone.ts:142

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhX` (`typescript:S7735`) at `src/tools/manage-milestone.ts:142`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `142`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhX`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhX` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhX`.

### 196. Rewrite negated condition in src/tools/manage-milestone.ts:143

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhY` (`typescript:S7735`) at `src/tools/manage-milestone.ts:143`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `143`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhY`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxveI5cC3g4vWFhY` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhY`.

### 197. Use RegExp.exec in src/tools/manage-milestone.ts:218

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFha` (`typescript:S6594`) at `src/tools/manage-milestone.ts:218`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `218`
- Sonar issue: `AZ8dpxveI5cC3g4vWFha`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpxveI5cC3g4vWFha` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFha`.

### 198. Use RegExp.exec in src/tools/manage-milestone.ts:224

- [x] Resolve Sonar issue `AZ8dpxveI5cC3g4vWFhb` (`typescript:S6594`) at `src/tools/manage-milestone.ts:224`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `224`
- Sonar issue: `AZ8dpxveI5cC3g4vWFhb`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpxveI5cC3g4vWFhb` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxveI5cC3g4vWFhb`.

### 199. Reduce cognitive complexity in src/tools/manage-milestone.ts:292

- [x] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhc` (`typescript:S3776`) at `src/tools/manage-milestone.ts:292`: reduce cognitive complexity from 20 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 20 to 15 or less.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `292`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhc`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhc` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhc`.

### 200. Rewrite negated condition in src/tools/manage-milestone.ts:313

- [x] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhd` (`typescript:S7735`) at `src/tools/manage-milestone.ts:313`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `313`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhd`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhd` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhd`.
