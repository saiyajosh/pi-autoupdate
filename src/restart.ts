import { spawnSync } from "node:child_process";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const RESTART_GUARD = "PI_AUTOUPDATE_RESTARTED";

export function currentPiCommand(
  args: string[],
  executable = process.execPath,
  entry = process.argv[1],
) {
  // Bun standalone binaries embed their entry point in a virtual filesystem.
  if (entry && !entry.includes("$bunfs") && !entry.includes("~BUN") && !entry.includes("%7EBUN")) {
    return { program: executable, args: [entry, ...args] };
  }

  return { program: executable, args };
}

export function resumeArgs(sessionFile: string | undefined, launchArgs: string[] = []): string[] {
  // One-shot extensions are not stored in the session file. Keep them on restart.
  const extensions: string[] = [];

  for (let i = 0; i < launchArgs.length; i++) {
    const arg = launchArgs[i]!;

    if ((arg === "--extension" || arg === "-e") && launchArgs[i + 1]) {
      extensions.push(arg, launchArgs[++i]!);
    }
  }

  return [...extensions, ...(sessionFile ? ["--session", sessionFile] : ["--no-session"])];
}

/** Stop Pi's terminal renderer before giving stdio to the replacement process. */
export async function restartPi(ctx: ExtensionContext): Promise<boolean> {
  const command = currentPiCommand(
    resumeArgs(ctx.sessionManager.getSessionFile(), process.argv.slice(2)),
  );

  const env = { ...process.env, [RESTART_GUARD]: "1" };

  return ctx.ui.custom<boolean>((tui, _theme, _keys, done) => {
    tui.stop();
    // Clear only after the renderer stops so it cannot repaint the old session.
    tui.terminal.clearScreen();
    tui.terminal.write("\u001b[3J\u001b[H");

    const result = spawnSync(command.program, command.args, {
      cwd: ctx.cwd,
      env,
      stdio: "inherit",
    });

    const ok = !result.error && result.status === 0;

    if (!ok) {
      tui.start();
      tui.requestRender(true);
    }

    done(ok);

    return { render: () => [], invalidate: () => undefined };
  });
}
