import { describe, expect, it } from "vitest";

import { PROFILE_DIR, wrapCommand } from "../../profile";

describe("wrapCommand", () => {
  it("wraps command with shell function for anthropic provider", () => {
    const result = wrapCommand("ls -la", "anthropic");
    expect(result).toBe(`source ${PROFILE_DIR}/common.sh && shell "ls -la" 60`);
  });

  it("wraps command with shell function for openai provider", () => {
    const result = wrapCommand("pwd", "openai");
    expect(result).toBe(`source ${PROFILE_DIR}/common.sh && shell "pwd" 60`);
  });

  it("wraps command with shell function for google_ai_studio provider", () => {
    const result = wrapCommand("echo hello", "google_ai_studio");
    expect(result).toBe(
      `source ${PROFILE_DIR}/common.sh && shell "echo hello" 60`
    );
  });

  it("passes timeoutSec to shell wrapper", () => {
    const result = wrapCommand("long-cmd", "anthropic", { timeoutSec: 120 });
    expect(result).toBe(
      `source ${PROFILE_DIR}/common.sh && shell "long-cmd" 120`
    );
  });

  it("escapes double quotes in command", () => {
    const result = wrapCommand('echo "hello world"', "anthropic");
    expect(result).toBe(
      `source ${PROFILE_DIR}/common.sh && shell "echo \\"hello world\\"" 60`
    );
  });

  it("escapes backslashes in command", () => {
    const result = wrapCommand("echo \\n", "anthropic");
    expect(result).toBe(
      `source ${PROFILE_DIR}/common.sh && shell "echo \\\\n" 60`
    );
  });
});
