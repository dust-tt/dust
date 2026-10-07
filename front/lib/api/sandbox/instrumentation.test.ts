import {
  recordRunningSandboxDelta,
  recordSandboxFunctionRun,
} from "@app/lib/api/sandbox/instrumentation";
import { getStatsDClient, statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("recordSandboxFunctionRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["frame", "pod"] as const)(
    "tags %s function metrics by owner",
    (ownerKind) => {
      const increment = vi
        .spyOn(statsDMetrics, "increment")
        .mockImplementation(() => undefined);
      const distribution = vi
        .spyOn(statsDMetrics, "distribution")
        .mockImplementation(() => undefined);

      recordSandboxFunctionRun({
        ownerKind,
        runnerKind: "warm",
        status: "success",
        durationMs: 42,
      });

      expect(increment).toHaveBeenCalledWith(
        "sandbox.functions.run",
        1,
        expect.arrayContaining([
          `owner_kind:${ownerKind}`,
          "runner_kind:warm",
          "status:success",
        ])
      );
      expect(distribution).toHaveBeenCalledWith(
        "sandbox.functions.run.duration",
        42,
        expect.arrayContaining([`owner_kind:${ownerKind}`])
      );
    }
  );
});

describe("recordRunningSandboxDelta", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["conversation", "frame"] as const)(
    "emits signed counter packets tagged by %s, not workspace",
    (sandboxType) => {
      const send = vi
        .spyOn(getStatsDClient().socket, "send")
        .mockImplementation(() => undefined);
      const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);

      for (const delta of [1, 1, -1] as const) {
        recordRunningSandboxDelta({
          delta,
          sandboxType,
          reason: delta === 1 ? "create" : "pause",
          sandboxId: "sandbox_123",
          providerId: "e2b_abc",
          workspaceId: "ws_secret",
        });
      }

      const packets = send.mock.calls.map(([packet]) => packet.toString());
      expect(packets).toEqual([
        expect.stringMatching(/^sandbox\.lifecycle\.running_delta:1\|c\|#/),
        expect.stringMatching(/^sandbox\.lifecycle\.running_delta:1\|c\|#/),
        expect.stringMatching(/^sandbox\.lifecycle\.running_delta:-1\|c\|#/),
      ]);
      for (const packet of packets) {
        expect(packet).toContain("region:");
        expect(packet).toContain(`sandbox_type:${sandboxType}`);
        expect(packet).not.toMatch(/workspace|ws_secret|host:/);
      }

      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxId: "sandbox_123",
          providerId: "e2b_abc",
          workspaceId: "ws_secret",
          sandboxType,
          reason: "create",
          delta: 1,
        }),
        "Sandbox running count updated"
      );
    }
  );
});
