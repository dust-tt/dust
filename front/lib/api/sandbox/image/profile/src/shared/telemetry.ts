import { spawnSync } from "node:child_process";

import type { Profile } from "../profile";

interface ToolInvocation {
  readonly tool: string;
  readonly profile: Profile;
  readonly exitCode: number;
  readonly durationMs: number;
}

export function logToolInvocation({
  tool,
  profile,
  exitCode,
  durationMs,
}: ToolInvocation): void {
  const payload = JSON.stringify({
    event_type: "tool_invocation",
    tool,
    profile,
    exit_code: exitCode,
    duration_ms: durationMs,
  });

  try {
    spawnSync("logger", ["-t", "dust_tool", payload], { stdio: "ignore" });
  } catch {
    // Telemetry must never break the tool. `logger` may be absent on dev hosts
    // (macOS) and spawn errors (ENOENT, EACCES) should be silently swallowed.
  }
}
