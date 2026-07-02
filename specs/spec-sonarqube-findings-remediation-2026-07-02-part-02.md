# Spec: SonarQube Findings Remediation Part 2 of 6

Scope: tasks 051-100 of 271 from the 2026-07-02 AnalyseMe snapshot for `senad-d_IssueMe`.

Common acceptance criteria: fix the referenced rule without suppression, preserve behavior, and confirm the issue key disappears after fresh Sonar analysis.

## Tasks

### 51. Use Array.flat in src/tools/projects.ts:340

- [x] Resolve Sonar issue `AZ8dpxvzI5cC3g4vWFhv` (`typescript:S7751`) at `src/tools/projects.ts:340`: prefer `Array#flat()` over `Array#flatMap()` when only flattening.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:MEDIUM`. `Array#flat()` expresses flatten-only operations more clearly than `flatMap()` with an identity callback.

#### How
Replace identity `flatMap()` usage with `flat()` at the equivalent depth and preserve item ordering. Apply the issue-specific remediation: prefer `Array#flat()` over `Array#flatMap()` when only flattening.

#### Where
- File: `src/tools/projects.ts`
- Line: `340`
- Sonar issue: `AZ8dpxvzI5cC3g4vWFhv`
- Rule: `typescript:S7751`
- Severity/impact: `MINOR`; `MAINTAINABILITY:MEDIUM`
- Tags: editable-source, es2019, readability

#### Acceptance criteria
- The flagged flatten-only operation uses `Array#flat()`.
- The code change resolves `AZ8dpxvzI5cC3g4vWFhv` without suppressing `typescript:S7751` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvzI5cC3g4vWFhv`.

### 52. Use Object.hasOwn in src/tools/runtime.ts:138

- [x] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFig` (`typescript:S6653`) at `src/tools/runtime.ts:138`: use `Object.hasOwn()` instead of `Object.prototype.hasOwnProperty.call()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `Object.hasOwn()` is the modern, clearer standard-library API for own-property checks.

#### How
Replace `Object.prototype.hasOwnProperty.call(object, key)` with `Object.hasOwn(object, key)` and keep null-safety intact. Apply the issue-specific remediation: use `Object.hasOwn()` instead of `Object.prototype.hasOwnProperty.call()`.

#### Where
- File: `src/tools/runtime.ts`
- Line: `138`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFig`
- Rule: `typescript:S6653`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: es2022

#### Acceptance criteria
- The flagged own-property check uses `Object.hasOwn()`.
- The code change resolves `AZ8dpxxLI5cC3g4vWFig` without suppressing `typescript:S6653` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFig`.

### 53. Rewrite negated condition in src/tools/runtime.ts:164

- [x] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFih` (`typescript:S7735`) at `src/tools/runtime.ts:164`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `164`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFih`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFih` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFih`.

### 54. Remove nested template literal in src/tools/runtime.ts:164

- [x] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFii` (`typescript:S4624`) at `src/tools/runtime.ts:164`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/tools/runtime.ts`
- Line: `164`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFii`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpxxLI5cC3g4vWFii` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFii`.

### 55. Rewrite negated condition in src/tools/runtime.ts:168

- [x] Resolve Sonar issue `AZ8dpxxLI5cC3g4vWFij` (`typescript:S7735`) at `src/tools/runtime.ts:168`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/runtime.ts`
- Line: `168`
- Sonar issue: `AZ8dpxxLI5cC3g4vWFij`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxxLI5cC3g4vWFij` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxxLI5cC3g4vWFij`.

### 56. Reduce cognitive complexity in src/tools/sync-issues.ts:29

- [x] Resolve Sonar issue `AZ8dpxwYI5cC3g4vWFiC` (`typescript:S3776`) at `src/tools/sync-issues.ts:29`: reduce cognitive complexity from 21 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 21 to 15 or less.

#### Where
- File: `src/tools/sync-issues.ts`
- Line: `29`
- Sonar issue: `AZ8dpxwYI5cC3g4vWFiC`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxwYI5cC3g4vWFiC` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwYI5cC3g4vWFiC`.

### 57. Rewrite negated condition in src/tools/sync-issues.ts:35

- [x] Resolve Sonar issue `AZ8dpxwYI5cC3g4vWFiD` (`typescript:S7735`) at `src/tools/sync-issues.ts:35`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/tools/sync-issues.ts`
- Line: `35`
- Sonar issue: `AZ8dpxwYI5cC3g4vWFiD`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxwYI5cC3g4vWFiD` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxwYI5cC3g4vWFiD`.

