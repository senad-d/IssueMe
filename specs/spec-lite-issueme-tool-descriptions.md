# Plan: Lite IssueMe Tool Descriptions and Schema Token Budget

## Task Description
Reduce the prompt/context footprint of the loaded `issueme_*` tool definitions while keeping the tools useful and safe for LLM tool selection. The immediate target is the IssueMe tool descriptions and surrounding schema/guidance text that are loaded at the start of a new session.

Task type: enhancement/refactor
Complexity: medium

This plan is investigation-to-implementation guidance only. It does not require behavior changes to IssueMe GitHub operations.

## Objective
Produce a leaner IssueMe tool context by:

- shortening top-level tool descriptions,
- trimming repetitive parameter descriptions,
- centralizing shared IssueMe concepts into one compact preamble,
- preserving safety-critical signals needed for correct tool use,
- validating that all tool names, inputs, and runtime behavior remain unchanged.

## Problem Statement
The currently loaded IssueMe tool context includes 28 tools. The raw tool schemas are estimated at roughly 4.5k tokens, with additional IssueMe-specific developer guidance likely adding several thousand more tokens. Meaningful token savings are possible because many descriptions repeat the same concepts:

- current repository,
- GitHub issue,
- local IssueMe JSON/cache file,
- open issue requirements,
- read-only/listing behavior,
- native sub-issue wording,
- Projects v2 discovery workflow.

The top-level tool descriptions are not the largest token consumer, but they are the easiest first win. The larger opportunity is to compact parameter descriptions and repeated guidance while retaining enough semantic signal for safe tool selection.

## Solution Approach
Use a layered approach:

1. Add or refine one shared IssueMe preamble/glossary that applies to all IssueMe tools.
2. Replace verbose top-level descriptions with short, action-oriented descriptions.
3. Audit parameter descriptions and remove repeated phrases that the preamble already covers.
4. Keep safety-critical language where it changes tool choice or prevents destructive mistakes.
5. Add a lightweight token-budget check or documented measurement procedure so future schema changes do not silently grow startup context.

Suggested shared preamble:

> IssueMe tools operate on the current repository unless stated otherwise. “Issue” means GitHub issue. “Cache” means local IssueMe JSON. List/discovery tools are read-only unless named sync/refresh. Mutating issue tools require open issues except reopen.

Keep these safety signals even after trimming:

- read-only vs mutating behavior,
- open vs closed issue behavior,
- local cache side effects,
- native sub-issue relationships,
- destructive label/milestone delete confirmation,
- bulk updates require explicit issue numbers,
- Projects v2 mutations require discovered project/field/option IDs.

## Relevant Files
Use these files/areas to complete the task:

- `src/` — locate IssueMe tool registration, schemas, descriptions, and developer guidance source.
- `test/` — add or update schema/tool discovery tests and token-budget tests.
- `scripts/` — optional location for a token measurement helper if no suitable test utility exists.
- `README.md` / `docs/` — update only if public tool descriptions or developer guidance are documented there.
- `CHANGELOG.md` — note the context-size optimization if this project tracks user-visible changes.
- `specs/spec-lite-issueme-tool-descriptions.md` — this implementation plan.

### New Files
No new runtime files are required. Optional additions:

- `test/tool-schema-token-budget.test.mjs` — verifies the IssueMe schema prompt stays under a chosen budget.
- `scripts/measure-tool-schema-tokens.mjs` — optional helper for manual token-count reporting.

## Implementation Phases

### Phase 1: Foundation
- Locate the source of IssueMe tool definitions and any generated schema output.
- Establish a baseline token estimate for current IssueMe tool schemas and guidance.
- Confirm the exact list of 28 loaded IssueMe tools remains the target set.

### Phase 2: Core Implementation
- Introduce the compact shared preamble/glossary.
- Replace top-level tool descriptions with the lite descriptions in this spec.
- Compact parameter descriptions using consistent short phrases.
- Remove repeated wording from developer guidance while preserving workflow/safety requirements.

