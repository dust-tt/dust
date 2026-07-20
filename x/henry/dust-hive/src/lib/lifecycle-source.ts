import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { isErrnoException } from "./errors";

async function runGit(worktreePath: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: worktreePath,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr.trim() || "unknown error"}`);
  }
  return stdout;
}

async function getPathFingerprint(worktreePath: string, relativePath: string): Promise<string> {
  try {
    const info = await lstat(join(worktreePath, relativePath));
    return `${relativePath}:${info.mtimeMs}:${info.size}`;
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return `${relativePath}:missing`;
    }
    throw error;
  }
}

export async function getSourceFingerprint(worktreePath: string): Promise<string> {
  const [head, changedPaths, untrackedPaths] = await Promise.all([
    runGit(worktreePath, ["rev-parse", "HEAD"]),
    runGit(worktreePath, ["diff", "--name-only", "-z", "HEAD", "--"]),
    runGit(worktreePath, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const paths = new Set(
    `${changedPaths}${untrackedPaths}`.split("\0").filter((path) => path.length > 0)
  );
  const pathFingerprints = await Promise.all(
    [...paths].sort().map((path) => getPathFingerprint(worktreePath, path))
  );

  return Bun.hash(`${head.trim()}\0${pathFingerprints.join("\0")}`).toString(16);
}
