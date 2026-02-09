import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { tryListMCPTools } from "@app/lib/actions/mcp_actions";
import type { StepContext } from "@app/lib/actions/types";
import { computeStepContexts } from "@app/lib/actions/utils";
import { createClientSideMCPServerConfigurations } from "@app/lib/api/actions/mcp_client_side";
import { getJITServers } from "@app/lib/api/assistant/jit_actions";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import { getCompletionDuration } from "@app/lib/api/assistant/messages";
import {
  createSkillKnowledgeFileSystemServer,
  getSkillDataSourceConfigurations,
  getSkillServers,
} from "@app/lib/api/assistant/skill_actions";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type { RunModelAndCreateActionsResult } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import { createToolActionsActivity } from "@app/temporal/agent_loop/lib/create_tool_actions";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type { AgentActionsEvent, AgentMessageType, ModelId } from "@app/types";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";

// Matches the command (/run or /list) as the second word in the message.
// The first word is the agent mention text (e.g. "Dust").
const COMMAND_REGEX = /^\S+\s+\/(run|list)\b/;

// Matches a tool call: tool_name(args) where args can span multiple lines.
const TOOL_CALL_REGEX = /(\w+)\s*\(([\s\S]*?)\)/g;

type PromptCommand = "run" | "list";

interface ParsedToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Extract the body after the command word in the user message.
 */
function getBodyAfterCommand(content: string): string {
  const match = content.match(COMMAND_REGEX);
  if (!match) {
    return "";
  }
  return content.slice(match[0].length).trim();
}

/**
 * Parse tool calls from the body after the /run command.
 * Each tool call: server_name__tool_name({ "key": "value" }) or server_name__tool_name()
 */
function parseToolCalls(body: string): ParsedToolCall[] | { error: string } {
  const results: ParsedToolCall[] = [];

  for (const match of body.matchAll(TOOL_CALL_REGEX)) {
    const toolName = match[1];
    if (!toolName.includes(TOOL_NAME_SEPARATOR)) {
      return {
        error: `Invalid tool name "${toolName}". Expected format: server_name__tool_name(...)`,
      };
    }

    const argsTrimmed = match[2].trim();
    let args: Record<string, unknown> = {};
    if (argsTrimmed.length > 0) {
      try {
        args = JSON.parse(argsTrimmed) as Record<string, unknown>;
      } catch {
        return {
          error: `Invalid JSON arguments for ${toolName}: ${argsTrimmed}`,
        };
      }
    }

    results.push({ toolName, arguments: args });
  }

  if (results.length === 0) {
    return {
      error:
        "No tool calls specified. Expected format: server_name__tool_name({ ... })",
    };
  }

  return results;
}

/**
 * List available tools for the agent and return them as available tool names.
 */
async function listAvailableTools(
  auth: Authenticator,
  runAgentData: AgentLoopExecutionData,
  step: number
): Promise<MCPToolConfigurationType[]> {
  const {
    agentConfiguration,
    conversation: originalConversation,
    userMessage,
    agentMessage: originalAgentMessage,
  } = runAgentData;

  const { slicedConversation: conversation, slicedAgentMessage: agentMessage } =
    sliceConversationForAgentMessage(originalConversation, {
      agentMessageId: originalAgentMessage.sId,
      agentMessageVersion: originalAgentMessage.version,
      step,
    });

  const attachments = listAttachments(conversation);
  const jitServers = await getJITServers(auth, {
    agentConfiguration,
    conversation,
    attachments,
  });

  const clientSideMCPActionConfigurations =
    await createClientSideMCPServerConfigurations(
      auth,
      userMessage.context.clientSideMCPServerIds
    );

  const { enabledSkills } = await SkillResource.listForAgentLoop(
    auth,
    runAgentData
  );

  const skillServers = await getSkillServers(auth, {
    agentConfiguration,
    skills: enabledSkills,
  });

  const dataSourceConfigurations = await getSkillDataSourceConfigurations(
    auth,
    { skills: enabledSkills }
  );

  const fileSystemServer = await createSkillKnowledgeFileSystemServer(auth, {
    dataSourceConfigurations,
  });
  if (fileSystemServer) {
    skillServers.push(fileSystemServer);
  }

  const { serverToolsAndInstructions: mcpActions } = await tryListMCPTools(
    auth,
    {
      agentConfiguration,
      conversation,
      agentMessage,
      clientSideActionConfigurations: clientSideMCPActionConfigurations,
    },
    {
      jitServers,
      skillServers,
    }
  );

  return mcpActions.flatMap((s) => s.tools);
}

