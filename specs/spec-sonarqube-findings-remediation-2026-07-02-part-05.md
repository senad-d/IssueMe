# Spec: SonarQube Findings Remediation Part 5 of 6

Scope: tasks 201-250 of 271 from the 2026-07-02 AnalyseMe snapshot for `senad-d_IssueMe`.

Common acceptance criteria: fix the referenced rule without suppression, preserve behavior, and confirm the issue key disappears after fresh Sonar analysis.

## Tasks

### 201. Rewrite negated condition in src/tools/manage-milestone.ts:314

- [ ] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhe` (`typescript:S7735`) at `src/tools/manage-milestone.ts:314`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `314`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhe`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhe` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhe`.

### 202. Rewrite negated condition in src/tools/manage-milestone.ts:315

- [ ] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhf` (`typescript:S7735`) at `src/tools/manage-milestone.ts:315`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `315`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhf`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhf` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhf`.

### 203. Rewrite negated condition in src/tools/manage-milestone.ts:316

- [ ] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhg` (`typescript:S7735`) at `src/tools/manage-milestone.ts:316`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `316`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhg`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhg` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhg`.

### 204. Extract nested ternary in src/tools/manage-milestone.ts:338

- [ ] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhh` (`typescript:S3358`) at `src/tools/manage-milestone.ts:338`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `338`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhh`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhh` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhh`.

### 205. Extract nested ternary in src/tools/manage-milestone.ts:339

- [ ] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhi` (`typescript:S3358`) at `src/tools/manage-milestone.ts:339`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `339`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhi`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhi` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhi`.

### 206. Extract nested ternary in src/tools/manage-milestone.ts:339

- [ ] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhj` (`typescript:S3358`) at `src/tools/manage-milestone.ts:339`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `339`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhj`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhj` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhj`.

### 207. Extract nested ternary in src/tools/manage-milestone.ts:340

- [ ] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhk` (`typescript:S3358`) at `src/tools/manage-milestone.ts:340`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `340`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhk`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhk` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhk`.

### 208. Rewrite negated condition in src/tools/manage-milestone.ts:342

- [ ] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhl` (`typescript:S7735`) at `src/tools/manage-milestone.ts:342`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `342`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhl`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhl` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhl`.

### 209. Remove nested template literal in src/tools/manage-milestone.ts:343

- [ ] Resolve Sonar issue `AZ8dpxvfI5cC3g4vWFhm` (`typescript:S4624`) at `src/tools/manage-milestone.ts:343`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/manage-milestone.ts`
- Line: `343`
- Sonar issue: `AZ8dpxvfI5cC3g4vWFhm`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxvfI5cC3g4vWFhm` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvfI5cC3g4vWFhm`.

### 210. Rewrite negated condition in src/tools/projects.ts:300

- [ ] Resolve Sonar issue `AZ8dpxvzI5cC3g4vWFhu` (`typescript:S7735`) at `src/tools/projects.ts:300`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/projects.ts`
- Line: `300`
- Sonar issue: `AZ8dpxvzI5cC3g4vWFhu`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvzI5cC3g4vWFhu` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvzI5cC3g4vWFhu`.

### 211. Extract nested ternary in src/tools/projects.ts:465

- [ ] Resolve Sonar issue `AZ8dpxvzI5cC3g4vWFhw` (`typescript:S3358`) at `src/tools/projects.ts:465`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/projects.ts`
- Line: `465`
- Sonar issue: `AZ8dpxvzI5cC3g4vWFhw`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxvzI5cC3g4vWFhw` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvzI5cC3g4vWFhw`.

### 212. Remove nested template literal in src/tools/projects.ts:476

- [ ] Resolve Sonar issue `AZ8dpxvzI5cC3g4vWFhx` (`typescript:S4624`) at `src/tools/projects.ts:476`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/projects.ts`
- Line: `476`
- Sonar issue: `AZ8dpxvzI5cC3g4vWFhx`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxvzI5cC3g4vWFhx` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvzI5cC3g4vWFhx`.

### 213. Remove nested template literal in src/tools/projects.ts:485

- [ ] Resolve Sonar issue `AZ8dpxvzI5cC3g4vWFhy` (`typescript:S4624`) at `src/tools/projects.ts:485`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/projects.ts`
- Line: `485`
- Sonar issue: `AZ8dpxvzI5cC3g4vWFhy`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxvzI5cC3g4vWFhy` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvzI5cC3g4vWFhy`.

### 214. Rewrite negated condition in src/tools/projects.ts:489

- [ ] Resolve Sonar issue `AZ8dpxvzI5cC3g4vWFhz` (`typescript:S7735`) at `src/tools/projects.ts:489`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/projects.ts`
- Line: `489`
- Sonar issue: `AZ8dpxvzI5cC3g4vWFhz`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxvzI5cC3g4vWFhz` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvzI5cC3g4vWFhz`.

