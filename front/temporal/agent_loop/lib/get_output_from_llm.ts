import { CancelledFailure, heartbeat, sleep } from "@temporalio/activity";

import type { LLM } from "@app/lib/api/llm/llm";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type {
  GetOutputRequestParams,
  GetOutputResponse,
  Output,
} from "@app/temporal/agent_loop/lib/types";
import { Err, Ok } from "@app/types/shared/result";

const LLM_HEARTBEAT_INTERVAL_MS = 10_000;
// Log heartbeat status periodically to track long-waiting LLM calls.
const HEARTBEAT_LOG_INTERVAL = 6; // Every minute (6 * 10s)
// Timeout for waiting on a single LLM event (first or subsequent).
const LLM_EVENT_TIMEOUT_MINUTES = 5;
const LLM_EVENT_TIMEOUT_MS = LLM_EVENT_TIMEOUT_MINUTES * 60 * 1000;

class LLMStreamTimeoutError extends Error {
  constructor(
    public readonly elapsedMs: number,
    public readonly context?: { conversationId: string; step: number }
  ) {
    super(
      `LLM stream timeout after ${Math.round(elapsedMs / 1000)}s waiting for event`
    );
    this.name = "LLMStreamTimeoutError";
  }
}

// Wraps an async iterator and ensures heartbeat() is called at regular intervals
// even when the source is slow to yield values.
async function* withPeriodicHeartbeat<T>(
  stream: AsyncIterator<T>,
  logContext?: { conversationId: string; step: number }
): AsyncGenerator<T> {
  let nextPromise = stream.next();
  let streamExhausted = false;
  let heartbeatCount = 0;
  let lastEventTimeMs = Date.now();

  try {
    while (!streamExhausted) {
      const result = await Promise.race([
        nextPromise
          .then((value) => ({ type: "stream" as const, value }))
          .catch((error) => {
            // Rethrow to ensure errors are not swallowed
            throw error;
          }),
        new Promise<{ type: "heartbeat" }>((resolve) =>
          setTimeout(
            () => resolve({ type: "heartbeat" }),
            LLM_HEARTBEAT_INTERVAL_MS
          )
        ),
      ]);

      heartbeat();

      if (result.type === "heartbeat") {
        heartbeatCount++;
        const elapsedMs = Date.now() - lastEventTimeMs;

        // Check for timeout waiting on event.
        if (elapsedMs >= LLM_EVENT_TIMEOUT_MS) {
          logger.error(
            {
              ...logContext,
              heartbeatCount,
              elapsedMs,
              timeoutMinutes: LLM_EVENT_TIMEOUT_MINUTES,
            },
            "[LLM stream] timeout - no event received"
          );
          throw new LLMStreamTimeoutError(elapsedMs, logContext);
        }

        // Log every minute to track long-waiting LLM calls.
        if (heartbeatCount % HEARTBEAT_LOG_INTERVAL === 0) {
          logger.info(
            {
              ...logContext,
              heartbeatCount,
              elapsedMs,
            },
            "[LLM stream] heartbeat - still waiting for event"
          );
        }
        // Heartbeat won the race, but nextPromise is still pending
        // Continue racing with the same nextPromise
        continue;
      }

      // Stream value arrived
      const streamResult = result.value;

      if (streamResult.done) {
        streamExhausted = true;
        break;
      }

      yield streamResult.value;
      nextPromise = stream.next();
      // Reset for next event.
      heartbeatCount = 0;
      lastEventTimeMs = Date.now();
    }
  } finally {
    // Ensure the underlying stream is closed on early exit (timeout, error, or break).
    // This aborts the HTTP connection to the LLM provider.
    // Wrapped in try/catch to avoid masking the original error if cleanup fails.
    try {
      await stream.return?.();
    } catch (cleanupError) {
      logger.warn(
        { err: cleanupError, ...logContext },
        "[LLM stream] cleanup error"
      );
    }
  }
}

export async function getOutputFromLLMStream(
  auth: Authenticator,
  {
    modelConversationRes,
    conversation,
    hasConditionalJITTools,
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
    updateResourceAndPublishEvent,
  }: GetOutputRequestParams & { llm: LLM }
): Promise<GetOutputResponse> {
  const start = Date.now();
  let timeToFirstEvent: number | undefined = undefined;
  const events = llm.stream({
    conversation: modelConversationRes.value.modelConversation,
    hasConditionalJITTools,
    prompt,
    specifications,
  });

  const contents: Output["contents"] = [];
  const actions: Output["actions"] = [];
  let generation = "";
  let nativeChainOfThought = "";

  const logContext = { conversationId: conversation.sId, step };

  try {
    for await (const event of withPeriodicHeartbeat(events, logContext)) {
      timeToFirstEvent = Date.now() - start;
      if (event.type === "error") {
        await flushParserTokens();
        return new Err({
          type: "shouldRetryMessage",
          content: event.content,
        });
      }

      // Sleep allows the activity to be cancelled, e.g. on a "Stop agent" request.
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
              region: region,
            },
          });

          nativeChainOfThought += "\n\n";
          continue;
        }
        default:
          break;
      }

      if (event.type === "tool_call") {
        const {
          content: { name, id, arguments: args },
          metadata: { thoughtSignature },
        } = event;
        actions.push({
          name,
          functionCallId: id,
        });
        contents.push({
          type: "function_call",
          value: {
            id,
            name,
            arguments: JSON.stringify(args),
            metadata: thoughtSignature ? { thoughtSignature } : undefined,
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
  } catch (err) {
    if (err instanceof LLMStreamTimeoutError) {
      await flushParserTokens();
      return new Err({
        type: "shouldRetryMessage",
        content: {
          type: "llm_timeout_error",
          message: `LLM stream timeout after ${LLM_EVENT_TIMEOUT_MINUTES} minutes waiting for event`,
          isRetryable: true,
        },
      });
    }
    throw err;
  }

  await flushParserTokens();

  if (contents.length === 0 && actions.length === 0) {
    return new Err({
      type: "shouldRetryMessage",
      content: {
        type: "unknown_error",
        message: "Agent execution didn't complete.",
        isRetryable: true,
      },
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
    timeToFirstEvent,
  });
}