/**
 * Publish a success message with the given content and end the agent loop.
 */
async function publishSuccessAndFinish(
  auth: Authenticator,
  runAgentData: AgentLoopExecutionData,
  step: number,
  content: string
): Promise<null> {
  const {
    agentConfiguration,
    conversation: originalConversation,
    agentMessage: originalAgentMessage,
    agentMessageRow,
  } = runAgentData;

  const { slicedConversation: conversation, slicedAgentMessage: agentMessage } =
    sliceConversationForAgentMessage(originalConversation, {
      agentMessageId: originalAgentMessage.sId,
      agentMessageVersion: originalAgentMessage.version,
      step,
    });

  await AgentStepContentResource.createNewVersion({
    workspaceId: conversation.owner.id,
    agentMessageId: agentMessage.agentMessageId,
    step,
    index: 0,
    type: "text_content",
    value: {
      type: "text_content",
      value: content,
    },
  });

  const completedTs = Date.now();

  const updatedAgentMessage = {
    ...agentMessage,
    content,
    chainOfThought: agentMessage.chainOfThought ?? null,
    completedTs,
    status: "succeeded",
    completionDurationMs: getCompletionDuration(
      agentMessage.created,
      completedTs,
      agentMessage.actions
    ),
    prunedContext: agentMessageRow.prunedContext ?? false,
  } satisfies AgentMessageType;

  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "agent_message_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      message: updatedAgentMessage,
      runIds: [],
    },
    agentMessageRow,
    conversation,
    step,
  });

  return null;
}

/**
 * Main entry point for tool test run commands.
 * Returns a result if the message is a tool test command, or null to fall through
 * to normal LLM processing.
 */
export async function handlePromptCommand(
  auth: Authenticator,
  runAgentData: AgentLoopExecutionData,
  step: number,
  runIds: string[]
): Promise<RunModelAndCreateActionsResult | null | "not_a_command"> {
  const match = runAgentData.userMessage.content.match(COMMAND_REGEX);
  const toolTestCommand = (match?.[1] as PromptCommand) ?? null;
  if (!toolTestCommand) {
    return "not_a_command";
  }

  if (toolTestCommand === "list") {
    await handleToolListCommand(auth, runAgentData, step);
    return null;
  }

  // toolTestCommand === "run"
  if (step > 0) {
    await handleToolRunFinalStep(auth, runAgentData, step);
    return null;
  }

  const toolRunResult = await handleToolRunFirstStep(
    auth,
    runAgentData,
    step,
    runIds
  );
  if (!toolRunResult) {
    return null;
  }

  const createResult = await createToolActionsActivity(auth, {
    runAgentData,
    actions: toolRunResult.actions,
    stepContexts: toolRunResult.stepContexts,
    functionCallStepContentIds: toolRunResult.functionCallStepContentIds,
    step,
    runIds,
  });

  return { runId: null, actionBlobs: createResult.actionBlobs };
}

/**
 * Handle the /list command: list available tools and publish as success message.
 */
async function handleToolListCommand(
  auth: Authenticator,
  runAgentData: AgentLoopExecutionData,
  step: number
): Promise<null> {
  const availableTools = await listAvailableTools(auth, runAgentData, step);
  const toolNames = availableTools.map((t) => t.name);
  const content = "```\n" + toolNames.join("\n") + "\n```";
  return publishSuccessAndFinish(auth, runAgentData, step, content);
}

/**
 * Handle step 0 of a /run command: parse the message, list available tools,
 * match parsed tool calls, and create step content entries.
 */
