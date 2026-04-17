import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runTool } from "./_test_utils";

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

  it("finds files matching glob pattern", async () => {
    const { stdout, exitCode } = await runTool("glob", ["*.txt", tempDir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("file3.txt");
    expect(stdout).not.toContain("file2.py");
  });

  it("supports recursive glob", async () => {
    const { stdout, exitCode } = await runTool("glob", ["**/*.txt", tempDir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("file1.txt");
    expect(stdout).toContain("file3.txt");
  });

  it("errors on missing pattern", async () => {
    const { stderr, exitCode } = await runTool("glob", []);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("pattern is required");
  });

  it("supports pagination with next offset footer", async () => {
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(tempDir, `extra_${i}.txt`), "");
    }
    const { stdout, exitCode } = await runTool("glob", [
      "*.txt",
      "--path",
      tempDir,
      "--limit",
      "3",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Next offset: 3");
  });
});
