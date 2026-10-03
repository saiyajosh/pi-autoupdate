import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mock, test } from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { RESTART_GUARD, restartPi } from "../src/restart.js";

test("restart stops the renderer, clears the screen, and hands over the saved session", async () => {
  const calls: string[] = [];

  const spawn = mock.method(
    childProcess,
    "spawnSync",
    (_program: string, args: string[], options: childProcess.SpawnSyncOptions) => {
      calls.push("spawn");
      assert.ok(args.includes("/session.jsonl"));
      assert.equal(options.cwd, "/project");
      assert.equal(options.env?.[RESTART_GUARD], "1");
      assert.equal(options.stdio, "inherit");

      return { status: 0, signal: null, pid: 1, output: [], stdout: null, stderr: null };
    },
  );

  syncBuiltinESMExports();

  const tui = {
    stop: () => calls.push("stop"),
    start: () => calls.push("start"),
    requestRender: () => calls.push("render"),
    terminal: {
      clearScreen: () => calls.push("clear"),
      write: (text: string) => {
        assert.equal(text, "\u001b[3J\u001b[H");
        calls.push("scrollback");
      },
    },
  };

  // SAFETY: restartPi only uses the session getter, cwd and custom factory; the fake TUI implements every method it invokes.
  const ctx = Object.assign({} as ExtensionContext, {
    cwd: "/project",
    sessionManager: { getSessionFile: () => "/session.jsonl" },
    ui: {
      custom: async (
        factory: (
          terminalUI: typeof tui,
          theme: undefined,
          keys: undefined,
          done: (ok: boolean) => void,
        ) => { render: () => string[]; invalidate: () => void },
      ) => {
        let result = false;
        factory(tui, undefined, undefined, (ok) => {
          result = ok;
        });

        return result;
      },
    },
  });

  try {
    assert.equal(await restartPi(ctx), true);
    assert.deepEqual(calls, ["stop", "clear", "scrollback", "spawn"]);
    calls.length = 0;
    spawn.mock.mockImplementation(() => ({
      status: 1,
      signal: null,
      pid: 1,
      output: [],
      stdout: null,
      stderr: null,
    }));
    assert.equal(await restartPi(ctx), false);
    assert.deepEqual(calls, ["stop", "clear", "scrollback", "start", "render"]);
  } finally {
    spawn.mock.restore();
    syncBuiltinESMExports();
  }
});
