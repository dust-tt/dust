import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const PROFILE_LOCAL_DIR = path.resolve(__dirname, "..");

export function runBashFunction(
  funcCall: string,
  cwd: string
): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const profilePath = path.join(PROFILE_LOCAL_DIR, "common.sh");
  const result = spawnSync(
    "bash",
    ["--norc", "-c", `source "${profilePath}" && ${funcCall}`],
    {
      cwd,
      encoding: "utf-8",
      timeout: 10000,
    }
  );
  return {
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    exitCode: result.status ?? 1,
  };
}

export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "profile-test-"));
}

export function cleanupTempDir(tempDir: string): void {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
