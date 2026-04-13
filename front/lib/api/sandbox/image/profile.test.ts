import { describe, expect, it } from "vitest";

import {
  buildWaitAndCollectCommand,
  generateExecId,
  wrapCommand,
  wrapCommandWithCapture,
} from "./profile";

describe("generateExecId", () => {
  it("returns a 16-character hex string", () => {
    const id = generateExecId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateExecId()));
    expect(ids.size).toBe(100);
  });
});

describe("wrapCommandWithCapture", () => {
  it("includes tee redirect to output file", () => {
    const result = wrapCommandWithCapture("ls -la", "abc123", "anthropic");
    expect(result).toContain("tee /tmp/dust_exec_abc123.out");
  });

  it("includes exit sentinel", () => {
    const result = wrapCommandWithCapture("ls -la", "abc123", "anthropic");
    expect(result).toContain("echo $_EXIT > /tmp/dust_exec_abc123.exit");
  });

  it("sources the profile and wraps the command", () => {
    const result = wrapCommandWithCapture("echo hello", "abc123", "anthropic");
    expect(result).toContain(
      'source /opt/dust/profile/common.sh && shell "echo hello" 60'
    );
  });

  it("escapes double quotes and backslashes", () => {
    const result = wrapCommandWithCapture(
      'echo "hello \\ world"',
      "abc123",
      "anthropic"
    );
    expect(result).toContain('shell "echo \\"hello \\\\ world\\"" 60');
  });

  it("respects custom timeout", () => {
    const result = wrapCommandWithCapture("ls", "abc123", "anthropic", {
      timeoutSec: 120,
    });
    expect(result).toContain("120");
  });
});

describe("buildWaitAndCollectCommand", () => {
  it("includes PID-based orphan cleanup", () => {
    const result = buildWaitAndCollectCommand("abc123");
    expect(result).toContain("kill $(cat /tmp/dust_wac_abc123.pid)");
  });

  it("writes its own PID", () => {
    const result = buildWaitAndCollectCommand("abc123");
    expect(result).toContain("echo $$ > /tmp/dust_wac_abc123.pid");
  });

  it("waits for exit sentinel", () => {
    const result = buildWaitAndCollectCommand("abc123");
    expect(result).toContain(
      "while [ ! -f /tmp/dust_exec_abc123.exit ]; do sleep 0.5; done"
    );
  });

  it("reads the output file", () => {
    const result = buildWaitAndCollectCommand("abc123");
    expect(result).toContain("cat /tmp/dust_exec_abc123.out");
  });

  it("exits with the captured exit code", () => {
    const result = buildWaitAndCollectCommand("abc123");
    expect(result).toContain("exit $(cat /tmp/dust_exec_abc123.exit)");
  });
});

describe("wrapCommand", () => {
  it("still works unchanged", () => {
    const result = wrapCommand("echo hi", "anthropic");
    expect(result).toBe(
      'source /opt/dust/profile/common.sh && shell "echo hi" 60'
    );
  });
});
