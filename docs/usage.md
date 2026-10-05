# Advanced usage

[← Quick start](../README.md)

## Settings files

Settings live in `~/.pi/agent/autoupdate.json`. If you set `PI_CODING_AGENT_DIR`, they live in that directory instead.

To disable updates before your first launch, create this file:

```json
{
  "updatePi": false,
  "updateExtensions": false
}
```

Set either value to `true` to enable that target. Both default to `true`; no file is required. Missing keys use their defaults. Only these keys and boolean values are accepted. Invalid settings stop automatic updates and show a warning.

`/autoupdate-config` saves each change immediately. File edits and UI changes take effect on the next launch; `/reload` is not needed. Escape closes the menu, but does not undo saved changes.

“Update extensions” covers every Pi-managed package, including skills, prompts, and themes. A package update does not necessarily mean an extension changed.

## When updates run

Checks run only when an interactive Pi session starts—not in print, JSON, or RPC mode, on `/reload`, or when switching sessions. Setting `PI_OFFLINE` or `PI_SKIP_VERSION_CHECK` skips checks.

The extension uses `pi update` for the enabled targets. Local sources, manually copied files, pinned npm versions, and pinned Git refs are not upgraded. Some standalone Pi installations need a manual Pi update.

To review changes yourself before installing them, disable automatic updates and use Pi's update commands manually.

## Verification and restart

Updates are checked after installation: Pi must match the expected release, and packages must have a newer npm version or a changed Git commit.

After verification succeeds, Pi restarts in the current saved session, or preserves `--no-session`. The restarted process skips one check to avoid a restart loop. Files passed through `--extension` or `-e` are passed to the new process.

Restart clears the terminal screen and scrollback. The new process shows a one-time completion notification. The progress panel disappears before restart or on failure.

## Troubleshooting

Run `/autoupdate-report` for the last attempted update, including failures. Reports survive restart and are saved at `<agent-dir>/autoupdate-last-run.json`.

No new report is written when no updates are pending, so an existing report may describe an earlier run. Updates made before report support cannot be reconstructed.

Network, file, installation, or verification errors leave Pi open. An update can partly complete before failing: restart manually to load any installed changes. If automatic restart fails after verification, restart Pi yourself.

Outside Pi, use:

```sh
pi --version # Installed Pi executable version
pi list      # Configured packages and installation locations
```

## Install from GitHub

```sh
pi install git:github.com/saiyajosh/pi-autoupdate
```

For a persistent local installation, run `pi install ./` from the repository. Local sources are not automatically upgraded.
