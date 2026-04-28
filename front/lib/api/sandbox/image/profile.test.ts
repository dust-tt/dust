import { describe, expect, it } from "vitest";
import {
  buildWaitAndCollectCommand,
  wrapCommand,
  wrapCommandWithCapture,
} from "./profile";
import { getSandboxImageFromRegistry } from "./registry";

function expectedWrappedCommand(cmd: string, timeoutSec = 60): string {
  return [
    `source /opt/dust/profile/anthropic.sh && shell "$(cat <<'DUST_CMD_EOF'`,
    cmd,
    "DUST_CMD_EOF",
    `)" ${timeoutSec}`,
  ].join("\n");
}

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
    expect(result).toContain(expectedWrappedCommand("echo hello"));
  });

  it("preserves double quotes and backslashes", () => {
    const result = wrapCommandWithCapture(
      'echo "hello \\ world"',
      "abc123",
      "anthropic"
    );
    expect(result).toContain(expectedWrappedCommand('echo "hello \\ world"'));
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
    expect(result).toBe(expectedWrappedCommand("echo hi"));
  });

  it("does not advertise edit_file for openai", () => {
    const imageResult = getSandboxImageFromRegistry({ name: "dust-base" });
    expect(imageResult.isOk()).toBe(true);

    if (imageResult.isErr()) {
      return;
    }

    const openaiTools = imageResult.value.tools.filter((tool) => {
      if (!tool.profile) {
        return true;
      }

      return Array.isArray(tool.profile)
        ? tool.profile.includes("openai")
        : tool.profile === "openai";
    });

    expect(openaiTools.map((tool) => tool.name)).not.toContain("edit_file");
  });
});
