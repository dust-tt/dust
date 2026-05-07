import { isSandboxChildResumeState } from "@app/lib/actions/types";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import logger from "@app/logger/logger";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import type { ModelId } from "@app/types/shared/model_id";

// Continuation for `runSandboxChildToolWorkflow`. Relaunches the parent bash's
// agent loop only when this is the last blocked sibling to settle — earlier
// siblings (still blocked, or that already triggered the relaunch) keep us
// idle.
export async function maybeRelaunchParentAfterSandboxChildActivity(
  authType: AuthenticatorType,
  {
    childActionModelId,
    runAgentArgs,
  }: {
    childActionModelId: ModelId;
    runAgentArgs: AgentLoopArgs;
  }
): Promise<void> {
  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;

  const child = await AgentMCPActionResource.fetchByModelIdWithAuth(
    auth,
    childActionModelId
  );
  if (!child) {
    logger.warn(
      { childActionModelId },
      "Sandbox-child continuation: child action not found"
    );
    return;
  }

  const resumeState = child.stepContext.resumeState;
  if (!isSandboxChildResumeState(resumeState)) {
    logger.warn(
      { childActionModelId },
      "Sandbox-child continuation: child resumeState is not sandbox_child"
    );
    return;
  }

  const [parent, remaining] = await Promise.all([
    AgentMCPActionResource.fetchById(auth, resumeState.parentActionId),
    AgentMCPActionResource.listBlockedSandboxChildren(auth, {
      agentMessageId: child.agentMessageId,
      parentActionId: resumeState.parentActionId,
    }),
  ]);

  if (
    !parent ||
    parent.status !== "blocked_child_action_input_required" ||
    remaining.length > 0
  ) {
    return;
  }

  const launchRes = await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: runAgentArgs,
    startStep: parent.stepContent.step,
    waitForCompletion: true,
  });

  if (launchRes.isErr() && launchRes.error instanceof Error) {
    // Anything other than `agent_loop_already_running` (a benign race when
    // another path beat us to the relaunch) propagates so Temporal retries.
    throw launchRes.error;
  }
}
