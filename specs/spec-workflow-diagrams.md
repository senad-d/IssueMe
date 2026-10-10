# IssueMe visual workflow documentation

### 1. Explain the implemented tools and supported workflows

- [x] Review the current extension and publish a user-facing visual guide with editable diagrams.

#### Why

Users need to understand which workflows IssueMe supports, how GitHub and the local cache interact, and why partial results must be reconciled before retrying.

#### How

Review registrations, handlers, shared runtime, GitHub clients, public contracts, and workflow tests. Create seven native draw.io diagrams with SVG exports, descriptive text alternatives, and a complete tool-to-workflow map. Link the guide from the README and usage guide, and include diagram assets in package contents.

#### Where

- `docs/workflows.md`
- `docs/diagrams/*.drawio`, `docs/diagrams/*.svg`, `docs/diagrams/README.md`
- `README.md`, `docs/usage.md`, `package.json`
- `test/workflow-diagrams.test.mjs`

#### Acceptance criteria

- All 47 registered tools appear exactly once in the guide's workflow-family map.
- Architecture, daily issue lifecycle, relationship distinctions, Projects v2, explicit bulk operations, and result recovery are explained without implying background automation or unimplemented Git/PR capabilities.
- GitHub state and local cache effects, closed-issue exceptions, confirmation boundaries, and retry limitations match implemented behavior.
- All seven diagrams pass structural validation with zero warnings, have fitted canvases, and have visually reviewed final exports.
- Editable sources and final SVGs are shipped; temporary previews are absent.
- Existing documentation edits are retained; no live GitHub state is changed.
- Verification passed: `npm run lint`, `npm test` (525 passing), `npm run check:pack`, and `git diff --check`.
