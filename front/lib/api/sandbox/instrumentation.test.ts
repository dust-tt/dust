import { recordSandboxFunctionRun } from "@app/lib/api/sandbox/instrumentation";
import { statsDMetrics } from "@app/lib/utils/statsd";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("recordSandboxFunctionRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "frame",
    "pod",
  ] as const)("tags %s function metrics by owner", (ownerKind) => {
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
  });
});
