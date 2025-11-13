import type { Logger } from "pino";

import type { LLM } from "@app/lib/api/llm/llm";
import type { Authenticator } from "@app/lib/auth";
import { getOutputFromAction } from "@app/temporal/agent_loop/lib/get_output_from_action";
import { getOutputFromLLMStream } from "@app/temporal/agent_loop/lib/get_output_from_llm";
import type { GetOutputRequestParams } from "@app/temporal/agent_loop/lib/types";

export async function getOutputFromLLM(
  auth: Authenticator,
  localLogger: Logger,
  {
    modelConversationRes,
    conversation,
    userMessage,
    specifications,
    flushParserTokens,
    contentParser,
    agentMessageRow,
    step,
    agentConfiguration,
    agentMessage,
    model,
    prompt,
    llm,
    runConfig,
    publishAgentError,
    updateResourceAndPublishEvent,
  }: GetOutputRequestParams & { llm: LLM | null }
) {
  if (llm === null) {
    return getOutputFromAction(auth, {
      modelConversationRes,
      conversation,
      userMessage,
      runConfig,
      specifications,
      flushParserTokens,
      contentParser,
      agentMessageRow,
      step,
      agentConfiguration,
      agentMessage,
      model,
      publishAgentError,
      prompt,
      updateResourceAndPublishEvent,
    });
  } else {
    if (userMessage.rank === 0) {
      // Log conversations that are using the new LLM router (log only once when the conversation starts)
      localLogger.info(
        {
          conversationId: conversation.sId,
        },
        "Running model with the new LLM router"
      );
    }
    return getOutputFromLLMStream(auth, {
      modelConversationRes,
      conversation,
      userMessage,
      runConfig,
      specifications,
      flushParserTokens,
      contentParser,
      agentMessageRow,
      step,
      agentConfiguration,
      agentMessage,
      model,
      publishAgentError,
      prompt,
      llm,
      updateResourceAndPublishEvent,
    });
  }
}
