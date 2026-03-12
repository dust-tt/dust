import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runBashFunction } from "./_test_utils";

describe("write_file", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("writes content to file", () => {
    const filePath = path.join(tempDir, "output.txt");
    const { stdout, exitCode } = runBashFunction(
      `write_file "${filePath}" "hello world"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Wrote");
    expect(fs.readFileSync(filePath, "utf-8")).toBe("hello world");
  });

  it("creates parent directories", () => {
    const filePath = path.join(tempDir, "nested", "deep", "file.txt");
    const { exitCode } = runBashFunction(
      `write_file "${filePath}" "content"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("content");
  });

  it("overwrites existing file", () => {
    const filePath = path.join(tempDir, "existing.txt");
    fs.writeFileSync(filePath, "old content");
    const { exitCode } = runBashFunction(
      `write_file "${filePath}" "new content"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("new content");
  });

  it("errors on missing path", () => {
    const { stderr, exitCode } = runBashFunction("write_file", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("path is required");
  });

  it("returns help with --help flag", () => {
    const { stdout, exitCode } = runBashFunction("write_file --help", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("write_file <path>");
  });

  it("error includes usage hint", () => {
    const { stderr, exitCode } = runBashFunction("write_file", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
    expect(stderr).toContain("--help");
  });
});