### 58. Use regex character class in src/utils/github-login.ts:30

- [x] Resolve Sonar issue `AZ8dpxyNI5cC3g4vWFja` (`typescript:S6035`) at `src/utils/github-login.ts:30`: replace the regex alternation with a character class.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. A character class is clearer and cheaper than alternation when matching single-character alternatives.

#### How
Replace the single-character alternation with an equivalent character class and keep the same accepted values. Apply the issue-specific remediation: replace the regex alternation with a character class.

#### Where
- File: `src/utils/github-login.ts`
- Line: `30`
- Sonar issue: `AZ8dpxyNI5cC3g4vWFja`
- Rule: `typescript:S6035`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: regex, type-dependent

#### Acceptance criteria
- The flagged regular expression uses a character class instead of single-character alternation.
- The code change resolves `AZ8dpxyNI5cC3g4vWFja` without suppressing `typescript:S6035` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyNI5cC3g4vWFja`.

### 59. Iterate iterable directly in src/github/client.ts:845

- [x] Resolve Sonar issue `AZ8dpxzHI5cC3g4vWFjx` (`typescript:S7747`) at `src/github/client.ts:845`: iterate directly with `for…of` instead of converting to an array.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Converting an iterable to an array before `for…of` creates unnecessary allocation and obscures intent.

#### How
Iterate the original iterable directly with `for…of`, preserving iteration order and loop behavior. Apply the issue-specific remediation: iterate directly with `for…of` instead of converting to an array.

#### Where
- File: `src/github/client.ts`
- Line: `845`
- Sonar issue: `AZ8dpxzHI5cC3g4vWFjx`
- Rule: `typescript:S7747`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, performance, readability

#### Acceptance criteria
- The flagged loop no longer converts the iterable to an array only for iteration.
- The code change resolves `AZ8dpxzHI5cC3g4vWFjx` without suppressing `typescript:S7747` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzHI5cC3g4vWFjx`.

### 60. Iterate iterable directly in src/github/client.ts:861

- [x] Resolve Sonar issue `AZ8dpxzHI5cC3g4vWFjy` (`typescript:S7747`) at `src/github/client.ts:861`: iterate directly with `for…of` instead of converting to an array.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Converting an iterable to an array before `for…of` creates unnecessary allocation and obscures intent.

#### How
Iterate the original iterable directly with `for…of`, preserving iteration order and loop behavior. Apply the issue-specific remediation: iterate directly with `for…of` instead of converting to an array.

#### Where
- File: `src/github/client.ts`
- Line: `861`
- Sonar issue: `AZ8dpxzHI5cC3g4vWFjy`
- Rule: `typescript:S7747`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, performance, readability

#### Acceptance criteria
- The flagged loop no longer converts the iterable to an array only for iteration.
- The code change resolves `AZ8dpxzHI5cC3g4vWFjy` without suppressing `typescript:S7747` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzHI5cC3g4vWFjy`.

### 61. Rewrite negated condition in src/issues/store.ts:320

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFk7` (`typescript:S7735`) at `src/issues/store.ts:320`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/store.ts`
- Line: `320`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFk7`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0sI5cC3g4vWFk7` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFk7`.

### 62. Rewrite negated condition in src/issues/store.ts:321

