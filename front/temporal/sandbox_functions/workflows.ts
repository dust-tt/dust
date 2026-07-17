import {
  DEFAULT_MCP_REQUEST_TIMEOUT_MS,
  RUN_AGENT_CALL_TOOL_TIMEOUT_MS,
} from "@app/lib/actions/constants";
import type { AuthenticatorType } from "@app/lib/auth";
import { TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS } from "@app/temporal/agent_loop/config";
import type * as runSandboxFunctionInvocationActivities from "@app/temporal/sandbox_functions/activities/run_sandbox_function_invocation";
import type * as runSandboxFunctionToolActivities from "@app/temporal/sandbox_functions/activities/run_sandbox_function_tool";
import { proxyActivities } from "@temporalio/workflow";

const toolActivityStartToCloseTimeoutMs =
  Math.max(RUN_AGENT_CALL_TOOL_TIMEOUT_MS, DEFAULT_MCP_REQUEST_TIMEOUT_MS) +
  60 * 1000;

const { runSandboxFunctionToolActivity } = proxyActivities<
  typeof runSandboxFunctionToolActivities
>({
  startToCloseTimeout: toolActivityStartToCloseTimeoutMs,
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
  await runSandboxFunctionInvocationActivity(authType, {
    sandboxFunctionId,
    invocationId,
  });
}
