import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
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
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type { AgentActionsEvent, AgentMessageType, ModelId } from "@app/types";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";

interface ParsedToolCall {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

// Match "@mention /runtools" at the start: first word is the mention, second is /runtools.
const RUNTOOLS_PATTERN = /^\s*\S+\s+\/runtools(?:\s|$)/;

/**
 * Check if a user message is a tool test run command.
 * Expected format: "@agent /runtools ..." where /runtools is the second word.
 */
export function isToolTestRunMessage(content: string): boolean {
  return RUNTOOLS_PATTERN.test(content);
}

/**
 * Parse a tool test run message into individual tool calls.
 * Expected format: "@agent /runtools" followed by tool calls.
 *
 * Format:
 *   @agent /runtools
 *   server_name__tool_name({ "key": "value" })
 *   server_name__tool_name()
 */
function parseToolTestRunMessage(
  content: string
): ParsedToolCall[] | { error: string } {
  const prefixMatch = RUNTOOLS_PATTERN.exec(content);
  if (!prefixMatch) {
    return { error: "No /runtools command found" };
  }
  // Strip the matched prefix ("@agent /runtools") and get the rest.
  const body = content.slice(prefixMatch[0].length).trim();

  if (!body) {
    return { error: "No tool calls specified after /runtools" };
  }

  const results: ParsedToolCall[] = [];
  // Match each tool call pattern: server__tool(...)
  const toolCallRegex = /(\w+)__(\w+)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = toolCallRegex.exec(body)) !== null) {
    const serverName = match[1];
    const toolName = match[2];
    const openParenIndex = match.index + match[0].length - 1;

    // Find the matching closing paren, tracking nesting.
    const argsContent = extractBalancedParens(body, openParenIndex);
    if (argsContent === null) {
      return {
        error: `Unbalanced parentheses for ${serverName}__${toolName}`,
      };
    }

    const argsTrimmed = argsContent.trim();
    let args: Record<string, unknown> = {};
    if (argsTrimmed.length > 0) {
      try {
        args = JSON.parse(argsTrimmed) as Record<string, unknown>;
      } catch {
        return {
          error: `Invalid JSON arguments for ${serverName}__${toolName}: ${argsTrimmed}`,
        };
      }
    }

    results.push({ serverName, toolName, arguments: args });
  }

  if (results.length === 0) {
    return {
      error:
        "No valid tool calls found. Expected format: server_name__tool_name({ ... })",
    };
  }

  return results;
}

/**
 * Extract content between balanced parentheses starting at the given index.
 */
function extractBalancedParens(str: string, openIndex: number): string | null {
  let depth = 1;
  let i = openIndex + 1;
  while (i < str.length && depth > 0) {
    if (str[i] === "(") {
      depth++;
    } else if (str[i] === ")") {
      depth--;
    }
    if (depth > 0) {
      i++;
    }
  }
  if (depth !== 0) {
    return null;
  }
  return str.slice(openIndex + 1, i);
}

/**
 * Handle step 0 of a tool test run: parse the message, list available tools,
 * match parsed tool calls, and create step content entries.
 */
export async function handleToolTestRunFirstStep(
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

  // Parse the tool calls from the user message.
  const parsed = parseToolTestRunMessage(userMessage.content);
  if ("error" in parsed) {
    await publishAgentError({
      code: "tool_test_run_parse_error",
      message: parsed.error,
      metadata: null,
    });
    return null;
  }

  // List available tools (same flow as runModelActivity).
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

  const availableTools = mcpActions.flatMap((s) => s.tools);

  // Match each parsed tool call to an available tool.
  const actions: AgentActionsEvent["actions"] = [];
  const functionCallStepContentIds: Record<string, ModelId> = {};

  for (const [index, parsedCall] of parsed.entries()) {
    const prefixedName = `${parsedCall.serverName}${TOOL_NAME_SEPARATOR}${parsedCall.toolName}`;
    const matchedTool = availableTools.find((t) => t.name === prefixedName);

    if (!matchedTool) {
      const availableToolNames = availableTools.map((t) => t.name).join(", ");
      await publishAgentError({
        code: "tool_test_run_tool_not_found",
        message: `Tool "${prefixedName}" not found. Available tools: ${availableToolNames}`,
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
          name: prefixedName,
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
 * Handle step 1+ of a tool test run: create a text step content indicating
 * the tools have run, publish success, and return null to end the loop.
 */
export async function handleToolTestRunFinalStep(
  auth: Authenticator,
  runAgentData: AgentLoopExecutionData,
  step: number
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

  // Create a text step content with the result message.
  await AgentStepContentResource.createNewVersion({
    workspaceId: conversation.owner.id,
    agentMessageId: agentMessage.agentMessageId,
    step,
    index: 0,
    type: "text_content",
    value: {
      type: "text_content",
      value: "See the breakdown tab for the details of the tool calls",
    },
  });

  const content = "See the breakdown tab for the details of the tool calls";
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
