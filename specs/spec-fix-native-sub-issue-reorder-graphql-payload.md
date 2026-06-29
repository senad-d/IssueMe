# Plan: Fix Native Sub-Issue Reorder GraphQL Payload

## Task Description

Investigate and fix the one failure found by the live IssueMe smoke test against real GitHub issues: `issueme_reorder_sub_issues` fails when GitHub rejects the GraphQL selection set for `reprioritizeSubIssue` with `Field 'subIssue' doesn't exist on type 'ReprioritizeSubIssuePayload'`.

Task type: fix. Complexity: medium.

## Objective

Make native sub-issue reordering work against the real GitHub GraphQL schema while preserving the existing safety model: exact child-list validation, no body-only ordering fallback, open-issue checks, sequential execution, bounded output, and cache refresh after successful remote reorder.

## Problem Statement

The live test validated issue creation, labels, assignees, comments, updates, native sub-issue creation/listing, development-link listing, bulk close, single close, sync/listing, and read-only repository metadata. The only observed tool failure was:

```text
Failed to reorder native sub-issues under #3.
Error: GitHub GraphQL native sub-issue operation IssueMeReprioritizeSubIssue is unavailable or unsupported for this repository/API.
GitHub detail: undefinedField: Field 'subIssue' doesn't exist on type 'ReprioritizeSubIssuePayload'
```

Current unit tests pass because mocked GraphQL responses model `reprioritizeSubIssue` as returning both `issue` and `subIssue`. The live GitHub schema accepts the mutation but does not expose `subIssue` on the `ReprioritizeSubIssuePayload`, so the current query is over-selecting the payload and fails before the reorder can execute.

## Solution Approach

Adjust only the reorder mutation payload handling. Keep `addSubIssue` and `removeSubIssue` behavior unchanged because the live failure is specific to `ReprioritizeSubIssuePayload`.

For reorder, request only fields that the real payload exposes, most likely `issue { id number title state url }` plus optional `clientMutationId` if needed. Build the returned `NativeSubIssueMutationResult` by combining the parent returned by GitHub with the already validated child summary from the current relationship list. The child is safe to reuse because `reorderSubIssues` already fetched current relationships and verified the requested child belongs to the parent before mutation.

## Relevant Files

- `src/github/client.ts` — owns `reorderSubIssues`, `reprioritizeSubIssue`, GraphQL selection sets, sub-issue result normalization, and unsupported-field classification.
- `src/tools/sub-issue.ts` — formats reorder results, handles structured reorder failures, and refreshes relationship cache after successful mutations.
- `test/sub-issue-tool.test.mjs` — contains the mocked native sub-issue reorder tests that currently assume `reprioritizeSubIssue.subIssue` exists.
- `test/github-client.test.mjs` — add or adjust lower-level GraphQL client coverage if useful for payload-shape regression.
- `README.md`, `SECURITY.md`, `docs/STRUCTURE.md`, `docs/PROJECT_DEFINITION_BRIEF.md` — likely no behavioral rewrite needed, but verify wording still matches the fixed implementation.
- `CHANGELOG.md` — record the live-schema compatibility fix.

## Implementation Phases

### Phase 1: Confirm and Model the Schema Mismatch

- Treat the live smoke-test error as the regression fixture: `ReprioritizeSubIssuePayload` has no `subIssue` field.
- Keep existing add/remove native sub-issue payload assumptions separate from reorder payload assumptions.
- Add tests that fail if the reorder mutation query selects `subIssue`.

### Phase 2: Core Implementation

- Change `reprioritizeSubIssue` to accept or otherwise retain the already validated `NativeSubIssueSummary` child being moved.
- Remove `subIssue { ... }` from the `reprioritizeSubIssue` GraphQL selection set.
- Add a reorder-specific normalizer that requires a valid returned parent `issue` and combines it with the known child summary.
- Keep `normalizeSubIssueMutationResult` for `addSubIssue` and `removeSubIssue`, or split normalizers clearly if that improves readability.

### Phase 3: Integration & Polish

- Update mocks to emulate the real reorder payload shape.
- Ensure unsupported-field errors still report clearly for genuinely missing `reprioritizeSubIssue` or missing native sub-issue fields, but no longer classify the absent reorder `subIssue` payload field as an unsupported native sub-issue feature after the query is corrected.
- Update release notes and run validation.

## Step by Step Tasks

### 1. Add a Regression Test for the Live Payload Shape

- In `test/sub-issue-tool.test.mjs`, change the reorder mock for `IssueMeReprioritizeSubIssue` to return:
  - `data.reprioritizeSubIssue.issue`
  - no `data.reprioritizeSubIssue.subIssue`
