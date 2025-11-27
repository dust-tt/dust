import * as fs from "fs";
import { Op } from "sequelize";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { constructPromptMultiActions } from "@app/lib/api/assistant/generation";
import { getLLM } from "@app/lib/api/llm";
import type {
  EventError,
  SuccessCompletionEvent,
} from "@app/lib/api/llm/types/events";
import { getSupportedModelConfig } from "@app/lib/assistant";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import {
  AgentMessageFeedbackModel,
  AgentMessageModel,
  ConversationModel,
  MentionModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { ConversationType, UserMessageType } from "@app/types";
import { isUserMessageType } from "@app/types";

interface EvaluationResult {
  conversationId: string;
  evaluatorResponse: string | null;
  error?: string;
}

interface ConversationFeedback {
  messageSId: string;
  thumbDirection: AgentMessageFeedbackDirection;
  content: string | null;
}

async function getConversationFeedbacks(
  workspaceId: number,
  conversationId: number
): Promise<ConversationFeedback[]> {
  // Find all feedbacks for messages in this conversation
  const messages = await MessageModel.findAll({
    where: {
      workspaceId,
      conversationId,
      agentMessageId: {
        [Op.ne]: null,
      },
    },
    attributes: ["id", "sId", "agentMessageId"],
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        attributes: ["id"],
        include: [
          {
            model: AgentMessageFeedbackModel,
            as: "feedbacks",
            attributes: ["thumbDirection", "content"],
          },
        ],
      },
    ],
  });

  const feedbacks: ConversationFeedback[] = [];

  for (const message of messages) {
    const agentMessage = message.agentMessage as
      | (AgentMessageModel & { feedbacks?: AgentMessageFeedbackModel[] })
      | undefined;
    if (agentMessage?.feedbacks && agentMessage.feedbacks.length > 0) {
      for (const feedback of agentMessage.feedbacks) {
        feedbacks.push({
          messageSId: message.sId,
          thumbDirection: feedback.thumbDirection,
          content: feedback.content,
        });
      }
    }
  }

  return feedbacks;
}