- [x] Resolve Sonar issue `AZ8dpx0sI5cC3g4vWFk8` (`typescript:S7735`) at `src/issues/store.ts:321`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/store.ts`
- Line: `321`
- Sonar issue: `AZ8dpx0sI5cC3g4vWFk8`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0sI5cC3g4vWFk8` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0sI5cC3g4vWFk8`.

### 63. Reduce cognitive complexity in src/tools/close-issue.ts:31

- [x] Resolve Sonar issue `AZ8dpxvVI5cC3g4vWFhG` (`typescript:S3776`) at `src/tools/close-issue.ts:31`: reduce cognitive complexity from 20 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 20 to 15 or less.

#### Where
- File: `src/tools/close-issue.ts`
- Line: `31`
- Sonar issue: `AZ8dpxvVI5cC3g4vWFhG`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpxvVI5cC3g4vWFhG` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxvVI5cC3g4vWFhG`.

### 64. Rewrite negated condition in src/utils/safe-read.ts:77

- [x] Resolve Sonar issue `AZ8dpxyFI5cC3g4vWFjY` (`typescript:S7735`) at `src/utils/safe-read.ts:77`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/utils/safe-read.ts`
- Line: `77`
- Sonar issue: `AZ8dpxyFI5cC3g4vWFjY`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxyFI5cC3g4vWFjY` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyFI5cC3g4vWFjY`.

### 65. Rewrite negated condition in src/utils/safe-read.ts:78

- [x] Resolve Sonar issue `AZ8dpxyFI5cC3g4vWFjZ` (`typescript:S7735`) at `src/utils/safe-read.ts:78`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/utils/safe-read.ts`
- Line: `78`
- Sonar issue: `AZ8dpxyFI5cC3g4vWFjZ`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxyFI5cC3g4vWFjZ` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyFI5cC3g4vWFjZ`.

### 66. Remove useless empty object in src/utils/validation.ts:113

- [x] Resolve Sonar issue `AZ8dpxyoI5cC3g4vWFjj` (`typescript:S7744`) at `src/utils/validation.ts:113`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/utils/validation.ts`
- Line: `113`
- Sonar issue: `AZ8dpxyoI5cC3g4vWFjj`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxyoI5cC3g4vWFjj` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyoI5cC3g4vWFjj`.

### 67. Use RegExp.exec in src/utils/validation.ts:136

- [x] Resolve Sonar issue `AZ8dpxyoI5cC3g4vWFjl` (`typescript:S6594`) at `src/utils/validation.ts:136`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/utils/validation.ts`
- Line: `136`
- Sonar issue: `AZ8dpxyoI5cC3g4vWFjl`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpxyoI5cC3g4vWFjl` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyoI5cC3g4vWFjl`.

### 68. Use RegExp.exec in src/commands/config-tui.ts:657

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkd` (`typescript:S6594`) at `src/commands/config-tui.ts:657`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `657`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkd`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkd` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkd`.

### 69. Simplify boolean conditional in src/commands/config-tui.ts:668

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFke` (`typescript:S6644`) at `src/commands/config-tui.ts:668`: remove unnecessary boolean literals in the conditional expression.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Boolean literals inside a conditional expression add noise and obscure the direct boolean expression.

#### How
Replace the conditional expression with the equivalent boolean expression while preserving truthiness semantics. Apply the issue-specific remediation: remove unnecessary boolean literals in the conditional expression.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `668`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFke`
- Rule: `typescript:S6644`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source

#### Acceptance criteria
- The flagged conditional no longer returns boolean literals unnecessarily.
- The code change resolves `AZ8dpx0VI5cC3g4vWFke` without suppressing `typescript:S6644` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFke`.

### 70. Remove useless empty object in src/tools/sub-issue.ts:647

- [x] Resolve Sonar issue `AZ8dpxtYI5cC3g4vWFhF` (`typescript:S7744`) at `src/tools/sub-issue.ts:647`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/tools/sub-issue.ts`
- Line: `647`
- Sonar issue: `AZ8dpxtYI5cC3g4vWFhF`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxtYI5cC3g4vWFhF` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxtYI5cC3g4vWFhF`.

### 71. Remove useless empty object in src/utils/validation.ts:45

- [x] Resolve Sonar issue `AZ8dpxyoI5cC3g4vWFje` (`typescript:S7744`) at `src/utils/validation.ts:45`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/utils/validation.ts`
- Line: `45`
- Sonar issue: `AZ8dpxyoI5cC3g4vWFje`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxyoI5cC3g4vWFje` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyoI5cC3g4vWFje`.

