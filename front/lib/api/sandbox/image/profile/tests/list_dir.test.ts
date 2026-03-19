import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runBashFunction } from "./_test_utils";

describe("list_dir", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    fs.mkdirSync(path.join(tempDir, "dir1"));
    fs.writeFileSync(path.join(tempDir, "file1.txt"), "");
    fs.mkdirSync(path.join(tempDir, "dir1", "nested"));
    fs.writeFileSync(path.join(tempDir, "dir1", "file2.txt"), "");
    fs.mkdirSync(path.join(tempDir, "dir1", "nested", "deep"));
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("lists directory contents with default depth", () => {
    const { stdout, exitCode } = runBashFunction(
      `list_dir "${tempDir}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("dir1");
    expect(stdout).toContain("nested");
  });

  it("respects depth parameter", () => {
    const { stdout, exitCode } = runBashFunction(
      `list_dir "${tempDir}" 1`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("dir1");
    expect(stdout).not.toContain("nested");
  });

  it("caps depth at 5", () => {
    const { stdout, exitCode } = runBashFunction(
      `list_dir "${tempDir}" 100`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("deep");
  });

  it("errors on directory not found", () => {
    const { stderr, exitCode } = runBashFunction(
      `list_dir "${tempDir}/nonexistent"`,
      tempDir
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("directory not found");
  });

  it("returns help with --help flag", () => {
    const { stdout, exitCode } = runBashFunction("list_dir --help", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("list_dir [path]");
  });
});
