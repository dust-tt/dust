import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import {
  getAgentLoopData,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import { getSmallWhitelistedModel } from "@app/types/assistant/assistant";
import type {
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { GEMINI_2_5_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";
import { GPT_5_1_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { isProviderWhitelisted } from "@app/types/assistant/models/providers";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";

export async function ensureConversationTitleFromAgentLoop(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<string | null> {
  const runAgentDataRes = await getAgentLoopData(authType, agentLoopArgs);
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

  const { conversation, userMessage } = runAgentDataRes.value;

  const authResult = await Authenticator.fromJSON(authType);
  if (authResult.isErr()) {
    throw new Error(
      `Failed to deserialize authenticator: ${authResult.error.code}`
    );
  }
  const auth = authResult.value;

  return ensureConversationTitle(auth, { conversation, userMessage });
}

export async function ensureConversationTitle(
  auth: Authenticator,
  {
    conversation,
    userMessage,
  }: { conversation: ConversationType; userMessage: UserMessageType }
): Promise<string | null> {
  // If the conversation has a title, return early.
  if (conversation.title) {
    return conversation.title;
  }

  const titleRes = await generateConversationTitle(auth, {
    ...conversation,
    content: [...conversation.content, [userMessage]],
  });

  if (titleRes.isErr()) {
    logger.error(
      {
        conversationId: conversation.sId,
        error: titleRes.error,
      },
      "Conversation title generation error"
    );
    return null;
  }

  const title = titleRes.value;
  await ConversationResource.updateTitle(auth, conversation.sId, title);

  // Enqueue the conversation_title event in Redis.
  await publishConversationEvent(
    {
      type: "conversation_title",
      created: Date.now(),
      title,
    },
    {
      conversationId: conversation.sId,
    }
  );

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
  conversation: ConversationType
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getFastModelConfig(owner);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate title")
    );
  }

  const prompt =
    "Generate a concise conversation title (3-8 words) based on the user's message and context. " +
    "The title should capture the main topic or request without being too generic.";

  // Turn the conversation into a digest that can be presented to the model.
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
    return modelConversationRes;
  }

  const { modelConversation: conv } = modelConversationRes.value;
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
  owner: WorkspaceType
): ModelConfigurationType | null {
  if (isProviderWhitelisted(owner, "openai")) {
    return GPT_5_1_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "anthropic")) {
    return CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG;
  }
  if (isProviderWhitelisted(owner, "google_ai_studio")) {
    return GEMINI_2_5_FLASH_MODEL_CONFIG;
  }

  return getSmallWhitelistedModel(owner);
}
