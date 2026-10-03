import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir, VERSION } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { configPath, loadConfig, saveConfig } from "./src/config.js";
import {
  clearReport,
  loadReport,
  notifyReport,
  openReport,
  saveReport,
  showReport,
  type UpdateReport,
} from "./src/report.js";
import { currentPiCommand, RESTART_GUARD, restartPi } from "./src/restart.js";
import {
  packageRevision,
  verifyPackageRevision,
  checkUpdates,
  targetFor,
  updateArgs,
  verifyPiVersion,
} from "./src/updates.js";

export default function autoupdate(pi: ExtensionAPI): void {
  const path = configPath(getAgentDir());
  // Consume the marker immediately: a child launched after this one may check again.
  const restarted = process.env[RESTART_GUARD] === "1";
  delete process.env[RESTART_GUARD];
  let running = false;
  const reportPath = join(getAgentDir(), "autoupdate-last-run.json");

  async function run(ctx: ExtensionContext): Promise<void> {
    if (running) return;
    running = true;
    let report: UpdateReport | undefined;
    let updateStarted = false;

    try {
      const config = await loadConfig(path);

      if (!config.updatePi && !config.updateExtensions) return;

      const pending = await checkUpdates(ctx.cwd, config);
      const target = targetFor(pending);

      if (!target) return;

      report = {
        time: new Date().toISOString(),
        cwd: ctx.cwd,
        message: "Updates detected — installing…",
        items: [
          ...(pending.piVersion
            ? [
                {
                  name: "Pi",
                  status: "pending" as const,
                  detail: `${VERSION} → ${pending.piVersion}`,
                },
              ]
            : []),
          ...pending.packages.map((pkg) => ({
            name: `${pkg.displayName} (${pkg.scope})`,
            status: "pending" as const,
            detail: "package update detected",
          })),
        ],
      };
      showReport(ctx, report);

      const before = await Promise.all(
        pending.packages.map((pkg) => packageRevision(ctx.cwd, pkg)),
      );

      for (let i = 0; i < before.length; i++) {
        report.items[i + (pending.piVersion ? 1 : 0)]!.detail =
          `${before[i]} → latest · installing…`;
      }

      showReport(ctx, report);
      const command = currentPiCommand(updateArgs(target));
      updateStarted = true;
      const result = await pi.exec(command.program, command.args, { timeout: 300_000 });

      if (result.killed || result.code !== 0) {
        throw new Error(
          `pi ${updateArgs(target).join(" ")} failed${result.killed ? " (timed out)" : ` (exit ${result.code})`}: ${result.stderr || result.stdout}`,
        );
      }

      report.message = "Update command finished — verifying installed updates…";
      showReport(ctx, report);

      if (pending.piVersion) {
        const versionCommand = currentPiCommand(["--version"]);

        const version = await pi.exec(versionCommand.program, versionCommand.args, {
          timeout: 10_000,
        });

        const item = report.items[0]!;
        const installed = version.stdout.trim();

        const verified =
          !version.killed && version.code === 0 && verifyPiVersion(installed, pending.piVersion);

        item.status = verified ? "success" : "error";
        item.detail = verified
          ? `${VERSION} → ${installed} · verified`
          : `could not verify ${pending.piVersion}; run pi update --self manually`;
      }

      for (let i = 0; i < pending.packages.length; i++) {
        const pkg = pending.packages[i]!;
        const after = await packageRevision(ctx.cwd, pkg);
        const item = report.items[i + (pending.piVersion ? 1 : 0)]!;
        item.status = verifyPackageRevision(pkg.type, before[i]!, after) ? "success" : "error";
        item.detail =
          item.status === "success"
            ? `${before[i]} → ${after} · installed revision verified`
            : `${after} · installed revision did not advance`;
      }

      if (report.items.some((item) => item.status !== "success")) {
        throw new Error(
          "Some updates could not be verified. Staying in this session; restart manually if needed.",
        );
      }

      report.message = "All updates verified. Restarting Pi in your current session…";
      await saveReport(reportPath, report);
      showReport(ctx, report);
      // Let the final status render before handing over the terminal.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      clearReport(ctx);
      const ok = await restartPi(ctx);

      if (ok) ctx.shutdown();
      else {
        report.message = "Updates verified, but automatic restart failed. Restart Pi manually.";
        await saveReport(reportPath, report);
        notifyReport(ctx, report, "warning");
      }
    } catch (error) {
      if (report) {
        report.message = `Auto-update incomplete: ${String(error)}`;

        for (const item of report.items) {
          if (item.status === "pending") {
            item.status = "error";
            item.detail = updateStarted
              ? "not verified; the command may have made partial changes"
              : "update not attempted";
          }
        }

        clearReport(ctx);
        notifyReport(ctx, report, "error");

        try {
          await saveReport(reportPath, report);
        } catch (saveError) {
          ctx.ui.notify(`Could not save update report: ${String(saveError)}`, "warning");
        }
      } else ctx.ui.notify(`Auto-update skipped: ${String(error)}`, "warning");
    } finally {
      clearReport(ctx);
      running = false;
    }
  }

  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "startup" || ctx.mode !== "tui") return;

    if (restarted) {
      try {
        const report = await loadReport(reportPath);

        if (report) {
          report.message = `Restart complete · running Pi ${VERSION}.`;
          notifyReport(ctx, report);
          await saveReport(reportPath, report);
        }
      } catch (error) {
        ctx.ui.notify(`Could not read update report: ${String(error)}`, "warning");
      }

      return;
    }

    if (process.env.PI_OFFLINE || process.env.PI_SKIP_VERSION_CHECK) return;
    await run(ctx);
  });

  pi.registerCommand("autoupdate-report", {
    description: "Show the last automatic update report",
    handler: async (_args, ctx) => {
      try {
        const report = await loadReport(reportPath);

        if (report && ctx.mode === "tui") await openReport(ctx, report);
        else
          ctx.ui.notify(
            report ? JSON.stringify(report, null, 2) : "No automatic update report saved yet.",
            "info",
          );
      } catch (error) {
        ctx.ui.notify(`Could not read update report: ${String(error)}`, "error");
      }
    },
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
            `Update Pi automatically when a new release is available: ${config.updatePi ? "on" : "off"}`,
            `Update all Pi extensions automatically when a new release is available: ${config.updateExtensions ? "on" : "off"}`,
            "Done",
          ]);

          if (!choice || choice === "Done") break;

          if (choice.startsWith("Update Pi automatically when a new release is available:"))
            config.updatePi = !config.updatePi;
          else if (
            choice.startsWith(
              "Update all Pi extensions automatically when a new release is available:",
            )
          )
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
