import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AgentCreationResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import apiConfig from "@app/lib/api/config";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "agent_management",
  version: "1.0.0",
  description: "Tools for managing agent configurations",
  authorization: null,
  icon: "ActionRobotIcon",
  documentationUrl: null,
};

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  void agentLoopContext;

  const server = new McpServer(serverInfo);

  server.tool(
    "create_agent",
    "Create a new agent.",
    {
      name: z
        .string()
        .describe(
          "The name of the agent (must be unique). Only letters, numbers, underscores (_) and hyphens (-) are allowed. Maximum 30 characters."
        ),
      description: z
        .string()
        .describe("A brief description of what the agent does"),
      instructions: z
        .string()
        .describe("The prompt/instructions that define the agent's behavior"),
      emoji: z
        .string()
        .optional()
        .describe(
          "An emoji character to use as the agent's avatar (e.g., '🤖'). If not provided, defaults to '🤖'"
        ),
      sub_agent_name: z
        .string()
        .optional()
        .describe(
          "The name of the sub-agent to create. If provided, sub_agent_description and sub_agent_instructions must also be provided."
        ),
      sub_agent_description: z
        .string()
        .optional()
        .describe("A brief description of what the sub-agent does"),
      sub_agent_instructions: z
        .string()
        .optional()
        .describe(
          "The prompt/instructions that define the sub-agent's behavior"
        ),
      sub_agent_emoji: z
        .string()
        .optional()
        .describe(
          "An emoji character to use as the sub-agent's avatar (e.g., '🤔'). If not provided, defaults to '🤖'"
        ),
    },
    async ({
      name,
      description,
      instructions,
      emoji,
      sub_agent_name,
      sub_agent_description,
      sub_agent_instructions,
      sub_agent_emoji,
    }) => {
      const owner = auth.workspace();
      if (!owner) {
        return makeMCPToolTextError("Workspace not found");
      }

      const user = auth.user();
      if (!user) {
        return makeMCPToolTextError("User not found");
      }

      if (sub_agent_instructions) {
        if (!sub_agent_name || sub_agent_name.trim() === "") {
          return makeMCPToolTextError(
            "sub_agent_name is required when sub_agent_instructions is provided"
          );
        }
        if (!sub_agent_description || sub_agent_description.trim() === "") {
          return makeMCPToolTextError(
            "sub_agent_description is required when sub_agent_instructions is provided"
          );
        }
      }

      const prodCredentials = await prodAPICredentialsForOwner(owner);
      const api = new DustAPI(
        apiConfig.getDustAPIConfig(),
        {
          ...prodCredentials,
          extraHeaders: {
            // Needed to add the user as editor of the agent.
            "x-api-user-email": user.email,
          },
        },
        logger
      );

      const result = await api.createGenericAgentConfiguration({
        name,
        description,
        instructions,
        emoji,
        subAgentName: sub_agent_name,
        subAgentDescription: sub_agent_description,
        subAgentInstructions: sub_agent_instructions,
        subAgentEmoji: sub_agent_emoji,
      });

      if (result.isErr()) {
        return makeMCPToolTextError(
          `Failed to create agent: ${result.error.message}`
        );
      }

      const { agentConfiguration: agent, subAgentConfiguration } = result.value;
      const agentUrl = `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/w/${owner.sId}/builder/assistants/${agent.sId}`;

      // Prepare the structured output resource
      const agentCreationResource: AgentCreationResultResourceType = {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_CREATION_RESULT,
        text: `Created agent: ${name}`,
        uri: agentUrl,
        mainAgent: {
          id: agent.sId,
          name: name,
          description: description,
          pictureUrl: agent.pictureUrl,
          url: agentUrl,
        },
        subAgent: subAgentConfiguration
          ? {
              id: subAgentConfiguration.sId,
              name: subAgentConfiguration.name,
              description: subAgentConfiguration.description,
              pictureUrl: subAgentConfiguration.pictureUrl,
              url: `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/w/${owner.sId}/builder/assistants/${subAgentConfiguration.sId}`,
            }
          : undefined,
      };

      // Return both structured data and a text message
      return {
        isError: false,
        content: [
          {
            type: "resource" as const,
            resource: agentCreationResource,
          },
          {
            type: "text" as const,
            text:
              `Successfully created agent "${name}" (ID: ${agent.sId}).\n\n` +
              `The agent has been created with:\n- Web search and browse tools\n` +
              `- Search across workspace data sources\n- Query tools for any data warehouses in the global space` +
              (sub_agent_name ? `\n- Run @${sub_agent_name} sub-agent` : "") +
              `\n\nView and edit it at: ${agentUrl}`,
          },
        ],
      };
    }
  );

  return server;
};

export default createServer;
