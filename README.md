# pi-autoupdate

Automatically check for and install Pi and Pi-managed package updates when an interactive Pi session starts. If an update is installed, Pi restarts into the same session. Both update targets are enabled by default.

> Prototype: test locally before using with your everyday Pi installation. Installing this package permits it to run update commands on your behalf at startup.

## Try locally

```sh
npm ci --ignore-scripts
npm run check
pi --extension ./index.ts
```

For an installed copy instead of one-run testing:

```sh
pi install ./                         # local package; no npm publication required
# Once published: pi install npm:pi-autoupdate
```

### See what changed

When updates are detected, a themed **AUTO-UPDATE** panel names Pi and each package, shows installation and verification progress, and marks each result with a green **✓** or red **✗**. Pi's executable version is checked against the expected release; packages must show an increased installed npm version or a changed Git commit. A successful command alone is not considered proof of an update.

Once everything is verified, the panel announces a restart in the current session. After a brief pause, the terminal screen and scrollback are cleared before launching the replacement Pi. The replacement shows a one-time completion notification with its running Pi version, rather than stacking two startup screens. The progress panel is removed before restart and on failure; completed reports do not stay pinned near the editor. Explicit `--extension`/`-e` files are forwarded to the replacement.

Use `/autoupdate-report` to open a dismissible dialog showing the most recent attempted update, including names, before/after versions or commits, timestamp, working directory and failures. Press **Esc** or **Enter** to close it, or **↑/↓** to scroll longer reports. It does not check for or install updates. The report is saved at `<agent-dir>/autoupdate-last-run.json` (normally `~/.pi/agent/autoupdate-last-run.json`), so it remains available after restart. No report is written for a startup with no pending updates. Old runs made before this reporting feature cannot be reconstructed.

For a quick check outside Pi, run `pi --version` to inspect the installed Pi executable and `pi list` to locate configured package installations. Packages can contain extensions, skills, prompts or themes; “package updated” does not necessarily mean an extension changed.

### Configuration

After launching, use `/autoupdate-config` to toggle **Update Pi automatically when a new release is available** and **Update all Pi extensions automatically when a new release is available** independently. Changes take effect on the next launch.

Alternatively, edit `<agent-dir>/autoupdate.json` (normally `~/.pi/agent/autoupdate.json`):

```json
{
  "updatePi": true,
  "updateExtensions": true
}
```

The agent directory respects `PI_CODING_AGENT_DIR`. Missing properties default to `true`; unknown keys, non-boolean values and malformed JSON **prevent automatic updates** until corrected. The command writes this file on the first change. Manual edits take effect on the next launch (no `/reload` required).

## Behavior and limitations

- On an interactive startup, check the enabled targets, use Pi's native `pi update` command when updates are pending, then restart into the current saved session (or `--no-session`). No update means no restart. A restart marker skips the next automatic check to avoid loops.
- Honors `PI_OFFLINE` and `PI_SKIP_VERSION_CHECK`. Skips automatic updates in print, JSON and RPC modes to keep those process interfaces stable, and on session switches or `/reload`.
- Only **Pi-managed installed packages** can be updated. Manually copied extension files, pinned package versions/git refs and local sources are not upgraded by Pi's package updater. Some standalone installations require a manual Pi self-update.
- Package checks use Pi's exported `DefaultPackageManager.checkForAvailableUpdates()` API. This API is typed and exported in Pi 0.87.1 but is not guaranteed stable across future Pi releases. This prototype is tested against Pi 0.99.1; verify compatibility before publishing new releases.
- Network, filesystem, update and verification failures leave the current session open and show a warning or error notification with details available through `/autoupdate-report`. An update command can make partial changes before failing; restart manually if Pi reports that this happened. The restart spawns a child Pi attached to the same terminal, then shuts down the original when the child exits.
- Updates execute code from Pi and installed packages. Install only trusted sources, and consider the implications of automatic updates before enabling them.

## Development

`npm run check` runs strict TypeScript checking, Oxlint with vendored anti-slop rules, formatting verification and unit tests. `npm run format` formats owned source. CI runs the same checks. The npm tarball includes the extension and its runtime dependencies are declared in `dependencies`; Pi itself is a peer dependency. To inspect the publish contents, run `npm pack --dry-run`.

### Ad-hoc TUI end-to-end tests

```sh
npm run test:tui
```

Requires **macOS or Linux**, **Python 3** (`python3` on PATH), and the installed development dependencies. The suite launches real Pi in a pseudo-terminal and interprets its rendered screen using `@xterm/headless`; it does not need a provider login or API key. It typically takes around 20 seconds.

Coverage includes:
- Report dialog borders, padding, half-width centering, scrolling, resizing, Esc/Enter/Ctrl+C dismissal and restored editor input.
- One-time post-restart feedback and report availability without a persistent progress widget.
- Simulated update-command failure, timeout, installed-version verification failure and restart failure.
- Failed report persistence, unavailable version service, malformed configuration, malformed reports and missing reports.

Each launch uses a temporary agent directory and working directory, disables resource discovery, and loads a test-only adapter around the real extension. HTTP fetches, update commands and the failed-restart boundary are intercepted. **No updates are installed and no real restart is performed.** Timeout results are simulated, not delayed for five minutes. Temporary directories and child processes are cleaned up, including after test failures; timeout diagnostics include the rendered terminal screen.

These tests live under `test/tui/` and run **only when explicitly invoked**. They are excluded from `npm test`, `npm run check`, and CI execution. Normal typechecking, linting and formatting still cover their TypeScript sources.

No publish command runs automatically.
