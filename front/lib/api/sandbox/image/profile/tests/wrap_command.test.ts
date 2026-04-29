import { describe, expect, it } from "vitest";

import { PROFILE_DIR, wrapCommand } from "../../profile";

function expectedWrappedCommand(
  cmd: string,
  profile: string,
  timeoutSec = 60
): string {
  return [
    `DUST_PROFILE=${profile} source ${PROFILE_DIR}/common.sh && shell "$(cat <<'DUST_CMD_EOF'`,
    cmd,
    "DUST_CMD_EOF",
    `)" ${timeoutSec}`,
  ].join("\n");
}

describe("wrapCommand", () => {
  it("maps providers to the correct profile wrapper", () => {
    expect(wrapCommand("ls -la", "anthropic")).toBe(
      expectedWrappedCommand("ls -la", "anthropic")
    );
    expect(wrapCommand("pwd", "openai")).toBe(
      expectedWrappedCommand("pwd", "openai")
    );
    expect(wrapCommand("echo hello", "google_ai_studio")).toBe(
      expectedWrappedCommand("echo hello", "gemini")
    );
  });

  it("preserves the command verbatim and applies custom timeouts", () => {
    const result = wrapCommand('echo "hello" && echo \\n', "anthropic", {
      timeoutSec: 120,
    });
    expect(result).toBe(
      expectedWrappedCommand('echo "hello" && echo \\n', "anthropic", 120)
    );
  });

  it("throws when the command contains the reserved heredoc delimiter", () => {
    expect(() =>
      wrapCommand("echo before\nDUST_CMD_EOF\necho after", "anthropic")
    ).toThrow(
      "Command contains the reserved heredoc delimiter 'DUST_CMD_EOF'."
    );
  });
});
