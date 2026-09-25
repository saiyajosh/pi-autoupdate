import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const configSchema = z.strictObject({
  updatePi: z.boolean().default(true),
  updateExtensions: z.boolean().default(true),
});

export type AutoUpdateConfig = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: AutoUpdateConfig = {
  updatePi: true,
  updateExtensions: true,
};

export function configPath(agentDir: string): string {
  return join(agentDir, "autoupdate.json");
}

export async function loadConfig(path: string): Promise<AutoUpdateConfig> {
  let text: string;

  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { ...DEFAULT_CONFIG };
    }

    throw new Error(`Cannot read ${path}: ${String(error)}`, { cause: error });
  }

  try {
    return configSchema.parse(JSON.parse(text));
  } catch (error) {
    throw new Error(`Invalid config ${path}: ${String(error)}`, { cause: error });
  }
}

export async function saveConfig(path: string, config: AutoUpdateConfig): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporary, `${JSON.stringify(configSchema.parse(config), null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
