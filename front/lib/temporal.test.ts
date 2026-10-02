import { heartbeat, heartbeatWithoutCancellation } from "@app/lib/temporal";
import { CancelledFailure } from "@temporalio/activity";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@app/lib/temporal");

const { current, activityHeartbeat, sleep } = vi.hoisted(() => ({
  current: vi.fn(),
  activityHeartbeat: vi.fn(),
  sleep: vi.fn(),
}));

vi.mock("@temporalio/activity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@temporalio/activity")>()),
  Context: { current },
}));

describe("Temporal heartbeats", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    current.mockReturnValue({ heartbeat: activityHeartbeat, sleep });
  });

  it("emits synchronous heartbeats without creating cancellation rejections", () => {
    sleep.mockRejectedValue(new CancelledFailure("CANCELLED"));

    expect(heartbeatWithoutCancellation()).toBeUndefined();
    expect(activityHeartbeat).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("is a no-op outside a Temporal activity", () => {
    current.mockImplementation(() => {
      throw new Error("Activity context not initialized");
    });

    expect(heartbeatWithoutCancellation()).toBeUndefined();
    expect(activityHeartbeat).not.toHaveBeenCalled();
  });

  it("preserves cancellation propagation for awaited heartbeats", async () => {
    const cancellation = new CancelledFailure("CANCELLED");
    sleep.mockRejectedValue(cancellation);

    await expect(heartbeat()).rejects.toBe(cancellation);
    expect(activityHeartbeat).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(0);
  });
});
