import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runTool } from "./_test_utils";

describe("grep_files", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    fs.writeFileSync(path.join(tempDir, "file1.txt"), "hello world\n");
    fs.writeFileSync(path.join(tempDir, "file2.txt"), "foo bar\nhello again\n");
    fs.mkdirSync(path.join(tempDir, "subdir"));
    fs.writeFileSync(
      path.join(tempDir, "subdir", "file3.py"),
      "# hello\nprint('test')\n"
    );
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("searches for pattern in directory", async () => {
    const { stdout, exitCode } = await runTool("grep_files", [
      "hello",
      "--path",
      tempDir,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("file2.txt");
    expect(stdout).toContain("file3.py");
  });

  it("filters by glob pattern", async () => {
    const { stdout, exitCode } = await runTool("grep_files", [
      "hello",
      "--glob",
      "*.txt",
      "--path",
      tempDir,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).not.toContain("file3.py");
  });

  it("errors on missing pattern", async () => {
    const { stderr, exitCode } = await runTool("grep_files", []);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("pattern is required");
  });

  it("max-results param limits output lines", async () => {
    const lines = Array.from({ length: 50 }, (_, i) => `hello line ${i + 1}`);
    fs.writeFileSync(path.join(tempDir, "many.txt"), lines.join("\n") + "\n");
    const { stdout, exitCode } = await runTool("grep_files", [
      "hello",
      "--path",
      tempDir,
      "--max-results",
      "3",
    ]);
    expect(exitCode).toBe(0);
    // Should show pagination hint since there are more than 3 matches
    const outputLines = stdout
      .split("\n")
      .filter((l: string) => /:\d+:/.test(l));
    expect(outputLines.length).toBeLessThanOrEqual(3);
    expect(stdout).toContain("Next offset: 3");
  });

  it("context param shows N lines before/after matches", async () => {
    fs.writeFileSync(
      path.join(tempDir, "context.txt"),
      "line1\nline2\nTARGET\nline4\nline5\n"
    );
    const { stdout, exitCode } = await runTool("grep_files", [
      "TARGET",
      "--glob",
      "*.txt",
      "--path",
      tempDir,
      "--context",
      "1",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("line2");
    expect(stdout).toContain("TARGET");
    expect(stdout).toContain("line4");
  });

  it("sorts output by file path", async () => {
    const { stdout, exitCode } = await runTool("grep_files", [
      "hello",
      "--path",
      tempDir,
    ]);
    expect(exitCode).toBe(0);
    const lines = stdout.split("\n").filter((l: string) => l.includes(":"));
    const filePaths = lines.map((l: string) => l.split(":")[0]);
    const sorted = [...filePaths].sort();
    expect(filePaths).toEqual(sorted);
  });

  it("supports anthropic output-mode files", async () => {
    const { stdout, exitCode } = await runTool(
      "grep_files",
      ["hello", "--path", tempDir, "--output-mode", "files"],
      "anthropic"
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    // In files mode, no line numbers or content shown
    expect(stdout).not.toContain("hello world");
  });

  it("treats a flag-like pattern literally after --", async () => {
    fs.writeFileSync(
      path.join(tempDir, "flags.txt"),
      "--help is literal here\n"
    );
    const { stdout, exitCode } = await runTool("grep_files", [
      "--path",
      tempDir,
      "--",
      "--help",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("flags.txt");
    expect(stdout).toContain("--help is literal here");
  });

  it("returns structured errors for invalid numeric flags", async () => {
    const { stderr, exitCode } = await runTool("grep_files", [
      "hello",
      "--path",
      tempDir,
      "--max-results",
      "nope",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("invalid value for --max-results");
    expect(stderr).not.toContain("Traceback");
  });

  it("supports stable offset pagination", async () => {
    const lines = Array.from({ length: 8 }, (_, i) => `hello page ${i + 1}`);
    fs.writeFileSync(path.join(tempDir, "pages.txt"), lines.join("\n") + "\n");
    const page1 = await runTool("grep_files", [
      "hello page",
      "--path",
      tempDir,
      "--max-results",
      "3",
      "--offset",
      "0",
    ]);
    const page2 = await runTool("grep_files", [
      "hello page",
      "--path",
      tempDir,
      "--max-results",
      "3",
      "--offset",
      "3",
    ]);
    expect(page1.exitCode).toBe(0);
    expect(page2.exitCode).toBe(0);
    expect(page1.stdout).toContain("hello page 1");
    expect(page1.stdout).not.toContain("hello page 4");
    expect(page2.stdout).toContain("hello page 4");
    expect(page2.stdout).not.toContain("hello page 1");
  });
});