### Phase 3: Integration & Polish
- Add or update tests to ensure schema compatibility and behavior stability.
- Measure before/after token count and document the savings.
- Update docs/changelog if appropriate.
- Run project validation.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Locate Tool Context Sources
- Search for IssueMe tool schema registration and descriptions.
- Search for developer guidance text that mentions IssueMe workflow rules.
- Identify whether schemas are hand-written, generated, or assembled from reusable helpers.
- Do not alter runtime GitHub mutation logic as part of this task.

### 2. Establish Baseline and Budget
- Record the current list of IssueMe tools.
- Estimate current token cost for:
  - top-level descriptions,
  - parameter descriptions,
  - IssueMe-specific developer guidance.
- Set an implementation target:
  - top-level IssueMe descriptions: approximately 200–250 tokens total,
  - overall IssueMe tool/guidance context: at least 20% reduction if feasible,
  - no loss of safety-critical tool selection signal.

### 3. Add Shared IssueMe Preamble
- Add one compact shared preamble near the place where IssueMe tool guidance is loaded.
- Define shared terms once:
  - current repository,
  - issue = GitHub issue,
  - cache = local IssueMe JSON,
  - list/discovery = read-only unless sync/refresh,
  - mutating issue tools require open issues except reopen.
- Remove duplicated copies of those phrases from individual tool/parameter descriptions where safe.

### 4. Replace Top-Level Tool Descriptions
Use these lite descriptions as the target wording:

| Tool | Lite description |
|---|---|
| `issueme_sync_issues` | Sync open issues to local cache; remove stale closed issue files. |
| `issueme_list_issues` | List/search repo issues with filters; read-only summaries. |
| `issueme_list_labels` | List/search repo labels with metadata. |
| `issueme_list_milestones` | List repo milestones with state, dates, and issue counts. |
| `issueme_list_assignees` | List users assignable to repo issues. |
| `issueme_list_projects` | Discover Projects v2 boards for repo/org/user. |
| `issueme_get_project_fields` | List Projects v2 fields, options, and iterations. |
| `issueme_add_issue_to_project` | Add an open issue to a Projects v2 board. |
| `issueme_update_project_item` | Update one Projects v2 item field. |
| `issueme_manage_label` | Create, update, or delete repo labels. |
| `issueme_manage_milestone` | Create, update, close, reopen, or delete milestones. |
| `issueme_create_issue` | Create repo issue and local cache file. |
| `issueme_create_sub_issue` | Create native sub-issue under a parent issue. |
| `issueme_add_sub_issue` | Attach existing issue as native sub-issue. |
| `issueme_remove_sub_issue` | Detach native sub-issue relationship. |
| `issueme_reorder_sub_issues` | Reorder native sub-issues under a parent issue. |
| `issueme_list_sub_issues` | Inspect native parent/sub-issue relationships. |
| `issueme_list_issue_development_links` | Inspect linked PRs, branches, commits, and references. |
| `issueme_get_issue` | Read cached issue or refresh known issue. |
| `issueme_update_issue` | Update open issue fields and refresh cache. |
| `issueme_comment_issue` | Comment on open issue and refresh cache. |
| `issueme_update_comment` | Edit verified comment on open issue. |
| `issueme_delete_comment` | Delete verified comment on open issue. |
| `issueme_assign_issue` | Add, remove, or set issue assignees. |
| `issueme_label_issue` | Add, remove, or set issue labels. |
| `issueme_reopen_issue` | Reopen closed issue, optionally with comment. |
| `issueme_close_issue` | Close open issue and remove local cache. |
| `issueme_bulk_update_issues` | Apply one safe mutation to explicit issue numbers. |

### 5. Compact Parameter Descriptions
- Replace long repeated phrases with short canonical wording.
- Prefer compact fragments:
  - `Issue number.`
  - `Open issue number.`
  - `Parent issue number.`
  - `Child issue number.`
  - `Label names.`
  - `GitHub usernames.`
  - `Milestone number.`
  - `ProjectV2 node ID.`
  - `Sort field.`
  - `Sort direction.`
  - `Max results. Default 25; max 50.`
