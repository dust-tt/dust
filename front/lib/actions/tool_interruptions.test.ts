import { RETRY_ON_INTERRUPT_MAX_ATTEMPTS } from "@app/lib/actions/constants";
import type {
  ToolAbortClassification,
  ToolInterruptionType,
} from "@app/lib/actions/tool_interruptions";
import {
  classifyToolAbortReason,
  makeRetryableToolDeployInterruptionError,
  shouldRetryToolInterruption,
  TOOL_DEPLOY_INTERRUPTION_ERROR_TYPE,
} from "@app/lib/actions/tool_interruptions";
import { DUST_WORKER_SHUTDOWN_ABORT_REASON } from "@app/lib/shutdown_signal";
import { ApplicationFailure, CancelledFailure } from "@temporalio/common";
import { describe, expect, it } from "vitest";

describe("tool interruptions", () => {
  it.each<[unknown, ToolAbortClassification]>([
    [new CancelledFailure("CANCELLED"), "user_cancellation"],
    [new CancelledFailure("WORKER_SHUTDOWN"), "deploy_interruption"],
    [DUST_WORKER_SHUTDOWN_ABORT_REASON, "deploy_interruption"],
    ["unexpected", "unknown"],
  ])("classifies abort reason %#", (reason, expectedClassification) => {
    expect(classifyToolAbortReason(reason)).toBe(expectedClassification);
  });

  it.each<
    [
      ToolInterruptionType | null,
      number,
      "retry_on_interrupt" | "no_retry",
      boolean,
    ]
  >([
    [
      "deploy_interruption",
      RETRY_ON_INTERRUPT_MAX_ATTEMPTS - 1,
      "retry_on_interrupt",
      true,
    ],
    [
      "deploy_interruption",
      RETRY_ON_INTERRUPT_MAX_ATTEMPTS,
      "retry_on_interrupt",
      false,
    ],
    ["deploy_interruption", 1, "no_retry", false],
    [
      "timeout",
      RETRY_ON_INTERRUPT_MAX_ATTEMPTS - 1,
      "retry_on_interrupt",
      true,
    ],
    [null, 1, "retry_on_interrupt", false],
  ])("returns whether interruption should retry %#", (interruptionType, attempt, retryPolicy, expected) => {
    expect(
      shouldRetryToolInterruption({
        interruptionType,
        attempt,
        retryPolicy,
      })
    ).toBe(expected);
  });

  it("creates a typed retryable deploy interruption failure", () => {
    const error = makeRetryableToolDeployInterruptionError();

    expect(error).toBeInstanceOf(ApplicationFailure);
    expect(error.type).toBe(TOOL_DEPLOY_INTERRUPTION_ERROR_TYPE);
    expect(error.nonRetryable).toBe(false);
  });
});
