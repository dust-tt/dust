import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { createMCPAction } from "@app/lib/actions/mcp";
import { getAugmentedInputs } from "@app/lib/actions/mcp_execution";
import { validateToolInputs } from "@app/lib/actions/mcp_utils";
import type { StepContext } from "@app/lib/actions/types";
import { getExecutionStatusFromConfig } from "@app/lib/actions/utils";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import type { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { buildActionBaseParams } from "@app/temporal/agent_loop/lib/action_utils";
import type {
  AgentActionsEvent,
  AgentConfigurationType,
  AgentMessageType,
  ModelId,
} from "@app/types";
import type { RunAgentArgs } from "@app/types/assistant/agent_run";
import { getRunAgentData } from "@app/types/assistant/agent_run";

interface ActionBlob {
  action: AgentMCPAction;
  actionConfiguration: MCPToolConfigurationType;
  needsApproval: boolean;
}

export type CreateToolActionsResult = {
  actionBlobs: ActionBlob[];
};

export async function createToolActionsActivity(
  authType: AuthenticatorType,
  {
    runAgentArgs,
    actions,
    stepContexts,
    functionCallStepContentIds,
    step,
  }: {
    runAgentArgs: RunAgentArgs;
    actions: AgentActionsEvent["actions"];
    stepContexts: StepContext[];
    functionCallStepContentIds: Record<string, ModelId>;
    step: number;
  }
): Promise<CreateToolActionsResult> {
  const auth = await Authenticator.fromJSON(authType);

  const runAgentDataRes = await getRunAgentData(authType, runAgentArgs);
  if (runAgentDataRes.isErr()) {
    throw runAgentDataRes.error;
  }

  const conversationId = runAgentDataRes.value.conversation.sId;

  const actionBlobs: ActionBlob[] = [];

  for (const [
    index,
    { action: actionConfiguration, functionCallId },
  ] of actions.entries()) {
    const { agentConfiguration, agentMessage, agentMessageRow } =
      runAgentDataRes.value;
    const stepContentId = functionCallStepContentIds[functionCallId];

    const result = await createActionForTool(auth, {
      actionConfiguration,
      agentConfiguration,
      agentMessage,
      agentMessageRow,
      conversationId,
      stepContentId,
      stepContext: stepContexts[index],
      step,
    });

    if (result) {
      actionBlobs.push(result);
    }
  }

  return {
    actionBlobs,
  };
}

async function createActionForTool(
  auth: Authenticator,
  {
    actionConfiguration,
    agentConfiguration,
    agentMessage,
    agentMessageRow,
    conversationId,
    stepContentId,
    stepContext,
    step,
  }: {
    actionConfiguration: MCPToolConfigurationType;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    agentMessageRow: AgentMessage;
    conversationId: string;
    stepContentId: ModelId;
    stepContext: StepContext;
    step: number;
  }
): Promise<ActionBlob | void> {
  const actionBaseParams = await buildActionBaseParams({
    agentMessageId: agentMessage.agentMessageId,
    citationsAllocated: stepContext.citationsCount,
    mcpServerConfigurationId: actionConfiguration.id.toString(),
    step,
    stepContentId,
  });

  const validateToolInputsResult = validateToolInputs(actionBaseParams.params);
  if (validateToolInputsResult.isErr()) {
    return updateResourceAndPublishEvent(
      {
        type: "tool_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tool_error",
          message: validateToolInputsResult.error.message,
          metadata: null,
        },
      },
      agentMessageRow,
      {
        conversationId,
        step,
      }
    );
  }

  // Compute augmented inputs with preconfigured data sources, etc.
  const augmentedInputs = getAugmentedInputs({
    auth,
    rawInputs: actionBaseParams.params,
    actionConfiguration,
  });

  // Create the action object in the database and yield an event for the generation of the params.
  // We store the action here as the params have been generated, if an error occurs later on,
  // the error will be stored on the parent agent message.
  const { action: agentMCPAction, mcpAction } = await createMCPAction(auth, {
    actionBaseParams,
    augmentedInputs,
    stepContentId,
    stepContext,
  });

  // Publish the tool params event.
  await updateResourceAndPublishEvent(
    {
      type: "tool_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: mcpAction,
    },
    agentMessageRow,
    {
      conversationId,
      step,
    }
  );

  // Handle tool approval.
  const { status } = await getExecutionStatusFromConfig(
    auth,
    actionConfiguration,
    agentMessage
  );

  if (status === "pending") {
    await updateResourceAndPublishEvent(
      {
        type: "tool_approve_execution",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        conversationId,
        actionId: mcpAction.getSId(auth.getNonNullableWorkspace()),
        action: mcpAction,
        inputs: mcpAction.params,
        stake: actionConfiguration.permission,
        metadata: {
          toolName: actionConfiguration.originalName,
          mcpServerName: actionConfiguration.mcpServerName,
          agentName: agentConfiguration.name,
          icon: actionConfiguration.icon,
        },
      },
      agentMessageRow,
      {
        conversationId,
        step,
      }
    );
  }

  // Update the action to surface the execution state.
  await agentMCPAction.update({
    executionState: status,
  });

  return {
    action: agentMCPAction,
    actionConfiguration,
    needsApproval: status === "pending",
  };
}
