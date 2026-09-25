import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { configPath, DEFAULT_CONFIG, loadConfig, saveConfig } from "../src/config.js";

test("missing config enables both update targets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-autoupdate-"));

  try {
    assert.deepEqual(await loadConfig(configPath(directory)), DEFAULT_CONFIG);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("config round-trips and accepts individually disabled targets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-autoupdate-"));
  const path = configPath(directory);

  try {
    await saveConfig(path, { updatePi: false, updateExtensions: true });
    assert.deepEqual(await loadConfig(path), { updatePi: false, updateExtensions: true });
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      updatePi: false,
      updateExtensions: true,
    });
    assert.equal(await loadConfig(path).then((config) => config.updatePi), false);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("manual partial config uses defaults, invalid JSON or keys fail closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-autoupdate-"));
  const path = configPath(directory);

  try {
    await writeFile(path, '{"updatePi":false}');
    assert.deepEqual(await loadConfig(path), { updatePi: false, updateExtensions: true });

    for (const invalid of ['{"updatePi":"false"}', '{"surprise":true}', "{not json}"]) {
      await writeFile(path, invalid);
      await assert.rejects(loadConfig(path), /Invalid config/);
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});
