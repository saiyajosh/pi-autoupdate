import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { configPath } from "../src/config.js";

test("Pi loads the packaged entry point and registers /autoupdate-config", async () => {
  const agentDir = await mkdtemp(join(tmpdir(), "pi-autoupdate-integration-"));

  try {
    await writeFile(configPath(agentDir), '{"updatePi":false,"updateExtensions":false}\n');

    const child = spawn(
      join(process.cwd(), "node_modules/.bin/pi"),
      ["--extension", join(process.cwd(), "index.ts"), "--mode", "rpc", "--no-session"],
      {
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdin.end('{"id":"commands","type":"get_commands"}\n');
    const timeout = setTimeout(() => child.kill(), 15_000);

    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });

      assert.equal(exitCode, 0, stderr);
      assert.match(stdout, /"name":"autoupdate-config"/);
      assert.match(stdout, /"name":"autoupdate-report"/);
      assert.doesNotMatch(stdout, /"name":"autoupdate-status"/);
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    await rm(agentDir, { recursive: true });
  }
});
