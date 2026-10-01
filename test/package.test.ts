import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { z } from "zod";

const exec = promisify(execFile);

test(
  "npm tarball includes only release files and loads with standalone runtime dependencies",
  { timeout: 60_000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-autoupdate-package-"));
    const packageDir = join(dir, "package");
    const agentDir = join(dir, "agent");

    try {
      const packed = await exec("pnpm", ["pack", "--pack-destination", dir, "--json"], {
        timeout: 30_000,
      });

      const metadata = z
        .object({
          filename: z.string(),
          files: z.array(z.object({ path: z.string() })),
        })
        .parse(JSON.parse(packed.stdout));

      const paths = metadata.files.map((file) => file.path).sort();
      const rootFiles = ["LICENSE", "README.md", "index.ts", "package.json"];
      assert.ok(rootFiles.every((path) => paths.includes(path)));
      assert.ok(paths.every((path) => rootFiles.includes(path) || /^src\/[\w/-]+\.ts$/.test(path)));
      await exec("tar", ["-xzf", join(dir, basename(metadata.filename)), "-C", dir]);

      const manifest = z
        .object({
          name: z.literal("pi-autoupdate"),
          version: z.string(),
          dependencies: z.object({ semver: z.string(), zod: z.string() }),
          peerDependencies: z.object({ "@earendil-works/pi-coding-agent": z.literal("*") }),
          pi: z.object({ extensions: z.array(z.string()) }),
          publishConfig: z.object({
            access: z.literal("public"),
            registry: z.literal("https://registry.npmjs.org/"),
          }),
        })
        .parse(JSON.parse(await readFile(join(packageDir, "package.json"), "utf8")));

      assert.deepEqual(manifest.pi.extensions, ["./index.ts"]);

      // Use cached production dependencies only; Pi supplies its own host API.
      await exec(
        "pnpm",
        [
          "install",
          "--prod",
          "--ignore-scripts",
          "--offline",
          "--ignore-workspace",
          "--config.auto-install-peers=false",
        ],
        { cwd: packageDir, timeout: 30_000 },
      );
      await assert.rejects(
        access(join(packageDir, "node_modules/@earendil-works/pi-coding-agent")),
      );
      await mkdir(agentDir);
      await writeFile(
        join(agentDir, "autoupdate.json"),
        '{"updatePi":false,"updateExtensions":false}\n',
      );

      const child = exec(
        join(process.cwd(), "node_modules/.bin/pi"),
        ["--extension", join(packageDir, "index.ts"), "--mode", "rpc", "--no-session"],
        {
          cwd: dir,
          env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1" },
          timeout: 15_000,
        },
      );

      child.child.stdin?.end('{"id":"commands","type":"get_commands"}\n');
      const result = await child;
      assert.match(result.stdout, /"name":"autoupdate-config"/);
      assert.doesNotMatch(result.stderr, /Failed to load extension/);
    } finally {
      await rm(dir, { recursive: true });
    }
  },
);
