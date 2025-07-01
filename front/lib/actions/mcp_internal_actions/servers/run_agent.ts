import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { z } from "zod";

import {
  AGENT_CONFIGURATION_URI_PATTERN,
  ConfigurableToolInputSchemas,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  isServerSideMCPServerConfiguration,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import config from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, getHeaderFromUserEmail, normalizeError, Ok } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "run_agent",
  version: "1.0.0",
  description: "Run a child agent (agent as tool).",
  icon: "ActionRobotIcon",
  authorization: null,
  documentationUrl: null,
};

function parseAgentConfigurationUri(uri: string): Result<string, Error> {
  const match = uri.match(AGENT_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(new Error(`Invalid URI for an agent configuration: ${uri}`));
  }
  // Safe to do this because the inputs are already checked against the zod schema here.
  return new Ok(match[2]);
}

/**
 * This method fetches the name and description of a child agent. It returns it even if the
 * agent is private as it is referenced from a parent agent which requires a name and description
 * for the associated run_agent tool rendering.
 *
 * Actual permissions to run the agent for the auth are checked at run time when creating the
 * conversation. Through execution of the parent agent the child agent name and description could be
 * leaked to the user which appears as acceptable given the proactive decision of a builder having
 * access to it to refer it from the parent agent more broadly shared.
 *
 * If the agent has been archived, this method will return null leading to the tool being displayed
 * to the model as not configured.
 */
async function leakyGetAgentNameAndDescriptionForChildAgent(
  auth: Authenticator,
  agentId: string
): Promise<{
  name: string;
  description: string;
} | null> {
  const owner = auth.getNonNullableWorkspace();
  const agentConfiguration = await AgentConfiguration.findOne({
    where: {
      sId: agentId,
      workspaceId: owner.id,
      status: "active",
    },
    attributes: ["name", "description"],
  });

  if (!agentConfiguration) {
    return null;
  }

  return {
    name: agentConfiguration.name,
    description: agentConfiguration.description,
  };
}

