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

After launching, use `/autoupdate-config` to toggle **Update Pi** and **Update extensions** independently. Changes take effect on the next launch.

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
- Package checks use Pi's exported `DefaultPackageManager.checkForAvailableUpdates()` API. This API is typed and exported in Pi 0.87.1 but is not guaranteed stable across future Pi releases. This prototype targets Pi 0.87.1; verify compatibility before publishing new releases.
- Network, filesystem and update failures leave the current session open and show a warning. An update command can make partial changes before failing; restart manually if Pi reports that this happened. The restart spawns a child Pi attached to the same terminal, then shuts down the original when the child exits.
- Updates execute code from Pi and installed packages. Install only trusted sources, and consider the implications of automatic updates before enabling them.

## Development

`npm run check` runs strict TypeScript checking, Oxlint with vendored anti-slop rules, formatting verification and unit tests. `npm run format` formats owned source. CI runs the same checks. The npm tarball includes the extension and its runtime dependencies are declared in `dependencies`; Pi itself is a peer dependency. To inspect the publish contents, run `npm pack --dry-run`.

No publish command runs automatically.
