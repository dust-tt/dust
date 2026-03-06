import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { ConversationButlerSuggestionResource } from "@app/lib/resources/conversation_butler_suggestion_resource";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import {
  GLOBAL_AGENTS_SID,
  getFastestWhitelistedModel,
} from "@app/types/assistant/assistant";
import type {
  AgentMessageType,
  ButlerDoneEvent,
  ButlerSuggestionCreatedEvent,
  ButlerThinkingEvent,
  ConversationType,
} from "@app/types/assistant/conversation";
import type { ButlerSuggestionData } from "@app/types/conversation_butler_suggestion";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

const SUGGEST_ACTIONS_FUNCTION_NAME = "suggest_actions";

const MAX_AGENTS_IN_PROMPT = 50;
const RENAME_CONFIDENCE_THRESHOLD = 70;
const AGENT_CONFIDENCE_THRESHOLD = 70;
const FRAME_CONFIDENCE_THRESHOLD = 70;

// Minimum number of messages (by rank distance) between two suggestions of the same type.
const SUGGESTION_COOLDOWN_MESSAGES = 10;

const SuggestActionsResult = z.object({
  rename_confidence: z.number(),
  new_title: z.string(),
  agent_confidence: z.number(),
  agent_name: z.string(),
  agent_prompt: z.string(),
  frame_confidence: z.number(),
  frame_prompt: z.string(),
});

function buildAnalyzeConversationSpecifications({
  hasAgents,
  shouldSuggestFrame,
}: {
  hasAgents: boolean;
  shouldSuggestFrame: boolean;
}): AgentActionSpecification[] {
  const properties: Record<string, object> = {
    rename_confidence: {
      type: "number",
      description:
        "Confidence from 0 to 100 that renaming the conversation title would improve it. " +
        "Use 0 if the current title is already adequate.",
    },
    new_title: {
      type: "string",
      description: "The proposed new title (3-8 words).",
    },
    agent_confidence: {
      type: "number",
      description: hasAgents
        ? "Confidence from 0 to 100 that one of the listed agents would help the user. " +
          "Use 0 if the conversation doesn't need agent help or no agents are relevant."
        : "Always set to 0 when no agents are available.",
    },
    agent_name: {
      type: "string",
      description: hasAgents
        ? "The exact name of the recommended agent from the provided list, or empty string if none."
        : "Always set to empty string when no agents are available.",
    },
    agent_prompt: {
      type: "string",
      description: hasAgents
        ? "A suggested message to send to the recommended agent, or empty string if none."
        : "Always set to empty string when no agents are available.",
    },
    frame_confidence: {
      type: "number",
      description: shouldSuggestFrame
        ? "Confidence from 0 to 100 that creating a visual Frame would benefit the conversation. " +
          "Use 0 if the conversation does not have content that would benefit from visual output."
        : "Always set to 0 when frame suggestions are not available.",
    },
    frame_prompt: {
      type: "string",
      description: shouldSuggestFrame
        ? "A prompt describing the Frame to create (e.g. 'Create a dashboard summarizing the sales data we discussed'), or empty string if none."
        : "Always set to empty string when frame suggestions are not available.",
    },
  };

  return [
    {
      name: SUGGEST_ACTIONS_FUNCTION_NAME,
      description:
        "Suggested one or many actions to the user to evaluate whether the title should be updated, " +
        "whether an available agent could help, and whether a visual Frame should be created.",
      inputSchema: {
        type: "object",
        properties,
        required: [
          "rename_confidence",
          "new_title",
          "agent_confidence",
          "agent_name",
          "agent_prompt",
          "frame_confidence",
          "frame_prompt",
        ],
      },
    },
  ];
}

