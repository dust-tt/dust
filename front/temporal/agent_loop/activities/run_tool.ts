import { getRunnerForActionConfiguration } from "@app/lib/actions/runners";
import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import { isMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getCitationsCount } from "@app/lib/actions/utils";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type { RunAgentArgs } from "@app/types";
import { assertNever, getRunAgentData } from "@app/types";
import type { ModelId } from "@app/types/shared/model_id";

export async function runToolActivity(
  authType: AuthenticatorType,
  {
    runAgentArgs,
    inputs,
    functionCallId,
    step,
    stepActionIndex,
    stepActions,
    citationsRefsOffset,
    stepContentId,
  }: {
    runAgentArgs: RunAgentArgs;
    inputs: Record<string, string | boolean | number>;
    functionCallId: string;
    step: number;
    stepActionIndex: number;
    stepActions: ActionConfigurationType[];
    citationsRefsOffset: number;
    stepContentId: ModelId;
  }
): Promise<{ citationsIncrement: number }> {
  const auth = await Authenticator.fromJSON(authType);

  const actionConfiguration = stepActions[stepActionIndex];
  const { agentConfiguration, conversation, agentMessage, agentMessageRow } =
    getRunAgentData(runAgentArgs);

  if (isMCPToolConfiguration(actionConfiguration)) {
    const eventStream = getRunnerForActionConfiguration(
      actionConfiguration
    ).run(auth, {
      agentConfiguration: agentConfiguration,
      conversation,
      agentMessage,
      rawInputs: inputs,
      functionCallId,
      step,
      stepActionIndex,
      stepActions,
      citationsRefsOffset,
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
          return { citationsIncrement: 0 };

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

    return {
      citationsIncrement: getCitationsCount({
        agentConfiguration: agentConfiguration,
        stepActions: stepActions,
        stepActionIndex: stepActionIndex,
      }),
    };
  } else {
    assertNever(actionConfiguration);
  }
}
