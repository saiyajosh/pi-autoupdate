import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import autoupdate from "../index.js";
import { configPath } from "../src/config.js";
import { loadReport, saveReport } from "../src/report.js";
import { RESTART_GUARD } from "../src/restart.js";

test("startup feedback is one-time and failed updates remove live progress", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-autoupdate-lifecycle-"));
  const envKeys = ["PI_CODING_AGENT_DIR", "PI_OFFLINE", "PI_SKIP_VERSION_CHECK", RESTART_GUARD];
  const previous = envKeys.map((key) => process.env[key]);
  process.env.PI_CODING_AGENT_DIR = dir;
  delete process.env.PI_OFFLINE;
  delete process.env.PI_SKIP_VERSION_CHECK;
  const reportPath = join(dir, "autoupdate-last-run.json");
  const widgets: boolean[] = [];
  const notifications: string[] = [];

  // SAFETY: the tested startup paths only access cwd, mode, setWidget and notify.
  const ctx = Object.assign({} as ExtensionContext, {
    cwd: dir,
    mode: "tui",
    ui: {
      setWidget: (_key: string, content: Parameters<ExtensionContext["ui"]["setWidget"]>[1]) => {
        widgets.push(content !== undefined);
      },
      notify: (message: string, severity: string) => notifications.push(`${severity}: ${message}`),
    },
  });

  let start = async (_event: { reason: string }, _ctx: ExtensionContext): Promise<void> => {};

  // SAFETY: initialization and the failed update path only use on, registerCommand and exec.
  const api = Object.assign({} as ExtensionAPI, {
    on: (_event: string, handler: typeof start) => {
      start = handler;
    },
    registerCommand: () => {},
    exec: async () => ({ code: 1, killed: false, stdout: "", stderr: "installation failed" }),
  });

  try {
    await saveReport(reportPath, {
      time: new Date().toISOString(),
      cwd: dir,
      message: "All updates verified",
      items: [{ name: "Pi", status: "success", detail: "0.99.1 → 0.99.2" }],
    });
    process.env[RESTART_GUARD] = "1";
    autoupdate(api);
    await start({ reason: "startup" }, ctx);
    await start({ reason: "switch" }, ctx);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0]!, /^info: Restart complete/);
    assert.equal(widgets.length, 0);

    notifications.length = 0;
    await writeFile(configPath(dir), '{"updatePi":true,"updateExtensions":false}');
    t.mock.method(globalThis, "fetch", async () => new Response('{"version":"999.0.0"}'));
    autoupdate(api);
    await start({ reason: "startup" }, ctx);
    assert.ok(widgets.includes(true));
    assert.equal(widgets.at(-1), false);
    assert.match(notifications[0]!, /^error: Auto-update incomplete/);
    assert.match(notifications[0]!, /installation failed/);
    assert.equal((await loadReport(reportPath))?.items[0]?.status, "error");

    widgets.length = 0;
    notifications.length = 0;
    await writeFile(configPath(dir), '{"updatePi":false,"updateExtensions":false}');
    autoupdate(api);
    await start({ reason: "startup" }, ctx);
    assert.ok(!widgets.includes(true));
    assert.deepEqual(notifications, []);
  } finally {
    envKeys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
    await rm(dir, { recursive: true });
  }
});