function buildPrompt(
  currentTitle: string,
  agents: LightAgentConfigurationType[],
  suggestionHistory: ButlerSuggestionData[],
  shouldSuggestFrame: boolean
): string {
  const shouldBuildPromptForAgentSuggestion = agents.length > 0;

  let prompt = "You are a conversation analyst. Your job is to:\n";

  const tasks: string[] = [
    "Score how much the conversation title would benefit from being updated.",
  ];
  if (shouldBuildPromptForAgentSuggestion) {
    tasks.push("Determine if one of the available agents could help the user.");
  }
  if (shouldSuggestFrame) {
    tasks.push(
      "Determine if creating a visual Frame would benefit the conversation."
    );
  }

  for (let i = 0; i < tasks.length; i++) {
    prompt += `${i + 1}. ${tasks[i]}\n`;
  }
  prompt += "\n";

  prompt +=
    "Title evaluation guidelines:\n" +
    "- The current title was auto-generated early in the conversation and may no longer reflect the main topic.\n" +
    "- A good title is 3-8 words, specific, and captures the main intent.\n" +
    "- Set rename_confidence HIGH (>75) only when the current title is clearly wrong, misleading, " +
    "or the conversation has shifted to a completely different topic.\n" +
    "- Set rename_confidence LOW (<30) when the current title is already a reasonable summary, " +
    "or the difference is just stylistic.\n" +
    "- Be conservative — most auto-generated titles are adequate.\n\n";

  if (shouldBuildPromptForAgentSuggestion) {
    prompt +=
      "Agent suggestion guidelines:\n" +
      "- Review the list of available agents below and determine if one could help with the user's current question or task.\n" +
      "- Set agent_confidence HIGH (>75) only when an agent clearly matches the user's need " +
      "and hasn't already been involved in the conversation.\n" +
      "- Set agent_confidence LOW (<30) when the user's need is already being addressed " +
      "or no agent is a strong match.\n" +
      "- The agent_name MUST exactly match one of the names from the list below.\n" +
      "- The agent_prompt should be a natural message the user would send to that agent.\n\n" +
      "Available agents:\n";

    for (const agent of agents) {
      const description = agent.description ? `: ${agent.description}` : "";
      prompt += `- ${agent.name}${description}\n`;
    }

    prompt += "\n";
  } else {
    prompt +=
      "No agents are available, so set agent_confidence to 0, agent_name to empty string, " +
      "and agent_prompt to empty string.\n\n";
  }

  if (shouldSuggestFrame) {
    prompt +=
      "Frame creation guidelines:\n" +
      "- Frames are interactive visual components (dashboards, charts, presentations, formatted documents).\n" +
      "- Set frame_confidence HIGH (>75) only when the conversation contains content that would clearly " +
      "benefit from visual presentation: data analysis results, document iterations, structured reports, " +
      "comparisons, or summaries that deserve a polished visual output.\n" +
      "- Set frame_confidence LOW (<30) when the conversation is purely Q&A, has no structured data " +
      "or document content, or the user hasn't reached a point where a visual output would add value.\n" +
      '- The frame_prompt should start with "Use the Create Frames skill to" followed by a description of the Frame to create ' +
      'based on the conversation content (e.g. "Use the Create Frames skill to build a dashboard summarizing the quarterly sales data", ' +
      '"Use the Create Frames skill to turn this report into an interactive presentation").\n' +
      "- Be conservative — only suggest frames when there is clear value in a visual output.\n\n";
  } else {
    prompt +=
      "Frame creation is not available, so set frame_confidence to 0 and frame_prompt to empty string.\n\n";
  }

  if (suggestionHistory.length > 0) {
    prompt += "Previous suggestion history (most recent first):\n";
    for (const suggestion of suggestionHistory) {
      const outcome =
        suggestion.status === "accepted" ? "ACCEPTED" : "DISMISSED";

      switch (suggestion.suggestionType) {
        case "rename_title": {
          const { suggestedTitle } = suggestion.metadata;
          prompt += `- [${outcome}] Title rename: "${suggestedTitle}"\n`;
          break;
        }
        case "call_agent": {
          if (!shouldBuildPromptForAgentSuggestion) {
            break;
          }
          const { agentName } = suggestion.metadata;
          prompt += `- [${outcome}] Agent suggestion: ${agentName}\n`;
          break;
        }
        case "create_frame": {
          if (!shouldSuggestFrame) {
            break;
          }
          prompt += `- [${outcome}] Frame creation suggestion\n`;
          break;
        }
        default:
          assertNever(suggestion);
      }
    }
    prompt +=
      "\nDo NOT re-suggest titles that were DISMISSED. " +
      "Learn from accepted suggestions to understand user preferences.\n\n";
  }

  prompt +=
    "You MUST call the tool. Always call it.\n\n" +
    `The current conversation title is: "${currentTitle}"`;

  return prompt;
}

