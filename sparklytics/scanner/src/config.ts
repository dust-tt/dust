import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ScanConfig } from "./types.js";

const ConfigFileSchema = z
  .object({
    targetDir: z.string().optional(),
    packageName: z.string().optional(),
    excludeDirs: z.array(z.string()).optional(),
    sparkleTokensPath: z.string().nullable().optional(),
    outputDir: z.string().optional(),
  })
  .strict();

const DEFAULTS: ScanConfig = {
  targetDir: process.cwd(),
  packageName: "@dust-tt/sparkle",
  excludeDirs: ["node_modules", ".next", "dist", "build", "coverage", ".git", "sparkle"],
  sparkleTokensPath: null,
  outputDir: process.cwd(),
  verbose: false,
};

export function loadConfig(cliFlags: Partial<ScanConfig> = {}): ScanConfig {
  let fileConfig: Partial<ScanConfig> = {};

  const configPath = path.join(process.cwd(), "sparkle.config.json");
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const parsed = ConfigFileSchema.safeParse(raw);
      if (parsed.success) {
        fileConfig = parsed.data as Partial<ScanConfig>;
      } else {
        console.warn(
          "[sparkle-scan] Warning: sparkle.config.json has invalid fields, ignoring."
        );
      }
    } catch {
      console.warn(
        "[sparkle-scan] Warning: Could not parse sparkle.config.json."
      );
    }
  }

  const merged: ScanConfig = {
    ...DEFAULTS,
    ...fileConfig,
    ...Object.fromEntries(
      Object.entries(cliFlags).filter(([, v]) => v !== undefined)
    ),
  } as ScanConfig;

  // Resolve targetDir and outputDir to absolute paths
  if (!path.isAbsolute(merged.targetDir)) {
    merged.targetDir = path.resolve(process.cwd(), merged.targetDir);
  }
  if (!path.isAbsolute(merged.outputDir)) {
    merged.outputDir = path.resolve(process.cwd(), merged.outputDir);
  }
  if (
    merged.sparkleTokensPath &&
    !path.isAbsolute(merged.sparkleTokensPath)
  ) {
    merged.sparkleTokensPath = path.resolve(
      process.cwd(),
      merged.sparkleTokensPath
    );
  }

  return merged;
}
