import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  CHILD_AGENT_CONFIGURATION_URI_PATTERN,
  ConfigurableToolInputSchemas,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { runAction } from "@app/lib/actions/server";
import { renderConversationForModel } from "@app/lib/api/assistant/generation";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import logger from "@app/logger/logger";
import type {
  AgentConfigurationType,
  ConversationType,
  Result,
} from "@app/types";
import { Err, Ok, SUPPORTED_MODEL_CONFIGS } from "@app/types";

function getPrompt(query: string, agentConfiguration: AgentConfigurationType) {
  return `You are @${agentConfiguration.name}.\n\n
    Here is a description of what you are: ${agentConfiguration.description}\n\n
    Here are your instructions: ${agentConfiguration.instructions}\n\n
    Another AI assistant that is less specialized, is asking you for help to answer a tricky question from a user.\n\n
    The end user will not see your reply, only the other assistant will see it. You are provided with the full conversation history between the user and the other assistant.\n\n
    The other assistant will also provide his own instructions. These instructions DO NOT apply to you (especially when it comes to formatting, answer length or tone of voice). They are only provided as context for you to understand the other assistants purpose.\n\n
    Here is the other assistant's query: ${query}`;
}

const serverInfo: InternalMCPServerDefinitionType = {
  name: "ask-agent",
  version: "1.0.0",
  description: "Demo server showing a basic interaction with a child agent.",
  icon: "robot",
  authorization: null,
};

function parseAgentConfigurationUri(uri: string): Result<string, Error> {
  const match = uri.match(CHILD_AGENT_CONFIGURATION_URI_PATTERN);
  if (!match) {
    return new Err(
      new Error(`Invalid URI for a child agent configuration: ${uri}`)
    );
  }
  // Safe to do this because the inputs are already checked against the zod schema here.
  return new Ok(match[2]);
}

function createServer(
  auth: Authenticator,
  conversation?: ConversationType,
  getAgentConfiguration?: (
    auth: Authenticator,
    agentId: string
  ) => Promise<AgentConfigurationType | null>
): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "ask-agent",
    // TODO(mcp): we most likely want to configure this description based on the agent configuration.
    "Ask a query to an agent.",
    {
      query: z.string().describe("The query to ask to the child agent."),
      childAgent:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.CONFIGURATION.CHILD_AGENT
        ],
    },
    async ({ query, childAgent: { uri } }) => {
      if (!conversation) {
        return makeMCPToolTextError(
          "Unreachable: calling ask-agent tool without a conversation."
        );
      }
      if (!getAgentConfiguration) {
        return makeMCPToolTextError(
          "Unreachable: calling ask-agent tool without a getAgentConfiguration callback."
        );
      }

      // Parse the child agent ID from the URI
      const childAgentIdRes = parseAgentConfigurationUri(uri);
      if (childAgentIdRes.isErr()) {
        return makeMCPToolTextError(childAgentIdRes.error.message);
      }

      const childAgentId = childAgentIdRes.value;

      // Get the child agent configuration.
      const agentConfiguration = await getAgentConfiguration(
        auth,
        childAgentId
      );
      if (!agentConfiguration) {
        return makeMCPToolTextError("Failed to retrieve agent configuration.");
      }

      const model = SUPPORTED_MODEL_CONFIGS.find(
        (m) =>
          m.modelId === agentConfiguration.model.modelId &&
          m.providerId === agentConfiguration.model.providerId
      );
      if (!model) {
        return makeMCPToolTextError(
          `The model selected is not supported: ${agentConfiguration.model.modelId}.`
        );
      }

      const renderedConversationRes = await renderConversationForModel(auth, {
        conversation,
        model,
        prompt: agentConfiguration.instructions || "",
        allowedTokenCount: model.contextSize - model.generationTokensCount,
      });
      if (renderedConversationRes.isErr()) {
        return makeMCPToolTextError(
          `Error preparing conversation for child agent: ${renderedConversationRes.error.message}`
        );
      }

      const renderedConversation = renderedConversationRes.value;

      const runConfig = cloneBaseConfig(
        getDustProdAction("assistant-v2-multi-actions-agent").config
      );
      runConfig.MODEL.provider_id = model.providerId;
      runConfig.MODEL.model_id = model.modelId;
      runConfig.MODEL.temperature = agentConfiguration.model.temperature;
      if (agentConfiguration.model.reasoningEffort) {
        runConfig.MODEL.reasoning_effort =
          agentConfiguration.model.reasoningEffort;
      }
      if (agentConfiguration.model.responseFormat) {
        runConfig.MODEL.response_format = JSON.parse(
          agentConfiguration.model.responseFormat
        );
      }
      const anthropicBetaFlags =
        config.getMultiActionsAgentAnthropicBetaFlags();
      if (anthropicBetaFlags) {
        runConfig.MODEL.anthropic_beta_flags = anthropicBetaFlags;
      }

      const result = await runAction(
        auth,
        "assistant-v2-multi-actions-agent",
        runConfig,
        [
          {
            conversation: renderedConversation.modelConversation,
            // TODO(mcp): pass the agent's tools here.
            specifications: [],
            prompt: getPrompt(query, agentConfiguration),
          },
        ]
      );
      if (result.isErr()) {
        return makeMCPToolTextError(
          `Error running child agent: ${result.error.message}`
        );
      }

      const lastBlock = result.value.results?.[0][0].value;
      if (!lastBlock) {
        logger.error(
          {
            conversationId: conversation.sId,
            childAgentId,
          },
          "Could not extract content from child agent response."
        );
      }

      return {
        isError: false,
        content: [
          {
            type: "text",
            text: JSON.stringify(lastBlock),
          },
        ],
      };
    }
  );

  return server;
}

export default createServer;