### 72. Remove useless empty object in src/utils/validation.ts:56

- [x] Resolve Sonar issue `AZ8dpxyoI5cC3g4vWFjf` (`typescript:S7744`) at `src/utils/validation.ts:56`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/utils/validation.ts`
- Line: `56`
- Sonar issue: `AZ8dpxyoI5cC3g4vWFjf`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxyoI5cC3g4vWFjf` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyoI5cC3g4vWFjf`.

### 73. Remove useless empty object in src/utils/validation.ts:79

- [x] Resolve Sonar issue `AZ8dpxyoI5cC3g4vWFjg` (`typescript:S7744`) at `src/utils/validation.ts:79`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/utils/validation.ts`
- Line: `79`
- Sonar issue: `AZ8dpxyoI5cC3g4vWFjg`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxyoI5cC3g4vWFjg` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyoI5cC3g4vWFjg`.

### 74. Remove useless empty object in src/utils/validation.ts:83

- [x] Resolve Sonar issue `AZ8dpxyoI5cC3g4vWFjh` (`typescript:S7744`) at `src/utils/validation.ts:83`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/utils/validation.ts`
- Line: `83`
- Sonar issue: `AZ8dpxyoI5cC3g4vWFjh`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxyoI5cC3g4vWFjh` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyoI5cC3g4vWFjh`.

### 75. Use regex character class in src/utils/validation.ts:102

- [x] Resolve Sonar issue `AZ8dpxyoI5cC3g4vWFji` (`typescript:S6035`) at `src/utils/validation.ts:102`: replace the regex alternation with a character class.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. A character class is clearer and cheaper than alternation when matching single-character alternatives.

#### How
Replace the single-character alternation with an equivalent character class and keep the same accepted values. Apply the issue-specific remediation: replace the regex alternation with a character class.

#### Where
- File: `src/utils/validation.ts`
- Line: `102`
- Sonar issue: `AZ8dpxyoI5cC3g4vWFji`
- Rule: `typescript:S6035`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: regex, type-dependent

#### Acceptance criteria
- The flagged regular expression uses a character class instead of single-character alternation.
- The code change resolves `AZ8dpxyoI5cC3g4vWFji` without suppressing `typescript:S6035` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyoI5cC3g4vWFji`.

### 76. Remove useless empty object in src/utils/validation.ts:121

- [x] Resolve Sonar issue `AZ8dpxyoI5cC3g4vWFjk` (`typescript:S7744`) at `src/utils/validation.ts:121`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/utils/validation.ts`
- Line: `121`
- Sonar issue: `AZ8dpxyoI5cC3g4vWFjk`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpxyoI5cC3g4vWFjk` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxyoI5cC3g4vWFjk`.

### 77. Batch Array.push calls in src/commands/config-tui.ts:224

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkW` (`typescript:S7778`) at `src/commands/config-tui.ts:224`: avoid multiple `Array#push()` calls.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Repeated adjacent `Array#push()` calls are noisier than pushing multiple values together.

#### How
Combine adjacent pushes into one `push(a, b, ...)` call or construct the array with all values at once. Apply the issue-specific remediation: avoid multiple `Array#push()` calls.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `224`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkW`
- Rule: `typescript:S7778`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, performance, readability, type-dependent

#### Acceptance criteria
- The flagged adjacent `Array#push()` calls are combined or otherwise simplified.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkW` without suppressing `typescript:S7778` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkW`.

### 78. Batch Array.push calls in src/commands/config-tui.ts:225

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkX` (`typescript:S7778`) at `src/commands/config-tui.ts:225`: avoid multiple `Array#push()` calls.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Repeated adjacent `Array#push()` calls are noisier than pushing multiple values together.

