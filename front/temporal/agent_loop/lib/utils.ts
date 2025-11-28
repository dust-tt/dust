import type { Logger } from "pino";

import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { LLM } from "@app/lib/api/llm/llm";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessage } from "@app/lib/models/agent/conversation";
import { compareOutputs } from "@app/temporal/agent_loop/lib/compare_outputs";
import { getOutputFromAction } from "@app/temporal/agent_loop/lib/get_output_from_action";
import { getOutputFromLLMStream } from "@app/temporal/agent_loop/lib/get_output_from_llm";
import type { GetOutputRequestParams } from "@app/temporal/agent_loop/lib/types";
import type { ConversationWithoutContentType } from "@app/types";

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

const noopUpdateResourceAndPublishEvent = (
  _auth: Authenticator,
  _: {
    event: AgentMessageEvents;
    agentMessageRow: AgentMessage;
    conversation: ConversationWithoutContentType;
    step: number;
    modelInteractionDurationMs?: number;
    userMessageOrigin?: string | null;
  }
): Promise<void> => {
  return Promise.resolve();
};

const noopPublishAgentError = (_error: {
  code: string;
  message: string;
  metadata: Record<string, string | number | boolean> | null;
}): Promise<void> => {
  return Promise.resolve();
};

export async function getOutputFromLLMWithParallelComparisonMode(
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
  }: GetOutputRequestParams & { llm: LLM }
) {
  // Comparison mode: run both implementations in parallel
  localLogger.info(
    {
      conversationId: conversation.sId,
      step,
    },
    "Running LLM comparison mode: executing both core and llm implementations in parallel"
  );

  // We need to create a separate content parser for the new implementation
  // to avoid conflicts with the old implementation's parser
  const newContentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration({ agentConfiguration })
  );

  // Helper function to flush tokens for the new parser (we won't publish these events)
  async function flushNewParserTokens(): Promise<void> {
    // Consume tokens but don't publish them
    for await (const _tokenEvent of newContentParser.flushTokens()) {
      // Silently discard
    }
  }

  const [coreResponse, llmResponse] = await Promise.allSettled([
    getOutputFromAction(auth, {
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
    }),
    getOutputFromLLMStream(auth, {
      modelConversationRes,
      conversation,
      userMessage,
      runConfig,
      specifications,
      agentMessageRow,
      step,
      agentConfiguration,
      agentMessage,
      model,
      prompt,
      llm,
      // we don't want to have any side effect from the new implementation in comparison mode, so we pass a noop functions
      updateResourceAndPublishEvent: noopUpdateResourceAndPublishEvent,
      publishAgentError: noopPublishAgentError,
      flushParserTokens: flushNewParserTokens,
      contentParser: newContentParser,
    }),
  ]);

  // Compare the outputs
  const comparisonResult = compareOutputs(coreResponse, llmResponse);

  if (comparisonResult) {
    const { hasCriticalDifferences, ...restOfComparisonResult } =
      comparisonResult;

    const logLevel = hasCriticalDifferences ? "warn" : "info";
    localLogger[logLevel](
      {
        conversationId: conversation.sId,
        step,
        comparison: restOfComparisonResult,
      },
      `LLM comparison: ${comparisonResult.summary}`
    );
  } else {
    localLogger.warn(
      {
        conversationId: conversation.sId,
        step,
        coreResponseIsErr:
          coreResponse.status === "rejected" || coreResponse.value.isErr(),
        llmResponseIsErr:
          llmResponse.status === "rejected" || llmResponse.value.isErr(),
      },
      "LLM comparison mode: could not compare outputs (one or both failed)"
    );
  }

  if (coreResponse.status === "rejected") {
    return Promise.reject(coreResponse.reason);
  }

  return coreResponse.value;
}
