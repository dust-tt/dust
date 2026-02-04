import { workflow } from "@novu/framework";
import z from "zod";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import type { Result } from "@app/types";
import { Err, getSmallWhitelistedModel, stripMarkdown } from "@app/types";
import { Ok } from "@app/types";
import { assertNever } from "@app/types/shared/utils/assert_never";

import type { ConversationAddedAsParticipantPayloadType } from "../triggers/conversation-added-as-participant";
import {
  CONVERSATION_ADDED_AS_PARTICIPANT_TRIGGER_ID,
  ConversationAddedAsParticipantPayloadSchema,
} from "../triggers/conversation-added-as-participant";

const ConversationDetailsSchema = z.object({
  subject: z.string(),
  userThatAddedYouFullname: z.string(),
  workspaceName: z.string(),
});

type ConversationDetailsType = z.infer<typeof ConversationDetailsSchema>;

const getConversationDetails = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: ConversationAddedAsParticipantPayloadType;
}): Promise<ConversationDetailsType> => {
  let subject: string = "A dust conversation";
  let userThatAddedYouFullname: string = "Someone else";
  let workspaceName: string = "A workspace";

  if (subscriberId) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );

    const conversation = await ConversationResource.fetchById(
      auth,
      payload.conversationId
    );

    if (conversation) {
      workspaceName = auth.getNonNullableWorkspace().name;
      subject = conversation.title ?? "Dust conversation";

      const userThatAddedYou = await UserResource.fetchById(
        payload.userThatAddedYouId
      );

      if (userThatAddedYou) {
        userThatAddedYouFullname = userThatAddedYou.fullName();
      }
    }
  }
  return {
    subject,
    userThatAddedYouFullname,
    workspaceName,
  };
};

const shouldSkipConversation = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: ConversationAddedAsParticipantPayloadType;
}): Promise<boolean> => {
  if (subscriberId) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );

    const conversation = await ConversationResource.fetchById(
      auth,
      payload.conversationId
    );

    if (!conversation) {
      return true;
    }
  }

  return false;
};

const FUNCTION_NAME = "write_summary";

const specification: AgentActionSpecification = {
  name: FUNCTION_NAME,
  description: "Write a summary of the conversation",
  inputSchema: {
    type: "object",
    properties: {
      conversation_summary: {
        type: "string",
        description: "A short summary of the conversation.",
      },
    },
    required: ["conversation_summary"],
  },
};

const SUMMARY_ALLOWED_TOKEN_COUNT = 4000;

const generateConversationSummary = async (
  subscriberId: string | undefined,
  payload: ConversationAddedAsParticipantPayloadType
): Promise<
  Result<
    string,
    DustError<
      | "conversation_not_found"
      | "no_unread_messages_found"
      | "no_whitelisted_model_found"
      | "internal_error"
      | "generation_failed"
      | "user_not_found"
    >
  >