async function handleToolRunFirstStep(
  auth: Authenticator,
  runAgentData: AgentLoopExecutionData,
  step: number,
  runIds: string[]
): Promise<{
  actions: AgentActionsEvent["actions"];
  functionCallStepContentIds: Record<string, ModelId>;
  runId: null;
  stepContexts: StepContext[];
} | null> {
  const {
    agentConfiguration,
    conversation: originalConversation,
    userMessage,
    agentMessage: originalAgentMessage,
    agentMessageRow,
  } = runAgentData;

  const { slicedConversation: conversation, slicedAgentMessage: agentMessage } =
    sliceConversationForAgentMessage(originalConversation, {
      agentMessageId: originalAgentMessage.sId,
      agentMessageVersion: originalAgentMessage.version,
      step,
    });

  const localLogger = logger.child({
    workspaceId: conversation.owner.sId,
    conversationId: conversation.sId,
    toolTestRun: true,
  });

  async function publishAgentError(error: {
    code: string;
    message: string;
    metadata: Record<string, string | number | boolean> | null;
  }): Promise<void> {
    localLogger.error({ error }, `Tool test run error: ${error.message}`);

    await updateResourceAndPublishEvent(auth, {
      event: {
        type: "agent_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error,
        runIds,
      },
      agentMessageRow,
      conversation,
      step,
    });
  }

  // Parse the tool calls from the body after "/run".
  const body = getBodyAfterCommand(userMessage.content);
  const parsed = parseToolCalls(body);
  if ("error" in parsed) {
    await publishAgentError({
      code: "tool_test_run_parse_error",
      message: parsed.error,
      metadata: null,
    });
    return null;
  }

  const availableTools = await listAvailableTools(auth, runAgentData, step);

  // Match each parsed tool call to an available tool.
  const actions: AgentActionsEvent["actions"] = [];
  const functionCallStepContentIds: Record<string, ModelId> = {};

  for (const [index, parsedCall] of parsed.entries()) {
    const matchedTool = availableTools.find(
      (t) => t.name === parsedCall.toolName
    );

    if (!matchedTool) {
      const availableToolNames = availableTools.map((t) => t.name).join(", ");
      await publishAgentError({
        code: "tool_test_run_tool_not_found",
        message: `Tool "${parsedCall.toolName}" not found. Available tools: ${availableToolNames}`,
        metadata: null,
      });
      return null;
    }

    const functionCallId = generateRandomModelSId();

    const stepContent = await AgentStepContentResource.createNewVersion({
      workspaceId: conversation.owner.id,
      agentMessageId: agentMessage.agentMessageId,
      step,
      index,
      type: "function_call",
      value: {
        type: "function_call",
        value: {
          id: functionCallId,
          name: parsedCall.toolName,
          arguments: JSON.stringify(parsedCall.arguments),
        },
      },
    });

    functionCallStepContentIds[functionCallId] = stepContent.id;

    actions.push({
      action: matchedTool,
      functionCallId,
    });
  }

  // Compute the citations offset.
  const citationsRefsOffset = originalAgentMessage.actions.reduce(
    (total, action) => total + (action.citationsAllocated || 0),
    0
  );

  const stepContexts = computeStepContexts({
    agentConfiguration,
    stepActions: actions.map((a) => a.action),
    citationsRefsOffset,
  });

  return {
    actions,
    functionCallStepContentIds,
    runId: null,
    stepContexts,
  };
}

/**
 * Handle step 1+ of a /run command: format tool outputs as JSON in a code block,
 * publish success, and return null to end the loop.
 */
async function handleToolRunFinalStep(
  auth: Authenticator,
  runAgentData: AgentLoopExecutionData,
  step: number
): Promise<null> {
  // Build the output from the actions that ran in step 0.
  const outputs = runAgentData.agentMessage.actions.map((action) => ({
    tool: action.toolName,
    output: action.output,
  }));
  const content = "```json\n" + JSON.stringify(outputs, null, 2) + "\n```";
  return publishSuccessAndFinish(auth, runAgentData, step, content);
}
