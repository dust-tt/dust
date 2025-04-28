import { assertNever, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  DEFAULT_REASONING_ACTION_DESCRIPTION,
  DEFAULT_REASONING_ACTION_NAME,
} from "@app/lib/actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import { runReasoning } from "@app/lib/actions/reasoning";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isReasoningConfiguration } from "@app/lib/actions/types/guards";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { isModelId, isModelProviderId } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "reasoning_v2",
  version: "1.0.0",
  description:
    "Agent can decide to trigger a reasoning model for complex tasks (mcp)",
  icon: "ActionLightbulbIcon",
  authorization: null,
};

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    DEFAULT_REASONING_ACTION_NAME,
    DEFAULT_REASONING_ACTION_DESCRIPTION,
    {
      model:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL
        ],
    },
    async ({ model: { modelId, providerId } }) => {
      if (!agentLoopContext) {
        throw new Error("Unreachable: missing agentLoopContext.");
      }

      const { actionConfiguration } = agentLoopContext;
      if (!isReasoningConfiguration(actionConfiguration)) {
        throw new Error("Unreachable: Reasoning");
      }

      if (!isModelId(modelId) || !isModelProviderId(providerId)) {
        return makeMCPToolTextError("Invalid model ID.");
      }

      const actionOutput = {
        content: "",
        thinking: "",
      };

      for await (const event of runReasoning(auth, {
        reasoningModel: {
          modelId,
          providerId,
          temperature: actionConfiguration.temperature,
          reasoningEffort: actionConfiguration.reasoningEffort,
        },
        ...agentLoopContext,
      })) {
        switch (event.type) {
          case "error": {
            return makeMCPToolTextError(event.message);
          }
          case "token": {
            const { classification, text } = event.token;
            if (
              classification === "opening_delimiter" ||
              classification === "closing_delimiter"
            ) {
              continue;
            }
            if (classification === "chain_of_thought") {
              actionOutput.thinking += text;
            } else {
              actionOutput.content += text;
            }
            break;
          }
          case "runId":
            break;
          default:
            assertNever(event);
        }
      }

      return {
        isError: false,
        content: [
          {
            type: "resource",
            resource: {
              text: actionOutput.thinking,
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.THINKING,
              uri: "",
            },
          },
          {
            type: "text",
            text: actionOutput.content,
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;