#### How
Combine adjacent pushes into one `push(a, b, ...)` call or construct the array with all values at once. Apply the issue-specific remediation: avoid multiple `Array#push()` calls.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `225`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkX`
- Rule: `typescript:S7778`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, performance, readability, type-dependent

#### Acceptance criteria
- The flagged adjacent `Array#push()` calls are combined or otherwise simplified.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkX` without suppressing `typescript:S7778` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkX`.

### 79. Batch Array.push calls in src/commands/config-tui.ts:241

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkY` (`typescript:S7778`) at `src/commands/config-tui.ts:241`: avoid multiple `Array#push()` calls.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Repeated adjacent `Array#push()` calls are noisier than pushing multiple values together.

#### How
Combine adjacent pushes into one `push(a, b, ...)` call or construct the array with all values at once. Apply the issue-specific remediation: avoid multiple `Array#push()` calls.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `241`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkY`
- Rule: `typescript:S7778`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, performance, readability, type-dependent

#### Acceptance criteria
- The flagged adjacent `Array#push()` calls are combined or otherwise simplified.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkY` without suppressing `typescript:S7778` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkY`.

### 80. Batch Array.push calls in src/commands/config-tui.ts:242

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkZ` (`typescript:S7778`) at `src/commands/config-tui.ts:242`: avoid multiple `Array#push()` calls.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Repeated adjacent `Array#push()` calls are noisier than pushing multiple values together.

#### How
Combine adjacent pushes into one `push(a, b, ...)` call or construct the array with all values at once. Apply the issue-specific remediation: avoid multiple `Array#push()` calls.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `242`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkZ`
- Rule: `typescript:S7778`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, performance, readability, type-dependent

#### Acceptance criteria
- The flagged adjacent `Array#push()` calls are combined or otherwise simplified.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkZ` without suppressing `typescript:S7778` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkZ`.

### 81. Remove nested template literal in src/commands/config-tui.ts:351

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkb` (`typescript:S4624`) at `src/commands/config-tui.ts:351`: refactor the nested template literal.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested template literals make output formatting harder to inspect and increase the chance of subtle string regressions.

#### How
Compute the nested string fragment in a named variable or helper, then interpolate only the final value. Apply the issue-specific remediation: refactor the nested template literal.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `351`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkb`
- Rule: `typescript:S4624`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: brain-overload, confusing, editable-source, es2015

#### Acceptance criteria
- The flagged template literal no longer nests another template literal.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkb` without suppressing `typescript:S4624` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkb`.

### 82. Replace flag-driven behavior in src/commands/config-tui.ts:544

- [x] Resolve Sonar issue `AZ8dpx0VI5cC3g4vWFkc` (`typescript:S2301`) at `src/commands/config-tui.ts:544`: provide separate methods instead of using `active` to determine behavior.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Flag-driven methods make control flow harder to understand and evolve because one parameter selects multiple behaviors.

#### How
Split the active/inactive behavior into clearer methods or data-driven branches with explicit names, preserving the public API and UI behavior. Apply the issue-specific remediation: provide separate methods instead of using `active` to determine behavior.

#### Where
- File: `src/commands/config-tui.ts`
- Line: `544`
- Sonar issue: `AZ8dpx0VI5cC3g4vWFkc`
- Rule: `typescript:S2301`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: design, editable-source, type-dependent

#### Acceptance criteria
- The flagged method no longer uses a boolean or state flag as the main action selector.
- The code change resolves `AZ8dpx0VI5cC3g4vWFkc` without suppressing `typescript:S2301` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0VI5cC3g4vWFkc`.

### 83. Extract nested ternary in src/commands/issueme-command.ts:130

- [x] Resolve Sonar issue `AZ8dpx0KI5cC3g4vWFkT` (`typescript:S3358`) at `src/commands/issueme-command.ts:130`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/commands/issueme-command.ts`
- Line: `130`
- Sonar issue: `AZ8dpx0KI5cC3g4vWFkT`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpx0KI5cC3g4vWFkT` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0KI5cC3g4vWFkT`.

