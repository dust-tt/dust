import { classifyTemporalAbortReason } from "@app/lib/temporal/cancellation";
import { CancelledFailure } from "@temporalio/common";
import { describe, expect, it } from "vitest";

describe("classifyTemporalAbortReason", () => {
  it("classifies the SDK worker shutdown cancellation as worker_shutdown", () => {
    expect(
      classifyTemporalAbortReason(new CancelledFailure("WORKER_SHUTDOWN"))
    ).toBe("worker_shutdown");
  });

  it("classifies the SDK user cancellation as user_cancellation", () => {
    expect(classifyTemporalAbortReason(new CancelledFailure("CANCELLED"))).toBe(
      "user_cancellation"
    );
  });

  it("returns none for unrelated errors", () => {
    expect(classifyTemporalAbortReason(new Error("random"))).toBe("none");
  });
});
