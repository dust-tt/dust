import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getFastModelConfig } from "@app/lib/api/assistant/global_agents/configurations/dust/deep-dive";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { getHeaderFromUserEmail } from "@app/types/user";
import { DustAPI } from "@dust-tt/client";

const MAX_CHARACTERS_TO_SUMMARIZE = 100_000;

export async function summarizeWithAgent({
  auth,
  agentLoopRunContext,
  summaryAgentId,
  content,
}: {
  auth: Authenticator;
  agentLoopRunContext: AgentLoopRunContextType;
  summaryAgentId: string;
  content: string;
}): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.user();
  const prodCredentials = await prodAPICredentialsForOwner(owner);
  const api = new DustAPI(
    config.getDustAPIConfig(),
    {
      ...prodCredentials,
      extraHeaders: { ...getHeaderFromUserEmail(user?.email) },
    },
    logger
  );

  const mainAgent = agentLoopRunContext.agentConfiguration;
  const mainConversation = agentLoopRunContext.conversation;
  const toSummarize = content.slice(0, MAX_CHARACTERS_TO_SUMMARIZE);

  const originMessage = agentLoopRunContext.agentMessage;
  let parentOrigin: UserMessageOrigin | null = null;
  const parentMessage = mainConversation.content
    .flat()
    .find((m) => m.sId === originMessage.parentMessageId);
  if (parentMessage && isUserMessageType(parentMessage)) {
    parentOrigin = parentMessage.context.origin ?? null;
  }

  const convRes = await api.createConversation({
    title: `Summary of web page content (main conversation: ${mainConversation.sId})`,
    visibility: "unlisted",
    depth: mainConversation.depth + 1,
    message: {
      content: `Summarize the following web page content.\n\n` + toSummarize,
      mentions: [{ configurationId: summaryAgentId }],
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        username: mainAgent.name,
        fullName: `@${mainAgent.name}`,
        email: null,
        profilePictureUrl: mainAgent.pictureUrl,
        origin: parentOrigin,
        selectedMCPServerViewIds: null,
      },
      agenticMessageData: {
        // `run_agent` type will skip adding the conversation to the user history.
        type: "run_agent",
        originMessageId: originMessage.sId,
      },
    },
  });

  if (convRes.isErr() || !convRes.value.message) {
    return new Err(new Error("Failed to create summary conversation"));
  }

  const { conversation, message } = convRes.value;
  const streamRes = await api.streamAgentAnswerEvents({
    conversation,
    userMessageId: message.sId,
    options: {
      maxReconnectAttempts: 5,
      reconnectDelay: 5000,
      autoReconnect: true,
    },
  });
  if (streamRes.isErr()) {
    return new Err(
      new Error(`Failed to stream summary: ${streamRes.error.message}`)
    );
  }

  let finalContent = "";

  for await (const event of streamRes.value.eventStream) {
    if (
      event.type === "generation_tokens" &&
      event.classification === "tokens"
    ) {
      finalContent += event.text;
    } else if (event.type === "agent_message_success") {
      break;
    }
  }

  finalContent = finalContent.trim();
  if (!finalContent) {
    return new Err(new Error("Summary agent returned empty content"));
  }
  return new Ok(finalContent);
}

/**
 * Alternative version of summarizeWithAgent that uses a direct LLM call via runMultiActionsAgent.
 * This avoids creating a conversation and streaming through the Dust API, instead making a direct
 * LLM call for faster summarization.
 */
export async function summarizeWithLLM({
  auth,
  content,
  agentLoopRunContext,
}: {
  auth: Authenticator;
  content: string;
  agentLoopRunContext?: AgentLoopRunContextType;
}): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const toSummarize = content.slice(0, MAX_CHARACTERS_TO_SUMMARIZE);

  const model = getFastModelConfig(owner);
  if (!model) {
    return new Err(
      new Error("Failed to find a whitelisted model to generate summary")
    );
  }

  const conversation: ModelConversationTypeMultiActions = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Summarize the following web page content.\n\n${toSummarize}`,
          },
        ],
        name: "",
      },
    ],
  };

  const prompt =
    "Summarize the provided web page content concisely. Focus on the main points and key information.";

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.modelConfiguration.providerId,
      modelId: model.modelConfiguration.modelId,
      functionCall: null, // No function call needed, just text generation
      temperature: 0.3,
      useCache: false,
    },
    {
      conversation,
      prompt,
      specifications: [], // No tools needed for simple summarization
    },
    {
      context: {
        operationType: "web_content_summarization",
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
        ...(agentLoopRunContext && {
          conversationId: agentLoopRunContext.conversation.sId,
        }),
      },
    }
  );

  if (res.isErr()) {
    return new Err(res.error);
  }

  const summary = res.value.generation?.trim();
  if (!summary) {
    return new Err(new Error("LLM returned empty summary"));
  }

  return new Ok(summary);
}
