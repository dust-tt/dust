import { TOOL_ACTIVITY_START_TO_CLOSE_TIMEOUT_MS } from "@app/lib/actions/constants";
import type { AuthenticatorType } from "@app/lib/auth";
import { TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS } from "@app/temporal/agent_loop/config";
import type * as markSandboxFunctionInvocationFailedActivities from "@app/temporal/sandbox_functions/activities/mark_sandbox_function_invocation_failed";
import type * as runSandboxFunctionInvocationActivities from "@app/temporal/sandbox_functions/activities/run_sandbox_function_invocation";
import type * as runSandboxFunctionToolActivities from "@app/temporal/sandbox_functions/activities/run_sandbox_function_tool";
import { proxyActivities } from "@temporalio/workflow";

const { runSandboxFunctionToolActivity } = proxyActivities<
  typeof runSandboxFunctionToolActivities
>({
  startToCloseTimeout: TOOL_ACTIVITY_START_TO_CLOSE_TIMEOUT_MS,
  heartbeatTimeout: TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS,
  retry: {
    // Do not retry tool activities. Those are not idempotent.
    maximumAttempts: 1,
  },
});

const { runSandboxFunctionInvocationActivity } = proxyActivities<
  typeof runSandboxFunctionInvocationActivities
>({
  startToCloseTimeout: "3 minutes",
  retry: {
    // Sandbox functions may have non-idempotent side effects.
    maximumAttempts: 1,
  },
});

const { markSandboxFunctionInvocationFailedActivity } = proxyActivities<
  typeof markSandboxFunctionInvocationFailedActivities
>({
  startToCloseTimeout: "1 minute",
  retry: {
    // This only changes `created` to `errored`, so retries cannot overwrite a
    // successful invocation.
    maximumAttempts: 5,
  },
});

export async function runSandboxFunctionToolWorkflow({
  authType,
  actionModelId,
}: {
  authType: AuthenticatorType;
  actionModelId: number;
}) {
  await runSandboxFunctionToolActivity(authType, { actionModelId });
}

export async function runSandboxFunctionInvocationWorkflow({
  authType,
  sandboxFunctionId,
  invocationId,
}: {
  authType: AuthenticatorType;
  sandboxFunctionId: string;
  invocationId: string;
}) {
  try {
    await runSandboxFunctionInvocationActivity(authType, {
      sandboxFunctionId,
      invocationId,
    });
  } catch (error) {
    await markSandboxFunctionInvocationFailedActivity(authType, {
      errorMessage:
        "Pod function execution failed before it could return a result.",
      sandboxFunctionId,
      invocationId,
    });
    throw error;
  }
}
