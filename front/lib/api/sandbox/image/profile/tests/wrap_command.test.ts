import { describe, expect, it } from "vitest";

import { PROFILE_DIR, wrapCommand } from "../../profile";

function expectedWrappedCommand(
  cmd: string,
  profile: string,
  timeoutSec = 60
): string {
  return [
    `source ${PROFILE_DIR}/${profile}.sh && shell "$(cat <<'DUST_CMD_EOF'`,
    cmd,
    "DUST_CMD_EOF",
    `)" ${timeoutSec}`,
  ].join("\n");
}

describe("wrapCommand", () => {
  it("wraps command with shell function for anthropic provider", () => {
    const result = wrapCommand("ls -la", "anthropic");
    expect(result).toBe(expectedWrappedCommand("ls -la", "anthropic"));
  });

  it("wraps command with shell function for openai provider", () => {
    const result = wrapCommand("pwd", "openai");
    expect(result).toBe(expectedWrappedCommand("pwd", "openai"));
  });

  it("wraps command with shell function for google_ai_studio provider", () => {
    const result = wrapCommand("echo hello", "google_ai_studio");
    expect(result).toBe(expectedWrappedCommand("echo hello", "gemini"));
  });

  it("passes timeoutSec to shell wrapper", () => {
    const result = wrapCommand("long-cmd", "anthropic", { timeoutSec: 120 });
    expect(result).toBe(expectedWrappedCommand("long-cmd", "anthropic", 120));
  });

  it("preserves double quotes in command", () => {
    const result = wrapCommand('echo "hello world"', "anthropic");
    expect(result).toBe(
      expectedWrappedCommand('echo "hello world"', "anthropic")
    );
  });

  it("preserves backslashes in command", () => {
    const result = wrapCommand("echo \\n", "anthropic");
    expect(result).toBe(expectedWrappedCommand("echo \\n", "anthropic"));
  });

  it("throws when the command contains the reserved heredoc delimiter", () => {
    expect(() =>
      wrapCommand("echo before\nDUST_CMD_EOF\necho after", "anthropic")
    ).toThrow(
      "Command contains the reserved heredoc delimiter 'DUST_CMD_EOF'."
    );
  });
});
