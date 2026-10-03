import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import xterm from "@xterm/headless";
import { loadReport, saveReport, type UpdateReport } from "../../src/report.js";

const root = resolve(import.meta.dirname, "../..");

const report: UpdateReport = {
  time: "2026-09-30T23:09:18.240Z",
  cwd: "/isolated-project",
  message: "Test fixture — no updates were installed.",
  items: Array.from({ length: 30 }, (_, index) => ({
    name: `Example extension ${String(index + 1).padStart(2, "0")}`,
    status: index === 5 ? "error" : "success",
    detail: index === 5 ? "Simulated package failure" : "1.0.0 → 1.0.1 · verified",
  })),
};

async function launch(
  scenario: string,
  savedReport: "long" | "success" | "invalid" | "missing" = "missing",
) {
  const dir = await mkdtemp(join(tmpdir(), "pi-autoupdate-tui-"));

  const updating = [
    "installation-failure",
    "timeout",
    "verification-failure",
    "check-failure",
    "restart-failure",
    "report-save-failure",
  ].includes(scenario);

  await writeFile(
    join(dir, "autoupdate.json"),
    scenario === "bad-config"
      ? "{broken"
      : JSON.stringify({ updatePi: updating, updateExtensions: false }),
  );
  await writeFile(
    join(dir, "settings.json"),
    JSON.stringify({ quietStartup: true, checkForUpdates: false }),
  );

  if (savedReport === "long") await saveReport(join(dir, "autoupdate-last-run.json"), report);
  else if (savedReport === "success")
    await saveReport(join(dir, "autoupdate-last-run.json"), {
      ...report,
      items: report.items.slice(0, 1),
    });
  else if (savedReport === "invalid")
    await writeFile(join(dir, "autoupdate-last-run.json"), "{broken");

  if (scenario === "report-save-failure") await mkdir(join(dir, "autoupdate-last-run.json"));

  const terminal = new xterm.Terminal({
    cols: 120,
    rows: 40,
    allowProposedApi: true,
    scrollback: 1000,
  });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PI_CODING_AGENT_DIR: dir,
    PI_TELEMETRY: "0",
    AUTOUPDATE_TUI_SCENARIO: scenario,
    TERM: "xterm-256color",
  };

  delete env.PI_OFFLINE;
  delete env.PI_SKIP_VERSION_CHECK;
  delete env.PI_AUTOUPDATE_RESTARTED;

  if (scenario === "restart") env.PI_AUTOUPDATE_RESTARTED = "1";

  const child = spawn(
    "python3",
    [
      join(root, "test/tui/pty.py"),
      process.execPath,
      join(root, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"),
      "--no-session",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--no-tools",
      "--tui-mode",
      "fullscreen",
      "--extension",
      join(root, "test/tui/fixture.ts"),
    ],
    { cwd: dir, env, stdio: ["pipe", "pipe", "pipe"] },
  );

  let stderr = "";
  let spawnError: Error | undefined;
  const closed = new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
  child.on("error", (error) => {
    spawnError = error;
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.stdout.on("data", (chunk: Buffer) => terminal.write(chunk));
  child.stdin.on("error", (error) => {
    spawnError = error;
  });

  const send = (input: string) =>
    child.stdin.write(`${JSON.stringify({ input: Buffer.from(input).toString("base64") })}\n`);

  terminal.onData(send);

  function screen(): string {
    const buffer = terminal.buffer.active;

    return Array.from(
      { length: terminal.rows },
      (_, row) => buffer.getLine(buffer.baseY + row)?.translateToString(true) ?? "",
    ).join("\n");
  }

  async function waitFor(label: string, predicate: (text: string) => boolean): Promise<string> {
    const deadline = Date.now() + 12_000;

    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;

      const text = screen();

      if (predicate(text)) return text;

      if (child.exitCode !== null)
        throw new Error(`Pi exited while waiting for ${label}: ${stderr}\n${text}`);

      await delay(50);
    }

    throw new Error(`Timed out waiting for ${label}: ${stderr}\n${screen()}`);
  }

  async function command(value: string): Promise<void> {
    send(value);
    // Separate text and Enter so Pi processes the editor update before submission.
    await delay(100);
    send("\r");
  }

  async function close(): Promise<void> {
    child.stdin.end();
    const timeout = setTimeout(() => child.kill("SIGTERM"), 3000);

    await closed;
    clearTimeout(timeout);
    terminal.dispose();
    await rm(dir, { recursive: true });
  }

  return {
    dir,
    terminal,
    screen,
    waitFor,
    command,
    send,
    close,
    resize: (cols: number, rows: number) => {
      terminal.resize(cols, rows);
      child.stdin.write(`${JSON.stringify({ resize: [cols, rows] })}\n`);
    },
  };
}

test(
  "real Pi report dialog: layout, scrolling, resize, dismissal and editor recovery",
  { timeout: 30_000 },
  async () => {
    const tui = await launch("report", "long");

    try {
      await tui.waitFor("startup editor", (text) => text.includes("TUI fixture ready"));
      await tui.command("/autoupdate-report");

      const opened = await tui.waitFor("report modal", (text) =>
        text.includes("Auto-update report"),
      );

      const rows = opened.split("\n");
      const top = rows.find((row) => row.includes(`╭${"─".repeat(58)}╮`));
      assert.ok(top, opened);
      assert.equal(top.indexOf("╭"), 30, "half-width modal is horizontally centered");
      assert.match(opened, /│ {2}Auto-update report/);
      assert.match(opened, /Results from the last update run/);
      assert.match(opened, /Simulated package failure/);
      assert.match(opened, /Esc\/Enter close/);
      const headerRow = rows.findIndex((row) => row.includes("Auto-update report"));
      assert.ok(headerRow > 2 && headerRow < 20, "modal has vertical padding and is centered");
      tui.send("\u001b[B".repeat(18));
      await tui.waitFor("scrolled results", (text) => text.includes("Example extension 30"));
      tui.resize(100, 32);
      await tui.waitFor(
        "resized modal",
        (text) => text.includes(`╭${"─".repeat(48)}╮`) && text.includes("Auto-update report"),
      );

      for (const key of ["\u001b", "\r", "\u0003"]) {
        tui.send(key);
        await tui.waitFor("dismissed modal", (text) => !text.includes("Auto-update report"));
        assert.ok(!tui.screen().includes("↑ AUTO-UPDATE"));
        tui.send("editor-recovered");
        await tui.waitFor("working editor", (text) => text.includes("editor-recovered"));
        tui.send("\u0015");
        await delay(100);

        if (key !== "\u0003") {
          await tui.command("/autoupdate-report");
          await tui.waitFor("reopened modal", (text) => text.includes("Auto-update report"));
        }
      }
    } finally {
      await tui.close();
    }
  },
);

test("restart feedback appears once without a persistent widget", { timeout: 20_000 }, async () => {
  const tui = await launch("restart", "success");

  try {
    const text = await tui.waitFor("completion notification", (screen) =>
      screen.includes("Restart complete"),
    );

    assert.equal(text.split("Restart complete").length - 1, 1);
    assert.ok(!text.includes("↑ AUTO-UPDATE"));
    await tui.command("/autoupdate-report");
    await tui.waitFor(
      "persisted completion report",
      (screen) => screen.includes("Auto-update report") && screen.includes("Restart complete"),
    );
    tui.send("\u001b");
    await tui.waitFor(
      "closed completion report",
      (screen) => !screen.includes("Auto-update report"),
    );

    await tui.command("/reload");
    await delay(1000);
    assert.ok(!tui.screen().includes("↑ AUTO-UPDATE"));
  } finally {
    await tui.close();
  }
});

for (const scenario of ["installation-failure", "timeout", "verification-failure"]) {
  test(`real startup failure: ${scenario}`, { timeout: 20_000 }, async () => {
    const tui = await launch(scenario);

    try {
      await tui.waitFor("live progress", (text) => text.includes("↑ AUTO-UPDATE"));

      const failed = await tui.waitFor(
        "failure notification",
        (text) =>
          text.includes("Auto-update incomplete") &&
          !text.includes("↑ AUTO-UPDATE") &&
          text.includes("TUI fixture ready"),
      );

      assert.ok(!failed.includes("Restart complete"));

      const saved = await loadReport(join(tui.dir, "autoupdate-last-run.json"));
      assert.equal(saved?.items[0]?.status, "error");

      const calls = await readFile(join(tui.dir, "intercepted-exec.jsonl"), "utf8");
      assert.equal(calls.trim().split("\n").length, scenario === "verification-failure" ? 2 : 1);
      await tui.command("/autoupdate-report");

      const dialog = await tui.waitFor(
        "failure report",
        (text) => text.includes("Auto-update report") && text.includes("✗ Pi"),
      );

      assert.match(
        dialog,
        scenario === "timeout"
          ? /timed out/
          : scenario === "verification-failure"
            ? /could not verify/
            : /Simulated installation failure/,
      );
      tui.send("\u001b");
      await tui.waitFor("dismissed failure report", (text) => !text.includes("Auto-update report"));
      tui.send("still-operational");
      await tui.waitFor("editor after failure", (text) => text.includes("still-operational"));
    } finally {
      await tui.close();
    }
  });
}

for (const scenario of ["bad-config", "check-failure", "invalid-report", "missing-report"]) {
  test(`safe UI error handling: ${scenario}`, { timeout: 20_000 }, async () => {
    const tui = await launch(scenario, scenario === "invalid-report" ? "invalid" : "missing");

    try {
      if (scenario === "bad-config" || scenario === "check-failure") {
        await tui.waitFor("startup warning", (text) => text.includes("Auto-update skipped"));
      } else {
        await tui.waitFor("startup editor", (text) => text.includes("TUI fixture ready"));
        await tui.command("/autoupdate-report");
        await tui.waitFor("report feedback", (text) =>
          text.includes(
            scenario === "invalid-report"
              ? "Could not read update report"
              : "No automatic update report saved yet",
          ),
        );
      }

      assert.ok(!tui.screen().includes("↑ AUTO-UPDATE"));
      tui.send("still-operational");
      await tui.waitFor("editor after error", (text) => text.includes("still-operational"));
    } finally {
      await tui.close();
    }
  });
}

for (const scenario of ["restart-failure", "report-save-failure"]) {
  test(`real update recovery: ${scenario}`, { timeout: 20_000 }, async () => {
    const tui = await launch(scenario);

    try {
      await tui.waitFor("live progress", (text) => text.includes("↑ AUTO-UPDATE"));
      await tui.waitFor(
        "recovery warning",
        (text) =>
          !text.includes("↑ AUTO-UPDATE") &&
          text.includes(
            scenario === "restart-failure"
              ? "automatic restart failed"
              : "Could not save update report",
          ),
      );

      if (scenario === "restart-failure") {
        const saved = await loadReport(join(tui.dir, "autoupdate-last-run.json"));
        assert.equal(saved?.items[0]?.status, "success");
        assert.equal(
          await readFile(join(tui.dir, "intercepted-restart"), "utf8"),
          "restart blocked\n",
        );
        await tui.command("/autoupdate-report");
        await tui.waitFor(
          "restart failure report",
          (text) =>
            text.includes("Auto-update report") && text.includes("automatic restart failed"),
        );
        tui.send("\u001b");
        await tui.waitFor(
          "dismissed recovery report",
          (text) => !text.includes("Auto-update report"),
        );
      }

      tui.send("still-operational");
      await tui.waitFor("editor after recovery", (text) => text.includes("still-operational"));
    } finally {
      await tui.close();
    }
  });
}
