import type { Logger } from "pino";

import {
  AgentMessageContentParser,
  getDelimitersConfiguration,
} from "@app/lib/api/assistant/agent_message_content_parser";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { LLM } from "@app/lib/api/llm/llm";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import { statsDClient } from "@app/logger/statsDClient";
import { compareOutputs } from "@app/temporal/agent_loop/lib/compare_outputs";
import { getOutputFromAction } from "@app/temporal/agent_loop/lib/get_output_from_action";
import { getOutputFromLLMStream } from "@app/temporal/agent_loop/lib/get_output_from_llm";
import type {
  GetOutputRequestParams,
  GetOutputResponse,
} from "@app/temporal/agent_loop/lib/types";
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

  // We need to create a separate content parser for the llm implementation
  // to avoid conflicts with the core implementation's parser
  const llmContentParser = new AgentMessageContentParser(
    agentConfiguration,
    agentMessage.sId,
    getDelimitersConfiguration({ agentConfiguration })
  );

  // Measure timing for core implementation
  const coreStartTime = performance.now();
  let coreTimeToFirstEvent: number | null = null;
  let coreFirstEventCaptured = false;

  // Wrap the flush function for the core parser to capture time to the first event
  async function flushCoreParserTokensWithTiming(): Promise<void> {
    // First, check if there are any tokens to flush
    const tokens = [];
    for await (const tokenEvent of contentParser.flushTokens()) {
      tokens.push(tokenEvent);
      if (!coreFirstEventCaptured) {
        coreTimeToFirstEvent = performance.now() - coreStartTime;
        coreFirstEventCaptured = true;
      }

      await updateResourceAndPublishEvent(auth, {
        event: tokenEvent,
        agentMessageRow,
        conversation,
        step,
      });
    }
  }

  const corePromise = getOutputFromAction(auth, {
    modelConversationRes,
    conversation,
    userMessage,
    runConfig,
    specifications,
    flushParserTokens: flushCoreParserTokensWithTiming,
    contentParser,
    agentMessageRow,
    step,
    agentConfiguration,
    agentMessage,
    model,
    publishAgentError,
    prompt,
    updateResourceAndPublishEvent,
  }).then((response) => {
    const coreDuration = performance.now() - coreStartTime;
    return {
      response,
      duration: coreDuration,
      timeToFirstEvent: coreTimeToFirstEvent,
    };
  });

  // Measure timing for new implementation
  const llmStartTime = performance.now();
  let llmTimeToFirstEvent: number | null = null;
  let llmFirstEventCaptured = false;

  // Wrap the flush function to capture time to the first event
  async function flushLlmParserTokensWithTiming(): Promise<void> {
    for await (const _tokenEvent of llmContentParser.flushTokens()) {
      if (!llmFirstEventCaptured) {
        llmTimeToFirstEvent = performance.now() - llmStartTime;
        llmFirstEventCaptured = true;
      }
      // Silently discard
    }
  }

  const llmPromise = getOutputFromLLMStream(auth, {
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
    flushParserTokens: flushLlmParserTokensWithTiming,
    contentParser: llmContentParser,
  }).then((response) => {
    const llmDuration = performance.now() - llmStartTime;
    return {
      response,
      duration: llmDuration,
      timeToFirstEvent: llmTimeToFirstEvent,
    };
  });

  const [coreResponse, llmResponse] = await Promise.allSettled([
    corePromise,
    llmPromise,
  ]);
  recordTimeMetrics({
    coreResponse,
    llmResponse,
    modelId: model.modelId,
    step,
    workspaceId: conversation.owner.sId,
  });

  // Compare the outputs
  const comparisonResult = compareOutputs(coreResponse, llmResponse);

  if (comparisonResult) {
    const logLevel = comparisonResult.hasCriticalDifferences ? "warn" : "info";
    localLogger[logLevel](
      {
        conversationId: conversation.sId,
        step,
        comparison: {
          summary: comparisonResult.summary,
          sameActionsCount: comparisonResult.sameActionsCount,
          sameActionNames: comparisonResult.sameActionNames,
          sameContentStructure: comparisonResult.sameContentStructure,
          outputTypeMismatch: comparisonResult.outputTypeMismatch,
          generationLengthDifferencePercent:
            comparisonResult.generationLengthDifferencePercent,
          hasCriticalDifferences: comparisonResult.hasCriticalDifferences,
        },
      },
      `LLM comparison: ${comparisonResult.summary}`
    );
  } else {
    localLogger.warn(
      {
        conversationId: conversation.sId,
        step,
        coreResponseIsErr:
          coreResponse.status === "rejected" ||
          coreResponse.value.response.isErr(),
        llmResponseIsErr:
          llmResponse.status === "rejected" ||
          llmResponse.value.response.isErr(),
      },
      "LLM comparison mode: could not compare outputs (one or both failed)"
    );
  }

  if (coreResponse.status === "rejected") {
    return Promise.reject(coreResponse.reason);
  }

  return coreResponse.value;
}

function recordTimeMetrics({
  coreResponse,
  llmResponse,
  modelId,
  step,
  workspaceId,
}: {
  coreResponse: PromiseSettledResult<{
    response: GetOutputResponse;
    duration: number;
    timeToFirstEvent: number | null;
  }>;
  llmResponse: PromiseSettledResult<{
    response: GetOutputResponse;
    duration: number;
    timeToFirstEvent: number | null;
  }>;
  modelId: string;
  step: number;
  workspaceId: string;
}) {
  if (coreResponse.status === "rejected" || llmResponse.status === "rejected") {
    return;
  }
  if (
    coreResponse.value.response.isErr() ||
    llmResponse.value.response.isErr()
  ) {
    return;
  }

  const coreDurationMs = coreResponse.value.duration;
  const llmDurationMs = llmResponse.value.duration;
  const coreTimeToFirstEventMs = coreResponse.value.timeToFirstEvent;
  const llmTimeToFirstEventMs = llmResponse.value.timeToFirstEvent;

  // Send timing metrics to DataDog
  const tags = [`model:${modelId}`, `step:${step}`, `workspace:${workspaceId}`];

  // Total duration metrics
  statsDClient.timing(
    "llm_comparison.core_implementation.duration_ms",
    coreDurationMs,
    tags
  );

  statsDClient.timing(
    "llm_comparison.llm_implementation.duration_ms",
    llmDurationMs,
    tags
  );

  // Time to first event metrics
  if (coreTimeToFirstEventMs !== null) {
    statsDClient.timing(
      "llm_comparison.core_implementation.time_to_first_event_ms",
      coreTimeToFirstEventMs,
      tags
    );
  }

  if (llmTimeToFirstEventMs !== null) {
    statsDClient.timing(
      "llm_comparison.llm_implementation.time_to_first_event_ms",
      llmTimeToFirstEventMs,
      tags
    );
  }
}
