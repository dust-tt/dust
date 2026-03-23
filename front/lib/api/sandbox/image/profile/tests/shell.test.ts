import { execSync } from "child_process";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, runBashFunction } from "./_test_utils";

function hasTimeoutCommand(): boolean {
  try {
    execSync("command -v timeout", { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

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

  it("captures stderr separately from stdout", () => {
    const { stdout, stderr, exitCode } = runBashFunction(
      'shell "echo error >&2"',
      tempDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe("error");
  });

  it("captures both stdout and stderr separately", () => {
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

  it("truncates long output and saves to file", () => {
    // seq 1 15000 produces ~90000 chars, exceeding 50000 limit
    const { stdout } = runBashFunction('shell "seq 1 15000"', tempDir);
    expect(stdout).toContain("[Output too long");
    expect(stdout).toContain("[BEGIN TAIL]");
    expect(stdout).toContain("[END TAIL]");
    expect(stdout).toContain("/tmp/shell_output_");
    expect(stdout).toContain("15000");
  });

  it("timeout_sec param causes timeout after N seconds", () => {
    if (!hasTimeoutCommand()) {
      // timeout command not available on macOS, skip
      return;
    }
    // Use a 1 second timeout with a 5 second sleep
    const { stderr, exitCode } = runBashFunction('shell "sleep 5" 1', tempDir);
    expect(exitCode).toBe(124);
    expect(stderr).toContain("timed out after 1s");
  });

  it("returns help with --help flag", () => {
    const { stdout, exitCode } = runBashFunction("shell --help", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("shell <command>");
  });

  it("error includes usage hint", () => {
    const { stderr, exitCode } = runBashFunction("shell", tempDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
    expect(stderr).toContain("--help");
  });
});
