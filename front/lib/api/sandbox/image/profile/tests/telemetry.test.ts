import { spawnSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { logToolInvocation } from "../src/shared/telemetry";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

describe("logToolInvocation", () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
  });

  it("spawns logger with tag dust_tool and a structured JSON payload", () => {
    logToolInvocation({
      tool: "read_file",
      profile: "anthropic",
      exitCode: 0,
      durationMs: 42,
    });

    expect(spawnSync).toHaveBeenCalledTimes(1);
    const [command, args, options] = vi.mocked(spawnSync).mock.calls[0] ?? [];
    expect(command).toBe("logger");
    expect(args?.slice(0, 2)).toEqual(["-t", "dust_tool"]);
    expect(options).toEqual({ stdio: "ignore" });
    expect(JSON.parse(args?.[2] ?? "{}")).toEqual({
      event_type: "tool_invocation",
      tool: "read_file",
      profile: "anthropic",
      exit_code: 0,
      duration_ms: 42,
    });
  });

  it("swallows spawn errors so telemetry never breaks the tool", () => {
    vi.mocked(spawnSync).mockImplementationOnce(() => {
      throw new Error("logger missing");
    });

    expect(() =>
      logToolInvocation({
        tool: "shell",
        profile: "openai",
        exitCode: 1,
        durationMs: 5,
      })
    ).not.toThrow();
  });
});
