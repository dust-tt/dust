import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runBashFunction } from "./_test_utils";

describe("read_file", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    fs.writeFileSync(
      path.join(tempDir, "test.txt"),
      "line1\nline2\nline3\nline4\nline5\n"
    );
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("reads entire file with line numbers", () => {
    const { stdout, exitCode } = runBashFunction(
      `read_file "${tempDir}/test.txt"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("1\tline1");
    expect(stdout).toContain("5\tline5");
  });

  it("reads with offset and limit", () => {
    // offset=2, limit=2 means lines 2-3
    const { stdout, exitCode } = runBashFunction(
      `read_file "${tempDir}/test.txt" 2 2`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("2\tline2");
    expect(stdout).toContain("3\tline3");
    expect(stdout).not.toContain("1\tline1");
    expect(stdout).not.toContain("4\tline4");
  });

  it("reads from offset to EOF when no limit given", () => {
    const { stdout, exitCode } = runBashFunction(
      `read_file "${tempDir}/test.txt" 3`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("3\tline3");
    expect(stdout).toContain("5\tline5");
    expect(stdout).not.toContain("1\tline1");
  });

  it("outputs header with line range and total", () => {
    const { stdout, exitCode } = runBashFunction(
      `read_file "${tempDir}/test.txt"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[File:");
    expect(stdout).toContain("of 5]");
  });

  it("errors on missing path", () => {
    const { stderr, exitCode } = runBashFunction("read_file", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("path is required");
  });

  it("errors on file not found", () => {
    const { stderr, exitCode } = runBashFunction(
      `read_file "${tempDir}/nonexistent.txt"`,
      tempDir
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("file not found");
  });

  it("returns help with --help flag", () => {
    const { stdout, exitCode } = runBashFunction("read_file --help", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("read_file <path>");
  });

  it("error includes usage hint", () => {
    const { stderr, exitCode } = runBashFunction("read_file", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
    expect(stderr).toContain("--help");
  });

  it("detects binary files", () => {
    const binaryPath = path.join(tempDir, "binary.bin");
    const buf = Buffer.alloc(100);
    buf[50] = 0; // null byte
    buf.write("some text", 0);
    fs.writeFileSync(binaryPath, buf);

    const { stderr, exitCode } = runBashFunction(
      `read_file "${binaryPath}"`,
      tempDir
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("binary file detected");
  });

  it("supports gemini start/end semantics", () => {
    const { stdout, exitCode } = runBashFunction(
      `read_file "${tempDir}/test.txt" 2 4`,
      tempDir,
      "gemini"
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("2\tline2");
    expect(stdout).toContain("4\tline4");
    expect(stdout).not.toContain("1\tline1");
    expect(stdout).not.toContain("5\tline5");
  });

  it("counts a non-empty file without a trailing newline correctly", () => {
    const filePath = path.join(tempDir, "no-trailing-newline.txt");
    fs.writeFileSync(filePath, "lonely line");
    const { stdout, exitCode } = runBashFunction(
      `read_file "${filePath}"`,
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("of 1]");
    expect(stdout).toContain("1\tlonely line");
  });
});
