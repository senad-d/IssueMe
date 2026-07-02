# Spec: SonarQube Findings Remediation Part 6 of 6

Scope: tasks 251-271 of 271 from the 2026-07-02 AnalyseMe snapshot for `senad-d_IssueMe`.

Common acceptance criteria: fix the referenced rule without suppression, preserve behavior, and confirm the issue key disappears after fresh Sonar analysis.

## Tasks

### 251. Reduce cognitive complexity in src/tools/runtime.ts:930

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFjF` (`typescript:S3776`) at `src/tools/runtime.ts:930`: reduce cognitive complexity from 19 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 19 to 15 or less.

#### Where
- File: `src/tools/runtime.ts`
- Line: `930`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFjF`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxxLI5cC3g4vWFjF` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFjF`.

### 252. Reduce cognitive complexity in src/tools/runtime.ts:973

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFjG` (`typescript:S3776`) at `src/tools/runtime.ts:973`: reduce cognitive complexity from 25 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 25 to 15 or less.

#### Where
- File: `src/tools/runtime.ts`
- Line: `973`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFjG`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxxLI5cC3g4vWFjG` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFjG`.

### 253. Remove useless empty object in src/tools/runtime.ts:1003

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFjH` (`typescript:S7744`) at `src/tools/runtime.ts:1003`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/tools/runtime.ts`
- Line: `1003`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFjH`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxxLI5cC3g4vWFjH` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFjH`.

### 254. Use concise regex class in src/tools/runtime.ts:1188

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFjI` (`typescript:S6353`) at `src/tools/runtime.ts:1188`: use concise `\w` character class syntax.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Concise character class syntax improves regex readability without changing behavior.

#### How
Replace `[A-Za-z0-9_]` with an equivalent concise class such as `\w` where the semantics remain correct. Apply the issue-specific remediation: use concise `\w` character class syntax.

#### Where
- File: `src/tools/runtime.ts`
- Line: `1188`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFjI`
- Rule: `typescript:S6353`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged regular expression uses concise character class syntax.
- The code change resolves `AZ8dpxxLI5cC3g4vWFjI` without suppressing `typescript:S6353` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFjI`.

### 255. Use concise regex class in src/tools/runtime.ts:1189

- [ ] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFjJ` (`typescript:S6353`) at `src/tools/runtime.ts:1189`: use concise `\w` character class syntax.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Concise character class syntax improves regex readability without changing behavior.

#### How
Replace `[A-Za-z0-9_]` with an equivalent concise class such as `\w` where the semantics remain correct. Apply the issue-specific remediation: use concise `\w` character class syntax.

#### Where
- File: `src/tools/runtime.ts`
- Line: `1189`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFjJ`
- Rule: `typescript:S6353`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged regular expression uses concise character class syntax.
- The code change resolves `AZ8dpxxLI5cC3g4vWFjJ` without suppressing `typescript:S6353` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFjJ`.

### 256. Extract nested ternary in src/tools/sub-issue.ts:492

- [ ] Resolve Sonar issue `AZ8dpxtYI5cC3g4vWFhA` (`typescript:S3358`) at `src/tools/sub-issue.ts:492`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/sub-issue.ts`
- Line: `492`
- Sonar issue: `AZ8dpxtYI5cC3g4vWFhA`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxtYI5cC3g4vWFhA` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxtYI5cC3g4vWFhA`.

### 257. Extract nested ternary in src/tools/sub-issue.ts:507

- [ ] Resolve Sonar issue `AZ8dpxtYI5cC3g4vWFhB` (`typescript:S3358`) at `src/tools/sub-issue.ts:507`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/sub-issue.ts`
- Line: `507`
- Sonar issue: `AZ8dpxtYI5cC3g4vWFhB`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxtYI5cC3g4vWFhB` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxtYI5cC3g4vWFhB`.

### 258. Remove nested template literal in src/tools/sub-issue.ts:507

- [ ] Resolve Sonar issue `AZ8dpxtYI5cC3g4vWFhC` (`typescript:S4624`) at `src/tools/sub-issue.ts:507`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/sub-issue.ts`
- Line: `507`
- Sonar issue: `AZ8dpxtYI5cC3g4vWFhC`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxtYI5cC3g4vWFhC` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxtYI5cC3g4vWFhC`.

### 259. Extract nested ternary in src/tools/sub-issue.ts:516

