import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runBashFunction } from "./_test_utils";

describe("glob", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    fs.writeFileSync(path.join(tempDir, "file1.txt"), "");
    fs.writeFileSync(path.join(tempDir, "file2.py"), "");
    fs.mkdirSync(path.join(tempDir, "subdir"));
    fs.writeFileSync(path.join(tempDir, "subdir", "file3.txt"), "");
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("finds files matching glob pattern", () => {
    const { stdout, exitCode } = runBashFunction(
      `glob "*.txt" "${tempDir}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("file3.txt");
    expect(stdout).not.toContain("file2.py");
  });

  it("supports recursive glob", () => {
    const { stdout, exitCode } = runBashFunction(
      `glob "**/*.txt" "${tempDir}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("file3.txt");
  });

  it("errors on missing pattern", () => {
    const { stderr, exitCode } = runBashFunction("glob", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("pattern is required");
  });

  it("returns help with --help flag", () => {
    const { stdout, exitCode } = runBashFunction("glob --help", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("glob <pattern>");
  });

  it("error includes usage hint", () => {
    const { stderr, exitCode } = runBashFunction("glob", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
    expect(stderr).toContain("--help");
  });
});
