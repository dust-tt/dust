import path from "node:path";
import fg from "fast-glob";
import type { ScanConfig } from "../types.js";

export interface CollectedFiles {
  tsx: string[];
  css: string[];
}

export async function collectFiles(
  config: ScanConfig
): Promise<CollectedFiles> {
  const ignore = config.excludeDirs.map((d) => `**/${d}/**`);

  const [tsx, css] = await Promise.all([
    fg(["**/*.tsx", "**/*.ts", "!**/*.d.ts"], {
      cwd: config.targetDir,
      absolute: true,
      ignore,
      dot: false,
    }),
    fg(["**/*.css", "**/*.scss"], {
      cwd: config.targetDir,
      absolute: true,
      ignore,
      dot: false,
    }),
  ]);

  return {
    tsx: tsx.sort(),
    css: css.sort(),
  };
}

export function relativePath(targetDir: string, absPath: string): string {
  return path.relative(targetDir, absPath);
}
