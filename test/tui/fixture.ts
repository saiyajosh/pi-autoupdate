// Test-only adapter: keep the real extension and UI, replace external side effects.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import childProcess from "node:child_process";
import { appendFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import autoupdate from "../../index.js";

export default function fixture(pi: ExtensionAPI): void {
  const agentDir = process.env.PI_CODING_AGENT_DIR;
  const scenario = process.env.AUTOUPDATE_TUI_SCENARIO;

  if (!agentDir || !scenario)
    throw new Error("TUI fixture requires an isolated test directory and scenario");

  // No real HTTP requests, even if a future code path attempts one.
  globalThis.fetch = async () => {
    if (scenario === "check-failure") throw new Error("Simulated version service failure");

    const updating = [
      "installation-failure",
      "timeout",
      "verification-failure",
      "restart-failure",
      "report-save-failure",
    ].includes(scenario);

    return new Response(JSON.stringify({ version: updating ? "999.0.0" : VERSION }), {
      headers: { "content-type": "application/json" },
    });
  };

  const exec: ExtensionAPI["exec"] = async (_program, args) => {
    await appendFile(join(agentDir, "intercepted-exec.jsonl"), `${JSON.stringify(args)}\n`);
    // Briefly leave progress visible so the PTY test can observe it.
    await new Promise((resolve) => setTimeout(resolve, 600));

    if (args.includes("--version"))
      return {
        code: 0,
        killed: false,
        stdout: scenario === "restart-failure" ? "999.0.0" : VERSION,
        stderr: "",
      };

    if (args.includes("update") && args.includes("--self")) {
      if (scenario === "verification-failure" || scenario === "restart-failure")
        return { code: 0, killed: false, stdout: "", stderr: "" };

      return {
        code: 1,
        killed: scenario === "timeout",
        stdout: "",
        stderr: "Simulated installation failure",
      };
    }

    throw new Error(`Blocked unexpected test command: ${args.join(" ")}`);
  };

  if (scenario === "restart-failure") {
    // Intercept the real restart boundary too; never launch a replacement process.
    Object.assign(childProcess, {
      spawnSync: (_program: string, args: string[] = []) => {
        if (args.includes("--no-session"))
          appendFileSync(join(agentDir, "intercepted-restart"), "restart blocked\n");

        return { status: 1, signal: null, pid: 0, output: [], stdout: null, stderr: null };
      },
    });
    syncBuiltinESMExports();
  }

  // Preserve the real API except exec; no update process can be launched.
  autoupdate({ ...pi, exec });

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus("tui-fixture", "TUI fixture ready");
  });
}