- [ ] Resolve Sonar issue `AZ8dpxtYI5cC3g4vWFhD` (`typescript:S3358`) at `src/tools/sub-issue.ts:516`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/tools/sub-issue.ts`
- Line: `516`
- Sonar issue: `AZ8dpxtYI5cC3g4vWFhD`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxtYI5cC3g4vWFhD` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxtYI5cC3g4vWFhD`.

### 260. Remove useless empty object in src/tools/sub-issue.ts:620

- [ ] Resolve Sonar issue `AZ8dpxtYI5cC3g4vWFhE` (`typescript:S7744`) at `src/tools/sub-issue.ts:620`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/tools/sub-issue.ts`
- Line: `620`
- Sonar issue: `AZ8dpxtYI5cC3g4vWFhE`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxtYI5cC3g4vWFhE` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxtYI5cC3g4vWFhE`.

### 261. Use RegExp.exec in src/utils/date.ts:2

- [ ] Resolve Sonar issue `AZ8dpxyWI5cC3g4vWFjb` (`typescript:S6594`) at `src/utils/date.ts:2`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/utils/date.ts`
- Line: `2`
- Sonar issue: `AZ8dpxyWI5cC3g4vWFjb`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpxyWI5cC3g4vWFjb` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyWI5cC3g4vWFjb`.

### 262. Use RegExp.exec in src/utils/project-root.ts:73

- [ ] Resolve Sonar issue `AZ8dpxyeI5cC3g4vWFjc` (`typescript:S6594`) at `src/utils/project-root.ts:73`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/utils/project-root.ts`
- Line: `73`
- Sonar issue: `AZ8dpxyeI5cC3g4vWFjc`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpxyeI5cC3g4vWFjc` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyeI5cC3g4vWFjc`.

### 263. Simplify backtracking regex in src/utils/project-root.ts:73

- [ ] Resolve Sonar issue `AZ8dpxyeI5cC3g4vWFjd` (`typescript:S8786`) at `src/utils/project-root.ts:73`: simplify the regex to avoid super-linear backtracking.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `RELIABILITY:MEDIUM`. Super-linear regex backtracking can become a reliability or denial-of-service risk on crafted input.

#### How
Rewrite the regex to avoid ambiguous nested quantifiers or overlapping alternatives, and add focused tests for representative and adversarial inputs when practical. Apply the issue-specific remediation: simplify the regex to avoid super-linear backtracking.

#### Where
- File: `src/utils/project-root.ts`
- Line: `73`
- Sonar issue: `AZ8dpxyeI5cC3g4vWFjd`
- Rule: `typescript:S8786`
- Severity/impact: `MAJOR`; `RELIABILITY:MEDIUM`
- Tags: performance, regex

#### Acceptance criteria
- The flagged regex no longer has super-linear backtracking behavior and keeps the same intended matches.
- The code change resolves `AZ8dpxyeI5cC3g4vWFjd` without suppressing `typescript:S8786` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyeI5cC3g4vWFjd`.

### 264. Rewrite negated condition in src/errors.ts:381

- [ ] Resolve Sonar issue `AZ8dpx03I5cC3g4vWFlG` (`typescript:S7735`) at `src/errors.ts:381`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/errors.ts`
- Line: `381`
- Sonar issue: `AZ8dpx03I5cC3g4vWFlG`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx03I5cC3g4vWFlG` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx03I5cC3g4vWFlG`.

### 265. Use RegExp.exec in src/github/repository.ts:20

- [ ] Resolve Sonar issue `AZ8dpxzQI5cC3g4vWFj2` (`typescript:S6594`) at `src/github/repository.ts:20`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/github/repository.ts`
- Line: `20`
- Sonar issue: `AZ8dpxzQI5cC3g4vWFj2`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpxzQI5cC3g4vWFj2` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzQI5cC3g4vWFj2`.

### 266. Use RegExp.exec in src/github/repository.ts:26

- [ ] Resolve Sonar issue `AZ8dpxzQI5cC3g4vWFj3` (`typescript:S6594`) at `src/github/repository.ts:26`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/github/repository.ts`
- Line: `26`
- Sonar issue: `AZ8dpxzQI5cC3g4vWFj3`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpxzQI5cC3g4vWFj3` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzQI5cC3g4vWFj3`.

### 267. Simplify backtracking regex in src/github/repository.ts:26

