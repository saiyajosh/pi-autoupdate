import assert from "node:assert/strict";
import { test } from "node:test";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { currentPiCommand, resumeArgs } from "../src/restart.js";
import { checkUpdates, targetFor, updateArgs } from "../src/updates.js";

test("update targets and native arguments", () => {
  assert.equal(targetFor({ packages: [] }), undefined);
  assert.equal(targetFor({ piVersion: "999.0.0", packages: [] }), "self");
  assert.equal(targetFor({ packages: ["demo"] }), "extensions");
  assert.equal(targetFor({ piVersion: "999.0.0", packages: ["demo"] }), "all");
  assert.deepEqual(updateArgs("self"), ["update", "--self"]);
  assert.deepEqual(updateArgs("extensions"), ["update", "--extensions"]);
  assert.deepEqual(updateArgs("all"), ["update", "--self", "--extensions"]);
});

test("checks only enabled targets", async () => {
  let versionCalls = 0;
  let packageCalls = 0;

  const checks = {
    latestVersion: async () => {
      versionCalls++;

      return "999.0.0";
    },
    packages: async () => {
      packageCalls++;

      return ["sample"];
    },
  };

  assert.deepEqual(await checkUpdates(".", { updatePi: false, updateExtensions: true }, checks), {
    piVersion: undefined,
    packages: ["sample"],
  });
  assert.deepEqual(await checkUpdates(".", { updatePi: true, updateExtensions: false }, checks), {
    piVersion: "999.0.0",
    packages: [],
  });
  assert.deepEqual(await checkUpdates(".", { updatePi: false, updateExtensions: false }, checks), {
    piVersion: undefined,
    packages: [],
  });
  assert.equal(versionCalls, 1);
  assert.equal(packageCalls, 1);
});

test("outdated or invalid versions do not trigger a self-update", async () => {
  const packages = async () => [];

  for (const version of [VERSION, "0.0.1", "not-semver"]) {
    assert.equal(
      (
        await checkUpdates(
          ".",
          { updatePi: true, updateExtensions: false },
          {
            latestVersion: async () => version,
            packages,
          },
        )
      ).piVersion,
      undefined,
    );
  }
});

test("restart uses the current executable and preserves session choice", () => {
  assert.deepEqual(currentPiCommand(["update"], "/usr/bin/node", "/path/pi.js"), {
    program: "/usr/bin/node",
    args: ["/path/pi.js", "update"],
  });
  assert.deepEqual(currentPiCommand(["update"], "/path/pi", "$bunfs/pi"), {
    program: "/path/pi",
    args: ["update"],
  });
  assert.deepEqual(resumeArgs("/sessions/active.jsonl"), ["--session", "/sessions/active.jsonl"]);
  assert.deepEqual(resumeArgs(undefined), ["--no-session"]);
});
