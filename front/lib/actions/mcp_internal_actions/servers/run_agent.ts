import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  AGENT_CONFIGURATION_URI_PATTERN,
  ConfigurableToolInputSchemas,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import apiConfig from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, getHeaderFromGroupIds, normalizeError, Ok } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "run_agent",
  version: "1.0.0",
  description: "Run an agent (agent as tool).",
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

function createServer(auth: Authenticator): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "run_agent",
    // TODO(mcp): we probably want to make this description configurable to guide the model on when to use this sub-agent.
    "Run an agent.",
    {
      query: z
        .string()
        .describe(
          `The query sent to the agent. This is the question or instruction that will be processed by the agent, which will respond with its own capabilities and knowledge.`
        ),
      childAgent:
        ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT],
    },
    async ({ query, childAgent: { uri } }) => {
      const childAgentIdRes = parseAgentConfigurationUri(uri);
      if (childAgentIdRes.isErr()) {
        return makeMCPToolTextError(childAgentIdRes.error.message);
      }
      const childAgentId = childAgentIdRes.value;

      const owner = auth.getNonNullableWorkspace();
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
        title: `run_agent - ${new Date().toISOString()}`,
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

export default createServer;
