# pi-autoupdate

Automatically check for and install Pi and Pi-managed package updates when an interactive Pi session starts. If an update is installed, Pi restarts into the same session. Both update targets are enabled by default.

> Prototype: test locally before using with your everyday Pi installation. Installing this package permits it to run update commands on your behalf at startup.

## Try locally

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
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

Use Node **>=22.19.0** and **pnpm 12.8.1**, pinned in `package.json` via `packageManager`. See [pnpm installation](https://pnpm.io/installation) if pnpm is not available. Commit `pnpm-lock.yaml`; do not regenerate an npm lockfile.

`pnpm run check` runs strict TypeScript checking, Oxlint with vendored anti-slop rules, formatting verification and tests. `pnpm run format` formats owned source. CI installs with `--frozen-lockfile --ignore-scripts` and runs the same checks. The package smoke test creates the actual release tarball, checks its contents, installs only its cached runtime dependencies, and verifies that Pi can load the extracted extension. It requires `tar` on PATH (available on macOS and Linux).

The npm tarball includes the TypeScript extension sources, README, license and manifest; no compilation step is needed because Pi loads TypeScript extensions. Runtime dependencies are declared in `dependencies`; Pi itself remains a host-provided peer dependency. Tests, development tools and lockfiles are not shipped. Inspect the publish contents with `pnpm run pack:check`.

## Publishing to npm

Publishing is manual; CI does not publish or hold npm credentials. Development uses pnpm, but the package is still published to the public npm registry and installed by users with `pi install npm:pi-autoupdate`.

1. Merge the intended changes, including any other pending feature PRs, into `main`. Choose the release version in `package.json` (currently `0.1.0`); for subsequent releases use a new version. Run `pnpm install --lockfile-only --ignore-scripts` after manifest changes, then commit and push the release changes.
2. From a clean, up-to-date `main`, validate and preview the package:

   ```sh
   pnpm install --frozen-lockfile --ignore-scripts
   pnpm run check
   pnpm run pack:check
   ```

3. Authenticate with an npm account permitted to publish this package, with two-factor authentication enabled:

   ```sh
   pnpm login --registry https://registry.npmjs.org/
   pnpm whoami --registry https://registry.npmjs.org/
   ```

4. Explicitly publish:

   ```sh
   pnpm publish --publish-branch main
   ```

   `publishConfig` selects the public npm registry and public access. pnpm checks the branch and Git state; `prepublishOnly` reruns the quality gates and package preview before upload. Do not bypass these checks with `--no-git-checks` or `--ignore-scripts`. Provide an OTP when requested; never commit tokens or credentials.

5. Verify the published version with `pnpm view pi-autoupdate version`, then create and push its matching Git tag (for example, `v0.1.0`). Smoke-test installation in an isolated Pi agent directory with automatic updates disabled before normal use.

No publish command runs automatically. Registry name availability and account permissions must be confirmed when publishing.
