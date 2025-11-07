import { CancelledFailure, heartbeat, sleep } from "@temporalio/activity";

import type { LLM } from "@app/lib/api/llm/llm";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import type {
  GetOutputRequestParams,
  GetOutputResponse,
  Output,
} from "@app/temporal/agent_loop/lib/types";
import { Err, Ok, safeParseJSON } from "@app/types";

export async function getOutputFromLLMStream(
  auth: Authenticator,
  {
    modelConversationRes,
    conversation,
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
  }: GetOutputRequestParams & { llm: LLM }
): Promise<GetOutputResponse> {
  const events = llm.stream({
    conversation: modelConversationRes.value.modelConversation,
    prompt,
    specifications,
  });

  const contents: Output["contents"] = [];
  const actions: Output["actions"] = [];
  let generation = "";
  let nativeChainOfThought = "";

  for await (const event of events) {
    if (event.type === "error") {
      await flushParserTokens();
      return new Err({
        type: "shouldRetryMessage",
        message: event.content.message,
      });
    }

    // Heartbeat & sleep allow the activity to be cancelled, e.g. on a "Stop
    // agent" request. Upon experimentation, both are needed to ensure the
    // activity receives the cancellation signal. The delay until which is the
    // signal is received is governed by heartbeat
    // [throttling](https://docs.temporal.io/encyclopedia/detecting-activity-failures#throttling).
    heartbeat();
    try {
      await sleep(1);
    } catch (err) {
      if (err instanceof CancelledFailure) {
        logger.info("Activity cancelled, stopping");
        return new Err({ type: "shouldReturnNull" });
      }
      throw err;
    }

    switch (event.type) {
      case "text_delta": {
        for await (const tokenEvent of contentParser.emitTokens(
          event.content.delta
        )) {
          await updateResourceAndPublishEvent(auth, {
            event: tokenEvent,
            agentMessageRow,
            conversation,
            step,
          });
        }
        continue;
      }
      case "reasoning_delta": {
        await updateResourceAndPublishEvent(auth, {
          event: {
            type: "generation_tokens",
            classification: "chain_of_thought",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            text: event.content.delta,
          },
          agentMessageRow,
          conversation,
          step,
        });

        nativeChainOfThought += event.content.delta;
        continue;
      }
      case "reasoning_generated": {
        await updateResourceAndPublishEvent(auth, {
          event: {
            type: "generation_tokens",
            classification: "chain_of_thought",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            text: "\n\n",
          },
          agentMessageRow,
          conversation,
          step,
        });

        const currentRegion = regionsConfig.getCurrentRegion();
        let region: "us" | "eu";
        switch (currentRegion) {
          case "europe-west1":
            region = "eu";
            break;
          case "us-central1":
            region = "us";
            break;
          default:
            throw new Error(`Unexpected region: ${currentRegion}`);
        }

        // Add reasoning content to contents array
        contents.push({
          type: "reasoning",
          value: {
            reasoning: event.content.text,
            metadata: JSON.stringify(event.metadata),
            tokens: 0, // Will be updated later from token_usage event
            provider: model.providerId,
            region: null,
          },
        });

        nativeChainOfThought += "\n\n";
        continue;
      }
      default:
        break;
    }

    if (event.type === "tool_call") {
      const argsRes = safeParseJSON(event.content.arguments);

      if (argsRes.isErr()) {
        await publishAgentError({
          code: "tool_call_error",
          message: `Error parsing tool call arguments: ${argsRes.error.message}`,
          metadata: null,
        });
        return new Err({ type: "shouldReturnNull" });
      }

      actions.push({
        name: event.content.name,
        functionCallId: event.content.id,
      });
      contents.push({
        type: "function_call",
        value: {
          id: event.content.id,
          name: event.content.name,
          arguments: event.content.arguments,
        },
      });
    }

    if (event.type === "text_generated") {
      contents.push({
        type: "text_content",
        value: event.content.text,
      });
      generation += event.content.text;
    }

    if (event.type === "token_usage") {
      // Update reasoning token count on the last reasoning item
      const reasoningTokens = event.content.reasoningTokens ?? 0;
      if (reasoningTokens > 0) {
        for (let i = contents.length - 1; i >= 0; i--) {
          const content = contents[i];
          if (content.type === "reasoning") {
            content.value.tokens = reasoningTokens;
            break;
          }
        }
      }
    }
  }

  await flushParserTokens();

  if (contents.length === 0 && actions.length === 0) {
    return new Err({
      type: "shouldRetryMessage",
      message: "Agent execution didn't complete.",
    });
  }

  return new Ok({
    output: {
      actions,
      generation,
      contents,
    },
    nativeChainOfThought,
    dustRunId: llm.getTraceId(),
  });
}
