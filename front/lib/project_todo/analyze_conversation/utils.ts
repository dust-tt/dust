import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import type { Authenticator } from "@app/lib/auth";
import { EXTRACT_CONVERSATION_TODOS_FUNCTION_NAME } from "@app/lib/project_todo/analyze_conversation/types";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export function buildSpec(): AgentActionSpecification {
  return {
    name: EXTRACT_CONVERSATION_TODOS_FUNCTION_NAME,
    description:
      "Extract action items, notable facts, and the conversation topic from the conversation.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "One-line summary of the conversation topic, e.g. 'Debugging the embed timeout issue'.",
        },
        action_items: {
          type: "array",
          description: "List of action items extracted from the conversation.",
          items: {
            type: "object",
            properties: {
              sId: {
                type: "string",
                description:
                  "Stable identifier for this action item. Copy verbatim from the known action items list if this task was previously tracked. Omit for brand-new tasks.",
              },
              text: {
                type: "string",
                description: "Short description of the action item.",
              },
              assignee_name: {
                type: "string",
                description:
                  "Name of the person assigned, if clearly stated in the conversation.",
              },
              source_message_rank: {
                type: "number",
                description:
                  "Rank of the message where this action item was first mentioned.",
              },
              status: {
                type: "string",
                enum: ["open", "done"],
                description:
                  "'done' if the item was explicitly resolved in the conversation, 'open' otherwise.",
              },
              detected_done_rationale: {
                type: "string",
                description:
                  "Brief explanation of why the item is considered done, if status is 'done'.",
              },
            },
            required: ["text", "source_message_rank", "status"],
          },
        },
        notable_facts: {
          type: "array",
          description: "List of notable facts extracted from the conversation.",
          items: {
            type: "object",
            properties: {
              sId: {
                type: "string",
                description:
                  "Stable identifier for this notable fact. Copy verbatim from the known notable facts list if this fact was previously tracked. Omit for brand-new facts.",
              },
              text: {
                type: "string",
                description: "Short description of the notable fact.",
              },
              source_message_rank: {
                type: "number",
                description:
                  "Rank of the message where this fact was first mentioned.",
              },
            },
            required: ["text", "source_message_rank"],
          },
        },
      },
      required: ["topic", "action_items", "notable_facts"],
    },
  };
}

export function getLastProcessedMessageRank(
  conversation: ConversationType
): number {
  let maxRank = 0;
  for (const messageGroup of conversation.content) {
    for (const message of messageGroup) {
      if ("rank" in message && typeof message.rank === "number") {
        maxRank = Math.max(maxRank, message.rank);
      }
    }
  }
  return maxRank;
}

// Renders the conversation for the LLM and injects the prompt as a trailing user
// message (required so the conversation never ends on an assistant turn, which
// some providers reject). Returns null if rendering fails or produces no messages.
export async function renderConversationForLLM(
  auth: Authenticator,
  {
    conversation,
    model,
    prompt,
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
    prompt: string;
  }
): Promise<ModelConversationTypeMultiActions | null> {
  const res = await renderConversationForModel(auth, {
    conversation,
    model,
    prompt,
    tools: "",
    allowedTokenCount: model.contextSize - model.generationTokensCount,
    excludeActions: true,
    excludeImages: true,
  });
  if (res.isErr()) {
    logger.error(
      { conversationId: conversation.id, error: res.error },
      "Conversation todo: failed to render conversation"
    );
    return null;
  }
  const { modelConversation: conv } = res.value;
  if (conv.messages.length === 0) {
    return null;
  }
  conv.messages.push({
    role: "user",
    name: "todo_extractor",
    content: [{ type: "text", text: prompt }],
  });

  return conv;
}
