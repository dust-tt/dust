import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AI_CONFIG_DIRS, collectFilesRecursively, mergeSkills } from "../../src/lib/skills";

describe("skills", () => {
  const testDir = "/tmp/dust-hive-test-skills";

  beforeAll(() => {
    // Clean up any previous test artifacts
    rmSync(testDir, { recursive: true, force: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("collectFilesRecursively", () => {
    const filesDir = join(testDir, "collect-files");

    beforeAll(() => {
      mkdirSync(join(filesDir, "subdir"), { recursive: true });
      writeFileSync(join(filesDir, "file1.txt"), "content1");
      writeFileSync(join(filesDir, "file2.md"), "content2");
      writeFileSync(join(filesDir, "subdir", "nested.txt"), "nested content");
    });

    it("collects files from a directory", () => {
      const files = collectFilesRecursively(filesDir);
      expect(files.size).toBe(3);
      expect(files.has("file1.txt")).toBe(true);
      expect(files.has("file2.md")).toBe(true);
      expect(files.has("subdir/nested.txt")).toBe(true);
    });

    it("returns absolute paths as values", () => {
      const files = collectFilesRecursively(filesDir);
      expect(files.get("file1.txt")).toBe(join(filesDir, "file1.txt"));
      expect(files.get("subdir/nested.txt")).toBe(join(filesDir, "subdir", "nested.txt"));
    });

    it("returns empty map for non-existent directory", () => {
      const files = collectFilesRecursively("/non/existent/path");
      expect(files.size).toBe(0);
    });

    it("skips symlinks to avoid loops", () => {
      const symlinkDir = join(testDir, "symlink-test");
      mkdirSync(symlinkDir, { recursive: true });
      writeFileSync(join(symlinkDir, "real-file.txt"), "real");

      // Create a symlink that would cause a loop
      symlinkSync(symlinkDir, join(symlinkDir, "loop-link"));

      const files = collectFilesRecursively(symlinkDir);
      expect(files.size).toBe(1);
      expect(files.has("real-file.txt")).toBe(true);
      expect(files.has("loop-link")).toBe(false);
    });
  });

  describe("mergeSkills", () => {
    const mergeDir = join(testDir, "merge-skills");

    beforeAll(() => {
      // Create skills in .claude (highest priority)
      mkdirSync(join(mergeDir, ".claude", "skills", "skill-a"), { recursive: true });
      writeFileSync(join(mergeDir, ".claude", "skills", "skill-a", "SKILL.md"), "from claude");

      // Create skills in .codex (medium priority)
      mkdirSync(join(mergeDir, ".codex", "skills", "skill-a"), { recursive: true });
      writeFileSync(join(mergeDir, ".codex", "skills", "skill-a", "SKILL.md"), "from codex");
      writeFileSync(join(mergeDir, ".codex", "skills", "skill-a", "extra.txt"), "codex extra");

      mkdirSync(join(mergeDir, ".codex", "skills", "skill-b"), { recursive: true });
      writeFileSync(join(mergeDir, ".codex", "skills", "skill-b", "SKILL.md"), "codex skill-b");

      // Create skills in .agents (lowest priority)
      mkdirSync(join(mergeDir, ".agents", "skills", "skill-a"), { recursive: true });
      writeFileSync(join(mergeDir, ".agents", "skills", "skill-a", "SKILL.md"), "from agents");

      mkdirSync(join(mergeDir, ".agents", "skills", "skill-c"), { recursive: true });
      writeFileSync(join(mergeDir, ".agents", "skills", "skill-c", "SKILL.md"), "agents skill-c");
    });

    it("merges skills from all config directories", () => {
      const skills = mergeSkills(mergeDir, AI_CONFIG_DIRS);
      expect(skills.size).toBe(3);
      expect(skills.has("skill-a")).toBe(true);
      expect(skills.has("skill-b")).toBe(true);
      expect(skills.has("skill-c")).toBe(true);
    });

    it("uses whole-skill override semantics (highest priority wins entirely)", () => {
      const skills = mergeSkills(mergeDir, AI_CONFIG_DIRS);
      const skillA = skills.get("skill-a");

      // skill-a from .claude should completely replace lower priority versions
      if (!skillA) {
        throw new Error("skill-a should exist");
      }
      expect(skillA.files.size).toBe(1); // Only SKILL.md from claude, not extra.txt from codex
      expect(skillA.files.has("SKILL.md")).toBe(true);
      expect(skillA.files.has("extra.txt")).toBe(false); // codex's extra file not merged
    });

    it("preserves skills unique to lower priority directories", () => {
      const skills = mergeSkills(mergeDir, AI_CONFIG_DIRS);

      // skill-b only exists in .codex
      const skillB = skills.get("skill-b");
      if (!skillB) {
        throw new Error("skill-b should exist");
      }
      expect(skillB.files.has("SKILL.md")).toBe(true);

      // skill-c only exists in .agents
      const skillC = skills.get("skill-c");
      if (!skillC) {
        throw new Error("skill-c should exist");
      }
      expect(skillC.files.has("SKILL.md")).toBe(true);
    });

    it("returns empty map when no config directories exist", () => {
      const skills = mergeSkills("/non/existent/path", AI_CONFIG_DIRS);
      expect(skills.size).toBe(0);
    });

    it("handles partial config directories (some missing)", () => {
      const partialDir = join(testDir, "partial-merge");
      mkdirSync(join(partialDir, ".claude", "skills", "only-claude"), { recursive: true });
      writeFileSync(
        join(partialDir, ".claude", "skills", "only-claude", "SKILL.md"),
        "claude only"
      );
      // .codex and .agents don't exist

      const skills = mergeSkills(partialDir, AI_CONFIG_DIRS);
      expect(skills.size).toBe(1);
      expect(skills.has("only-claude")).toBe(true);
    });
  });

  describe("AI_CONFIG_DIRS", () => {
    it("has correct priority order (highest first)", () => {
      expect(AI_CONFIG_DIRS[0]).toBe(".claude");
      expect(AI_CONFIG_DIRS[1]).toBe(".codex");
      expect(AI_CONFIG_DIRS[2]).toBe(".agents");
    });

    it("has exactly 3 config directories", () => {
      expect(AI_CONFIG_DIRS.length).toBe(3);
    });
  });
});
