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

export function resumeArgs(sessionFile: string | undefined): string[] {
  return sessionFile ? ["--session", sessionFile] : ["--no-session"];
}

/** Stop Pi's terminal renderer before giving stdio to the replacement process. */
export async function restartPi(ctx: ExtensionContext): Promise<boolean> {
  const command = currentPiCommand(resumeArgs(ctx.sessionManager.getSessionFile()));
  const env = { ...process.env, [RESTART_GUARD]: "1" };

  return ctx.ui.custom<boolean>((tui, _theme, _keys, done) => {
    tui.stop();

    const result = spawnSync(command.program, command.args, {
      cwd: ctx.cwd,
      env,
      stdio: "inherit",
    });

    tui.start();
    tui.requestRender(true);
    done(!result.error && (result.status === null || result.status === 0));

    return { render: () => [], invalidate: () => undefined };
  });
}
