import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "assert";
import { z } from "zod";

import {
  AGENT_CONFIGURATION_URI_PATTERN,
  ConfigurableToolInputSchemas,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  isServerSideMCPServerConfiguration,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import apiConfig from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, getHeaderFromGroupIds, normalizeError, Ok } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "run_agent",
  version: "1.0.0",
  description: "Run a child agent (agent as tool).",
  icon: "ActionRobotIcon",
  authorization: null,
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
 * This method fetchs the name and description of a child agent. It returns it even even if the
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

  let childAgentBlob: { name: string; description: string } | null = null;

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
          `The query sent to the agent. This is the question or instruction that will be ` +
            `processed by the agent, which will respond with its own capabilities and knowledge.`
        ),
      childAgent:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT],
    },
    async ({ query, childAgent: { uri } }) => {
      assert(
        agentLoopContext?.runContext,
        "agentLoopContext is required where the tool is called."
      );
      const { agentConfiguration: mainAgent, conversation: mainConversation } =
        agentLoopContext.runContext;

      const childAgentIdRes = parseAgentConfigurationUri(uri);
      if (childAgentIdRes.isErr()) {
        return makeMCPToolTextError(childAgentIdRes.error.message);
      }
      const childAgentId = childAgentIdRes.value;

      const prodCredentials = await prodAPICredentialsForOwner(owner);
      const requestedGroupIds = auth.groups().map((g) => g.sId);
      const api = new DustAPI(
        apiConfig.getDustAPIConfig(),
        {
          ...prodCredentials,
          extraHeaders: getHeaderFromGroupIds(requestedGroupIds),
        },
        logger
      );

      const user = auth.getNonNullableUser();
      const convRes = await api.createConversation({
        title: `run_agent ${mainAgent.name} > ${childAgentBlob.name}`,
        visibility: "unlisted",
        message: {
          content: query,
          mentions: [{ configurationId: childAgentId }],
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            username: user.username ?? "unknown",
            fullName: user.fullName(),
            email: user.email,
            profilePictureUrl: user.imageUrl,
            origin: "mcp",
          },
        },
        contentFragment: undefined,
        // TODO(spolu): pull from the current agent message
        skipToolsValidation: false,
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

      const streamRes = await api.streamAgentAnswerEvents({
        conversation: conversation,
        userMessageId: createdUserMessage.sId,
      });

      if (streamRes.isErr()) {
        const errorMessage = `Failed to stream agent answer: ${streamRes.error.message}`;
        return makeMCPToolTextError(errorMessage);
      }

      let finalContent = "";
      try {
        for await (const event of streamRes.value.eventStream) {
          if (event.type === "generation_tokens") {
            finalContent += event.text;
          } else if (event.type === "agent_error") {
            const errorMessage = `Agent error: ${event.error.message}`;
            return makeMCPToolTextError(errorMessage);
          } else if (event.type === "user_message_error") {
            const errorMessage = `User message error: ${event.error.message}`;
            return makeMCPToolTextError(errorMessage);
          } else if (event.type === "agent_message_success") {
            break;
          }
        }
      } catch (streamError) {
        const errorMessage = `Error processing agent stream: ${
          normalizeError(streamError).message
        }`;
        return makeMCPToolTextError(errorMessage);
      }

      return { content: [{ type: "text", text: finalContent.trim() }] };
    }
  );

  return server;
}
