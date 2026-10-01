import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadReport, saveReport, type UpdateReport } from "../src/report.js";

test("update reports survive restart and reject malformed files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-autoupdate-report-"));
  const path = join(dir, "nested", "report.json");

  const report: UpdateReport = {
    time: new Date().toISOString(),
    cwd: "/project",
    message: "Updates verified",
    items: [
      { name: "Pi", status: "success", detail: "0.99.1 → 0.99.2" },
      { name: "example", status: "error", detail: "not verified" },
    ],
  };

  try {
    assert.equal(await loadReport(path), undefined);
    await saveReport(path, report);
    assert.deepEqual(await loadReport(path), report);
    await writeFile(path, '{"items":[]}');
    await assert.rejects(loadReport(path));
  } finally {
    await rm(dir, { recursive: true });
  }
});