### 215. Remove nested template literal in src/tools/projects.ts:492

- [ ] Resolve Sonar issue `AZ8dpxvzI5cC3g4vWFh0` (`typescript:S4624`) at `src/tools/projects.ts:492`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/projects.ts`
- Line: `492`
- Sonar issue: `AZ8dpxvzI5cC3g4vWFh0`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxvzI5cC3g4vWFh0` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvzI5cC3g4vWFh0`.

### 216. Remove nested template literal in src/tools/reopen-issue.ts:80

- [ ] Resolve Sonar issue `AZ8dpxv9I5cC3g4vWFh1` (`typescript:S4624`) at `src/tools/reopen-issue.ts:80`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/reopen-issue.ts`
- Line: `80`
- Sonar issue: `AZ8dpxv9I5cC3g4vWFh1`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxv9I5cC3g4vWFh1` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxv9I5cC3g4vWFh1`.

### 217. Remove nested template literal in src/tools/reopen-issue.ts:95

- [ ] Resolve Sonar issue `AZ8dpxv9I5cC3g4vWFh2` (`typescript:S4624`) at `src/tools/reopen-issue.ts:95`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/reopen-issue.ts`
- Line: `95`
- Sonar issue: `AZ8dpxv9I5cC3g4vWFh2`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxv9I5cC3g4vWFh2` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxv9I5cC3g4vWFh2`.

### 218. Rewrite negated condition in src/tools/runtime.ts:230

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFik` (`typescript:S7735`) at `src/tools/runtime.ts:230`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `230`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFik`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFik` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFik`.

### 219. Rewrite negated condition in src/tools/runtime.ts:238

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFil` (`typescript:S7735`) at `src/tools/runtime.ts:238`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `238`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFil`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFil` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFil`.

### 220. Remove useless empty object in src/tools/runtime.ts:309

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFim` (`typescript:S7744`) at `src/tools/runtime.ts:309`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/tools/runtime.ts`
- Line: `309`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFim`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxxLI5cC3g4vWFim` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFim`.

### 221. Reduce cognitive complexity in src/tools/runtime.ts:321

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFin` (`typescript:S3776`) at `src/tools/runtime.ts:321`: reduce cognitive complexity from 21 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 21 to 15 or less.

#### Where
- File: `src/tools/runtime.ts`
- Line: `321`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFin`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxxLI5cC3g4vWFin` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFin`.

### 222. Use regex character class in src/tools/runtime.ts:418

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFio` (`typescript:S6035`) at `src/tools/runtime.ts:418`: replace the regex alternation with a character class.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. A character class is clearer and cheaper than alternation when matching single-character alternatives.

#### How
Replace the single-character alternation with an equivalent character class and keep the same accepted values. Apply the issue-specific remediation: replace the regex alternation with a character class.

#### Where
- File: `src/tools/runtime.ts`
- Line: `418`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFio`
- Rule: `typescript:S6035`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: regex, type-dependent

#### Acceptance criteria
- The flagged regular expression uses a character class instead of single-character alternation.
- The code change resolves `AZ8dpxxLI5cC3g4vWFio` without suppressing `typescript:S6035` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFio`.

### 223. Remove useless empty object in src/tools/runtime.ts:494

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFip` (`typescript:S7744`) at `src/tools/runtime.ts:494`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/tools/runtime.ts`
- Line: `494`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFip`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxxLI5cC3g4vWFip` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFip`.

### 224. Rewrite negated condition in src/tools/runtime.ts:647

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFiq` (`typescript:S7735`) at `src/tools/runtime.ts:647`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `647`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFiq`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFiq` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFiq`.

### 225. Rewrite negated condition in src/tools/runtime.ts:676

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFir` (`typescript:S7735`) at `src/tools/runtime.ts:676`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `676`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFir`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFir` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFir`.

### 226. Rewrite negated condition in src/tools/runtime.ts:677

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFis` (`typescript:S7735`) at `src/tools/runtime.ts:677`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `677`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFis`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFis` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFis`.

### 227. Rewrite negated condition in src/tools/runtime.ts:679

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFit` (`typescript:S7735`) at `src/tools/runtime.ts:679`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `679`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFit`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFit` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFit`.

### 228. Reduce cognitive complexity in src/tools/runtime.ts:686

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFiu` (`typescript:S3776`) at `src/tools/runtime.ts:686`: reduce cognitive complexity from 17 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 17 to 15 or less.

#### Where
- File: `src/tools/runtime.ts`
- Line: `686`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFiu`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxxLI5cC3g4vWFiu` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFiu`.

