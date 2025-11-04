import { randomUUID } from "crypto";

import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import { LLMTraceBuffer } from "@app/lib/api/llm/traces/buffer";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
  StreamParameters,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { ModelIdType, ReasoningEffort } from "@app/types";

export abstract class LLM {
  protected modelId: ModelIdType;
  protected temperature: number;
  protected reasoningEffort: ReasoningEffort;
  protected bypassFeatureFlag: boolean;
  protected metadata: LLMClientMetadata;

  // Tracing fields.
  protected readonly authenticator: Authenticator;
  protected readonly context?: LLMTraceContext;
  protected readonly runId: string;

  protected constructor(
    auth: Authenticator,
    {
      bypassFeatureFlag = false,
      context,
      clientId,
      modelId,
      reasoningEffort = "none",
      temperature = AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced,
    }: LLMParameters & { clientId: string }
  ) {
    this.modelId = modelId;
    this.temperature = temperature;
    this.reasoningEffort = reasoningEffort;
    this.bypassFeatureFlag = bypassFeatureFlag;
    this.metadata = { clientId, modelId };

    // Initialize tracing.
    this.authenticator = auth;
    this.context = context;
    this.runId = `llm_${randomUUID()}`;
  }

  /**
   * Private method that wraps the abstract internalStream() with tracing functionality
   */
  private async *streamWithTracing({
    conversation,
    prompt,
    specifications,
  }: StreamParameters): AsyncGenerator<LLMEvent> {
    if (!this.context) {
      yield* this.internalStream({ conversation, prompt, specifications });
      return;
    }

    const workspaceId = this.authenticator.getNonNullableWorkspace().sId;
    const buffer = new LLMTraceBuffer(this.runId, workspaceId, this.context);

    const startTime = Date.now();

    buffer.setInput({
      conversation,
      modelId: this.modelId,
      prompt,
      reasoningEffort: this.reasoningEffort,
      specifications,
      temperature: this.temperature,
    });

    try {
      for await (const event of this.internalStream({
        conversation,
        prompt,
        specifications,
      })) {
        buffer.addEvent(event);
        yield event;
      }
    } finally {
      const durationMs = Date.now() - startTime;
      buffer.writeToGCS({ durationMs, startTime }).catch(() => {});
    }
  }

  /**
   * Get the runId for this LLM instance
   */
  getRunId(): string {
    return this.runId;
  }

  async *stream(
    args: StreamParameters,
    retryOptions?: { retries?: number; delayBetweenRetriesMs?: number }
  ): AsyncGenerator<LLMEvent> {
    const retries = retryOptions?.retries ?? 3;
    const delayBetweenRetriesMs = retryOptions?.delayBetweenRetriesMs ?? 1000;

    const accumulatedErrors: EventError[] = [];
    for (let i = 0; i < retries; i++) {
      for await (const event of this.streamWithTracing(args)) {
        const isError = event.type === "error";
        const isRetryableError = isError && event.content.isRetryable;

        if (!isRetryableError) {
          yield event;
          return;
        }

        if (!isError) {
          yield event;
          continue;
        }

        accumulatedErrors.push(event);

        const sleepTime = delayBetweenRetriesMs * (i + 1) ** 2;
        logger.warn(
          {
            error: event.content.originalError,
            attempt: i + 1,
            retries,
            sleepTime,
          },
          "Error while calling LLM. Retrying..."
        );
        await new Promise((resolve) => setTimeout(resolve, sleepTime));
      }

      if (accumulatedErrors.length === 0) {
        return;
      }
    }

    yield new EventError(
      {
        type: "maximum_retries",
        isRetryable: false,
        message: "Maximum retries reached",
      },
      this.metadata,
      accumulatedErrors
    );
  }

  protected abstract internalStream({
    conversation,
    prompt,
    specifications,
  }: StreamParameters): AsyncGenerator<LLMEvent>;
}
