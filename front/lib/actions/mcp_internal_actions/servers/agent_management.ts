import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  buildSelectedEmojiType,
  makeUrlForEmojiAndBackground,
} from "@app/components/assistant_builder/avatar_picker/utils";
import {
  makeMCPToolTextError,
  makeMCPToolTextSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import type { AgentModelConfigurationType } from "@app/types";
import { getLargeWhitelistedModel } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "agent_management",
  version: "1.0.0",
  description: "Tools for managing agent configurations",
  authorization: null,
  icon: "ActionRobotIcon",
  documentationUrl: null,
};

function removeLeadingAt(handle: string) {
  return handle.startsWith("@") ? handle.slice(1) : handle;
}

function assistantHandleIsValid(handle: string) {
  return /^[a-zA-Z0-9_-]{1,30}$/.test(removeLeadingAt(handle));
}

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  void agentLoopContext;

  const server = new McpServer(serverInfo);

  server.tool(
    "create_agent",
    "Create a new agent configuration with basic settings",
    {
      name: z
        .string()
        .describe(
          "The name of the agent (must be unique in the workspace). Only letters, numbers, underscores (_) and hyphens (-) are allowed. Maximum 30 characters."
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
    },
    async ({ name, description, instructions, emoji }) => {
      const owner = auth.workspace();
      if (!owner) {
        return makeMCPToolTextError("Workspace not found");
      }

      const user = auth.user();
      if (!user) {
        return makeMCPToolTextError("User not found");
      }

      // Validate agent name
      const cleanedName = removeLeadingAt(name);
      if (!cleanedName || cleanedName === "") {
        return makeMCPToolTextError("The agent name cannot be empty");
      }

      if (!assistantHandleIsValid(name)) {
        if (cleanedName.length > 30) {
          return makeMCPToolTextError(
            "The agent name must be 30 characters or less"
          );
        } else {
          return makeMCPToolTextError(
            "The agent name can only contain letters, numbers, underscores (_) and hyphens (-). Spaces and special characters are not allowed."
          );
        }
      }

      // Get the large whitelisted model for this workspace
      const model = getLargeWhitelistedModel(owner);
      if (!model) {
        return makeMCPToolTextError(
          "No suitable model available for this workspace. Please ensure your workspace has access to at least one AI model provider."
        );
      }

      // Build the agent model configuration
      const agentModel: AgentModelConfigurationType = {
        providerId: model.providerId,
        modelId: model.modelId,
        temperature: 0.7, // Default temperature for agents
        reasoningEffort: model.defaultReasoningEffort,
      };

      // Build emoji avatar URL
      const selectedEmoji = emoji || "🤖";
      const emojiData = buildSelectedEmojiType(selectedEmoji);

      let pictureUrl =
        "https://dust.tt/static/systemavatar/dust_avatar_full.png";
      if (emojiData) {
        pictureUrl = makeUrlForEmojiAndBackground(
          {
            id: emojiData.id,
            unified: emojiData.unified,
            native: emojiData.native,
          },
          "bg-blue-200"
        );
      }

      // eslint-disable-next-line import/no-cycle
      const { createGenericAgentConfigurationWithDefaultTools } = await import(
        "@app/lib/api/assistant/configuration/agent"
      );

      const result = await createGenericAgentConfigurationWithDefaultTools(
        auth,
        {
          name: cleanedName,
          description,
          instructions,
          pictureUrl,
          model: agentModel,
        }
      );
      if (result.isErr()) {
        return makeMCPToolTextError(
          `Failed to create agent: ${result.error.message}`
        );
      }

      const agent = result.value;
      const agentUrl = `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/w/${owner.sId}/builder/assistants/${agent.sId}`;

      return makeMCPToolTextSuccess({
        message: `Successfully created agent "${cleanedName}" (ID: ${agent.sId}).\n\nThe agent has been created as:\n- Status: Active\n- Scope: Hidden (unpublished, visible to editors only)\n\nView and edit it at: ${agentUrl}`,
      });
    }
  );

  return server;
};

export default createServer;