async function getConversationIdsForAgent(
  workspaceId: number,
  agentSId: string,
  limit: number
): Promise<string[]> {
  // Find conversations that have mentions of this agent
  const mentions = await MentionModel.findAll({
    where: {
      workspaceId,
      agentConfigurationId: agentSId,
    },
    include: [
      {
        model: MessageModel,
        required: true,
        include: [
          {
            model: ConversationModel,
            as: "conversation",
            required: true,
            where: {
              workspaceId,
              visibility: "unlisted", // Only regular conversations
            },
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  // Extract unique conversation sIds
  const conversationSIds = new Set<string>();
  for (const mention of mentions) {
    const messageWithConv = mention.message as
      | (MessageModel & { conversation?: ConversationModel })
      | undefined;
    if (messageWithConv?.conversation?.sId && conversationSIds.size < limit) {
      conversationSIds.add(messageWithConv.conversation.sId);
    }
  }

  return Array.from(conversationSIds);
}

function getLastUserMessage(
  conversation: ConversationType
): UserMessageType | null {
  // Iterate through conversation content in reverse to find the last user message
  for (let i = conversation.content.length - 1; i >= 0; i--) {
    const messageVersions = conversation.content[i];
    const latestVersion = messageVersions[messageVersions.length - 1];
    if (isUserMessageType(latestVersion)) {
      return latestVersion;
    }
  }
  return null;
}

async function evaluateConversation(
  auth: Authenticator,
  conversation: ConversationType,
  evaluatorAgentId: string,
  feedbacks: ConversationFeedback[]
): Promise<{ response: string | null; error?: string }> {
  try {
    // Get the evaluator agent configuration
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: evaluatorAgentId,
      variant: "full",
    });

    if (!agentConfiguration) {
      return {
        response: null,
        error: `Evaluator agent '${evaluatorAgentId}' not found`,
      };
    }

    const model = getSupportedModelConfig(agentConfiguration.model);
    if (!model) {
      return {
        response: null,
        error: `Model not supported: ${agentConfiguration.model.modelId}`,
      };
    }

    // Get the last user message for context
    const userMessage = getLastUserMessage(conversation);
    if (!userMessage) {
      return {
        response: null,
        error: "No user message found in conversation",
      };
    }

    // Get feature flags for the workspace
    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());

    // Build the prompt using the evaluator agent's instructions
    let prompt = constructPromptMultiActions(auth, {
      userMessage,
      agentConfiguration,
      fallbackPrompt: "You are an evaluation agent.",
      model,
      hasAvailableActions: false,
      agentsList: null,
      conversationId: conversation.sId,
      serverToolsAndInstructions: [],
      enabledSkills: [],
      equippedSkills: [],
      featureFlags,
    });

    // Add feedback information to the prompt if available
    if (feedbacks.length > 0) {
      const feedbackSection = feedbacks
        .map((f) => {
          const direction =
            f.thumbDirection === "up" ? "👍 Thumbs Up" : "👎 Thumbs Down";
          const comment = f.content ? `\n   Comment: "${f.content}"` : "";
          return `- Message ID: ${f.messageSId}\n   Feedback: ${direction}${comment}`;
        })
        .join("\n");

      prompt += `\n\n## User Feedback on this Conversation

The following feedback was provided by users on specific agent messages in this conversation:

${feedbackSection}

Please take this feedback into account in your evaluation.`;
    }

    // Render the conversation for the model (include tool usage)
    const modelConversationRes = await renderConversationForModel(auth, {
      conversation,
      model,
      prompt,
      tools: "[]", // No tools for evaluation
      allowedTokenCount: model.contextSize - model.generationTokensCount,
      excludeActions: false, // Include tool calls and results in the conversation
    });

    if (modelConversationRes.isErr()) {
      return {
        response: null,
        error: `Failed to render conversation: ${modelConversationRes.error.message}`,
      };
    }

    // Get the LLM client
    const llm = await getLLM(auth, {
      modelId: model.modelId,
      temperature: agentConfiguration.model.temperature,
      reasoningEffort: agentConfiguration.model.reasoningEffort,
      responseFormat: agentConfiguration.model.responseFormat,
      bypassFeatureFlag: true,
    });

    if (!llm) {
      return {
        response: null,
        error: `Could not create LLM client for model: ${model.modelId}`,
      };
    }

    // Stream the LLM response and collect text
    let generatedText = "";
    let errorInfo: EventError | null = null;

    for await (const event of llm.stream({
      conversation: modelConversationRes.value.modelConversation,
      prompt,
      specifications: [], // No tools
    })) {
      if (event.type === "text_delta") {
        // Accumulate text from delta events
        generatedText += event.content.delta;
      } else if (event.type === "success") {
        // Also check textGenerated in success event as fallback
        const successEvent = event as SuccessCompletionEvent;
        if (!generatedText && successEvent.textGenerated) {
          generatedText = successEvent.textGenerated.content.text;
        }
        // Check aggregated items if still no text
        if (!generatedText && successEvent.aggregated) {
          for (const item of successEvent.aggregated) {
            if (item.type === "text_generated") {
              generatedText = item.content.text;
              break;
            }
          }
        }
        break;
      } else if (event.type === "error") {
        errorInfo = event as EventError;
        break;
      }
      // Ignore other event types (reasoning_delta, etc.)
    }

    if (errorInfo) {
      return {
        response: null,
        error: `LLM error: ${errorInfo.content.message}`,
      };
    }

    return {
      response: generatedText || null,
    };
  } catch (error) {
    return {
      response: null,
      error: `Exception: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId",
    },
    targetAgentId: {
      type: "string",
      demandOption: true,
      description: "Target agent sId to find conversations for",
    },
    evaluatorAgentId: {
      type: "string",
      demandOption: true,
      description: "Evaluator agent sId to call for evaluation",
    },
    evaluatorWorkspaceId: {
      type: "string",
      demandOption: false,
      description:
        "Workspace sId for the evaluator agent (defaults to workspaceId if not provided)",
    },
    numConversations: {
      type: "number",
      demandOption: true,
      description: "Number of conversations to evaluate",
    },
    outputFile: {
      type: "string",
      demandOption: true,
      description: "Path to output file for results",
    },
  },
  async (
    {
      workspaceId,
      targetAgentId,
      evaluatorAgentId,
      evaluatorWorkspaceId,
      numConversations,
      outputFile,
      execute,
    },
    logger
  ) => {
    // Fetch workspace for target conversations
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    // Fetch workspace for evaluator agent (use same workspace if not specified)
    const evaluatorWsId = evaluatorWorkspaceId || workspaceId;
    const evaluatorWorkspace =
      evaluatorWsId === workspaceId
        ? workspace
        : await WorkspaceResource.fetchById(evaluatorWsId);
    if (!evaluatorWorkspace) {
      throw new Error(`Evaluator workspace ${evaluatorWsId} not found`);
    }

    const evaluatorAuth = await Authenticator.internalAdminForWorkspace(
      evaluatorWorkspace.sId
    );
    const owner = auth.getNonNullableWorkspace();

    logger.info(
      {
        workspaceId: owner.sId,
        targetAgentId,
        evaluatorAgentId,
        evaluatorWorkspaceId: evaluatorWorkspace.sId,
        numConversations,
      },
      "Starting evaluation"
    );

    // Get conversation IDs for the target agent
    const conversationIds = await getConversationIdsForAgent(
      owner.id,
      targetAgentId,
      numConversations
    );

    logger.info(
      { conversationCount: conversationIds.length },
      "Found conversations"
    );

    if (conversationIds.length === 0) {
      logger.warn("No conversations found for the target agent");
      return;
    }

    const results: EvaluationResult[] = [];
    let totalAnalyzed = 0;

    for (const conversationId of conversationIds) {
      logger.info({ conversationId }, "Processing conversation");

      // Fetch the full conversation
      const conversationResult = await getConversation(auth, conversationId);
      if (conversationResult.isErr()) {
        logger.error(
          { conversationId, error: conversationResult.error },
          "Failed to fetch conversation"
        );
        results.push({
          conversationId,
          evaluatorResponse: null,
          error: `Failed to fetch: ${conversationResult.error.message}`,
        });
        continue;
      }

      const conversation = conversationResult.value;

      // Fetch feedbacks for this conversation
      const feedbacks = await getConversationFeedbacks(
        owner.id,
        conversation.id
      );

      logger.info(
        { conversationId, feedbackCount: feedbacks.length },
        "Fetched feedbacks for conversation"
      );

      if (!execute) {
        logger.info(
          {
            conversationId,
            messageCount: conversation.content.length,
            feedbackCount: feedbacks.length,
            feedbacks: feedbacks.map((f) => ({
              messageSId: f.messageSId,
              thumbDirection: f.thumbDirection,
              hasComment: !!f.content,
            })),
          },
          "Would evaluate conversation (dry run)"
        );
        results.push({
          conversationId,
          evaluatorResponse: "[DRY RUN - no evaluation performed]",
        });
        continue;
      }

      // Evaluate the conversation
      const evalResult = await evaluateConversation(
        evaluatorAuth,
        conversation,
        evaluatorAgentId,
        feedbacks
      );

      totalAnalyzed++;

      // Skip adding to results if the first line of the response includes "Yes"
      const firstLine = evalResult.response?.split("\n")[0] ?? "";
      if (firstLine.includes("Yes")) {
        logger.info(
          { conversationId },
          "Skipping conversation (first line includes 'Yes')"
        );
        continue;
      }

      const result: EvaluationResult = {
        conversationId,
        evaluatorResponse: evalResult.response,
        error: evalResult.error,
      };

      results.push(result);

      // Print to console
      console.log("\n" + "=".repeat(80));
      console.log(`Conversation: ${conversationId}`);
      console.log("=".repeat(80));
      if (evalResult.error) {
        console.log(`Error: ${evalResult.error}`);
      } else {
        console.log(`Evaluator Response:\n${evalResult.response}`);
      }
    }

    // Write results to file
    const outputData = {
      metadata: {
        workspaceId,
        targetAgentId,
        evaluatorAgentId,
        evaluatorWorkspaceId: evaluatorWorkspace.sId,
        numConversations,
        timestamp: new Date().toISOString(),
        execute,
      },
      results,
    };

    fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));
    logger.info({ outputFile }, "Results written to file");

    // Summary
    const successCount = results.filter((r) => !r.error).length;
    const errorCount = results.filter((r) => r.error).length;

    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total conversations analysed: ${totalAnalyzed}`);
    console.log(`Conversations with feedback: ${results.length}`);
    console.log(`Successful evaluations: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Results saved to: ${outputFile}`);
  }
);