/**
 * Check whether any agent in the conversation has created a Frame
 * (i.e. used the interactive_content MCP server).
 */
function conversationHasFrame(conversation: ConversationType): boolean {
  for (const messageGroup of conversation.content) {
    for (const message of messageGroup) {
      if (message.type === "agent_message") {
        const agentMessage = message as AgentMessageType;
        for (const action of agentMessage.actions) {
          if (action.internalMCPServerName === "interactive_content") {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Extract the sIds of agents already participating in the conversation.
 */
function getParticipantAgentSIds(conversation: ConversationType): Set<string> {
  const sIds = new Set<string>();
  for (const messageGroup of conversation.content) {
    for (const message of messageGroup) {
      if (message.type === "agent_message") {
        sIds.add((message as AgentMessageType).configuration.sId);
      }
    }
  }
  return sIds;
}

/*
 * Determine whether a new suggestion of the given type should be proposed.
 *
 * Rules:
 * - If the most recent suggestion of this type is still pending and was
 *   created within the last SUGGESTION_COOLDOWN_MESSAGES messages → skip
 *   (the user can still see it).
 * - If the most recent suggestion is still pending but is older than
 *   SUGGESTION_COOLDOWN_MESSAGES messages → auto-dismiss it (it's scrolled
 *   off-screen) and allow a new one.
 * - If the most recent suggestion was dismissed/accepted within the last
 *   SUGGESTION_COOLDOWN_MESSAGES messages → skip (respect cooldown).
 * - Otherwise → allow.
 */
async function shouldProposeSuggestion(
  auth: Authenticator,
  {
    conversationId,
    currentMessageRank,
    suggestionType,
  }: {
    conversationId: ModelId;
    currentMessageRank: number;
    suggestionType: "rename_title" | "call_agent" | "create_frame";
  }
): Promise<boolean> {
  const latest =
    await ConversationButlerSuggestionResource.fetchLatestByConversationAndType(
      auth,
      { conversationId, suggestionType }
    );

  if (!latest) {
    return true;
  }

  // Resolve the rank of the message that triggered the previous suggestion.
  const previousSourceMessage = await MessageModel.findOne({
    attributes: ["rank"],
    where: {
      id: latest.sourceMessageId,
      workspaceId: auth.getNonNullableWorkspace().id,
      visibility: "visible", // to check for deletion
    },
  });

  // If the source message was deleted/not existing, allow a new suggestion.
  if (!previousSourceMessage) {
    return true;
  }

  const rankDistance = currentMessageRank - previousSourceMessage.rank;
  const withinCooldown = rankDistance < SUGGESTION_COOLDOWN_MESSAGES;

  if (latest.status === "pending") {
    if (withinCooldown) {
      // Still visible — skip.
      return false;
    }
    // Stale pending suggestion scrolled off-screen — auto-dismiss it.
    await latest.autoDismiss();
    return true;
  }

  // Dismissed or accepted — respect cooldown.
  return !withinCooldown;
}

/**
 * Analyze a conversation with a single LLM call to evaluate both title rename
 * and agent suggestion. Creates suggestions for each evaluation that passes
 * the confidence threshold.
 */
export async function analyzeConversation(
  auth: Authenticator,
  {
    conversation,
    messageId,
  }: {
    conversation: ConversationType;
    messageId: string;
  }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

  const thinkingEvent: ButlerThinkingEvent = {
    type: "butler_thinking",
    created: Date.now(),
  };
  await publishConversationEvent(thinkingEvent, {
    conversationId: conversation.sId,
  });

  try {
    const model = getFastestWhitelistedModel(owner);
    if (!model) {
      logger.warn(
        { conversationId: conversation.id, workspaceId: owner.sId },
        "Butler: no whitelisted model available for conversation analysis"
      );
      return;
    }

    // Fetch available agents, filtering out global (platform-provided) agents
    // and those already participating in the conversation.
    const participantSIds = getParticipantAgentSIds(conversation);
    const allAgents = await getAgentConfigurationsForView({
      auth,
      agentsGetView: "list",
      variant: "extra_light",
      sort: "priority",
    });
    const availableAgents = allAgents
      .filter((a) => a.scope !== "global" && !participantSIds.has(a.sId))
      .slice(0, MAX_AGENTS_IN_PROMPT);

    // Only suggest frames if no frame has already been created in this conversation.
    const hasFrame = conversationHasFrame(conversation);
    const shouldSuggestFrame = !hasFrame;

    // Resolve the @dust agent for frame creation suggestions.
    const dustAgent = allAgents.find((a) => a.sId === GLOBAL_AGENTS_SID.DUST);

    const suggestionHistory =
      await ConversationButlerSuggestionResource.fetchResolvedByConversation(
        auth,
        { conversationId: conversation.id, limit: 10 }
      );

    const currentTitle = conversation.title ?? "";
    const prompt = buildPrompt(
      currentTitle,
      availableAgents,
      suggestionHistory,
      shouldSuggestFrame
    );

    const modelConversationRes = await renderConversationForModel(auth, {
      conversation,
      model,
      prompt,
      tools: "",
      allowedTokenCount: model.contextSize - model.generationTokensCount,
      excludeActions: true,
      excludeImages: true,
    });

    if (modelConversationRes.isErr()) {
      logger.error(
        {
          conversationId: conversation.id,
          error: modelConversationRes.error,
        },
        "Butler: failed to render conversation for analysis"
      );
      return;
    }

    const { modelConversation: conv } = modelConversationRes.value;
    if (conv.messages.length === 0) {
      return;
    }

    const res = await runMultiActionsAgent(
      auth,
      {
        providerId: model.providerId,
        modelId: model.modelId,
        functionCall: SUGGEST_ACTIONS_FUNCTION_NAME,
        useCache: false,
      },
      {
        conversation: conv,
        prompt,
        specifications: buildAnalyzeConversationSpecifications({
          hasAgents: availableAgents.length > 0,
          shouldSuggestFrame,
        }),
        forceToolCall: SUGGEST_ACTIONS_FUNCTION_NAME,
      },
      {
        context: {
          operationType: "butler_analyze_conversation",
          conversationId: conversation.sId,
          workspaceId: owner.sId,
        },
      }
    );

    if (res.isErr()) {
      logger.error(
        { conversationId: conversation.id, error: res.error },
        "Butler: LLM call failed for conversation analysis"
      );
      return;
    }

    const action = res.value.actions?.[0];
    if (!action?.arguments) {
      logger.warn(
        { conversationId: conversation.id },
        "Butler: no tool call in LLM response for conversation analysis. Hint: improve the prompt"
      );
      return;
    }

    const parseResult = SuggestActionsResult.safeParse(action.arguments);
    if (parseResult.success === false) {
      logger.error(
        {
          conversationId: conversation.id,
          error: parseResult.error,
        },
        "Butler: failed to parse LLM response for conversation analysis"
      );
      return;
    }

    const {
      rename_confidence,
      new_title,
      agent_confidence,
      agent_name,
      agent_prompt,
      frame_confidence,
      frame_prompt,
    } = parseResult.data;

    // Find the source message that triggered this analysis.
    const sourceMessage = await MessageModel.findOne({
      where: {
        sId: messageId,
        workspaceId: owner.id,
        visibility: "visible",
      },
    });

    if (!sourceMessage) {
      return;
    }

    // Process rename title suggestion with throttling.
    if (
      rename_confidence >= RENAME_CONFIDENCE_THRESHOLD &&
      new_title &&
      new_title.trim().toLowerCase() !== currentTitle.trim().toLowerCase()
    ) {
      const shouldPropose = await shouldProposeSuggestion(auth, {
        conversationId: conversation.id,
        currentMessageRank: sourceMessage.rank,
        suggestionType: "rename_title",
      });

      if (shouldPropose) {
        const suggestion = await ConversationButlerSuggestionResource.makeNew(
          auth,
          {
            conversationId: conversation.id,
            sourceMessageId: sourceMessage.id,
            suggestionType: "rename_title",
            metadata: { suggestedTitle: new_title },
            status: "pending",
          }
        );

        const event: ButlerSuggestionCreatedEvent = {
          type: "butler_suggestion_created",
          created: Date.now(),
          suggestion: suggestion.toJSON(),
        };

        await publishConversationEvent(event, {
          conversationId: conversation.sId,
        });

        logger.info(
          {
            conversationId: conversation.id,
            suggestedTitle: new_title,
            confidence: rename_confidence,
          },
          "Butler: created rename_title suggestion"
        );
      }
    }

    // Process agent suggestion with throttling.
    if (
      agent_confidence >= AGENT_CONFIDENCE_THRESHOLD &&
      agent_name &&
      agent_prompt
    ) {
      // Validate that the agent name matches an available agent (case-insensitive).
      const matchedAgent = availableAgents.find(
        (a) => a.name.toLowerCase() === agent_name.toLowerCase()
      );

      if (matchedAgent) {
        const shouldPropose = await shouldProposeSuggestion(auth, {
          conversationId: conversation.id,
          currentMessageRank: sourceMessage.rank,
          suggestionType: "call_agent",
        });

        if (shouldPropose) {
          const suggestion = await ConversationButlerSuggestionResource.makeNew(
            auth,
            {
              conversationId: conversation.id,
              sourceMessageId: sourceMessage.id,
              suggestionType: "call_agent",
              metadata: {
                agentSId: matchedAgent.sId,
                agentName: matchedAgent.name,
                prompt: agent_prompt,
              },
              status: "pending",
            }
          );

          const event: ButlerSuggestionCreatedEvent = {
            type: "butler_suggestion_created",
            created: Date.now(),
            suggestion: suggestion.toJSON(),
          };

          await publishConversationEvent(event, {
            conversationId: conversation.sId,
          });

          logger.info(
            {
              conversationId: conversation.id,
              agentName: matchedAgent.name,
              agentSId: matchedAgent.sId,
              confidence: agent_confidence,
            },
            "Butler: created call_agent suggestion"
          );
        } else {
          logger.info(
            {
              conversationId: conversation.id,
              agentName: matchedAgent.name,
              confidence: agent_confidence,
            },
            "Butler: skipped call_agent suggestion (throttled)"
          );
        }
      }
    }

    // Process frame creation suggestion with throttling.
    if (
      shouldSuggestFrame &&
      dustAgent &&
      frame_confidence >= FRAME_CONFIDENCE_THRESHOLD &&
      frame_prompt
    ) {
      const shouldPropose = await shouldProposeSuggestion(auth, {
        conversationId: conversation.id,
        currentMessageRank: sourceMessage.rank,
        suggestionType: "create_frame",
      });

      if (shouldPropose) {
        const suggestion = await ConversationButlerSuggestionResource.makeNew(
          auth,
          {
            conversationId: conversation.id,
            sourceMessageId: sourceMessage.id,
            suggestionType: "create_frame",
            metadata: {
              agentSId: dustAgent.sId,
              agentName: dustAgent.name,
              prompt: frame_prompt,
            },
            status: "pending",
          }
        );

        const event: ButlerSuggestionCreatedEvent = {
          type: "butler_suggestion_created",
          created: Date.now(),
          suggestion: suggestion.toJSON(),
        };

        await publishConversationEvent(event, {
          conversationId: conversation.sId,
        });

        logger.info(
          {
            conversationId: conversation.id,
            confidence: frame_confidence,
          },
          "Butler: created create_frame suggestion"
        );
      }
    }
  } finally {
    const doneEvent: ButlerDoneEvent = {
      type: "butler_done",
      created: Date.now(),
    };
    await publishConversationEvent(doneEvent, {
      conversationId: conversation.sId,
    });
  }
}
