import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runTool } from "./_test_utils";

describe("edit_file", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    fs.writeFileSync(path.join(tempDir, "edit.txt"), "hello world\nfoo bar\n");
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("replaces unique match", async () => {
    const filePath = path.join(tempDir, "edit.txt");
    const { stdout, stderr, exitCode } = await runTool("edit_file", [
      "hello",
      "goodbye",
      filePath,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("-hello world");
    expect(stderr).toContain("+goodbye world");
    expect(fs.readFileSync(filePath, "utf-8")).toBe("goodbye world\nfoo bar\n");
  });

  it("errors when old_text not found", async () => {
    const filePath = path.join(tempDir, "edit.txt");
    const { stderr, exitCode } = await runTool("edit_file", [
      "nonexistent",
      "replacement",
      filePath,
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("old_text not found");
  });

  it("treats --help as literal text when editing", async () => {
    const filePath = path.join(tempDir, "help-literal.txt");
    fs.writeFileSync(filePath, "--help\n");
    const { exitCode } = await runTool("edit_file", [
      "--help",
      "updated",
      filePath,
    ]);
    expect(exitCode).toBe(0);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("updated\n");
  });

  describe("validation", () => {
    it("rejects empty files", async () => {
      const filePath = path.join(tempDir, "empty.txt");
      fs.writeFileSync(filePath, "");
      const result = await runTool("edit_file", ["old", "new", filePath]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("file is empty");
    });

    it("rejects file with null bytes as binary", async () => {
      const filePath = path.join(tempDir, "nullbyte.txt");
      fs.writeFileSync(filePath, Buffer.from("hello\x00world\n"));
      const result = await runTool("edit_file", ["hello", "bye", filePath]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("binary file");
    });
  });

  it("handles multiline edits", async () => {
    const filePath = path.join(tempDir, "multi.txt");
    fs.writeFileSync(filePath, "before\nline1\nline2\nafter\n");
    const result = await runTool("edit_file", [
      "line1\nline2",
      "new1\nnew2\nnew3",
      filePath,
    ]);
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(
      "before\nnew1\nnew2\nnew3\nafter\n"
    );
  });

  describe("delete", () => {
    it("deletes the literal old_text including newline when included", async () => {
      const filePath = path.join(tempDir, "smartdel2.txt");
      fs.writeFileSync(filePath, "line1\ndebug_line\nline3\n");
      const result = await runTool("edit_file", ["debug_line\n", "", filePath]);
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("line1\nline3\n");
    });
  });

  describe("trailing whitespace", () => {
    it("preserves trailing whitespace in new_text", async () => {
      const filePath = path.join(tempDir, "ws.txt");
      fs.writeFileSync(filePath, "hello world\n");
      const result = await runTool("edit_file", [
        "hello",
        "goodbye   ",
        filePath,
      ]);
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("goodbye    world\n");
    });

    it("preserves trailing whitespace in markdown files", async () => {
      const filePath = path.join(tempDir, "doc.md");
      fs.writeFileSync(filePath, "hello world\n");
      const result = await runTool("edit_file", [
        "hello",
        "goodbye  ",
        filePath,
      ]);
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe("goodbye   world\n");
    });
  });

  describe("replace-all", () => {
    it("replaces all occurrences with --replace-all", async () => {
      const filePath = path.join(tempDir, "replall.txt");
      fs.writeFileSync(filePath, "foo bar\nfoo baz\nfoo qux\n");
      const result = await runTool("edit_file", [
        "--replace-all",
        "foo",
        "replaced",
        filePath,
      ]);
      expect(result.exitCode).toBe(0);
      expect(fs.readFileSync(filePath, "utf-8")).toBe(
        "replaced bar\nreplaced baz\nreplaced qux\n"
      );
    });

    it("rejects multiple matches without --replace-all", async () => {
      const filePath = path.join(tempDir, "replall2.txt");
      fs.writeFileSync(filePath, "foo bar\nfoo baz\n");
      const result = await runTool("edit_file", ["foo", "bar", filePath]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("matches 2 times");
    });
  });

  describe("diff output", () => {
    it("keeps no-trailing-newline diffs readable", async () => {
      const filePath = path.join(tempDir, "no-newline-diff.txt");
      fs.writeFileSync(filePath, "Update timestamp: 1");
      const result = await runTool("edit_file", [
        "Update timestamp",
        "End timestamp",
        filePath,
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("-Update timestamp: 1");
      expect(result.stderr).toContain("+End timestamp: 1");
      expect(result.stderr).toContain("\\ No newline at end of file");
    });

    it("truncates very large diffs", async () => {
      const filePath = path.join(tempDir, "big-diff.txt");
      const lines = Array.from({ length: 2000 }, () => "foo");
      fs.writeFileSync(filePath, lines.join("\n") + "\n");
      const result = await runTool("edit_file", [
        "--replace-all",
        "foo",
        "bar",
        filePath,
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("[Diff truncated after");
    });
  });
});
