# pi-autoupdate

A Pi extension that automatically updates Pi and installed Pi packages at startup.

After installing and verifying updates, it restarts Pi in the same saved session. If no updates are available, the session continues without restarting.

> This prototype is tested against **Pi 0.99.1**. Automatic updates are enabled by default. Updates execute code from installed packages, so install only packages you trust.

## Install

Install the latest release from npm:

```sh
pi install npm:@saiyajosh/pi-autoupdate
```

To install from the GitHub repository instead:

```sh
pi install git:github.com/saiyajosh/pi-autoupdate
```

Start Pi normally. The extension checks for updates at the start of an interactive session.

Use `/autoupdate-config` to change these settings:

- **Update Pi:** update Pi itself.
- **Update extensions:** update Pi-managed packages, including extensions, skills, prompts, and themes.

Changes apply on the next launch. Turn both settings off to disable automatic updates.

## Configure

Settings are saved in `~/.pi/agent/autoupdate.json`. If you set `PI_CODING_AGENT_DIR`, the file is saved in that directory instead.

`/autoupdate-config` creates the file when you change a setting. You can also create or edit it manually:

```json
{
  "updatePi": true,
  "updateExtensions": true
}
```

- Both settings default to `true`. No config file is required.
- Set both values to `false` to disable updates before your first launch.
- Omitted settings use their default values.
- Manual edits apply on the next launch. `/reload` is not required.

Only these two keys and boolean values are accepted. Invalid JSON, unknown keys, or other value types stop automatic updates and show a warning until the file is fixed.

## Update behavior

### When checks run

Checks run only at interactive startup. They do not run:

- In print, JSON, or RPC mode.
- When switching sessions or running `/reload`.
- When `PI_OFFLINE` or `PI_SKIP_VERSION_CHECK` is set.

### What can be updated

The extension uses `pi update` for the enabled targets. The **Update extensions** setting covers all Pi-managed packages, not just extension files.

Manually copied files, pinned package versions or Git refs, and local sources are not upgraded. Some standalone Pi installations require a manual Pi update.

If you want to review changes before installing them, disable automatic updates and update manually.

### Progress and verification

The **AUTO-UPDATE** panel lists Pi and each package, shows progress, and marks each result with **✓** or **✗**.

A successful update command is not enough:

- Pi's executable version must match the expected release.
- Packages must show an increased installed npm version or a changed Git commit.

### Restart

After verification succeeds, Pi restarts in the current saved session or preserves `--no-session`. The restarted process skips one automatic check to prevent a restart loop.

Before restarting, the extension clears the terminal screen and scrollback. The new process shows a one-time completion notification with its Pi version. Files supplied through `--extension` or `-e` are passed to the new process.

The progress panel is removed before restart or on failure. Completed reports do not remain beside the editor.

### Failures

Network, filesystem, update, and verification failures leave the session open and show a warning or error. Use `/autoupdate-report` for details.

An update can partially complete before failing. If Pi reports partial changes, restart manually to load them.

## View update results

Use `/autoupdate-report` to view the most recent attempted update. It includes:

<img width="731" height="235" alt="image" src="https://github.com/user-attachments/assets/7ebf39c0-eaa0-459c-a468-fcd79df38321" />

- Pi and package names.
- Before and after versions or commits.
- Timestamp, working directory, and failures.

Press **Esc** or **Enter** to close the dialog. Use **↑/↓** to scroll. This command does not check for or install updates.

Reports are saved at `<agent-dir>/autoupdate-last-run.json`, normally `~/.pi/agent/autoupdate-last-run.json`, and remain available after restart.

No report is written when no updates are pending. Updates made before this reporting feature cannot be reconstructed.

To check installations outside Pi:

- `pi --version` shows the installed Pi executable's version.
- `pi list` locates configured package installations.

A package update does not necessarily mean an extension changed. Packages can also contain skills, prompts, and themes.

## Develop locally

### Requirements