- Rely on JSON schema constraints for enum values, min/max, and required fields instead of restating them in prose unless the prose helps tool choice.
- Keep special behavioral notes only where needed, for example:
  - `confirmDelete`: `Required true to delete.`
  - `body`: `Markdown body. Empty only when intentional.`
  - `labels`: `Omit for defaults; [] for none.`
  - `continueOnError`: `Default false; true allows partial bulk failure.`

### 6. Compact Developer Guidance
- Replace one-paragraph-per-tool guidance with grouped rules:
  - Discovery before mutation when names/IDs are unknown.
  - Project updates require project, item, field, and option/iteration IDs.
  - Closed issues can only be intentionally mutated through reopen.
  - Deleting labels/milestones requires explicit user intent and confirmation.
  - Bulk updates require an explicit issue-number list.
  - Native sub-issue tools must not fall back to body-only references.
- Remove guidance that simply restates the tool description or schema.
- Preserve sequencing rules that prevent unsafe mutations.

### 7. Preserve Schema Compatibility
- Verify all 28 IssueMe tool names remain unchanged.
- Verify required fields, enum values, min/max constraints, and default behavior remain unchanged.
- Verify no GitHub API behavior, local cache behavior, or issue mutation semantics change.
- Add a snapshot or structural test if one does not already exist.

### 8. Add Token-Budget Validation
- Add a small test or script that serializes the IssueMe tool schemas/guidance in the same or closest available format used by the runtime.
- Report approximate token count before and after.
- If exact tokenizer access is unavailable, use a stable heuristic and document it.
- Fail only on large regressions, not tiny tokenizer-dependent differences.

### 9. Update Documentation and Changelog
- Update public docs only if the exposed tool list/descriptions are documented there.
- Add a changelog entry such as: “Reduced IssueMe tool context size with compact descriptions and centralized guidance; tool behavior unchanged.”

### 10. Validate the Work
- Run type checking.
- Run the test suite.
- Run packaging/content checks.
- Manually inspect a freshly started session/tool listing to confirm descriptions are concise and still useful.

## Testing Strategy
- **Schema compatibility tests:** assert all 28 IssueMe tool names still exist and input schemas are unchanged except description text.
- **Token budget test:** compare approximate prompt size against the baseline and enforce a reasonable upper bound.
- **Tool-choice regression prompts:** manually or automatically verify common requests map to the correct tools:
  - create an issue,
  - list labels before labeling,
  - add issue to Projects v2 board,
  - update a project field,
  - create/attach native sub-issues,
  - reopen a closed issue,
  - close a completed issue,
  - bulk update explicit issue numbers only.
- **Safety checks:** verify destructive label/milestone delete confirmation language remains available to the model.
- **Behavior checks:** ensure runtime IssueMe operations are not modified by this refactor.

## Acceptance Criteria
- All 28 IssueMe tools remain available with the same names.
- Tool input schemas keep the same required fields, optional fields, enums, and constraints.
- Top-level IssueMe tool descriptions use the lite wording or equivalently concise alternatives.
- Shared IssueMe concepts are centralized instead of repeated throughout descriptions.
- Parameter descriptions are materially shorter while retaining safety-critical semantics.
- A before/after token estimate is recorded, with a target reduction of at least 20% for IssueMe-specific loaded context where feasible.
- Tests and validation commands pass.
- No GitHub issue, project, label, milestone, cache, or sub-issue runtime behavior changes.

## Validation Commands
Execute these commands to validate the task is complete:

- `npm run typecheck` — verify TypeScript compiles.
- `npm test` — run the project test suite.
- `npm run smoke:discover` — run the existing discovery/observability smoke check.
- `npm run validate` — run lint, tests, and package checks together.

## Notes
- This is a prompt/schema refactor, not a GitHub behavior change.
- Exact token counts must come from API/runtime usage metadata or a tokenizer-compatible measurement script; estimates inside the model are approximate.
- If future work wants larger savings, consider conditional tool loading by capability group, but keep that out of this first implementation unless already supported by the tool framework.