### 84. Reduce cognitive complexity in src/commands/issueme-command.ts:304

- [x] Resolve Sonar issue `AZ8dpx0KI5cC3g4vWFkU` (`typescript:S3776`) at `src/commands/issueme-command.ts:304`: reduce cognitive complexity from 16 to 15 or less.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `CRITICAL` and impact `MAINTAINABILITY:HIGH`. High cognitive complexity makes the function harder to review, test, and safely modify.

#### How
Extract focused top-level helper functions, use guard clauses, flatten control flow, and keep behavior identical. Follow the project guideline to avoid nesting functions. Apply the issue-specific remediation: reduce cognitive complexity from 16 to 15 or less.

#### Where
- File: `src/commands/issueme-command.ts`
- Line: `304`
- Sonar issue: `AZ8dpx0KI5cC3g4vWFkU`
- Rule: `typescript:S3776`
- Severity/impact: `CRITICAL`; `MAINTAINABILITY:HIGH`
- Tags: brain-overload, editable-source

#### Acceptance criteria
- The flagged function has cognitive complexity 15 or lower.
- The code change resolves `AZ8dpx0KI5cC3g4vWFkU` without suppressing `typescript:S3776` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0KI5cC3g4vWFkU`.

### 85. Use regex character class in src/config/config.ts:210

- [x] Resolve Sonar issue `AZ8dpx0AI5cC3g4vWFkQ` (`typescript:S6035`) at `src/config/config.ts:210`: replace the regex alternation with a character class.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. A character class is clearer and cheaper than alternation when matching single-character alternatives.

#### How
Replace the single-character alternation with an equivalent character class and keep the same accepted values. Apply the issue-specific remediation: replace the regex alternation with a character class.

#### Where
- File: `src/config/config.ts`
- Line: `210`
- Sonar issue: `AZ8dpx0AI5cC3g4vWFkQ`
- Rule: `typescript:S6035`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: regex, type-dependent

#### Acceptance criteria
- The flagged regular expression uses a character class instead of single-character alternation.
- The code change resolves `AZ8dpx0AI5cC3g4vWFkQ` without suppressing `typescript:S6035` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0AI5cC3g4vWFkQ`.

### 86. Remove useless empty object in src/errors.ts:423

- [x] Resolve Sonar issue `AZ8dpx03I5cC3g4vWFlH` (`typescript:S7744`) at `src/errors.ts:423`: remove the useless empty object.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Spreading or returning an empty object in this context has no effect and adds visual noise.

#### How
Remove the useless `{}` branch or restructure the object construction so only meaningful properties are included. Apply the issue-specific remediation: remove the useless empty object.

#### Where
- File: `src/errors.ts`
- Line: `423`
- Sonar issue: `AZ8dpx03I5cC3g4vWFlH`
- Rule: `typescript:S7744`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, spread-operator, unnecessary

#### Acceptance criteria
- The flagged empty object is removed without changing the resulting object shape.
- The code change resolves `AZ8dpx03I5cC3g4vWFlH` without suppressing `typescript:S7744` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx03I5cC3g4vWFlH`.

### 87. Use concise regex class in src/errors.ts:458

- [x] Resolve Sonar issue `AZ8dpx03I5cC3g4vWFlI` (`typescript:S6353`) at `src/errors.ts:458`: use concise `\w` character class syntax.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Concise character class syntax improves regex readability without changing behavior.

#### How
Replace `[A-Za-z0-9_]` with an equivalent concise class such as `\w` where the semantics remain correct. Apply the issue-specific remediation: use concise `\w` character class syntax.

#### Where
- File: `src/errors.ts`
- Line: `458`
- Sonar issue: `AZ8dpx03I5cC3g4vWFlI`
- Rule: `typescript:S6353`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged regular expression uses concise character class syntax.
- The code change resolves `AZ8dpx03I5cC3g4vWFlI` without suppressing `typescript:S6353` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx03I5cC3g4vWFlI`.

### 88. Use concise regex class in src/errors.ts:459

