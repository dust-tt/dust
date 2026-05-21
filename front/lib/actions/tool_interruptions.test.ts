import { RETRY_ON_INTERRUPT_MAX_ATTEMPTS } from "@app/lib/actions/constants";
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
  it("classifies user cancellation without retrying the activity", () => {
    const abortClassification = classifyToolAbortReason(
      new CancelledFailure("CANCELLED")
    );

    expect(abortClassification).toBe("user_cancellation");
    expect(
      shouldRetryToolInterruption({
        interruptionType: null,
        attempt: 1,
        retryPolicy: "retry_on_interrupt",
      })
    ).toBe(false);
  });

  it("classifies worker shutdown cancellation as deploy interruption", () => {
    expect(
      classifyToolAbortReason(new CancelledFailure("WORKER_SHUTDOWN"))
    ).toBe("deploy_interruption");
    expect(classifyToolAbortReason(DUST_WORKER_SHUTDOWN_ABORT_REASON)).toBe(
      "deploy_interruption"
    );
  });

  it("retries deploy interruption only for retry_on_interrupt non-final attempts", () => {
    expect(
      shouldRetryToolInterruption({
        interruptionType: "deploy_interruption",
        attempt: RETRY_ON_INTERRUPT_MAX_ATTEMPTS - 1,
        retryPolicy: "retry_on_interrupt",
      })
    ).toBe(true);

    expect(
      shouldRetryToolInterruption({
        interruptionType: "deploy_interruption",
        attempt: RETRY_ON_INTERRUPT_MAX_ATTEMPTS,
        retryPolicy: "retry_on_interrupt",
      })
    ).toBe(false);

    expect(
      shouldRetryToolInterruption({
        interruptionType: "deploy_interruption",
        attempt: 1,
        retryPolicy: "no_retry",
      })
    ).toBe(false);
  });

  it("uses the same retry decision for timeout interruptions", () => {
    expect(
      shouldRetryToolInterruption({
        interruptionType: "timeout",
        attempt: RETRY_ON_INTERRUPT_MAX_ATTEMPTS - 1,
        retryPolicy: "retry_on_interrupt",
      })
    ).toBe(true);
  });

  it("creates a typed retryable deploy interruption failure", () => {
    const error = makeRetryableToolDeployInterruptionError();

    expect(error).toBeInstanceOf(ApplicationFailure);
    expect(error.type).toBe(TOOL_DEPLOY_INTERRUPTION_ERROR_TYPE);
    expect(error.nonRetryable).toBe(false);
  });
});
