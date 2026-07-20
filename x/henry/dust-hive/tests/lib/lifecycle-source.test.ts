import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSourceFingerprint } from "../../src/lib/lifecycle-source";

const temporaryDirectories: string[] = [];

async function runGit(worktreePath: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: worktreePath,
    stdout: "ignore",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    throw new Error(stderr);
  }
}

async function createRepository(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "dust-hive-lifecycle-"));
  temporaryDirectories.push(path);
  await runGit(path, ["init", "-q"]);
  await runGit(path, ["config", "user.email", "test@example.com"]);
  await runGit(path, ["config", "user.name", "Test"]);
  await Bun.write(join(path, "tracked.ts"), "export const value = 1;\n");
  await Bun.write(join(path, ".gitignore"), "ignored.log\n");
  await runGit(path, ["add", "tracked.ts", ".gitignore"]);
  await runGit(path, ["commit", "-qm", "Initial"]);
  return path;
}

afterEach(async () => {
  for (const path of temporaryDirectories.splice(0)) {
    await rm(path, { recursive: true, force: true });
  }
});

describe("source activity fingerprint", () => {
  it("changes for continued edits to an already dirty file", async () => {
    const worktreePath = await createRepository();
    const cleanFingerprint = await getSourceFingerprint(worktreePath);

    await Bun.write(join(worktreePath, "tracked.ts"), "export const value = 2;\n");
    const firstEditFingerprint = await getSourceFingerprint(worktreePath);
    await Bun.write(join(worktreePath, "tracked.ts"), "export const value = 300;\n");
    const secondEditFingerprint = await getSourceFingerprint(worktreePath);

    expect(firstEditFingerprint).not.toBe(cleanFingerprint);
    expect(secondEditFingerprint).not.toBe(firstEditFingerprint);
  });

  it("ignores generated files excluded by Git", async () => {
    const worktreePath = await createRepository();
    const before = await getSourceFingerprint(worktreePath);

    await Bun.write(join(worktreePath, "ignored.log"), "generated output\n");

    expect(await getSourceFingerprint(worktreePath)).toBe(before);
  });
});
