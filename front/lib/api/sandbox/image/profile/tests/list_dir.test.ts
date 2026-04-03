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
      `list_dir "${tempDir}" --depth 1`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("dir1");
    expect(stdout).not.toContain("nested");
  });

  it("caps depth at 5", () => {
    const { stdout, exitCode } = runBashFunction(
      `list_dir "${tempDir}" --depth 100`,
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

  it("shows type suffixes for directories and files", () => {
    const { stdout, exitCode } = runBashFunction(
      `list_dir "${tempDir}" --depth 1`,
      tempDir
    );
    expect(exitCode).toBe(0);
    // Directories should end with /
    expect(stdout).toMatch(/dir1\//);
    // Files should not end with /
    expect(stdout).toMatch(/file1\.txt(?!\/)/);
  });

  it("sorts output alphabetically", () => {
    const { stdout, exitCode } = runBashFunction(
      `list_dir "${tempDir}" --depth 1`,
      tempDir
    );
    expect(exitCode).toBe(0);
    const lines = stdout
      .split("\n")
      .filter((l: string) => l.trim() && !l.startsWith("["));
    const sorted = [...lines].sort();
    expect(lines).toEqual(sorted);
  });

  it("supports pagination with offset and limit", () => {
    // Create many files
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(tempDir, `extra_${i}.txt`), "");
    }
    const { stdout: fullOutput } = runBashFunction(
      `list_dir "${tempDir}" --depth 1`,
      tempDir
    );
    const { stdout: page2 } = runBashFunction(
      `list_dir "${tempDir}" --depth 1 --offset 5 --limit 3`,
      tempDir
    );
    // Page 2 should have fewer entries than the full output
    const fullLines = fullOutput
      .split("\n")
      .filter((l: string) => l.trim() && !l.startsWith("["));
    const pageLines = page2
      .split("\n")
      .filter((l: string) => l.trim() && !l.startsWith("["));
    expect(pageLines.length).toBeLessThanOrEqual(3);
    expect(pageLines.length).toBeLessThan(fullLines.length);
    expect(page2).toContain("Next offset: 8");
  });
});
