import {
  DefaultPackageManager,
  getAgentDir,
  SettingsManager,
  VERSION,
} from "@earendil-works/pi-coding-agent";
import { gt, valid } from "semver";
import { z } from "zod";
import type { AutoUpdateConfig } from "./config.js";

export interface PendingUpdates {
  piVersion?: string;
  packages: string[];
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
    packages: (cwd: string) => Promise<string[]>;
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

async function checkPackages(cwd: string): Promise<string[]> {
  const agentDir = getAgentDir();

  const manager = new DefaultPackageManager({
    cwd,
    agentDir,
    settingsManager: SettingsManager.create(cwd, agentDir),
  });

  const updates = await manager.checkForAvailableUpdates();

  return updates.map((update) => update.displayName);
}
