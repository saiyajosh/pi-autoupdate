# Contributing

[← Quick start](README.md)

## Set up

Use Node **≥22.19.0** and pnpm **12.8.1** (pinned in `package.json`). See [pnpm installation](https://pnpm.io/installation).

Fork the repository for external contributions, then clone your fork. Otherwise:

```sh
git clone https://github.com/saiyajosh/pi-autoupdate.git
cd pi-autoupdate
git switch -c your-change
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
```

Pi loads the TypeScript extension directly; no compilation step is needed.

## Try the extension

Use a temporary settings directory so testing does not update your normal installation:

```sh
DEMO_AGENT_DIR="$(mktemp -d)"
printf '%s\n' '{"updatePi":false,"updateExtensions":false}' > "$DEMO_AGENT_DIR/autoupdate.json"
PI_CODING_AGENT_DIR="$DEMO_AGENT_DIR" pi --extension ./index.ts
```

This needs Pi on your PATH. Try `/autoupdate-config` and `/autoupdate-report`. A fresh directory has no saved report.

To use your normal settings instead, run `pi --extension ./index.ts`. **This can install updates.** Disable both settings first if you only want to inspect the UI.

## Find the code

| File | Responsibility |
| --- | --- |
| `index.ts` | Startup updates and slash commands |
| `src/config.ts` | Settings validation and storage |
| `src/updates.ts` | Update checks, targets, and verification |
| `src/restart.ts` | Session restart |
| `src/report.ts` | Reports, progress panel, and report dialog |
| `test/` | Unit, extension-loading, packaging, and terminal UI tests |

## Test changes

```sh
pnpm run format
pnpm run check
pnpm run test:tui # For UI or startup changes
pnpm run pack:check
```

- `check`: typechecking, linting, formatting verification, and tests.
- `test:tui`: real Pi sessions in an isolated pseudo-terminal; requires macOS or Linux and Python 3. No login or API key is needed. Usually takes about 20 seconds.
- `pack:check`: preview release contents.

The terminal tests cover report layout, scrolling, resizing, keyboard dismissal, restart feedback, and failure recovery. They use temporary directories and intercept network requests, update commands, and the restart boundary. **No updates are installed and no real restart occurs.** Timeouts are simulated. Processes and temporary files are cleaned up, including on failure.

Terminal tests run only when explicitly invoked; they are not part of `check` or CI. Their sources are still typechecked, linted, and formatted.

The package smoke test packs the release, installs production dependencies offline using the lockfile, and checks that Pi loads the extracted extension. It needs `tar` on your PATH.

## Submit a change

Add or update tests for your change. Open a PR describing what changed and how you tested it. Use pnpm, commit `pnpm-lock.yaml` when dependencies change, and do not add an npm lockfile.

CI installs with a frozen lockfile, skips install scripts, and runs checks and the release-content preview.

For bugs, include Pi version and installation method, OS, settings, and reproduction steps. Remove credentials and private session data.

## Packaging and compatibility

The release contains source, README, license, and package manifest. Runtime dependencies are declared in the manifest; Pi is supplied by the host. Tests, development tools, and lockfiles are excluded.

Package checks use Pi's exported `DefaultPackageManager.checkForAvailableUpdates()` API. It is typed and exported in Pi 0.87.1 but may change in later releases. This prototype is tested with Pi **0.99.1**. Test extension loading and update behavior when changing Pi compatibility.

Restarts launch a child Pi on the same terminal. The original process exits when the child finishes.
