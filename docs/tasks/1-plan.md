# Plan for objective 1

Deliver issue #43. Concurrent work runs in this repository; isolation is required: prepare a linked worktree (workspace rule 1).

Each task ran as its own chain on its agent; tasks without a dependency ran in parallel.

## Task restore-typescript-6-install: Restore reproducible installs with TypeScript 6.0

Agent: devops. Depends on: none.

- `package.json`
- `package-lock.json`

- [ ] Resolve issue #43's incompatible npm dependency graph without changing typescript-eslint.

#### Why
package.json and the root of package-lock.json currently request TypeScript ~7.0.2; the lockfile resolves 7.0.2. Locked typescript-eslint 8.71.1 requires TypeScript >=4.8.4 <6.1.0. The issue reports npm ci failing with ERESOLVE, stopping both CI and SonarQube before their checks run.

#### How
Read AGENTS.md, CONTRIBUTING.md, docs/development.md, package.json, the relevant package-lock.json entries, .github/workflows/ci.yml, and .github/workflows/sonar.yml. Issue #43 has no References section; its requirements are captured here. Use the assigned isolated workspace and Node >=22.19.0, preferably 22.19.0 to match CI.

Before editing, run the documented npm ci to capture the reported failure. If its outcome differs, report the actual result and use the verified peer-range conflict to guide the fix. Change only devDependencies.typescript to ~6.0.3 in package.json, then regenerate package-lock.json through npm using the documented npm install workflow. Preserve lockfileVersion 3, typescript-eslint's ^8.62.1 declaration and its existing locked version, unrelated dependencies, and scripts. Review generated changes for unrelated drift; removal of TypeScript 7's now-unneeded optional platform packages is legitimate. Do not handcraft resolved integrity data or bypass peer-dependency enforcement.

Run npm ci and npm run validate against the regenerated graph. Run npm run test:coverage to check Sonar's local coverage prerequisite; local coverage does not prove remote SonarQube success.

#### Where
- package.json — change the TypeScript development dependency range.
- package-lock.json — regenerate the matching dependency graph.

#### Out of scope
No source, compiler configuration, ESLint configuration, workflow, documentation, or unrelated dependency changes. Do not upgrade or remove typescript-eslint. The separate Dependabot task owns .github/dependabot.yml.

#### Acceptance criteria
- Both manifests declare TypeScript ~6.0.3, and the lockfile resolves a compatible 6.0.x version satisfying that range and typescript-eslint's peer constraint.
- typescript-eslint remains unchanged; generated lockfile changes are confined to the necessary TypeScript graph adjustments.
- npm ci and npm run validate pass locally without suppressing dependency checks; npm run test:coverage produces coverage/lcov.info.
- Issue-wide completion requires passing CI and SonarQube on the PR containing both tasks. Hand off local receipts and report remote checks as unverified/pending when unavailable; do not substitute local results for PR success.

#### Dependencies
None. Can run in parallel with ignore-incompatible-typescript-updates; the two tasks change disjoint files.

## Task ignore-incompatible-typescript-updates: Prevent Dependabot from proposing unsupported TypeScript versions

Agent: devops. Depends on: none.

- `.github/dependabot.yml`

- [ ] Add issue #43's targeted Dependabot guard while retaining all existing update behavior for other dependencies.

#### Why
The issue identifies a grouped Dependabot TypeScript upgrade as the source of the install failure. typescript-eslint currently supports TypeScript >=4.8.4 <6.1.0, so restoring the manifest alone would leave the incompatible upgrade eligible to be proposed again.

#### How
Read AGENTS.md, .github/dependabot.yml, docs/development.md, package.json's format:check script, and scripts/check-format.mjs. Issue #43 has no References section; its requirements are captured here.

Within the existing npm update block for directory /, add an ignore list entry with dependency-name: typescript and versions: [">=6.1.0"]. Place ignore at the update-block level alongside groups, not inside a dependency group or the github-actions block. Retain the existing two-space YAML indentation, weekly schedules, labels, commit-message settings, pull-request limits, both npm dependency groups, and the entire github-actions configuration. The policy should continue allowing compatible 6.0.x patch proposals while excluding 6.1.0 and later versions until typescript-eslint supports them.

Run the documented npm run format:check. This script uses Node built-ins and does not require the broken dependency install to be repaired first. Review the YAML hierarchy and exact dependency/version selectors explicitly: the existing formatting checker does not validate Dependabot YAML semantics.

#### Where
- .github/dependabot.yml — add the npm TypeScript ignore entry only.

#### Out of scope
No manifest, lockfile, workflow, source, or documentation changes. Do not disable TypeScript updates entirely, ungroup dependencies, or change github-actions updates. The separate dependency-restoration task owns package.json and package-lock.json.

#### Acceptance criteria
- The npm block contains exactly the requested TypeScript ignore policy for versions >=6.1.0; compatible 6.0.x updates are not excluded by this rule.
- Existing npm groups and all unrelated settings, including the github-actions block, remain unchanged.
- npm run format:check passes, and structural review confirms valid placement of the ignore entry and its selectors.
- Report configuration inspection as the verification performed; do not claim a live Dependabot scheduling run was observed. Overall issue acceptance still requires local npm ci/validate and passing PR CI/SonarQube after the manifest task is integrated.

#### Dependencies
None. Can run in parallel with restore-typescript-6-install; do not expand this task to repair the independently owned manifests.
