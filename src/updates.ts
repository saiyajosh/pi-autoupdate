import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  DefaultPackageManager,
  getAgentDir,
  SettingsManager,
  VERSION,
} from "@earendil-works/pi-coding-agent";
import { gt, gte, valid } from "semver";
import { z } from "zod";
import type { AutoUpdateConfig } from "./config.js";

export type PackageUpdate = Awaited<
  ReturnType<DefaultPackageManager["checkForAvailableUpdates"]>
>[number];

export interface PendingUpdates {
  piVersion?: string;
  packages: PackageUpdate[];
}

export type UpdateTarget = "self" | "extensions" | "all";

export function targetFor(pending: PendingUpdates): UpdateTarget | undefined {
  if (pending.piVersion && pending.packages.length) return "all";

  if (pending.piVersion) return "self";

  if (pending.packages.length) return "extensions";

  return undefined;
}

export function updateArgs(target: UpdateTarget): string[] {
  if (target === "all") return ["update", "--self", "--extensions"];

  return ["update", target === "self" ? "--self" : "--extensions"];
}

export async function checkUpdates(
  cwd: string,
  config: AutoUpdateConfig,
  dependencies: {
    latestVersion: () => Promise<string>;
    packages: (cwd: string) => Promise<PackageUpdate[]>;
  } = { latestVersion: fetchLatestVersion, packages: checkPackages },
): Promise<PendingUpdates> {
  const [latest, packages] = await Promise.all([
    config.updatePi ? dependencies.latestVersion() : Promise.resolve(undefined),
    config.updateExtensions ? dependencies.packages(cwd) : Promise.resolve([]),
  ]);

  return {
    piVersion:
      latest && valid(latest) && valid(VERSION) && gt(latest, VERSION) ? latest : undefined,
    packages,
  };
}

async function fetchLatestVersion(): Promise<string> {
  const response = await fetch("https://pi.dev/api/latest-version", {
    headers: { accept: "application/json", "User-Agent": `pi-autoupdate/${VERSION}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Pi version check returned HTTP ${response.status}`);
  const result = z.object({ version: z.string() }).parse(await response.json());

  if (!valid(result.version)) throw new Error("Pi version service returned an invalid version");

  return result.version;
}

export function verifyPiVersion(installed: string, expected: string): boolean {
  return Boolean(valid(installed) && valid(expected) && gte(installed, expected));
}

function packageManager(cwd: string): DefaultPackageManager {
  const agentDir = getAgentDir();

  return new DefaultPackageManager({
    cwd,
    agentDir,
    settingsManager: SettingsManager.create(cwd, agentDir),
  });
}

export async function checkPackages(cwd: string): Promise<PackageUpdate[]> {
  return packageManager(cwd).checkForAvailableUpdates();
}

/** Read local installation state, not a network check that can silently fail. */
export async function packageRevision(cwd: string, update: PackageUpdate): Promise<string> {
  const installed = packageManager(cwd)
    .listConfiguredPackages()
    .find((pkg) => pkg.source === update.source && pkg.scope === update.scope);

  if (!installed?.installedPath) throw new Error(`Cannot locate ${update.displayName}`);

  if (update.type === "npm") {
    const pkg = z
      .object({ version: z.string() })
      .parse(JSON.parse(await readFile(join(installed.installedPath, "package.json"), "utf8")));

    if (!valid(pkg.version)) throw new Error(`Invalid installed version for ${update.displayName}`);

    return pkg.version;
  }

  const result = await promisify(execFile)("git", ["rev-parse", "HEAD"], {
    cwd: installed.installedPath,
    timeout: 10_000,
  });

  const revision = result.stdout.trim();

  if (!/^[a-f0-9]{40,64}$/.test(revision))
    throw new Error(`Invalid git revision for ${update.displayName}`);

  return revision;
}

export function verifyPackageRevision(
  type: PackageUpdate["type"],
  before: string,
  after: string,
): boolean {
  return type === "npm"
    ? Boolean(valid(before) && valid(after) && gt(after, before))
    : /^[a-f0-9]{40,64}$/.test(before) && /^[a-f0-9]{40,64}$/.test(after) && before !== after;
}
