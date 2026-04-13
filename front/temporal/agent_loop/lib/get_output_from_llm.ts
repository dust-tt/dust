import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { parseResponseFormatSchema } from "@app/lib/api/llm/utils";
import { config as regionsConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { heartbeatRunModelAndCreateActionsActivity } from "@app/temporal/agent_loop/lib/heartbeat_details";
import type {
  GetOutputRequestParams,
  GetOutputResponse,
  Output,
} from "@app/temporal/agent_loop/lib/types";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { Err, Ok } from "@app/types/shared/result";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { CancelledFailure, sleep } from "@temporalio/activity";

const LLM_HEARTBEAT_INTERVAL_MS = 10_000;
// Log heartbeat status periodically to track long-waiting LLM calls.
const HEARTBEAT_LOG_INTERVAL = 6; // Every minute (6 * 10s)
// Timeout for waiting on a single LLM event (first or subsequent).
const LLM_EVENT_TIMEOUT_MINUTES = 2;
const LLM_EVENT_TIMEOUT_MS = LLM_EVENT_TIMEOUT_MINUTES * 60 * 1000;
type LLMStreamTimeoutKind = "activity" | "event";

export function resolveStableToolCallName(
  specifications: GetOutputRequestParams["specifications"],
  streamedToolName: string
): string | null {
  const exactMatch = specifications.find(
    (specification) => specification.name === streamedToolName
  );

  return exactMatch?.name ?? null;
}

export function getToolCallStartDeduplicationKeys({
  stableToolName,
  toolCallId,
  toolCallIndex,
}: {
  stableToolName: string;
  toolCallId?: string;
  toolCallIndex?: number;
}): string[] {
  const keys: string[] = [];

  if (toolCallId) {
    keys.push(`id:${toolCallId}`);
  }
  if (toolCallIndex !== undefined) {
    keys.push(`index:${toolCallIndex}`);
  }
  if (keys.length === 0) {
    keys.push(`name:${stableToolName}`);
  }

  return keys;
}

class LLMStreamTimeoutError extends Error {
  constructor(
    public readonly kind: LLMStreamTimeoutKind,
    public readonly elapsedMs: number,
    public readonly context?: { conversationId: string; step: number }
  ) {
    super(
      kind === "activity"
        ? `LLM stream exceeded the activity time budget after ${Math.round(elapsedMs / 1000)}s`
        : `LLM stream timeout after ${Math.round(elapsedMs / 1000)}s waiting for event`
    );
    this.name = "LLMStreamTimeoutError";
  }
}

function makeLLMTimeoutResponse(kind: LLMStreamTimeoutKind): GetOutputResponse {
  return new Err({
    type: "shouldRetryMessage",
    content: {
      type: "llm_timeout_error",
      message:
        kind === "activity"
          ? "The agent step hit its time budget before the model response completed"
          : `LLM stream timeout after ${LLM_EVENT_TIMEOUT_MINUTES} minutes waiting for event`,
      isRetryable: true,
    },
  });
}

// Wraps an async iterator and ensures heartbeat() is called at regular intervals
// even when the source is slow to yield values.
async function* withPeriodicHeartbeat(
  stream: AsyncIterator<LLMEvent>,
  activityTimeoutDeadlineMs: number,
  logContext: {
    workspaceId: string;
    conversationId: string;
    step: number;
    modelId: ModelIdType;
  }
): AsyncGenerator<LLMEvent> {
  let nextPromise = stream.next();
  let streamExhausted = false;
  let heartbeatCount = 0;
  const streamStartTimeMs = Date.now();
  let lastEventTimeMs = Date.now();
  let lastEventType: LLMEvent["type"] | undefined;

  let heartbeatTimer: NodeJS.Timeout | undefined;

  try {
    while (!streamExhausted) {
      const remainingActivityTimeMs = activityTimeoutDeadlineMs - Date.now();

      if (remainingActivityTimeMs <= 0) {
        logger.error(
          {
            ...logContext,
            totalElapsedMs: Date.now() - streamStartTimeMs,
          },
          "[LLM stream] timeout - activity time budget exceeded"
        );
        throw new LLMStreamTimeoutError(
          "activity",
          Date.now() - streamStartTimeMs,
          logContext
        );
      }

      heartbeatTimer = undefined;
      const result = await Promise.race([
        nextPromise
          .then((value) => ({ type: "stream" as const, value }))
          .catch((error) => {
            // Rethrow to ensure errors are not swallowed
            throw error;
          }),
        new Promise<{ type: "heartbeat" }>((resolve) => {
          heartbeatTimer = setTimeout(
            () => resolve({ type: "heartbeat" }),
            Math.min(LLM_HEARTBEAT_INTERVAL_MS, remainingActivityTimeMs)
          );
        }),
      ]);

      // Clear the heartbeat timer if the stream event won the race.
      clearTimeout(heartbeatTimer);

      if (result.type === "heartbeat") {
        heartbeatCount++;
        const now = Date.now();
        const timeSinceLastEventMs = now - lastEventTimeMs;

        heartbeatRunModelAndCreateActionsActivity({
          step: logContext.step,
          phase: "waiting_model_event",
          elapsedMs: now - streamStartTimeMs,
          heartbeatCount,
          lastEventType,
          timeSinceLastEventMs,
        });

        if (now >= activityTimeoutDeadlineMs) {
          logger.error(
            {
              ...logContext,
              heartbeatCount,
              totalElapsedMs: now - streamStartTimeMs,
            },
            "[LLM stream] timeout - activity time budget exceeded"
          );
          throw new LLMStreamTimeoutError(
            "activity",
            now - streamStartTimeMs,
            logContext
          );
        }

        // Check for timeout waiting on event.
        if (timeSinceLastEventMs >= LLM_EVENT_TIMEOUT_MS) {
          logger.error(
            {
              ...logContext,
              heartbeatCount,
              elapsedMs: timeSinceLastEventMs,
              timeoutMinutes: LLM_EVENT_TIMEOUT_MINUTES,
            },
            "[LLM stream] timeout - no event received"
          );
          throw new LLMStreamTimeoutError(
            "event",
            timeSinceLastEventMs,
            logContext
          );
        }

        // Log every minute to track long-waiting LLM calls.
        if (heartbeatCount % HEARTBEAT_LOG_INTERVAL === 0) {
          logger.info(
            {
              ...logContext,
              heartbeatCount,
              elapsedMs: timeSinceLastEventMs,
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

      const now = Date.now();
      lastEventType = streamResult.value.type;
      heartbeatRunModelAndCreateActionsActivity({
        step: logContext.step,
        phase: "processing_model_event",
        elapsedMs: now - streamStartTimeMs,
        lastEventType,
        timeSinceLastEventMs: now - lastEventTimeMs,
      });

      yield streamResult.value;
      nextPromise = stream.next();
      // Reset for next event.
      heartbeatCount = 0;
      lastEventTimeMs = Date.now();
    }
  } finally {
    // Clear any pending heartbeat timer to prevent leaked closures.
    clearTimeout(heartbeatTimer);

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
    step,
    agentConfiguration,
    agentMessage,
    model,
    activityTimeoutDeadlineMs,
    prompt,
    llm,
    updateResourceAndPublishEvent,
  }: GetOutputRequestParams & { llm: LLM }
): Promise<GetOutputResponse> {
  const start = Date.now();
  let timeToFirstEvent: number | undefined = undefined;
  const logContext = {
    workspaceId: conversation.owner.sId,
    conversationId: conversation.sId,
    step,
    modelId: model.modelId,
  };

  if (start >= activityTimeoutDeadlineMs) {
    logger.error(
      logContext,
      "[LLM stream] skipped - activity time budget exhausted"
    );
    return makeLLMTimeoutResponse("activity");
  }

  const events = llm.stream(
    {
      conversation: modelConversationRes.value.modelConversation,
      hasConditionalJITTools,
      prompt,
      specifications,
    },
    {
      conversationId: conversation.sId,
    }
  );

  const contents: Output["contents"] = [];
  const actions: Output["actions"] = [];
  let generation = "";
  let nativeChainOfThought = "";
  const publishedToolCallStartKeys = new Set<string>();

  try {
    for await (const event of withPeriodicHeartbeat(
      events,
      activityTimeoutDeadlineMs,
      logContext
    )) {
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
              agentMessage,
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
            agentMessage,
            conversation,
            step,
          });

          nativeChainOfThought += event.content.delta;
          continue;
        }
        case "tool_call_started": {
          const stableToolName = resolveStableToolCallName(
            specifications,
            event.content.name
          );

          if (!stableToolName) {
            continue;
          }

          const deduplicationKeys = getToolCallStartDeduplicationKeys({
            stableToolName,
            toolCallId: event.content.id,
            toolCallIndex: event.content.index,
          });

          if (
            deduplicationKeys.some((key) => publishedToolCallStartKeys.has(key))
          ) {
            continue;
          }

          await updateResourceAndPublishEvent(auth, {
            event: {
              type: "tool_call_started",
              created: Date.now(),
              configurationId: agentConfiguration.sId,
              messageId: agentMessage.sId,
              ...(event.content.id ? { toolCallId: event.content.id } : {}),
              ...(event.content.index !== undefined
                ? { toolCallIndex: event.content.index }
                : {}),
              toolName: stableToolName,
            },
            agentMessage,
            conversation,
            step,
          });

          for (const key of deduplicationKeys) {
            publishedToolCallStartKeys.add(key);
          }
          continue;
        }
        case "tool_call_delta":
          // tool_call_delta events act as heartbeat signals during tool call
          // streaming, preventing the LLM stream timeout when the model is
          // generating tool call arguments.
          continue;
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
            agentMessage,
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

        // Arguments are already fixed by parseToolArguments in the LLM client
        const stringifiedArgs = JSON.stringify(args);
        contents.push({
          type: "function_call",
          value: {
            id,
            name,
            arguments: stringifiedArgs,
            metadata: thoughtSignature ? { thoughtSignature } : undefined,
          },
        });
      }

      if (event.type === "text_generated") {
        contents.push({
          type: "text_content",
          value: event.content.text,
          metadata: event.metadata,
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
      return makeLLMTimeoutResponse(err.kind);
    }
    throw err;
  }

  await flushParserTokens();

  // Validate structured output against the JSON schema when response format is set.
  const responseFormat = parseResponseFormatSchema(llm.getResponseFormat());
  if (responseFormat && generation) {
    const parsed = safeParseJSON(generation);
    if (parsed.isErr()) {
      logger.warn(
        {
          ...logContext,
          responseFormatName: responseFormat.json_schema.name,
          error: parsed.error.message,
        },
        "Structured output JSON parsing failed: response from LLM may be invalid."
      );
    }
  }

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