- [ ] Resolve Sonar issue `AZ8dpxzQI5cC3g4vWFj4` (`typescript:S8786`) at `src/github/repository.ts:26`: simplify the regex to avoid super-linear backtracking.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `RELIABILITY:MEDIUM`. Super-linear regex backtracking can become a reliability or denial-of-service risk on crafted input.

#### How
Rewrite the regex to avoid ambiguous nested quantifiers or overlapping alternatives, and add focused tests for representative and adversarial inputs when practical. Apply the issue-specific remediation: simplify the regex to avoid super-linear backtracking.

#### Where
- File: `src/github/repository.ts`
- Line: `26`
- Sonar issue: `AZ8dpxzQI5cC3g4vWFj4`
- Rule: `typescript:S8786`
- Severity/impact: `MAJOR`; `RELIABILITY:MEDIUM`
- Tags: performance, regex

#### Acceptance criteria
- The flagged regex no longer has super-linear backtracking behavior and keeps the same intended matches.
- The code change resolves `AZ8dpxzQI5cC3g4vWFj4` without suppressing `typescript:S8786` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzQI5cC3g4vWFj4`.

### 268. Simplify backtracking regex in src/utils/slug.ts:14

- [ ] Resolve Sonar issue `AZ8dpxx8I5cC3g4vWFjU` (`typescript:S8786`) at `src/utils/slug.ts:14`: simplify the regex to avoid super-linear backtracking.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `RELIABILITY:MEDIUM`. Super-linear regex backtracking can become a reliability or denial-of-service risk on crafted input.

#### How
Rewrite the regex to avoid ambiguous nested quantifiers or overlapping alternatives, and add focused tests for representative and adversarial inputs when practical. Apply the issue-specific remediation: simplify the regex to avoid super-linear backtracking.

#### Where
- File: `src/utils/slug.ts`
- Line: `14`
- Sonar issue: `AZ8dpxx8I5cC3g4vWFjU`
- Rule: `typescript:S8786`
- Severity/impact: `MAJOR`; `RELIABILITY:MEDIUM`
- Tags: performance, regex

#### Acceptance criteria
- The flagged regex no longer has super-linear backtracking behavior and keeps the same intended matches.
- The code change resolves `AZ8dpxx8I5cC3g4vWFjU` without suppressing `typescript:S8786` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxx8I5cC3g4vWFjU`.

### 269. Simplify backtracking regex in src/utils/slug.ts:17

- [ ] Resolve Sonar issue `AZ8dpxx8I5cC3g4vWFjV` (`typescript:S8786`) at `src/utils/slug.ts:17`: simplify the regex to avoid super-linear backtracking.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `RELIABILITY:MEDIUM`. Super-linear regex backtracking can become a reliability or denial-of-service risk on crafted input.

#### How
Rewrite the regex to avoid ambiguous nested quantifiers or overlapping alternatives, and add focused tests for representative and adversarial inputs when practical. Apply the issue-specific remediation: simplify the regex to avoid super-linear backtracking.

#### Where
- File: `src/utils/slug.ts`
- Line: `17`
- Sonar issue: `AZ8dpxx8I5cC3g4vWFjV`
- Rule: `typescript:S8786`
- Severity/impact: `MAJOR`; `RELIABILITY:MEDIUM`
- Tags: performance, regex

#### Acceptance criteria
- The flagged regex no longer has super-linear backtracking behavior and keeps the same intended matches.
- The code change resolves `AZ8dpxx8I5cC3g4vWFjV` without suppressing `typescript:S8786` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxx8I5cC3g4vWFjV`.

### 270. Use RegExp.exec in src/utils/slug.ts:27

- [ ] Resolve Sonar issue `AZ8dpxx8I5cC3g4vWFjW` (`typescript:S6594`) at `src/utils/slug.ts:27`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/utils/slug.ts`
- Line: `27`
- Sonar issue: `AZ8dpxx8I5cC3g4vWFjW`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpxx8I5cC3g4vWFjW` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxx8I5cC3g4vWFjW`.

### 271. Extract nested ternary in src/utils/slug.ts:92

- [ ] Resolve Sonar issue `AZ8dpxx8I5cC3g4vWFjX` (`typescript:S3358`) at `src/utils/slug.ts:92`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/utils/slug.ts`
- Line: `92`
- Sonar issue: `AZ8dpxx8I5cC3g4vWFjX`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxx8I5cC3g4vWFjX` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxx8I5cC3g4vWFjX`.
