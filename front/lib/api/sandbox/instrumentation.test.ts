import {
  recordRunningSandboxDelta,
  recordSandboxFunctionRun,
} from "@app/lib/api/sandbox/instrumentation";
import { statsDMetrics } from "@app/lib/utils/statsd";
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
    "emits an incrementing gauge tagged by %s, not workspace",
    (sandboxType) => {
      const gaugeDelta = vi
        .spyOn(statsDMetrics, "gaugeDelta")
        .mockImplementation(() => undefined);
      const info = vi.spyOn(logger, "info").mockImplementation(() => undefined);

      recordRunningSandboxDelta({
        delta: 1,
        sandboxType,
        reason: "create",
        sandboxId: "sandbox_123",
        providerId: "e2b_abc",
        workspaceId: "ws_secret",
      });

      expect(gaugeDelta).toHaveBeenCalledWith(
        "sandbox.lifecycle.running",
        1,
        expect.arrayContaining([
          expect.stringMatching(/^region:/),
          `sandbox_type:${sandboxType}`,
        ])
      );
      const tags = gaugeDelta.mock.calls[0]?.[2] ?? [];
      expect(tags).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/workspace/i)])
      );

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
