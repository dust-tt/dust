import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyClaudeConfig } from "../../src/lib/setup";

let tmpDir: string;
let srcDir: string;
let destDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "dust-hive-setup-test-"));
  srcDir = join(tmpDir, "source");
  destDir = join(tmpDir, "destination");
  await mkdir(join(srcDir, ".claude", "skills", "local-skill"), { recursive: true });
  await mkdir(join(srcDir, ".claude", "worktrees", "nested-worktree"), { recursive: true });
  await mkdir(join(destDir, ".claude", "skills", "tracked-skill"), { recursive: true });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("copyClaudeConfig", () => {
  it("merges local config without copying worktrees", async () => {
    await writeFile(join(srcDir, ".claude", "settings.local.json"), "{}");
    await writeFile(join(srcDir, ".claude", "skills", "local-skill", "SKILL.md"), "local");
    await writeFile(
      join(srcDir, ".claude", "worktrees", "nested-worktree", "large-file"),
      "unwanted"
    );
    await writeFile(join(destDir, ".claude", "skills", "tracked-skill", "SKILL.md"), "tracked");

    await copyClaudeConfig(srcDir, destDir);

    expect(await Bun.file(join(destDir, ".claude", "settings.local.json")).text()).toBe("{}");
    expect(
      await Bun.file(join(destDir, ".claude", "skills", "local-skill", "SKILL.md")).text()
    ).toBe("local");
    expect(
      await Bun.file(join(destDir, ".claude", "skills", "tracked-skill", "SKILL.md")).text()
    ).toBe("tracked");
    expect(await Bun.file(join(destDir, ".claude", "worktrees")).exists()).toBe(false);
  });
});
