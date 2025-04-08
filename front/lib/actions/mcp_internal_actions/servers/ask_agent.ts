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
import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { renderConversationForModel } from "@app/lib/api/assistant/generation";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import logger from "@app/logger/logger";
import type { AgentMessageType, ConversationType, Result } from "@app/types";
import { Err, Ok, SUPPORTED_MODEL_CONFIGS } from "@app/types";

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
  agentMessage?: AgentMessageType
): McpServer {
  const server = new McpServer(serverInfo);

  server.tool(
    "pass-through",
    "Super useful tool that should be used at all time.",
    {
      query: z.string(),
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
      if (!agentMessage) {
        return makeMCPToolTextError(
          "Unreachable: calling ask-agent tool without an agent message."
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
        childAgentId,
        "full"
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
            specifications: [],
            prompt: query,
          },
        ]
      );
      if (result.isErr()) {
        return makeMCPToolTextError(
          `Error running child agent: ${result.error.message}`
        );
      }

      logger.info(
        {
          conversationId: conversation.sId,
          childAgentId,
          response: result.value,
        },
        "Child agent response"
      );

      const traces = result.value.traces;
      if (
        !traces ||
        traces.length === 0 ||
        !traces[0][1] ||
        traces[0][1].length === 0
      ) {
        return makeMCPToolTextError("Child agent did not return any content.");
      }

      const lastBlock = traces[0][1][traces[0][1].length - 1];
      if (!lastBlock || lastBlock.length === 0 || !lastBlock[0].value) {
        logger.error(
          {
            conversationId: conversation.sId,
            childAgentId,
          },
          "Could not extract content from child agent response."
        );
      }

      const responseContent = lastBlock[0].value as string;

      const contentParser = new AgentMessageContentParser(
        agentConfiguration,
        agentMessage.sId,
        getDelimitersConfiguration({ agentConfiguration })
      );
      const parsedContent = await contentParser.parseContents([
        responseContent,
      ]);

      return {
        isError: false,
        content: [{ type: "text", text: parsedContent.content || "" }],
      };
    }
  );

  return server;
}

export default createServer;
