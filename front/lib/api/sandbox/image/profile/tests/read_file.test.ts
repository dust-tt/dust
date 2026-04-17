import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runTool } from "./_test_utils";

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

  it("reads with offset and limit", async () => {
    // offset=2, limit=2 means lines 2-3
    const { stdout, exitCode } = await runTool("read_file", [
      path.join(tempDir, "test.txt"),
      "2",
      "2",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("2\tline2");
    expect(stdout).toContain("3\tline3");
    expect(stdout).not.toContain("1\tline1");
    expect(stdout).not.toContain("4\tline4");
  });

  it("reads from offset to EOF when no limit given", async () => {
    const { stdout, exitCode } = await runTool("read_file", [
      path.join(tempDir, "test.txt"),
      "3",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("3\tline3");
    expect(stdout).toContain("5\tline5");
    expect(stdout).not.toContain("1\tline1");
  });

  it("outputs header with line range and total", async () => {
    const { stdout, exitCode } = await runTool("read_file", [
      path.join(tempDir, "test.txt"),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("[File:");
    expect(stdout).toContain("of 5]");
  });

  it("errors on missing path", async () => {
    const { stderr, exitCode } = await runTool("read_file", []);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("path is required");
  });

  it("errors on file not found", async () => {
    const { stderr, exitCode } = await runTool("read_file", [
      path.join(tempDir, "nonexistent.txt"),
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("file not found");
  });

  it("detects binary files", async () => {
    const binaryPath = path.join(tempDir, "binary.bin");
    const buf = Buffer.alloc(100);
    buf[50] = 0; // null byte
    buf.write("some text", 0);
    fs.writeFileSync(binaryPath, buf);

    const { stderr, exitCode } = await runTool("read_file", [binaryPath]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("binary file detected");
  });

  it("supports gemini start/end semantics", async () => {
    const { stdout, exitCode } = await runTool(
      "read_file",
      [path.join(tempDir, "test.txt"), "2", "4"],
      "gemini"
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("2\tline2");
    expect(stdout).toContain("4\tline4");
    expect(stdout).not.toContain("1\tline1");
    expect(stdout).not.toContain("5\tline5");
  });

  it("counts a non-empty file without a trailing newline correctly", async () => {
    const filePath = path.join(tempDir, "no-trailing-newline.txt");
    fs.writeFileSync(filePath, "lonely line");
    const { stdout, exitCode } = await runTool("read_file", [filePath]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("of 1]");
    expect(stdout).toContain("1\tlonely line");
  });
});
