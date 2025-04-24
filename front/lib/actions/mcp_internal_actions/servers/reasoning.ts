import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { REASONING_MODEL_CONFIGS } from "@app/components/providers/types";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { canUseModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "reasoning_v2",
  version: "1.0.0",
  description:
    "Agent can decide to trigger a reasoning model for complex tasks",
  icon: "ActionLightbulbIcon",
  authorization: null,
};

function createServer(auth: Authenticator): McpServer {
  const server = new McpServer(serverInfo);

  const owner = auth.getNonNullableWorkspace();

  server.tool(
    "get_model_name",
    "Get the name of the reasoning model to use",
    {
      model:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL
        ],
    },
    async ({ model: { modelId, providerId } }) => {
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
            text: `Found the following model: ${supportedModel.displayName}.`,
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;