> => {
  if (!subscriberId) {
    return new Err(
      new DustError("user_not_found", "No subscriber ID provided")
    );
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    payload.workspaceId
  );

  const conversationRes = await getConversation(auth, payload.conversationId);

  if (conversationRes.isErr()) {
    return new Err(
      new DustError("conversation_not_found", "Failed to get conversation")
    );
  }

  const conversation = conversationRes.value;

  const owner = auth.getNonNullableWorkspace();

  const model = getSmallWhitelistedModel(owner);

  if (!model) {
    return new Err(
      new DustError("no_whitelisted_model_found", "No whitelisted model found")
    );
  }

  const userFullName = auth.user()?.fullName();

  if (!userFullName) {
    return new Err(
      new DustError("user_not_found", "User not found for summary generation")
    );
  }
  // Generate LLM summary
  const prompt =
    `# Task\n` +
    `Write a 1-2 sentence summary explaining why ${userFullName} was mentioned in this conversation and what action/input is needed from them.\n\n` +
    `CRITICAL RULE: You are writing to ${userFullName}. NEVER write their name "${userFullName}" in the summary. Always use "you/your/yours" instead.\n\n` +
    `# Input Format\n` +
    `You'll receive a JSON array of messages. Each message has:\n` +
    `- "role": "user" (human) or "assistant" (AI agent)\n` +
    `- "name": sender's display name (e.g., "Sarah Chen", "dust")\n` +
    `- "content": message text (human messages start with <dust_system> block with sender details)\n\n` +
    `Use "role", "name", and <dust_system> to attribute senders correctly. Use message text for context and what's needed.\n\n` +
    `# Writing Rules\n` +
    `1. **Length**: 1-2 sentences maximum\n` +
    `2. **Second person**: Use "you/your/yours" when referring to ${userFullName} - NEVER write "${userFullName}"\n` +
    `3. **Action-first**: Lead with what's needed from the user, then provide essential context\n` +
    `4. **Be specific**: Include concrete details (deadlines, numbers, decisions needed)\n` +
    `5. **No chat narration**: Don't write "X asked", "then Y replied", "assistant provided"\n` +
    `6. **Clear attribution**: Name who needs something from the user\n` +
    `7. **Concise context**: Only include background details necessary to understand the ask\n\n` +
    `# Examples\n\n` +
    `## BAD\n` +
    `"Sarah asked assistant about the budget; assistant replied with numbers; then Sarah mentioned ${userFullName} should review."\n` +
    `Problems: Chat narration, uses "${userFullName}", no clear action\n\n` +
    `## GOOD\n` +
    `"Sarah needs your approval on the Q1 hiring budget ($450K) by end of week to finalize headcount."\n` +
    `Why: Clear ask, uses "your", specific details, who needs it\n\n` +
    `## BAD\n` +
    `"User discussed design options with assistant and mentioned ${userFullName} for final decision."\n` +
    `Problems: Vague "user", uses "${userFullName}", unclear what decision\n\n` +
    `## GOOD\n` +
    `"Alex needs you to choose between the three homepage designs by Tuesday for the product launch."\n` +
    `Why: Specific choice, clear deadline, clear reason\n\n` +
    `## BAD\n` +
    `"Assistant helped user with analysis; they want ${userFullName}'s input on the findings."\n` +
    `Problems: Vague "input", uses "${userFullName}", unclear who wants it\n\n` +
    `## GOOD\n` +
    `"Jordan needs your technical review of the migration plan—specifically whether the 2-week timeline is feasible."\n` +
    `Why: Specific ask, uses "your", clear scope of input needed\n\n` +
    `# Your Task\n` +
    `Read the conversation messages below and write a 1-2 sentence summary that clearly explains:\n` +
    `- What action/input is needed from the mentioned user\n` +
    `- Who needs it and any critical context (deadlines, stakes)\n\n` +
    `Remember: Use "you/your" - NEVER write "${userFullName}".\n` +
    `Write in a clear, actionable tone that helps someone quickly understand what they need to do.`;

  const modelConversationRes = await renderConversationForModel(auth, {
    conversation,
    model,
    prompt,
    tools: JSON.stringify(specification),
    allowedTokenCount: Math.min(
      model.contextSize - model.generationTokensCount,
      SUMMARY_ALLOWED_TOKEN_COUNT
    ),
    excludeActions: true,
    excludeImages: true,
  });

  if (modelConversationRes.isErr()) {
    return new Err(
      new DustError("internal_error", "Failed to render conversation for model")
    );
  }

  const { modelConversation } = modelConversationRes.value;

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: FUNCTION_NAME,
    },
    {
      conversation: {
        messages: [
          {
            role: "user",
            name: userFullName,
            content: [
              {
                type: "text",
                text: `This is the content of the conversation to summarize:\n\n\`\`\`json\n${JSON.stringify(modelConversation.messages, null, 2)}\n\`\`\``,
              },
            ],
          },
        ],
      },
      prompt,
      specifications: [specification],
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType: "conversation_unread_summary",
        conversationId: conversation.sId,
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(new DustError("generation_failed", res.error.message));
  }

  // Extract summary from function call result.
  if (res.value.actions?.[0]?.arguments?.conversation_summary) {
    const summary = res.value.actions[0].arguments.conversation_summary;
    return new Ok(stripMarkdown(summary));
  }

  return new Err(
    new DustError("generation_failed", "No conversation summary generated")
  );
};

const generateEmailContent = async (
  subscriberId: string | undefined,
  payload: ConversationAddedAsParticipantPayloadType,
  details: ConversationDetailsType
): Promise<string> => {
  const summaryResult = await generateConversationSummary(
    subscriberId,
    payload
  );
  if (summaryResult.isErr()) {
    switch (summaryResult.error.code) {
      case "generation_failed":
      case "conversation_not_found":
      case "no_unread_messages_found":
      case "internal_error":
      case "no_whitelisted_model_found":
      case "user_not_found":
        break;
      default:
        assertNever(summaryResult.error.code);
    }
    return `${details.userThatAddedYouFullname} added you to the conversation "${details.subject}".`;
  }
  return `## ${details.userThatAddedYouFullname} added you to the conversation "${details.subject}".\n\n${summaryResult.value}`;
};

export const conversationAddedAsParticipantWorkflow = workflow(
  CONVERSATION_ADDED_AS_PARTICIPANT_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const details = await step.custom(
      "get-conversation-details",
      async () => {
        return getConversationDetails({
          subscriberId: subscriber.subscriberId,
          payload,
        });
      },
      {
        outputSchema: ConversationDetailsSchema,
      }
    );

    await step.inApp(
      "send-in-app",
      async () => {
        return {
          subject: details.subject,
          body: `${details.userThatAddedYouFullname} added you to the conversation.`,
          primaryAction: {
            label: "View",
            redirect: {
              url: getConversationRoute(
                payload.workspaceId,
                payload.conversationId
              ),
            },
          },
          data: {
            // This custom flag means that the in-app message should be deleted automatically after it is received (we don't want to clutter the user's inbox).
            autoDelete: true,
            conversationId: payload.conversationId,
          },
        };
      },
      {
        skip: async () => shouldSkipConversation({ payload }),
      }
    );

    await step.email(
      "send-email",
      async () => {
        const content = await generateEmailContent(
          subscriber.subscriberId,
          payload,
          details
        );
        const body = await renderEmail({
          name: subscriber.firstName ?? "You",
          workspace: {
            id: payload.workspaceId,
            name: details.workspaceName,
          },
          content,
          action: {
            label: "View conversation",
            url:
              process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL +
              getConversationRoute(payload.workspaceId, payload.conversationId),
          },
        });
        return {
          subject: `[Dust] You were mentioned in '${details.subject}'`,
          body,
        };
      },
      {
        // No email from trigger until we give more control over the notification to the users.
        skip: async () => {
          return shouldSkipConversation({ payload });
        },
      }
    );
  },
  {
    payloadSchema: ConversationAddedAsParticipantPayloadSchema,
    tags: ["conversations"] as NotificationAllowedTags,
  }
);
