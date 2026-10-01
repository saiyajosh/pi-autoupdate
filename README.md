# pi-autoupdate

Keep Pi and your installed Pi packages up to date automatically. This extension checks for updates when you start an interactive Pi session, installs available updates, and restarts Pi into the same saved session. If nothing needs updating, your session continues without a restart.

> This is a prototype targeting **Pi 0.87.1**. It runs update commands on your behalf, so use it only with Pi packages you trust. Automatic updates for both Pi and installed packages are enabled by default.

## Install and use

Install from this repository:

```sh
pi install git:github.com/saiyajosh/pi-autoupdate
```

Start Pi normally. Updates are checked at startup; there is no extra command to run.

Use `/autoupdate-config` in Pi to toggle either setting:

- **Update Pi** — keep Pi itself up to date.
- **Update extensions** — keep Pi-managed installed packages up to date.

Changes apply the next time you launch Pi. Turn both settings off to disable automatic updates.

## Configuration

Settings are saved in `~/.pi/agent/autoupdate.json`. If you use `PI_CODING_AGENT_DIR`, the file lives in that agent directory instead. `/autoupdate-config` creates the file when you first change a setting; you can also create or edit it yourself:

```json
{
  "updatePi": true,
  "updateExtensions": true
}
```

No config file is required: both settings default to `true`, including any omitted properties. To disable updates before your first launch, create this file with both values set to `false`.

Only these two keys and boolean values are accepted. Invalid JSON, unknown keys, or other value types stop automatic updates and produce a warning until you fix the file. Manual edits apply on the next launch; you do not need to run `/reload`.

## What gets updated—and when

- **Interactive startup only.** Checks do not run in print, JSON, or RPC mode, when switching sessions, or on `/reload`. Setting `PI_OFFLINE` or `PI_SKIP_VERSION_CHECK` also skips automatic updates.
- **Pi-managed packages only.** The “Update extensions” setting covers installed Pi packages, not just extension files. Manually copied files, pinned package versions or Git refs, and local sources are not upgraded by Pi's package updater.
- **Pi's own updater does the work.** The extension uses `pi update` for the enabled targets. Some standalone Pi installations cannot update themselves automatically; follow Pi's manual update guidance if you see a warning.
- **A restart happens after a successful update.** Pi resumes the current saved session, or preserves `--no-session`. The restarted process skips one automatic check to prevent a restart loop.
- **Failures leave your session open.** Network, filesystem, or update errors produce a warning. An update can partially complete before failing; if Pi reports that, restart manually to load any changes.

Updates run code from Pi and your installed packages. If you prefer to review changes before installing them, disable automatic updates and update manually.

## Run from source

You need **Node >=22.19.0**, **pnpm 12.8.1** (pinned in `package.json`), and Pi. See [pnpm installation](https://pnpm.io/installation) if needed.

```sh
git clone https://github.com/saiyajosh/pi-autoupdate.git
cd pi-autoupdate
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pi --extension ./index.ts
```

The last command loads the extension for that launch only. It uses your normal Pi configuration and can perform real updates; disable both settings first if you only want to inspect the configuration UI.

To try it without changing your everyday agent configuration, use a separate agent directory with updates disabled:

```sh
DEMO_AGENT_DIR="$(mktemp -d)"
printf '%s\n' '{"updatePi":false,"updateExtensions":false}' > "$DEMO_AGENT_DIR/autoupdate.json"
PI_CODING_AGENT_DIR="$DEMO_AGENT_DIR" pi --extension ./index.ts
```

For a persistent local installation, run `pi install ./` from the repository. Local sources are not automatically upgraded by Pi's package updater.

### Source layout and checks

- `index.ts` registers the startup handler and `/autoupdate-config` command.
- `src/config.ts` reads, validates, and saves settings.
- `src/updates.ts` checks available versions and selects update targets.
- `src/restart.ts` restarts Pi into the current session.
- `test/` covers configuration, update selection, restart arguments, extension loading, and release packaging.

There is no compilation step: Pi loads the TypeScript extension directly. The release tarball contains the extension sources, README, license, and manifest. Runtime dependencies are included in the manifest; Pi is supplied by the host. Tests, development tools, and lockfiles are not shipped.

`pnpm run check` runs TypeScript checking, Oxlint with vendored anti-slop rules, formatting verification, and tests. The package smoke test packs the actual release tarball, checks its contents, installs its production dependencies offline using the repository lockfile, and verifies that Pi loads the extracted extension. It requires `tar` on your PATH (available on macOS and Linux).

Use `pnpm run format` to format source and tests, and `pnpm run pack:check` to inspect release contents.

## Contributing

Bug reports and focused pull requests are welcome. For a bug report, include your Pi version, installation method, operating system, relevant settings, and steps to reproduce. Remove credentials and private session data from logs.

For a code change:

1. Fork the repository and create a branch for your fix or feature.
2. Install dependencies and run from source as described above.
3. Add or update tests for the behavior you change.
4. Run `pnpm run format` and `pnpm run check`, then open a pull request explaining the change and how you tested it.

Use pnpm and commit `pnpm-lock.yaml` when dependencies change; do not add an npm lockfile. CI uses a frozen lockfile, skips dependency install scripts, and runs the same checks plus the release-content preview.

Package update checks currently rely on Pi's exported `DefaultPackageManager.checkForAvailableUpdates()` API. It is typed and exported in Pi 0.87.1, but may change in later releases. Compatibility changes should test both extension loading and update behavior. Restarts launch a child Pi on the same terminal; the original process exits when that child finishes.

Releases are handled by a maintainer-only, manually triggered GitHub Actions workflow. Pushes and pull requests never publish a package.