- [x] Resolve Sonar issue `AZ8dpx03I5cC3g4vWFlJ` (`typescript:S6353`) at `src/errors.ts:459`: use concise `\w` character class syntax.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Concise character class syntax improves regex readability without changing behavior.

#### How
Replace `[A-Za-z0-9_]` with an equivalent concise class such as `\w` where the semantics remain correct. Apply the issue-specific remediation: use concise `\w` character class syntax.

#### Where
- File: `src/errors.ts`
- Line: `459`
- Sonar issue: `AZ8dpx03I5cC3g4vWFlJ`
- Rule: `typescript:S6353`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged regular expression uses concise character class syntax.
- The code change resolves `AZ8dpx03I5cC3g4vWFlJ` without suppressing `typescript:S6353` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx03I5cC3g4vWFlJ`.

### 89. Rewrite negated condition in src/github/client.ts:253

- [x] Resolve Sonar issue `AZ8dpxzHI5cC3g4vWFjt` (`typescript:S7735`) at `src/github/client.ts:253`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/github/client.ts`
- Line: `253`
- Sonar issue: `AZ8dpxzHI5cC3g4vWFjt`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxzHI5cC3g4vWFjt` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzHI5cC3g4vWFjt`.

### 90. Rewrite negated condition in src/github/client.ts:254

- [x] Resolve Sonar issue `AZ8dpxzHI5cC3g4vWFju` (`typescript:S7735`) at `src/github/client.ts:254`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/github/client.ts`
- Line: `254`
- Sonar issue: `AZ8dpxzHI5cC3g4vWFju`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxzHI5cC3g4vWFju` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzHI5cC3g4vWFju`.

### 91. Extract nested ternary in src/github/client.ts:353

- [x] Resolve Sonar issue `AZ8dpxzHI5cC3g4vWFjv` (`typescript:S3358`) at `src/github/client.ts:353`: extract the nested ternary into independent statements.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `MAINTAINABILITY:MEDIUM`. Nested ternaries are difficult to read and easy to change incorrectly during later maintenance.

#### How
Replace the nested conditional expression with named intermediate variables, guard clauses, or a small explicit if/else block. Apply the issue-specific remediation: extract the nested ternary into independent statements.

#### Where
- File: `src/github/client.ts`
- Line: `353`
- Sonar issue: `AZ8dpxzHI5cC3g4vWFjv`
- Rule: `typescript:S3358`
- Severity/impact: `MAJOR`; `MAINTAINABILITY:MEDIUM`
- Tags: confusing, editable-source

#### Acceptance criteria
- The flagged expression no longer contains a nested ternary.
- The code change resolves `AZ8dpxzHI5cC3g4vWFjv` without suppressing `typescript:S3358` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzHI5cC3g4vWFjv`.

### 92. Rewrite negated condition in src/github/client.ts:944

- [x] Resolve Sonar issue `AZ8dpxzHI5cC3g4vWFj0` (`typescript:S7735`) at `src/github/client.ts:944`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/github/client.ts`
- Line: `944`
- Sonar issue: `AZ8dpxzHI5cC3g4vWFj0`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxzHI5cC3g4vWFj0` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzHI5cC3g4vWFj0`.

### 93. Rewrite negated condition in src/github/client.ts:945

- [x] Resolve Sonar issue `AZ8dpxzHI5cC3g4vWFj1` (`typescript:S7735`) at `src/github/client.ts:945`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/github/client.ts`
- Line: `945`
- Sonar issue: `AZ8dpxzHI5cC3g4vWFj1`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpxzHI5cC3g4vWFj1` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzHI5cC3g4vWFj1`.

### 94. Use RegExp.exec in src/github/repository.ts:133

- [x] Resolve Sonar issue `AZ8dpxzQI5cC3g4vWFj5` (`typescript:S6594`) at `src/github/repository.ts:133`: use `RegExp.exec()` instead of `String#match()`.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. `RegExp.exec()` makes regex extraction intent explicit and avoids ambiguous `String#match()` behavior.

