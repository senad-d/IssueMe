# IssueMe diagrams

Read the [visual workflow guide](../workflows.md) for the diagrams, text explanations, examples, and complete 47-tool map.

| Diagram | View | Edit |
| --- | --- | --- |
| How IssueMe works | [SVG](01-how-issueme-works.svg) | [draw.io](01-how-issueme-works.drawio) |
| Supported workflows | [SVG](02-supported-workflows.svg) | [draw.io](02-supported-workflows.drawio) |
| Daily issue workflow | [SVG](03-daily-issue-workflow.svg) | [draw.io](03-daily-issue-workflow.drawio) |
| Choosing relationships | [SVG](04-choosing-relationships.svg) | [draw.io](04-choosing-relationships.drawio) |
| Projects v2 workflow | [SVG](05-projects-v2-workflow.svg) | [draw.io](05-projects-v2-workflow.drawio) |
| Explicit bulk workflow | [SVG](06-explicit-bulk-workflow.svg) | [draw.io](06-explicit-bulk-workflow.drawio) |
| Results and recovery | [SVG](07-results-and-recovery.svg) | [draw.io](07-results-and-recovery.drawio) |

## Maintaining the diagrams

- Edit the native, uncompressed `.drawio` source; do not edit the exported SVG independently. SVG exports also embed the editable diagram.
- Verify behavior against `src/tools/inventory.ts`, registered handlers, `src/contracts.ts`, and relevant GitHub clients/tests. These are current-capability diagrams, not a roadmap.
- Keep tool names/counts and the guide's tool map synchronized. `test/workflow-diagrams.test.mjs` checks inventory coverage, paired assets, and package inclusion.
- Preserve readable node sizes and explicit edge routes with facing-side anchors. Spread elements and fit the canvas rather than shrinking text to make room.
- With the draw.io tools: run `drawio_validate` after each source edit; use `drawio_fit_canvas` for margin/bounds warnings and validate again. Export a `mode: preview` PNG, review it, then export the final SVG. Do not commit temporary previews.
- With the desktop CLI, regenerate an SVG after reviewing the source:

```bash
drawio --export --format svg --embed-diagram --border 10 \
  --output docs/diagrams/01-how-issueme-works.svg \
  docs/diagrams/01-how-issueme-works.drawio
```

The sources and final SVGs are intentionally included in the npm package so the packaged Markdown guide has no missing diagram assets.
