import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { REASONING_MODEL_CONFIGS } from "@app/components/providers/types";
import {
  DEFAULT_REASONING_ACTION_DESCRIPTION,
  DEFAULT_REASONING_ACTION_NAME,
} from "@app/lib/actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { canUseModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "reasoning_v2",
  version: "1.0.0",
  description:
    "Agent can decide to trigger a reasoning model for complex tasks (mcp)",
  icon: "ActionLightbulbIcon",
  authorization: null,
};

function createServer(auth: Authenticator, agentLoopContext?: AgentLoopContextType): McpServer {
  const server = new McpServer(serverInfo);

  const owner = auth.getNonNullableWorkspace();

  server.tool(
    DEFAULT_REASONING_ACTION_NAME,
    DEFAULT_REASONING_ACTION_DESCRIPTION,
    {
      model:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL
        ],
      text: z.string().describe("The text to reason about"),
    },
    async ({ model: { modelId, providerId }, text }) => {
      if (!agentLoopContext) {
        throw new Error("Unreachable: missing agentLoopContext.");
      }

      const featureFlags = await getFeatureFlags(owner);
      const supportedModel = REASONING_MODEL_CONFIGS.find(
        (m) => m.modelId === modelId && m.providerId === providerId
      );

      if (!supportedModel) {
        return makeMCPToolTextError("Reasoning model not found.");
      }

      if (!canUseModel(supportedModel, featureFlags, auth.plan(), owner)) {
        return makeMCPToolTextError(
          "Reasoning model not allowed for the current workspace."
        );
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: `This is a placeholder for the reasoning functionality. In a real implementation, we would use the shared reasoning function with the model ${supportedModel.displayName} to reason about: "${text}"`,
          },
        ],
      };

      // Note: The full implementation would look something like this:
      /*
      // Use the shared reasoning function
      let content = "";
      let error = null;

      // We would need to have access to the conversation, agentConfiguration, and agentMessage
      // which would need to be passed from the agent context

      // Consume the generator to get the final result
      for await (const event of runReasoning(auth, {
        supportedModel,
        conversation,
        agentConfiguration,
        agentMessage,
        actionConfig: {
          modelId: supportedModel.modelId,
          providerId: supportedModel.providerId,
          reasoningEffort: null,
          temperature: null,
        },
      })) {
        if (event.type === "error") {
          error = event.message;
        } else if (event.type === "success") {
          content = event.content;
        }
      }

      if (error) {
        return makeMCPToolTextError(error);
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
      */
    }
  );

  return server;
}

export default createServer;