### 229. Rewrite negated condition in src/tools/runtime.ts:703

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFiv` (`typescript:S7735`) at `src/tools/runtime.ts:703`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `703`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFiv`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFiv` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFiv`.

### 230. Rewrite negated condition in src/tools/runtime.ts:704

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFiw` (`typescript:S7735`) at `src/tools/runtime.ts:704`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `704`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFiw`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFiw` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFiw`.

### 231. Rewrite negated condition in src/tools/runtime.ts:707

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFix` (`typescript:S7735`) at `src/tools/runtime.ts:707`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `707`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFix`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFix` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFix`.

### 232. Rewrite negated condition in src/tools/runtime.ts:708

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFiy` (`typescript:S7735`) at `src/tools/runtime.ts:708`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `708`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFiy`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFiy` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFiy`.

### 233. Rewrite negated condition in src/tools/runtime.ts:729

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFiz` (`typescript:S7735`) at `src/tools/runtime.ts:729`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `729`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFiz`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFiz` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFiz`.

### 234. Rewrite negated condition in src/tools/runtime.ts:730

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi0` (`typescript:S7735`) at `src/tools/runtime.ts:730`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `730`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi0`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi0` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi0`.

### 235. Rewrite negated condition in src/tools/runtime.ts:731

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi1` (`typescript:S7735`) at `src/tools/runtime.ts:731`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `731`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi1`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi1` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi1`.

### 236. Rewrite negated condition in src/tools/runtime.ts:758

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi2` (`typescript:S7735`) at `src/tools/runtime.ts:758`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `758`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi2`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi2` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi2`.

### 237. Rewrite negated condition in src/tools/runtime.ts:759

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi3` (`typescript:S7735`) at `src/tools/runtime.ts:759`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `759`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi3`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi3` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi3`.

### 238. Remove useless empty object in src/tools/runtime.ts:777

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi4` (`typescript:S7744`) at `src/tools/runtime.ts:777`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/tools/runtime.ts`
- Line: `777`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi4`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi4` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi4`.

### 239. Rewrite negated condition in src/tools/runtime.ts:791

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi5` (`typescript:S7735`) at `src/tools/runtime.ts:791`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `791`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi5`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi5` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi5`.

### 240. Rewrite negated condition in src/tools/runtime.ts:816

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi6` (`typescript:S7735`) at `src/tools/runtime.ts:816`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `816`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi6`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi6` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi6`.

### 241. Reduce cognitive complexity in src/tools/runtime.ts:825

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi7` (`typescript:S3776`) at `src/tools/runtime.ts:825`: reduce cognitive complexity from 25 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 25 to 15 or less.

#### Where
- File: `src/tools/runtime.ts`
- Line: `825`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi7`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi7` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi7`.

### 242. Rewrite negated condition in src/tools/runtime.ts:846

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi8` (`typescript:S7735`) at `src/tools/runtime.ts:846`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `846`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi8`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi8` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi8`.

### 243. Rewrite negated condition in src/tools/runtime.ts:848

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi9` (`typescript:S7735`) at `src/tools/runtime.ts:848`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `848`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi9`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi9` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi9`.

### 244. Rewrite negated condition in src/tools/runtime.ts:849

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi-` (`typescript:S7735`) at `src/tools/runtime.ts:849`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `849`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi-`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi-` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi-`.

### 245. Rewrite negated condition in src/tools/runtime.ts:850

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFi_` (`typescript:S7735`) at `src/tools/runtime.ts:850`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `850`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFi_`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFi_` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFi_`.

### 246. Rewrite negated condition in src/tools/runtime.ts:851

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFjA` (`typescript:S7735`) at `src/tools/runtime.ts:851`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `851`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFjA`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFjA` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFjA`.

### 247. Rewrite negated condition in src/tools/runtime.ts:852

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFjB` (`typescript:S7735`) at `src/tools/runtime.ts:852`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `852`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFjB`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFjB` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFjB`.

### 248. Rewrite negated condition in src/tools/runtime.ts:888

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFjC` (`typescript:S7735`) at `src/tools/runtime.ts:888`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `888`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFjC`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFjC` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFjC`.

### 249. Rewrite negated condition in src/tools/runtime.ts:889

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFjD` (`typescript:S7735`) at `src/tools/runtime.ts:889`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `889`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFjD`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFjD` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFjD`.

### 250. Rewrite negated condition in src/tools/runtime.ts:897

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFjE` (`typescript:S7735`) at `src/tools/runtime.ts:897`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `897`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFjE`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFjE` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFjE`.
