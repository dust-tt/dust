import { workflow } from "@novu/framework";
import z from "zod";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { Authenticator } from "@app/lib/auth";
import {
  getAgentsDataRetention,
  getConversationsDataRetention,
} from "@app/lib/data_retention";
import { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import type { Result } from "@app/types";
import { Err, getSmallWhitelistedModel, stripMarkdown } from "@app/types";
import { Ok } from "@app/types";
import { CONVERSATION_ADDED_AS_PARTICIPANT_TRIGGER_ID } from "@app/types/notification_preferences";
import { assertNever } from "@app/types/shared/utils/assert_never";

import { renderEmail } from "../email-templates/conversation-added-as-participant";
import type { ConversationAddedAsParticipantPayloadType } from "../triggers/conversation-added-as-participant";
import { ConversationAddedAsParticipantPayloadSchema } from "../triggers/conversation-added-as-participant";

const ConversationDetailsSchema = z.object({
  subject: z.string(),
  userThatAddedYouFullname: z.string(),
  workspaceName: z.string(),
  hasConversationRetentionPolicy: z.boolean(),
  hasAgentRetentionPolicies: z.boolean(),
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
  let hasConversationRetentionPolicy = false;
  let hasAgentRetentionPolicies = false;

  if (subscriberId) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );

    const conversationRes = await getConversation(auth, payload.conversationId);

    if (conversationRes.isOk()) {
      const conversation = conversationRes.value;
      workspaceName = auth.getNonNullableWorkspace().name;
      subject = conversation.title ?? "Dust conversation";

      const userThatAddedYou = await UserResource.fetchById(
        payload.userThatAddedYouId
      );

      if (userThatAddedYou) {
        userThatAddedYouFullname = userThatAddedYou.fullName();
      }

      const conversationsRetention = await getConversationsDataRetention(auth);
      hasConversationRetentionPolicy = conversationsRetention !== null;

      const agentsRetention = await getAgentsDataRetention(auth);
      hasAgentRetentionPolicies = conversation.content.flat().some((msg) => {
        if (msg.type !== "agent_message") {
          return false;
        }

        return msg.configuration.sId in agentsRetention;
      });
    }
  }
  return {
    subject,
    userThatAddedYouFullname,
    workspaceName,
    hasConversationRetentionPolicy,
    hasAgentRetentionPolicies,
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

const FUNCTION_NAME = "write_mention_summary";

const specification: AgentActionSpecification = {
  name: FUNCTION_NAME,
  description:
    "Write a concise summary explaining why a user was mentioned and what action is needed from them",
  inputSchema: {
    type: "object",
    properties: {
      conversation_summary: {
        type: "string",
        description:
          "A single sentence stating who needs something from the user and what specific action/decision is required.",
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
    `Write ONE sentence explaining to ${userFullName} why he was mentioned in the conversation and what action is needed from him.\n\n` +
    `CRITICAL RULES:\n` +
    `- You are writing TO ${userFullName}. Use "you/your" - NEVER write "${userFullName}"\n` +
    `- DO NOT describe the conversation. Only state what's needed.\n\n` +
    `# Input\n` +
    `You'll receive JSON messages with:\n` +
    `- "name": sender's display name (use this, not "user" or "assistant")\n` +
    `- "content": message text\n\n` +
    `# Extract\n` +
    `1. WHO needs something (actual person's name) from ${userFullName}\n` +
    `2. WHAT specific action/decision is needed\n` +
    `3. KEY DETAILS: deadlines, numbers, specific options\n\n` +
    `# Example Output Format\n` +
    `[Person's name] needs you to [specific action] [key details].\n\n` +
    `# Examples\n\n` +
    `"Sarah needs your approval on the Q1 hiring budget ($450K) by end of week to finalize headcount."\n` +
    `"Alex needs you to choose between the three homepage designs by Tuesday for the product launch."\n` +
    `"Jordan needs your technical review of the migration plan—specifically whether the 2-week timeline is feasible."\n` +
    `# Your Task\n` +
    `Write ONE sentence: [Name] needs you to [action] [details].\n` +
    `Use "you/your" and actual person names only.`;

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

const generateEmailBody = async (
  subscriber: {
    subscriberId?: string;
    firstName?: string | null;
  },
  payload: ConversationAddedAsParticipantPayloadType,
  details: ConversationDetailsType
): Promise<string> => {
  if (details.hasConversationRetentionPolicy) {
    return renderEmail({
      name: subscriber.firstName ?? "You",
      workspace: {
        id: payload.workspaceId,
        name: details.workspaceName,
      },
      userThatAddedYouFullname: details.userThatAddedYouFullname,
      conversation: {
        id: payload.conversationId,
        title: details.subject,
        summary:
          "Summary not generated due to data retention policy on conversations in this workspace.",
      },
    });
  }

  if (details.hasAgentRetentionPolicies) {
    return renderEmail({
      name: subscriber.firstName ?? "You",
      workspace: {
        id: payload.workspaceId,
        name: details.workspaceName,
      },
      userThatAddedYouFullname: details.userThatAddedYouFullname,
      conversation: {
        id: payload.conversationId,
        title: details.subject,
        summary:
          "Summary not generated due to data retention policy on agents in this conversation.",
      },
    });
  }
  const summaryResult = await generateConversationSummary(
    subscriber.subscriberId,
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
    return renderEmail({
      name: subscriber.firstName ?? "You",
      workspace: {
        id: payload.workspaceId,
        name: details.workspaceName,
      },
      userThatAddedYouFullname: details.userThatAddedYouFullname,
      conversation: {
        id: payload.conversationId,
        title: details.subject,
        summary: null,
      },
    });
  }
  return renderEmail({
    name: subscriber.firstName ?? "You",
    workspace: {
      id: payload.workspaceId,
      name: details.workspaceName,
    },
    userThatAddedYouFullname: details.userThatAddedYouFullname,
    conversation: {
      id: payload.conversationId,
      title: details.subject,
      summary: summaryResult.value,
    },
  });
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
        const body = await generateEmailBody(subscriber, payload, details);
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
