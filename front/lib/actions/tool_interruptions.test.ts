import { RETRY_ON_INTERRUPT_MAX_ATTEMPTS } from "@app/lib/actions/constants";
import type { ToolAbortClassification } from "@app/lib/actions/tool_interruptions";
import {
  classifyToolAbortReason,
  makeToolInterruptionError,
  shouldRetryToolInterruption,
  TOOL_INTERRUPTION_ERROR_TYPE,
} from "@app/lib/actions/tool_interruptions";
import { DUST_WORKER_SHUTDOWN_ABORT_REASON } from "@app/lib/shutdown_signal";
import { ApplicationFailure, CancelledFailure } from "@temporalio/common";
import { describe, expect, it } from "vitest";

describe("tool interruptions", () => {
  it.each<[unknown, ToolAbortClassification]>([
    [new CancelledFailure("CANCELLED"), "user_cancellation"],
    [new CancelledFailure("WORKER_SHUTDOWN"), "deploy_interruption"],
    [DUST_WORKER_SHUTDOWN_ABORT_REASON, "deploy_interruption"],
    ["unexpected", "none"],
  ])("classifies abort reason %#", (reason, expectedClassification) => {
    expect(classifyToolAbortReason(reason)).toBe(expectedClassification);
  });

  it.each<[boolean, number, "retry_on_interrupt" | "no_retry", boolean]>([
    [true, RETRY_ON_INTERRUPT_MAX_ATTEMPTS - 1, "retry_on_interrupt", true],
    [true, RETRY_ON_INTERRUPT_MAX_ATTEMPTS, "retry_on_interrupt", false],
    [true, 1, "no_retry", false],
    [false, 1, "retry_on_interrupt", false],
  ])("returns whether interruption should retry %#", (isInterruption, attempt, retryPolicy, expected) => {
    expect(
      shouldRetryToolInterruption({
        isInterruption,
        attempt,
        retryPolicy,
      })
    ).toBe(expected);
  });

  it("creates a typed retryable tool interruption failure", () => {
    const error = makeToolInterruptionError();

    expect(error).toBeInstanceOf(ApplicationFailure);
    expect(error.type).toBe(TOOL_INTERRUPTION_ERROR_TYPE);
    expect(error.nonRetryable).toBe(false);
  });
});