- Node **>=22.19.0**.
- pnpm **12.8.1**, pinned in `package.json`. See [pnpm installation](https://pnpm.io/installation).
- Pi.

### Run from source

```sh
git clone https://github.com/saiyajosh/pi-autoupdate.git
cd pi-autoupdate
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pi --extension ./index.ts
```

The last command loads the extension for that launch only.

> This uses your normal Pi configuration and can install updates. Disable both settings first if you only want to inspect the UI.

To test with updates disabled without changing your normal configuration:

```sh
DEMO_AGENT_DIR="$(mktemp -d)"
printf '%s\n' '{"updatePi":false,"updateExtensions":false}' > "$DEMO_AGENT_DIR/autoupdate.json"
PI_CODING_AGENT_DIR="$DEMO_AGENT_DIR" pi --extension ./index.ts
```

For a persistent local installation, run `pi install ./` from the repository. Local sources are not automatically upgraded.

### Source layout

- `index.ts`: startup handler, `/autoupdate-config`, and `/autoupdate-report`.
- `src/config.ts`: settings validation and storage.
- `src/updates.ts`: version checks and update target selection.
- `src/restart.ts`: session restart.
- `src/report.ts`: report storage, progress display, and report dialog.
- `test/`: configuration, updates, restarts, reports, extension loading, and packaging tests.

### Checks and packaging

- `pnpm run check`: typechecking, Oxlint with vendored anti-slop rules, formatting verification, and tests.
- `pnpm run format`: format source and tests.
- `pnpm run pack:check`: preview release contents.

Pi loads the TypeScript extension directly. No compilation step is required.

The release tarball contains source files, the README, license, and package manifest. The manifest declares runtime dependencies. Pi is supplied by the host. Tests, development tools, and lockfiles are excluded.

The package smoke test:

1. Packs the release tarball and checks its contents.
2. Installs production dependencies offline using the repository lockfile.
3. Verifies that Pi loads the extracted extension.

This test requires `tar` on your PATH, available on macOS and Linux.

### TUI tests

```sh
pnpm run test:tui
```

These tests require macOS or Linux, Python 3 (`python3` on PATH), and the development dependencies. They run real Pi in a pseudo-terminal and read its rendered screen using `@xterm/headless`.

No provider login or API key is required. The suite typically takes about 20 seconds.

Coverage includes:

- Report layout, borders, padding, centering, scrolling, and resizing.

- Esc, Enter, and Ctrl+C dismissal, with editor input restored afterward.

- One-time restart feedback and report access without a persistent progress panel.

- Installation, timeout, verification, restart, and report-storage failures.

- Unavailable version services, invalid configuration, and invalid or missing reports.

Each test uses temporary agent and working directories, disables resource discovery, and loads a test adapter around the extension. Network requests, update commands, and the failed-restart boundary are intercepted.

**No updates are installed and no real restart is performed.** Timeouts are simulated rather than waiting five minutes.

Temporary directories and child processes are cleaned up after each test, including on failure. Timeout diagnostics include the rendered terminal screen.

TUI tests run only when explicitly invoked. They are excluded from `pnpm test`, `pnpm run check`, and CI. Their TypeScript sources are still typechecked, linted, and formatted.

## Contribute

### Report a bug

Include:

- Pi version and installation method.
- Operating system and relevant settings.
- Steps to reproduce.

Remove credentials and private session data from logs.

### Submit a change

1. Fork the repository and create a branch.
2. Install dependencies and run from source.
3. Add or update tests for the change.
4. Run `pnpm run format` and `pnpm run check`.
5. Open a pull request describing the change and how you tested it.

Use pnpm. Commit `pnpm-lock.yaml` when dependencies change, and do not add an npm lockfile.

CI uses a frozen lockfile, skips dependency install scripts, and runs the checks and release-content preview.

### Compatibility

Package checks use Pi's exported `DefaultPackageManager.checkForAvailableUpdates()` API. It is typed and exported in Pi 0.87.1 but may change in later releases. This prototype is tested against Pi 0.99.1.

Test both extension loading and update behavior when changing Pi compatibility.

Restarts launch a child Pi on the same terminal. The original process exits when the child finishes.
