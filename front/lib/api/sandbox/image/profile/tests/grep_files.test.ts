import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runBashFunction } from "./_test_utils";

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

  it("searches for pattern in directory", () => {
    const { stdout, exitCode } = runBashFunction(
      `grep_files "hello" "" "${tempDir}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("file2.txt");
    expect(stdout).toContain("file3.py");
  });

  it("filters by glob pattern", () => {
    const { stdout, exitCode } = runBashFunction(
      `grep_files "hello" "*.txt" "${tempDir}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).not.toContain("file3.py");
  });

  it("errors on missing pattern", () => {
    const { stderr, exitCode } = runBashFunction("grep_files", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("pattern is required");
  });

  it("max_results param limits output lines", () => {
    // Create a file with many matches
    const lines = Array.from({ length: 50 }, (_, i) => `hello line ${i + 1}`);
    fs.writeFileSync(path.join(tempDir, "many.txt"), lines.join("\n") + "\n");
    const { stdout, exitCode } = runBashFunction(
      `grep_files "hello" "*.txt" "${tempDir}" 10`,
      tempDir
    );
    expect(exitCode).toBe(0);
    // Should have truncation message since we have >10 results
    expect(stdout).toContain("truncated");
  });

  it("context_lines param shows N lines before/after matches", () => {
    fs.writeFileSync(
      path.join(tempDir, "context.txt"),
      "line1\nline2\nTARGET\nline4\nline5\n"
    );
    const { stdout, exitCode } = runBashFunction(
      `grep_files "TARGET" "*.txt" "${tempDir}" 200 1`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("line2");
    expect(stdout).toContain("TARGET");
    expect(stdout).toContain("line4");
  });

  it("returns help with --help flag", () => {
    const { stdout, exitCode } = runBashFunction("grep_files --help", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("grep_files <pattern>");
  });

  it("error includes usage hint", () => {
    const { stderr, exitCode } = runBashFunction("grep_files", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
    expect(stderr).toContain("--help");
  });
});