export default async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = new McpServer(serverInfo);
  const owner = auth.getNonNullableWorkspace();

  let childAgentId: string | null = null;

  if (
    agentLoopContext &&
    agentLoopContext.listToolsContext &&
    isServerSideMCPServerConfiguration(
      agentLoopContext.listToolsContext.agentActionConfiguration
    ) &&
    agentLoopContext.listToolsContext.agentActionConfiguration.childAgentId
  ) {
    childAgentId =
      agentLoopContext.listToolsContext.agentActionConfiguration.childAgentId;
  }

  if (
    agentLoopContext &&
    agentLoopContext.runContext &&
    isServerSideMCPToolConfiguration(
      agentLoopContext.runContext.actionConfiguration
    ) &&
    agentLoopContext.runContext.actionConfiguration.childAgentId
  ) {
    childAgentId = agentLoopContext.runContext.actionConfiguration.childAgentId;
  }

  let childAgentBlob: {
    name: string;
    description: string;
  } | null = null;

  if (childAgentId) {
    childAgentBlob = await leakyGetAgentNameAndDescriptionForChildAgent(
      auth,
      childAgentId
    );
  }

  // If we have no child ID (unexpected) or the child agent was archived, return a dummy server
  // whose tool name and description informs the agent of the situation.
  if (!childAgentBlob) {
    server.tool(
      "run_agent_tool_not_available",
      "No child agent configured for this tool, as the child agent was probably archived. " +
        "Do not attempt to run the tool and warn the user instead.",
      {
        childAgent:
          ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT],
      },
      async () => {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "No child agent configured",
            },
          ],
        };
      }
    );
    return server;
  }

  server.tool(
    `run_${childAgentBlob.name}`,
    `Run agent ${childAgentBlob.name} (${childAgentBlob.description})`,
    {
      query: z
        .string()
        .describe(
          "The query sent to the agent. This is the question or instruction that will be " +
            "processed by the agent, which will respond with its own capabilities and knowledge."
        ),
      childAgent:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT],
    },
    async ({ query, childAgent: { uri } }, { sendNotification, _meta }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required where the tool is called"
      );
      const { agentConfiguration: mainAgent, conversation: mainConversation } =
        agentLoopContext.runContext;

      const childAgentIdRes = parseAgentConfigurationUri(uri);
      if (childAgentIdRes.isErr()) {
        return makeMCPToolTextError(childAgentIdRes.error.message);
      }
      const childAgentId = childAgentIdRes.value;

      const user = auth.user();

      const prodCredentials = await prodAPICredentialsForOwner(owner);
      const api = new DustAPI(
        config.getDustAPIConfig(),
        {
          ...prodCredentials,
          extraHeaders: {
            // We use a system API key to override the user here (not groups and role) so that the
            // sub-agent can access the same spaces as the user but also as the sub-agent may rely
            // on personal actions that have to be operated in the name of the user initiating the
            // interaction.
            ...getHeaderFromUserEmail(user?.email),
          },
        },
        logger
      );

      const convRes = await api.createConversation({
        title: `run_agent ${mainAgent.name} > ${childAgentBlob.name}`,
        visibility: "unlisted",
        depth: mainConversation.depth + 1,
        message: {
          content: query,
          mentions: [{ configurationId: childAgentId }],
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            username: mainAgent.name,
            fullName: `@${mainAgent.name}`,
            email: null,
            profilePictureUrl: mainAgent.pictureUrl,
            // `run_agent` origin will skip adding the conversation to the user history.
            origin: "run_agent",
          },
        },
        contentFragment: undefined,
        skipToolsValidation:
          agentLoopContext.runContext.agentMessage.skipToolsValidation ?? false,
      });

      if (convRes.isErr()) {
        const errorMessage = `Failed to create conversation: ${convRes.error.message}`;
        return makeMCPToolTextError(errorMessage);
      }

      const { conversation, message: createdUserMessage } = convRes.value;

      if (!createdUserMessage) {
        const errorMessage = "Failed to retrieve the created message.";
        return makeMCPToolTextError(errorMessage);
      }

      // Send notification indicating that a run_agent started and a new conversation was created.
      if (_meta?.progressToken && sendNotification) {
        const notification: MCPProgressNotificationType = {
          method: "notifications/progress",
          params: {
            progress: 1,
            total: 1,
            progressToken: _meta.progressToken,
            data: {
              label: `Running agent ${childAgentBlob.name}`,
              output: {
                type: "run_agent",
                query,
                childAgentId: childAgentId,
                conversationId: conversation.sId,
              },
            },
          },
        };
        await sendNotification(notification);
      }

      const streamRes = await api.streamAgentAnswerEvents({
        conversation: conversation,
        userMessageId: createdUserMessage.sId,
      });

      if (streamRes.isErr()) {
        const errorMessage = `Failed to stream agent answer: ${streamRes.error.message}`;
        return makeMCPToolTextError(errorMessage);
      }

      let finalContent = "";
      let chainOfThought = "";
      try {
        for await (const event of streamRes.value.eventStream) {
          if (event.type === "generation_tokens") {
            // Separate content based on classification
            if (event.classification === "chain_of_thought") {
              chainOfThought += event.text;
            } else if (event.classification === "tokens") {
              finalContent += event.text;
            } else if (
              event.classification === "closing_delimiter" &&
              event.delimiterClassification === "chain_of_thought" &&
              chainOfThought.length > 0
            ) {
              // For closing chain of thought delimiters, add a newline
              chainOfThought += "\n";
            }
          } else if (event.type === "agent_error") {
            const errorMessage = `Agent error: ${event.error.message}`;
            return makeMCPToolTextError(errorMessage);
          } else if (event.type === "user_message_error") {
            const errorMessage = `User message error: ${event.error.message}`;
            return makeMCPToolTextError(errorMessage);
          } else if (event.type === "agent_message_success") {
            break;
          } else if (event.type === "tool_approve_execution") {
            // We catch tool approval events and bubble them up as progress notifications to the
            // parent tool execution.
            // In the MCP server runner, we translate them into a tool_approve_execution event
            // that can be ultimately shown to the end user.
            // This part only passes along the event data without modifying them.
            const notification: MCPProgressNotificationType = {
              method: "notifications/progress",
              params: {
                progress: 0,
                total: 1,
                progressToken: 0,
                data: {
                  label: "Waiting for tool approval...",
                  output: {
                    type: "tool_approval_bubble_up",
                    configurationId: event.configurationId,
                    conversationId: event.conversationId,
                    messageId: event.messageId,
                    actionId: event.actionId,
                    metadata: event.metadata,
                    stake: event.stake,
                    inputs: event.inputs,
                  },
                },
              },
            };

            await sendNotification(notification);
          }
        }
      } catch (streamError) {
        const errorMessage = `Error processing agent stream: ${
          normalizeError(streamError).message
        }`;
        return makeMCPToolTextError(errorMessage);
      }
      finalContent = finalContent.trim();
      chainOfThought = chainOfThought.trim();

      return {
        isError: false,
        content: [
          {
            type: "resource",
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.RUN_AGENT_QUERY,
              text: query,
              childAgentId: childAgentId,
              uri: "",
            },
          },
          {
            type: "resource",
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.RUN_AGENT_RESULT,
              conversationId: conversation.sId,
              text: finalContent,
              chainOfThought:
                chainOfThought.length > 0 ? chainOfThought : undefined,
              uri: `${config.getClientFacingUrl()}/w/${auth.getNonNullableWorkspace().sId}/assistant/${conversation.sId}`,
            },
          },
        ],
      };
    }
  );

  return server;
}
