import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { renderConversationAsText } from "@app/lib/api/assistant/conversation/render_as_text";
import {
  getEffectiveWhiteListedProviders,
  getSmallWhitelistedModel,
  getWhitelistedProviders,
} from "@app/lib/api/assistant/models";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator, AuthenticatorType } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ModelProviderIdType } from "@app/lib/resources/storage/models/workspace";
import logger from "@app/logger/logger";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import {
  getAgentLoopRuntimeData,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import type {
  ConversationType,
  ConversationWithoutContentType,
  LightConversationType,
} from "@app/types/assistant/conversation";
import { ConversationError } from "@app/types/assistant/conversation";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import { CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { GEMINI_3_5_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";
import { GPT_5_1_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { getLightConversation } from "./fetch";

export async function updateConversationTitle(
  auth: Authenticator,
  {
    conversationId,
    title,
  }: {
    conversationId: string;
    title: string;
  }
): Promise<Result<undefined, ConversationError>> {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  await conversation.updateTitle(auth, title);

  await publishConversationEvent(
    {
      type: "conversation_title",
      created: Date.now(),
      title,
    },
    { conversationId }
  );

  return new Ok(undefined);
}

export async function ensureConversationTitleFromAgentLoop(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<string | null> {
  const runAgentDataRes = await getAgentLoopRuntimeData(
    authType,
    agentLoopArgs
  );
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      logger.info(
        {
          conversationId: agentLoopArgs.conversationId,
          agentMessageId: agentLoopArgs.agentMessageId,
        },
        "Message or conversation was deleted, exiting"
      );
      return null;
    }
    throw runAgentDataRes.error;
  }

  const { conversation, auth } = runAgentDataRes.value;

  return ensureConversationTitle(auth, { conversation });
}

export async function ensureConversationTitle(
  auth: Authenticator,
  {
    conversation,
  }: { conversation: ConversationResource | ConversationWithoutContentType }
): Promise<string | null> {
  // If the conversation has a title, return early.
  if (conversation.title) {
    return conversation.title;
  }

  // biome-ignore lint/plugin/noExpensiveConversationFetch: intentional full conversation load
  const conversationLightRes = await getLightConversation(
    auth,
    conversation.sId
  );
  if (conversationLightRes.isErr()) {
    logger.error(
      {
        conversationId: conversation.sId,
        error: conversationLightRes.error,
      },
      "[ensureConversationTitle] Failed to get light conversation"
    );

    return null;
  }

  const titleRes = await generateConversationTitle(
    auth,
    conversationLightRes.value
  );

  if (titleRes.isErr()) {
    logger.error(
      {
        conversationId: conversation.sId,
        error: titleRes.error,
      },
      "[ensureConversationTitle] Conversation title generation error"
    );
    return null;
  }

  const title = (conversation.triggerId ? "⚡ " : "") + titleRes.value;
  const updateRes = await updateConversationTitle(auth, {
    conversationId: conversation.sId,
    title,
  });
  if (updateRes.isErr()) {
    logger.error(
      {
        conversationId: conversation.sId,
        error: updateRes.error,
      },
      "[ensureConversationTitle] Failed to update conversation title"
    );
    return null;
  }

  return title;
}

const FUNCTION_NAME = "update_title";

const specifications: AgentActionSpecification[] = [
  {
    name: FUNCTION_NAME,
    description: "Update the title of the conversation",
    inputSchema: {
      type: "object",
      properties: {
        conversation_title: {
          type: "string",
          description: "A short title that summarizes the conversation.",
        },
      },
      required: ["conversation_title"],
    },
  },
];

async function generateConversationTitle(
  auth: Authenticator,
  conversation: ConversationType | LightConversationType
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);
  const model = getFastModelConfig(auth, whiteListedProviders);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate title")
    );
  }

  let prompt =
    "Generate a concise conversation title (3-8 words) based on the user's message and context. " +
    "The title should capture the main topic or request without being too generic.";
  if (conversation.triggerId) {
    prompt +=
      " The conversation was triggered either on a schedule or programmatically.";
  }

  // Turn the conversation into a digest that can be presented to the model.
  const conv: ModelConversationTypeMultiActions = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Here is the conversation to generate a title for.\n\n${renderConversationAsText(conversation, { includeTimestamps: true })}`,
          },
        ],
        name: "",
      },
    ],
  };

  if (conv.messages.length === 0) {
    // It is possible that no message were selected if the context size of the small model was
    // overflown by the initial user message. In that case we just skip title generation for now (it
    // will get attempted again with follow-up messages being added to the conversation).
    return new Err(
      new Error(
        "Error generating conversation title: rendered conversation is empty"
      )
    );
  }

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: FUNCTION_NAME,
      useCache: false,
    },
    {
      conversation: conv,
      prompt: prompt,
      specifications,
      forceToolCall: FUNCTION_NAME,
    },
    {
      context: {
        operationType: "conversation_title_suggestion",
        conversationId: conversation.sId,
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  // Extract title from function call result.
  if (res.value.actions?.[0]?.arguments?.conversation_title) {
    const title = res.value.actions[0].arguments.conversation_title;
    return new Ok(title);
  }

  return new Err(new Error("No title found in LLM response"));
}

function getFastModelConfig(
  auth: Authenticator,
  whiteListedProviders: ModelProviderIdType[] | null
): ModelConfigurationType | null {
  const providers = getWhitelistedProviders(auth, whiteListedProviders);

  if (providers.has("openai")) {
    return GPT_5_1_MODEL_CONFIG;
  }
  if (providers.has("anthropic")) {
    return CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG;
  }
  if (providers.has("google_ai_studio")) {
    return GEMINI_3_5_FLASH_MODEL_CONFIG;
  }

  return getSmallWhitelistedModel(auth, undefined, { whiteListedProviders });
}
