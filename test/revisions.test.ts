import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { packageRevision, type PackageUpdate } from "../src/updates.js";

test("verification reads the actual Pi-managed npm installation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-autoupdate-revision-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;

  const pkg: PackageUpdate = {
    source: "npm:example",
    displayName: "example",
    type: "npm",
    scope: "user",
  };

  const installed = join(dir, "npm", "node_modules", "example", "package.json");

  try {
    await writeFile(join(dir, "settings.json"), JSON.stringify({ packages: [pkg.source] }));
    await mkdir(join(dir, "npm", "node_modules", "example"), { recursive: true });
    await writeFile(installed, '{"version":"1.0.0"}');
    assert.equal(await packageRevision(dir, pkg), "1.0.0");
    await writeFile(installed, '{"version":"1.1.0"}');
    assert.equal(await packageRevision(dir, pkg), "1.1.0");
    await writeFile(installed, '{"version":"invalid"}');
    await assert.rejects(packageRevision(dir, pkg), /Invalid installed version/);
    await rm(installed);
    await assert.rejects(packageRevision(dir, pkg));
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(dir, { recursive: true });
  }
});
