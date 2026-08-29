import {
  DEFAULT_MCP_REQUEST_TIMEOUT_MS,
  RUN_AGENT_CALL_TOOL_TIMEOUT_MS,
} from "@app/lib/actions/constants";
import type { AuthenticatorType } from "@app/lib/auth";
import { TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS } from "@app/temporal/agent_loop/config";
import type * as cleanupRetiredFramePublicationActivities from "@app/temporal/sandbox_functions/activities/cleanup_retired_frame_publication";
import type * as markSandboxFunctionInvocationFailedActivities from "@app/temporal/sandbox_functions/activities/mark_sandbox_function_invocation_failed";
import type * as runSandboxFunctionInvocationActivities from "@app/temporal/sandbox_functions/activities/run_sandbox_function_invocation";
import type * as runSandboxFunctionToolActivities from "@app/temporal/sandbox_functions/activities/run_sandbox_function_tool";
import { proxyActivities, sleep } from "@temporalio/workflow";

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

const { cleanupRetiredFramePublicationActivity } = proxyActivities<
  typeof cleanupRetiredFramePublicationActivities
>({
  startToCloseTimeout: "1 minute",
  retry: {
    initialInterval: "10 seconds",
    maximumInterval: "5 minutes",
  },
});

const RETIRED_FRAME_PUBLICATION_GRACE_PERIOD_MS = 60 * 60 * 1000;
const RETIRED_FRAME_PUBLICATION_RETRY_DELAY_MS = 60 * 60 * 1000;

export async function cleanupRetiredFramePublicationWorkflow(args: {
  frameId: string;
  publicationId: string;
  workspaceId: string;
}) {
  // A canonical invocation can resolve the old active publication immediately before a publish
  // commits and create its invocation row immediately after. The grace period closes that small
  // resolver-to-row race before the activity decides whether the publication is still referenced.
  await sleep(RETIRED_FRAME_PUBLICATION_GRACE_PERIOD_MS);
  while (!(await cleanupRetiredFramePublicationActivity(args))) {
    await sleep(RETIRED_FRAME_PUBLICATION_RETRY_DELAY_MS);
  }
}

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
