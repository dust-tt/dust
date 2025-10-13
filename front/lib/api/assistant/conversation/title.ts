import { runActionStreamed } from "@app/lib/actions/server";
import { renderConversationForModel } from "@app/lib/api/assistant/preprocessing";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { ConversationType, Result } from "@app/types";
import {
  ConversationError,
  Err,
  getLargeNonAnthropicWhitelistedModel,
  Ok,
} from "@app/types";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { getAgentLoopData } from "@app/types/assistant/agent_run";

const MIN_GENERATION_TOKENS = 1024;

export async function ensureConversationTitle(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<string | null> {
  const runAgentDataRes = await getAgentLoopData(authType, agentLoopArgs);
  if (runAgentDataRes.isErr()) {
    if (
      runAgentDataRes.error instanceof ConversationError &&
      runAgentDataRes.error.type === "conversation_not_found"
    ) {
      return null;
    }

    throw runAgentDataRes.error;
  }

  const { conversation, userMessage } = runAgentDataRes.value;

  // If the conversation has a title, return early.
  if (conversation.title) {
    return conversation.title;
  }
  const auth = await Authenticator.fromJSON(authType);

  // TODO(DURABLE-AGENTS 2025-07-15): Add back the agent message before generating the title.
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

async function generateConversationTitle(
  auth: Authenticator,
  conversation: ConversationType
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const model = getLargeNonAnthropicWhitelistedModel(owner);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate title")
    );
  }

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel(auth, {
    conversation,
    model,
    prompt: "", // There is no prompt for title generation.
    tools: "",
    allowedTokenCount: model.contextSize - MIN_GENERATION_TOKENS,
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

  // Note: the last message is generally not a user message (though it can happen if no agent were
  // mentioned) which, without stitching, will cause the title generation to fail since models
  // expect a user message to be the last message. The stitching is done in the
  // `assistant-v2-title-generator` app.
  const config = cloneBaseConfig(
    getDustProdAction("assistant-v2-title-generator").config
  );
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await runActionStreamed(
    auth,
    "assistant-v2-title-generator",
    config,
    [
      {
        conversation: conv,
      },
    ],
    {
      conversationId: conversation.sId,
      workspaceId: conversation.owner.sId,
    }
  );

  if (res.isErr()) {
    return new Err(
      new Error(`Error generating conversation title: ${res.error}`)
    );
  }

  const { eventStream } = res.value;
  let title: string | null = null;

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(
        new Error(
          `Error generating conversation title: ${event.content.message}`
        )
      );
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(
          new Error(`Error generating conversation title: ${e.error}`)
        );
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const v = e.value as any;
        if (v.conversation_title) {
          title = v.conversation_title;
        }
      }
    }
  }

  if (title === null) {
    return new Err(
      new Error("Error generating conversation title: malformed output")
    );
  }

  return new Ok(title);
}
