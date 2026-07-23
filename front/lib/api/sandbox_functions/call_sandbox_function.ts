import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type {
  SandboxFunctionCallError,
  SandboxFunctionInvocationContext,
} from "@app/types/api/sandbox_functions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Safety ceiling on waiting for the result event delivered over the invocation stream.
const CALL_RESULT_WAIT_TIMEOUT_MS = 3 * 60 * 1_000;

/**
 * Invoke a sandbox function and wait for its result.
 */
export async function callSandboxFunction(
  auth: Authenticator,
  sandboxFunction: SandboxFunctionResource,
  input: unknown,
  context?: SandboxFunctionInvocationContext
): Promise<Result<unknown, SandboxFunctionCallError>> {
  const invocationResult = await sandboxFunction.invoke(auth, {
    input,
    context,
  });
  if (invocationResult.isErr()) {
    return new Err({
      code: "invocation_failed",
      message: invocationResult.error.message,
    });
  }
  const invocation = invocationResult.value;
  const { sId: invocationId } = invocation;

  try {
    for await (const { data } of getSandboxFunctionInvocationEvents({
      invocationId,
      lastEventId: null,
      signal: AbortSignal.timeout(CALL_RESULT_WAIT_TIMEOUT_MS),
    })) {
      if (data.type === "sandbox_function_invocation_error") {
        return new Err(data.error);
      }

      if (data.type !== "sandbox_function_invocation_result") {
        continue;
      }

      return new Ok(data.result);
    }
  } catch (error) {
    return new Err({
      code: "transport_error",
      message: `Failed to receive sandbox function events: ${normalizeError(error).message}`,
    });
  }

  return new Err({
    code: "transport_error",
    message: "Pod function did not return a result in time.",
  });
}
