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
import { getFastestWhitelistedModel } from "@app/types/assistant/assistant";
import type {
  AgentMessageType,
  ButlerSuggestionCreatedEvent,
  ConversationType,
} from "@app/types/assistant/conversation";
import type { ButlerSuggestionData } from "@app/types/conversation_butler_suggestion";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";

const SUGGEST_ACTIONS_FUNCTION_NAME = "suggest_actions";

const MAX_AGENTS_IN_PROMPT = 50;
const RENAME_CONFIDENCE_THRESHOLD = 70;
const AGENT_CONFIDENCE_THRESHOLD = 70;

// Minimum number of messages (by rank distance) between two suggestions of the same type.
const SUGGESTION_COOLDOWN_MESSAGES = 10;

function buildAnalyzeConversationSpecifications(
  hasAgents: boolean
): AgentActionSpecification[] {
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
  };

  return [
    {
      name: SUGGEST_ACTIONS_FUNCTION_NAME,
      description:
        "Suggested one or many actions to the user to evaluate whether the title should be updated " +
        "and whether an available agent could help.",
      inputSchema: {
        type: "object",
        properties,
        required: [
          "rename_confidence",
          "new_title",
          "agent_confidence",
          "agent_name",
          "agent_prompt",
        ],
      },
    },
  ];
}

function buildPrompt(
  currentTitle: string,
  agents: LightAgentConfigurationType[],
  suggestionHistory: ButlerSuggestionData[]
): string {
  const shouldBuildPromptForAgentSuggestion = agents.length > 0;

  let prompt = "You are a conversation analyst. Your job is to:\n";

  if (shouldBuildPromptForAgentSuggestion) {
    prompt +=
      "1. Score how much the conversation title would benefit from being updated.\n" +
      "2. Determine if one of the available agents could help the user.\n\n";
  } else {
    prompt +=
      "Score how much the conversation title would benefit from being updated.\n";
  }

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
    suggestionType: "rename_title" | "call_agent";
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

  const suggestionHistory =
    await ConversationButlerSuggestionResource.fetchResolvedByConversation(
      auth,
      { conversationId: conversation.id, limit: 10 }
    );

  const currentTitle = conversation.title ?? "";
  const prompt = buildPrompt(currentTitle, availableAgents, suggestionHistory);

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
      specifications: buildAnalyzeConversationSpecifications(
        availableAgents.length > 0
      ),
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

  const {
    rename_confidence,
    new_title,
    agent_confidence,
    agent_name,
    agent_prompt,
  } = action.arguments as {
    rename_confidence: number;
    new_title: string;
    agent_confidence: number;
    agent_name: string;
    agent_prompt: string;
  };

  logger.info(
    {
      workspaceId: owner.sId,
      conversationId: conversation.id,
      currentTitle,
      rename_confidence,
      new_title,
      agent_confidence,
      agent_name,
    },
    "Butler: conversation analysis result"
  );

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
    } else {
      logger.info(
        {
          conversationId: conversation.id,
          confidence: rename_confidence,
        },
        "Butler: skipped rename_title suggestion (throttled)"
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
    } else {
      logger.info(
        {
          conversationId: conversation.id,
          agentName: agent_name,
          agent_confidence,
        },
        "Butler: agent name from LLM did not match any available agent, skipping"
      );
    }
  }
}
