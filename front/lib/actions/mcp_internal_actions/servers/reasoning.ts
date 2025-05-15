import { assertNever, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  DEFAULT_REASONING_ACTION_DESCRIPTION,
  DEFAULT_REASONING_ACTION_NAME,
} from "@app/lib/actions/constants";
import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import { runReasoning } from "@app/lib/actions/reasoning";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { isModelId, isModelProviderId, isReasoningEffortId } from "@app/types";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "reasoning",
  version: "1.0.0",
  description:
    "Agent can decide to trigger a reasoning model for complex tasks (mcp)",
  icon: "ActionLightbulbIcon",
  authorization: null,
};

function createServer(
  auth: Authenticator,
  agentLoopRunContext?: AgentLoopRunContextType
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
    async (
      { model: { modelId, providerId, temperature, reasoningEffort } },
      { sendNotification, _meta }
    ) => {
      if (!agentLoopRunContext) {
        throw new Error("Unreachable: missing agentLoopRunContext.");
      }

      if (
        !isModelId(modelId) ||
        !isModelProviderId(providerId) ||
        (reasoningEffort !== null && !isReasoningEffortId(reasoningEffort))
      ) {
        return makeMCPToolTextError("Invalid model ID.");
      }

      const actionOutput = {
        content: "",
        thinking: "",
      };

      const { conversation, agentConfiguration, agentMessage } =
        agentLoopRunContext;

      for await (const event of runReasoning(auth, {
        reasoningModel: { modelId, providerId, temperature, reasoningEffort },
        conversation,
        agentConfiguration,
        agentMessage,
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

            if (_meta?.progressToken) {
              const notification: MCPProgressNotificationType = {
                method: "notifications/progress",
                params: {
                  progress: 0,
                  total: 1,
                  progressToken: _meta?.progressToken,
                  data: {
                    label: "Thinking...",
                    output: {
                      type: "text",
                      text,
                    },
                  },
                },
              };

              await sendNotification(notification);
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
            type: "resource",
            resource: {
              text: actionOutput.content,
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.REASONING_SUCCESS,
              uri: "",
            },
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;
