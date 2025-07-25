import { runToolWithStreaming } from "@app/lib/actions/mcp";
import type { StepContext } from "@app/lib/actions/types";
import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import { computeGlobalCitationsOffset } from "@app/lib/actions/utils";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { assertNever } from "@app/types";
import { isFunctionCallContent } from "@app/types/assistant/agent_message_content";
import type { RunAgentArgs } from "@app/types/assistant/agent_run";
import { getRunAgentData } from "@app/types/assistant/agent_run";
import type { ModelId } from "@app/types/shared/model_id";

export async function runToolActivity(
  authType: AuthenticatorType,
  {
    runAgentArgs,
    action,
    stepContext,
    stepContentId,
  }: {
    runAgentArgs: RunAgentArgs;
    action: ActionConfigurationType;
    stepContext: StepContext;
    stepContentId: ModelId;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);

  // Fetch step content to derive inputs, functionCallId, and step
  const stepContent =
    await AgentStepContentResource.fetchByModelId(stepContentId);
  if (!stepContent) {
    throw new Error(
      `Step content not found for stepContentId: ${stepContentId}`
    );
  }
  if (!isFunctionCallContent(stepContent.value)) {
    throw new Error(
      `Expected step content to be a function call, got: ${stepContent.value.type}`
    );
  }

  const { step } = stepContent;

  const runAgentDataRes = await getRunAgentData(authType, runAgentArgs);
  if (runAgentDataRes.isErr()) {
    throw runAgentDataRes.error;
  }

  const { agentConfiguration, conversation, agentMessage, agentMessageRow } =
    runAgentDataRes.value;

  // Compute the global citations offset from past actions.
  const globalCitationsOffset = computeGlobalCitationsOffset({
    agentConfiguration,
    agentMessage,
    currentStep: step,
  });

  const adjustedStepContext = {
    ...stepContext,
    citationsOffset: stepContext.citationsOffset + globalCitationsOffset,
  };

  const eventStream = runToolWithStreaming(auth, action, {
    agentConfiguration: agentConfiguration,
    conversation,
    agentMessage,
    rawInputs: JSON.parse(stepContent.value.value.arguments),
    functionCallId: stepContent.value.value.id,
    step,
    stepContext: adjustedStepContext,
    stepContentId,
  });

  for await (const event of eventStream) {
    switch (event.type) {
      case "tool_error":
        await updateResourceAndPublishEvent(
          {
            type: "tool_error",
            created: event.created,
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
              metadata: event.error.metadata,
            },
          },
          conversation,
          agentMessageRow,
          step
        );
        return;

      case "tool_success":
        await updateResourceAndPublishEvent(
          {
            type: "agent_action_success",
            created: event.created,
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            action: event.action,
          },
          conversation,
          agentMessageRow,
          step
        );

        // We stitch the action into the agent message. The conversation is expected to include
        // the agentMessage object, updating this object will update the conversation as well.
        agentMessage.actions.push(event.action);
        break;

      case "tool_params":
      case "tool_approve_execution":
      case "tool_notification":
        await updateResourceAndPublishEvent(
          event,
          conversation,
          agentMessageRow,
          step
        );
        break;

      default:
        assertNever(event);
    }
  }
}
