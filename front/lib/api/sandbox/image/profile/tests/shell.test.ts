import * as fs from "fs";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runBashFunction } from "./_test_utils";

describe("shell", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it("executes command and captures output", () => {
    const { stdout, exitCode } = runBashFunction('shell "echo hello"', tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("hello");
  });

  it("captures stdout and stderr separately", () => {
    const { stdout, stderr, exitCode } = runBashFunction(
      'shell "echo out && echo err >&2"',
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toBe("out");
    expect(stderr).toBe("err");
  });

  it("returns exit code from command", () => {
    const { exitCode } = runBashFunction('shell "exit 42"', tempDir);
    expect(exitCode).toBe(42);
  });

  it("errors on missing command", () => {
    const { stderr, exitCode } = runBashFunction("shell", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("command is required");
  });

  it("dispatches read_file through the shell wrapper", () => {
    const filePath = path.join(tempDir, "wrapped.txt");
    fs.writeFileSync(filePath, "wrapped\n");

    const { stdout, exitCode } = runBashFunction(
      `read_file "${filePath}" 1 1`,
      tempDir
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("1\twrapped");
  });

  it("does not export edit_file for openai", () => {
    const { exitCode } = runBashFunction("type edit_file", tempDir, "openai");
    expect(exitCode).not.toBe(0);
  });

  it("truncates long stdout and saves full output to file", () => {
    // seq 1 15000 produces ~80000 chars, exceeding 50000 budget
    const { stdout } = runBashFunction('shell "seq 1 15000"', tempDir);
    expect(stdout).toContain("[Output too long");
    expect(stdout).toContain("[BEGIN TAIL]");
    expect(stdout).toContain("[END TAIL]");
    expect(stdout).toMatch(/\/tmp\/shell_output_\d+\.stdout\.txt/);
    expect(stdout).toContain("15000");
  });

  it("reserves at least 1k for stderr when both streams exceed budget", () => {
    // Each seq 1 20000 ≈ 108k chars on stdout and stderr.
    const { stdout, stderr } = runBashFunction(
      'shell "seq 1 20000; seq 1 20000 >&2"',
      tempDir
    );
    expect(stdout).toContain("[Output too long");
    expect(stderr).toContain("[Output too long");
    // stdout allocation ≈ 49000 (reserve 1000 for stderr).
    expect(stdout.length).toBeGreaterThan(48_000);
    expect(stdout.length).toBeLessThan(50_500);
    // stderr allocation ≈ 1000.
    expect(stderr.length).toBeGreaterThan(500);
    expect(stderr.length).toBeLessThan(2_500);
  });

  it("preserves small stderr untruncated and gives remainder to stdout", () => {
    const { stdout, stderr } = runBashFunction(
      'shell "seq 1 20000; echo small-err >&2"',
      tempDir
    );
    expect(stderr).toBe("small-err");
    expect(stdout).toContain("[Output too long");
    // stdout budget = 50000 - 10 (length of "small-err\n") ≈ 49990.
    expect(stdout.length).toBeGreaterThan(49_500);
  });

  it("timeout_sec param causes timeout after N seconds", () => {
    const { stderr, exitCode } = runBashFunction('shell "sleep 5" 1', tempDir);
    expect(exitCode).toBe(124);
    expect(stderr).toContain("timed out after 1s");
  });
});
