import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, VERSION } from "@earendil-works/pi-coding-agent";
import { configPath, loadConfig, saveConfig } from "./src/config.js";
import { currentPiCommand, RESTART_GUARD, restartPi } from "./src/restart.js";
import { checkUpdates, targetFor, updateArgs } from "./src/updates.js";

export default function autoupdate(pi: ExtensionAPI): void {
  const path = configPath(getAgentDir());
  // Consume the marker immediately: a child launched after this one may check again.
  const restarted = process.env[RESTART_GUARD] === "1";
  delete process.env[RESTART_GUARD];
  let running = false;

  async function run(ctx: ExtensionContext): Promise<void> {
    if (running) return;
    running = true;

    try {
      const config = await loadConfig(path);

      if (!config.updatePi && !config.updateExtensions) return;

      const pending = await checkUpdates(ctx.cwd, config);
      const target = targetFor(pending);

      if (!target) return;

      ctx.ui.notify(
        `Updating ${pending.piVersion ? `Pi ${VERSION} → ${pending.piVersion}` : ""}${pending.piVersion && pending.packages.length ? " and " : ""}${pending.packages.length ? `${pending.packages.length} Pi package(s)` : ""}…`,
        "info",
      );
      const command = currentPiCommand(updateArgs(target));
      const result = await pi.exec(command.program, command.args, { timeout: 300_000 });

      if (result.killed || result.code !== 0) {
        throw new Error(
          `pi ${updateArgs(target).join(" ")} failed${result.killed ? " (timed out)" : ` (exit ${result.code})`}: ${result.stderr || result.stdout}`,
        );
      }

      // Some standalone installs return instructions rather than changing Pi.
      if (pending.piVersion && target === "self") {
        const version = await pi.exec(
          command.program,
          [...command.args.slice(0, -2), "--version"],
          { timeout: 10_000 },
        );

        if (version.code !== 0 || version.stdout.trim() === VERSION) {
          ctx.ui.notify(
            `Pi did not update automatically. ${result.stdout.trim() || "Run pi update manually."}`,
            "warning",
          );

          return;
        }
      }

      ctx.ui.notify("Update complete. Restarting Pi into this session…", "info");
      const ok = await restartPi(ctx);

      if (ok) ctx.shutdown();
      else
        ctx.ui.notify("Automatic restart failed. Restart Pi manually to load the update.", "error");
    } catch (error) {
      ctx.ui.notify(`Auto-update skipped: ${String(error)}`, "warning");
    } finally {
      running = false;
    }
  }

  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "startup" || restarted || ctx.mode !== "tui") return;

    if (process.env.PI_OFFLINE || process.env.PI_SKIP_VERSION_CHECK) return;
    await run(ctx);
  });

  pi.registerCommand("autoupdate-config", {
    description: "Configure automatic Pi and Pi-package updates",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/autoupdate-config requires the terminal UI", "warning");

        return;
      }

      try {
        const config = await loadConfig(path);

        while (true) {
          const choice = await ctx.ui.select(`Auto-update configuration (${path})`, [
            `Update Pi: ${config.updatePi ? "on" : "off"}`,
            `Update extensions: ${config.updateExtensions ? "on" : "off"}`,
            "Done",
          ]);

          if (!choice || choice === "Done") break;

          if (choice.startsWith("Update Pi:")) config.updatePi = !config.updatePi;
          else if (choice.startsWith("Update extensions:"))
            config.updateExtensions = !config.updateExtensions;
          else continue;
          await saveConfig(path, config);
        }
      } catch (error) {
        ctx.ui.notify(`Auto-update configuration error: ${String(error)}`, "error");
      }
    },
  });
}
