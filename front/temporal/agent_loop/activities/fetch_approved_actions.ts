import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { StepContext } from "@app/lib/actions/types";
import { computeStepContexts } from "@app/lib/actions/utils";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { RemoteMCPServerModel } from "@app/lib/models/assistant/actions/remote_mcp_server";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { ModelId } from "@app/types";
import { isFunctionCallContent } from "@app/types/assistant/agent_message_content";
import type { RunAgentArgs } from "@app/types/assistant/agent_run";
import { getRunAgentData } from "@app/types/assistant/agent_run";

export async function getBlockedToolsActivity({
  authType,
  runAgentArgs,
}: {
  authType: AuthenticatorType;
  runAgentArgs: RunAgentArgs;
}): Promise<{
  actions: Array<{
    functionCallId: string;
    action: MCPToolConfigurationType;
  }>;
  stepContexts: StepContext[];
  functionCallStepContentIds: Record<string, ModelId>;
} | null> {
  const auth = await Authenticator.fromJSON(authType);
  const runAgentDataRes = await getRunAgentData(authType, runAgentArgs);

  if (runAgentDataRes.isErr()) {
    throw runAgentDataRes.error;
  }

  const { agentMessage, agentConfiguration } = runAgentDataRes.value;

  // Use the new method to fetch approved actions
  const approvedStepContents =
    await AgentStepContentResource.fetchApprovedActionsForMessage(
      auth,
      agentMessage.agentMessageId
    );

  if (approvedStepContents.length === 0) {
    // No approved actions to run
    return null;
  }

  const actions: {
    functionCallId: string;
    action: MCPToolConfigurationType;
  }[] = [];
  const functionCallStepContentIds: Record<string, ModelId> = {};

  // Process each step content with approved actions
  for (const { stepContent, actions: dbActions } of approvedStepContents) {
    if (!isFunctionCallContent(stepContent.value)) {
      continue;
    }

    const functionCallId = stepContent.value.value.id;

    // For each approved action in this step content
    for (const dbAction of dbActions) {
      // Fetch the actual MCP server configuration to reconstruct the action config
      const mcpServerConfig = await AgentMCPServerConfiguration.findOne({
        where: {
          sId: dbAction.mcpServerConfigurationId,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        include: [
          {
            model: MCPServerViewModel,
            as: "mcpServerView",
            required: true,
            include: [
              {
                model: RemoteMCPServerModel,
                as: "remoteMCPServer",
                required: false,
              },
            ],
          },
        ],
      });

      if (!mcpServerConfig) {
        throw new Error(
          `MCP server configuration not found: ${dbAction.mcpServerConfigurationId}`
        );
      }

      // Reconstruct the action configuration with real data
      const actionConfig: MCPToolConfigurationType = {
        type: "mcp_configuration",
        id: mcpServerConfig.id,
        sId: mcpServerConfig.sId,
        name: stepContent.value.value.name,
        originalName: stepContent.value.value.name,
        mcpServerName:
          mcpServerConfig.mcpServerView.remoteMCPServer?.name ||
          mcpServerConfig.name ||
          "",
        description: mcpServerConfig.singleToolDescriptionOverride || "",
        icon: undefined, // Will be filled by proper MCP server metadata if needed
        permission: "never_ask", // Default since this is already approved
        timeFrame: mcpServerConfig.timeFrame,
        jsonSchema: mcpServerConfig.jsonSchema,
        additionalConfiguration: mcpServerConfig.additionalConfiguration,
        mcpServerViewId: mcpServerConfig.mcpServerViewId.toString(),
        dustAppConfiguration: null, // Would need full app configuration data to reconstruct properly
        internalMCPServerId: mcpServerConfig.internalMCPServerId,
        inputSchema: {}, // This would need to be fetched from the actual MCP server
        availability: "auto",
        toolServerId: "", // This would be set based on server type
        dataSources: null, // Would need agent configuration context
        tables: null, // Would need agent configuration context
        childAgentId: null, // Would need agent configuration context
        reasoningModel: null, // Would need agent configuration context
      };

      actions.push({
        functionCallId,
        action: actionConfig,
      });

      functionCallStepContentIds[functionCallId] = stepContent.id;
    }
  }

  // Compute step contexts for the approved actions
  const stepContexts = computeStepContexts({
    agentConfiguration,
    stepActions: actions.map((a) => a.action),
    citationsRefsOffset: 0,
  });

  return {
    actions,
    stepContexts,
    functionCallStepContentIds,
  };
}
