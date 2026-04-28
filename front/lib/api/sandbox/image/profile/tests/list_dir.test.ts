import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runTool } from "./_test_utils";

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

  it("lists directory contents with default depth", async () => {
    const { stdout, exitCode } = await runTool("list_dir", [tempDir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("dir1");
    expect(stdout).toContain("nested");
  });

  it("respects depth parameter", async () => {
    const { stdout, exitCode } = await runTool("list_dir", [
      tempDir,
      "--depth",
      "1",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("dir1");
    expect(stdout).not.toContain("nested");
  });

  it("caps depth at 5", async () => {
    const { stdout, exitCode } = await runTool("list_dir", [
      tempDir,
      "--depth",
      "100",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("deep");
  });

  it("errors on directory not found", async () => {
    const { stderr, exitCode } = await runTool("list_dir", [
      path.join(tempDir, "nonexistent"),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("directory not found");
  });

  it("shows type suffixes for directories and files", async () => {
    const { stdout, exitCode } = await runTool("list_dir", [
      tempDir,
      "--depth",
      "1",
    ]);
    expect(exitCode).toBe(0);
    // Directories should end with /
    expect(stdout).toMatch(/dir1\//);
    // Files should not end with /
    expect(stdout).toMatch(/file1\.txt(?!\/)/);
  });

  it("sorts output alphabetically", async () => {
    const { stdout, exitCode } = await runTool("list_dir", [
      tempDir,
      "--depth",
      "1",
    ]);
    expect(exitCode).toBe(0);
    const lines = stdout
      .split("\n")
      .filter((l: string) => l.trim() && !l.startsWith("["));
    const sorted = [...lines].sort();
    expect(lines).toEqual(sorted);
  });

  it("supports pagination with offset and limit", async () => {
    // Create many files
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(tempDir, `extra_${i}.txt`), "");
    }
    const { stdout: fullOutput } = await runTool("list_dir", [
      tempDir,
      "--depth",
      "1",
    ]);
    const { stdout: page2 } = await runTool("list_dir", [
      tempDir,
      "--depth",
      "1",
      "--offset",
      "5",
      "--limit",
      "3",
    ]);
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
