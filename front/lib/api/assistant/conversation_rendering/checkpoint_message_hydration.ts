import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { ModelId } from "@app/types/shared/model_id";

async function fetchCheckpointStepContents(
  auth: Authenticator,
  {
    agentMessageModelId,
    latestCompletedStep,
  }: {
    agentMessageModelId: ModelId;
    latestCompletedStep: number;
  }
): Promise<AgentStepContentResource[]> {
  const textContents = await AgentStepContentResource.fetchByAgentMessages(
    auth,
    {
      agentMessageIds: [agentMessageModelId],
      textContentOnly: true,
    }
  );

  const stepContents =
    await AgentStepContentResource.fetchByAgentMessageModelIdsAtStep(auth, {
      agentMessageModelIds: [agentMessageModelId],
      step: latestCompletedStep,
    });
  const stepContentIds = new Set(stepContents.map(({ id }) => id));

  return [
    ...textContents.filter(
      ({ id, step }) => step <= latestCompletedStep && !stepContentIds.has(id)
    ),
    ...stepContents,
  ];
}

export async function fetchCheckpointAgentMessageContentHydration(
  auth: Authenticator,
  {
    agentMessageModelId,
    targetStep,
  }: {
    agentMessageModelId: ModelId;
    targetStep: number;
  }
) {
  const latestCompletedStep = targetStep - 1;
  if (latestCompletedStep < 0) {
    return {
      stepContents: [],
      actionsWithOutputContent: [],
      actionsWithoutOutputContent: [],
    };
  }

  const [stepContents, actions] = await Promise.all([
    fetchCheckpointStepContents(auth, {
      agentMessageModelId,
      latestCompletedStep,
    }),
    AgentMCPActionResource.fetchVisibleByLatestStepContents(auth, [
      agentMessageModelId,
    ]),
  ]);
  const actionsWithOutputContent: AgentMCPActionResource[] = [];
  const actionsWithoutOutputContent: AgentMCPActionResource[] = [];

  for (const action of actions) {
    if (action.stepContent.step > latestCompletedStep) {
      continue;
    }

    if (action.stepContent.step === latestCompletedStep) {
      actionsWithOutputContent.push(action);
    } else {
      actionsWithoutOutputContent.push(action);
    }
  }

  return {
    stepContents,
    actionsWithOutputContent,
    actionsWithoutOutputContent,
  };
}