- Assert the GraphQL query for `IssueMeReprioritizeSubIssue` does not contain a `subIssue { ... }` selection.
- Keep the existing assertion that variables include `issueId`, `subIssueId`, and the correct `beforeId` or `afterId`.
- Preserve assertions that final relationship metadata comes from the follow-up `IssueMeListSubIssues` query, not from mutation payload child data.

### 2. Split Reorder Payload Normalization from Add/Remove Normalization

- In `src/github/client.ts`, leave `normalizeSubIssueMutationResult` focused on payloads that include both `issue` and `subIssue`.
- Add a function such as `normalizeReprioritizeSubIssueResult(data, repository, child)` that:
  - verifies `data.reprioritizeSubIssue` is an object;
  - normalizes `payload.issue` as the parent summary;
  - returns `{ parent, child }` using the known child summary passed by the caller;
  - throws `GitHubApiError` with `github_response_shape_invalid` if the parent payload is missing or incomplete.

### 3. Update `reprioritizeSubIssue` to Use the Real Selection Set

- Change the private method signature from taking only `childIssueId` to taking the child summary or both child ID and child summary.
- Use `child.id` for the `subIssueId` variable.
- Query only fields supported by the live payload, for example:

```graphql
mutation IssueMeReprioritizeSubIssue($issueId: ID!, $subIssueId: ID!, $beforeId: ID, $afterId: ID) {
  reprioritizeSubIssue(input: {issueId: $issueId, subIssueId: $subIssueId, beforeId: $beforeId, afterId: $afterId}) {
    issue { id number title state url }
  }
}
```

- Return `normalizeReprioritizeSubIssueResult(data, this.repository.fullName, child)`.

### 4. Update Reorder Call Sites

- In `reorderSubIssues`, pass the `NativeSubIssueSummary` child object into `reprioritizeSubIssue` for both first-position and after-position moves.
- Keep the current local `currentOrder` simulation and final relationship refresh unchanged.
- Verify `result.mutations.length` still reports applied mutation count correctly.

### 5. Preserve Safety and Error Semantics

- Do not add body-only fallback ordering.
- Keep `assertReorderableSubIssueList` requirements unchanged.
- Keep closed parent/child refusal unchanged.
- Keep cache refresh partial-success behavior unchanged after a successful remote reorder.
- Ensure genuine GraphQL permission and unsupported-operation errors still map to `github_sub_issue_forbidden` or `github_sub_issue_unsupported`.

### 6. Update Documentation and Release Notes

- Add a `CHANGELOG.md` fix entry for real GitHub GraphQL `ReprioritizeSubIssuePayload` compatibility.
- Review README/SECURITY wording. If no behavior changed from the user's perspective, no documentation change is required beyond the changelog.
- If wording mentions that the reorder mutation returns child payload data, update it to say IssueMe validates child membership before mutation and refreshes relationships afterward.

### 7. Validate the Fix

- Run targeted tests for native sub-issues.
- Run full validation.
- Optionally repeat the live smoke test in a separate Pi session with new temporary issues to verify `issueme_reorder_sub_issues` succeeds and cleanup still leaves zero open issues/cache files.

## Testing Strategy

- Unit/integration tests should not require live GitHub access.
- Mock GitHub GraphQL to match the live payload shape for `reprioritizeSubIssue`.
- Keep a negative assertion that the mutation query does not request `subIssue` under `reprioritizeSubIssue`.
- Keep existing tests for invalid child lists, permission failures, unsupported native sub-issue fields, cache-refresh partial success, and relationship refresh.
- Add a focused client-level test if the tool-level test does not directly protect the GraphQL query shape.

## Acceptance Criteria

- `issueme_reorder_sub_issues` no longer selects `subIssue` from `ReprioritizeSubIssuePayload`.
- Mocked reorder tests pass with a payload containing only `reprioritizeSubIssue.issue`.
- Successful reorder still refreshes relationship cache and reports final child order from `IssueMeListSubIssues`.
- Add/remove native sub-issue tools remain unchanged and tested.
- No body-only reorder fallback is introduced.
- Full validation passes.
- A live smoke retest can reorder temporary native sub-issues without the `Field 'subIssue' doesn't exist` error.

## Validation Commands

Execute these commands to validate the task is complete:

- `node --test test/sub-issue-tool.test.mjs` — targeted native sub-issue tool tests.
- `node --test test/github-client.test.mjs` — lower-level GraphQL client regression coverage if updated.
- `npm run typecheck` — TypeScript validation.
- `npm run test` — full mocked test suite.
- `npm run validate` — repository lint, tests, packaging, and smoke validation.

## Notes

- The live smoke test otherwise succeeded and cleaned up temporary issues. No existing closed issues were modified.
- The current automated suite passes, which confirms this is a live-schema coverage gap rather than an existing mocked-test failure.
- Do not rerun live mutation tests without explicit user approval because they create and close real GitHub issues.
