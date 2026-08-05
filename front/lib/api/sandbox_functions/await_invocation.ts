import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import logger from "@app/logger/logger";
import type { SandboxFunctionInvocationOutcome } from "@app/types/api/sandbox_functions";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// How long an invocation request waits for an outcome before handing the client back to the
// invocation event stream. This bounds how long a request is held open, not how long a Pod
// function may run: an invocation that outlives the wait keeps running and settles on the stream.
export const SYNCHRONOUS_INVOCATION_WAIT_TIMEOUT_MS = 10_000;

/**
 * Wait for an invocation to settle, up to a short ceiling.
 *
 * Returns null when the invocation is still running, which happens in two cases:
 *
 * - It blocked on user input (tool approval or personal authentication). Waiting further would
 *   deadlock: the approval card only renders once the client holds the invocation and subscribes
 *   to its stream, which it cannot do while the request that returns the invocation is pending.
 * - The ceiling elapsed.
 *
 * In both cases the caller returns the invocation without an outcome and the client subscribes to
 * the event stream, which replays from history everything already published.
 */
export async function awaitSandboxFunctionInvocationOutcome({
  invocationId,
  timeoutMs = SYNCHRONOUS_INVOCATION_WAIT_TIMEOUT_MS,
}: {
  invocationId: string;
  timeoutMs?: number;
}): Promise<SandboxFunctionInvocationOutcome | null> {
  try {
    for await (const { data } of getSandboxFunctionInvocationEvents({
      invocationId,
      lastEventId: null,
      signal: AbortSignal.timeout(timeoutMs),
    })) {
      switch (data.type) {
        case "sandbox_function_invocation_result":
          return { status: "succeeded", result: data.result };
        case "sandbox_function_invocation_error":
          return { status: "errored", error: data.error };
        case "tool_approve_execution":
        case "tool_personal_auth_required":
          return null;
        case "sandbox_function_invocation_created":
          break;
        default:
          // A deploy rolling out a new event type must not fail invocations served by older
          // instances: ignore what this instance does not know and keep waiting.
          assertNeverAndIgnore(data);
      }
    }
  } catch (error) {
    // The invocation itself is unaffected, only this wait failed. Fall back to the stream.
    logger.error(
      { invocationId, error: normalizeError(error).message },
      "Failed to wait for Pod function invocation outcome"
    );
    return null;
  }

  // Reaching here means the stream ended without an outcome and without the invocation blocking
  // on user input: it is simply still running past the ceiling. That should be rare, since a Pod
  // function settling this slowly is the case the wait cannot help with.
  logger.info(
    { invocationId, timeoutMs },
    "Pod function invocation outlived the synchronous wait"
  );

  return null;
}
