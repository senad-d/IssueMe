# Pi lifecycle verification

IssueMe command and configuration behavior is verified at two levels:

1. automated real Pi RPC lifecycle smoke for command discovery and non-TUI mode guards;
2. documented manual interactive TUI verification for terminal-only `ctx.ui.custom()` behavior.

## Automated RPC smoke

Run:

```bash
npm run smoke:pi-lifecycle
```

The smoke creates a temporary trusted GitHub-like project, starts Pi with the IssueMe checkout as the only extension, and drives real Pi RPC commands:

```bash
pi --mode rpc --no-session --no-extensions -e <checkout> --offline --approve --no-skills --no-prompt-templates --no-themes --no-context-files
```

It verifies:

- `/issueme` is discoverable through Pi `get_commands`;
- `/issueme info` emits the safe IssueMe help/status message;
- `/issueme` in RPC mode returns the non-interactive config fallback instead of calling `ctx.ui.custom()`;
- `/issueme start` without a configured default skill path emits guidance without starting an agent turn;
- no `extension_ui_request` is emitted for direct/custom TUI;
- `GH_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_REPOSITORY` are scrubbed;
- `PI_OFFLINE=1` is set;
- no project `.env` is used or created;
- `.pi/agent/issueme.json` is not written by the RPC fallback;
- no live GitHub call or remote mutation is made.

Use `npm run smoke:pi-lifecycle -- --json` for a machine-readable report, or `-- --keep-temp` to keep the temporary project for local inspection.

## Interactive TUI blocker and manual evidence

Pi RPC documents `ctx.ui.custom()` as unavailable in RPC mode, and IssueMe intentionally guards the configuration component with `ctx.mode === "tui"`. Real config editing, invalid-input rendering, terminal key decoding, save, and close behavior therefore require an interactive TTY. Until Pi exposes a stable headless TUI driver for CI, pseudo-terminal key automation is treated as a manual verification step because escape sequences and redraw timing vary by terminal.

Manual check:

1. Create a disposable project with GitHub-looking metadata and no secrets.
2. From that project, launch IssueMe as the only extension:

   ```bash
   PI_OFFLINE=1 PI_TUI_WRITE_LOG=/tmp/issueme-tui.log env -u GH_TOKEN -u GITHUB_TOKEN -u GITHUB_REPOSITORY pi --no-extensions -e /absolute/path/to/issueme --offline --approve --no-skills --no-prompt-templates --no-themes --no-context-files
   ```

3. Run `/issueme info` and confirm it reports project trust, repository status, `Token: missing`, `.pi/agent/issueme.json`, and registered `issueme_*` tools without exposing environment values.
4. Run `/issueme` and confirm the configuration TUI opens.
5. Edit **Issue directory** to a safe value such as `manual-issues`, press Enter, then exit with `Esc` or `q`; confirm `.pi/agent/issueme.json` contains only non-secret settings.
6. Reopen `/issueme`, try an invalid value such as `../bad`, and confirm validation is shown without saving the invalid config.
7. Run `/issueme start` without a configured default skill path and confirm it displays guidance instead of exposing local absolute paths.
8. Inspect `/tmp/issueme-tui.log` only for lifecycle evidence; do not commit it. It must not contain `GH_TOKEN`, `GITHUB_TOKEN`, `github_pat_`, or private issue data.

This manual check covers the real TUI mode while `npm run smoke:pi-lifecycle` covers at least one non-TUI mode through Pi RPC.
