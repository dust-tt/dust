import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { AgentStepContentToolExecutionModel } from "@app/lib/models/agent/actions/agent_step_content_tool_execution";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";

export class AgentMCPActionFactory {
  // Monotonic counter: step content indexes only need to be unique within an agent message.
  private static stepContentIndex = 0;

  /**
   * Creates an MCP action (with its function_call step content and tool execution row),
   * blocked on tool validation by default.
   */
  static async create({
    workspace,
    conversationId,
    agentMessageId,
    status = "blocked_validation_required",
  }: {
    workspace: WorkspaceType;
    conversationId: ModelId;
    agentMessageId: ModelId;
    status?: ToolExecutionStatus;
  }): Promise<{
    action: AgentMCPActionModel;
    stepContent: AgentStepContentModel;
  }> {
    const functionCallId = generateRandomModelSId();
    const currentIndex = this.stepContentIndex++;

    const stepContent = await AgentStepContentModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      step: 1,
      index: currentIndex,
      version: 0,
      type: "function_call",
      value: {
        type: "function_call",
        value: {
          id: functionCallId,
          name: "test_tool",
          arguments: "{}",
        },
      },
    });

    const toolConfiguration: LightMCPToolConfigurationType = {
      id: 1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: "test_tool",
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: "test-server-view",
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      internalMCPServerId: null,
      availability: "auto",
      permission: "low",
      toolServerId: "test-server",
      retryPolicy: "no_retry",
      originalName: "test_tool",
      mcpServerName: "test_server",
    };

    const action = await AgentMCPActionModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      mcpServerConfigurationId: generateRandomModelSId(),
      status,
      citationsAllocated: 0,
      augmentedInputs: {},
      toolConfiguration,
      stepContentId: stepContent.id,
      stepContext: {
        citationsCount: 0,
        citationsOffset: 0,
        resumeState: null,
        retrievalTopK: 10,
        websearchResultCount: 5,
      },
    });

    await AgentStepContentToolExecutionModel.create({
      workspaceId: workspace.id,
      conversationId,
      agentMessageId,
      agentMCPActionId: action.id,
      stepContentId: stepContent.id,
    });

    return { action, stepContent };
  }
}