#### How
Move the regex to an expression or constant as needed, call `regex.exec(value)`, and keep all capture-group handling equivalent. Apply the issue-specific remediation: use `RegExp.exec()` instead of `String#match()`.

#### Where
- File: `src/github/repository.ts`
- Line: `133`
- Sonar issue: `AZ8dpxzQI5cC3g4vWFj5`
- Rule: `typescript:S6594`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, regex, type-dependent

#### Acceptance criteria
- The flagged code uses `RegExp.exec()` instead of `String#match()`.
- The code change resolves `AZ8dpxzQI5cC3g4vWFj5` without suppressing `typescript:S6594` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzQI5cC3g4vWFj5`.

### 95. Simplify backtracking regex in src/github/repository.ts:144

- [x] Resolve Sonar issue `AZ8dpxzQI5cC3g4vWFj6` (`typescript:S8786`) at `src/github/repository.ts:144`: simplify the regex to avoid super-linear backtracking.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MAJOR` and impact `RELIABILITY:MEDIUM`. Super-linear regex backtracking can become a reliability or denial-of-service risk on crafted input.

#### How
Rewrite the regex to avoid ambiguous nested quantifiers or overlapping alternatives, and add focused tests for representative and adversarial inputs when practical. Apply the issue-specific remediation: simplify the regex to avoid super-linear backtracking.

#### Where
- File: `src/github/repository.ts`
- Line: `144`
- Sonar issue: `AZ8dpxzQI5cC3g4vWFj6`
- Rule: `typescript:S8786`
- Severity/impact: `MAJOR`; `RELIABILITY:MEDIUM`
- Tags: performance, regex

#### Acceptance criteria
- The flagged regex no longer has super-linear backtracking behavior and keeps the same intended matches.
- The code change resolves `AZ8dpxzQI5cC3g4vWFj6` without suppressing `typescript:S8786` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpxzQI5cC3g4vWFj6`.

### 96. Rewrite negated condition in src/issues/format.ts:68

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkk` (`typescript:S7735`) at `src/issues/format.ts:68`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `68`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkk`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkk` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkk`.

### 97. Rewrite negated condition in src/issues/format.ts:69

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkl` (`typescript:S7735`) at `src/issues/format.ts:69`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `69`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkl`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkl` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkl`.

### 98. Rewrite negated condition in src/issues/format.ts:70

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkm` (`typescript:S7735`) at `src/issues/format.ts:70`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `70`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkm`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkm` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkm`.

### 99. Rewrite negated condition in src/issues/format.ts:98

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFkn` (`typescript:S7735`) at `src/issues/format.ts:98`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `98`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFkn`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFkn` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFkn`.

### 100. Rewrite negated condition in src/issues/format.ts:99

- [x] Resolve Sonar issue `AZ8dpx0gI5cC3g4vWFko` (`typescript:S7735`) at `src/issues/format.ts:99`: rewrite the unexpected negated condition.

#### Why
Sonar reports this as a `CODE_SMELL` with severity `MINOR` and impact `MAINTAINABILITY:LOW`. Unexpected negated conditions make branching harder to follow and can hide the main success path.

#### How
Invert the branch or reorder the conditional so the positive condition is handled first, preserving the same returned values and side effects. Apply the issue-specific remediation: rewrite the unexpected negated condition.

#### Where
- File: `src/issues/format.ts`
- Line: `99`
- Sonar issue: `AZ8dpx0gI5cC3g4vWFko`
- Rule: `typescript:S7735`
- Severity/impact: `MINOR`; `MAINTAINABILITY:LOW`
- Tags: editable-source, readability

#### Acceptance criteria
- The flagged branch no longer uses an unexpected negated condition.
- The code change resolves `AZ8dpx0gI5cC3g4vWFko` without suppressing `typescript:S7735` or changing the issue status manually.
- Public IssueMe behavior remains unchanged; add or update focused tests for behavior-affecting refactors.
- Local validation passes, and a fresh Sonar analysis no longer lists `AZ8dpx0gI5cC3g4vWFko`.
