import { startObservation } from "@langfuse/tracing";
import { randomUUID } from "crypto";

import type { LLMTraceId } from "@app/lib/api/llm/traces/buffer";
import {
  createLLMTraceId,
  LLMTraceBuffer,
} from "@app/lib/api/llm/traces/buffer";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES, removeNulls } from "@app/types";

export abstract class LLM {
  protected modelId: ModelIdType;
  protected modelConfig: (typeof SUPPORTED_MODEL_CONFIGS)[number];
  protected temperature: number | null;
  protected reasoningEffort: ReasoningEffort | null;
  protected responseFormat: string | null;
  protected bypassFeatureFlag: boolean;
  protected metadata: LLMClientMetadata;

  // Tracing fields.
  protected readonly authenticator: Authenticator;
  protected readonly context?: LLMTraceContext;
  protected readonly traceId: LLMTraceId;

  protected constructor(
    auth: Authenticator,
    {
      bypassFeatureFlag = false,
      context,
      clientId,
      modelId,
      reasoningEffort = "none",
      responseFormat = null,
      temperature = AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced,
    }: LLMParameters & { clientId: ModelProviderIdType }
  ) {
    this.modelId = modelId;
    this.modelConfig = getSupportedModelConfig({
      modelId: this.modelId,
      providerId: clientId,
    });
    this.temperature = temperature;
    this.reasoningEffort = reasoningEffort;
    this.responseFormat = responseFormat;
    this.bypassFeatureFlag = bypassFeatureFlag;
    this.metadata = { clientId, modelId };

    // Initialize tracing.
    this.authenticator = auth;
    this.context = context;
    this.traceId = createLLMTraceId(randomUUID());
  }

  /**
   * Private method that wraps the abstract internalStream() with tracing functionality
   */
  private async *streamWithTracing({
    conversation,
    prompt,
    specifications,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent> {
    if (!this.context) {
      yield* this.internalStream({ conversation, prompt, specifications });
      return;
    }

    const workspaceId = this.authenticator.getNonNullableWorkspace().sId;
    const buffer = new LLMTraceBuffer(this.traceId, workspaceId, this.context);

    const generation = startObservation(
      "llm-completion",
      {
        input: [{ role: "system", content: prompt }, ...conversation.messages],
        model: this.modelId,
        modelParameters: {
          reasoningEffort: this.reasoningEffort ?? "",
          responseFormat: this.responseFormat ?? "",
          temperature: this.temperature ?? "",
        },
        metadata: {
          tools: specifications.map((spec) => spec.name),
        },
      },
      { asType: "generation" }
    );

    generation.updateTrace({
      tags: removeNulls([
        this.authenticator.user()?.sId
          ? `actualUserId:${this.authenticator.user()?.sId}`
          : null,
        this.authenticator.key()
          ? `apiKeyId:${this.authenticator.key()?.id}`
          : null,
        `authMethod:${this.authenticator.authMethod() ?? "unknown"}`,
        `operationType:${this.context.operationType}`,
      ]),
      metadata: {
        dustTraceId: this.traceId,
      },
      // In observability, userId maps to workspaceId for consistent grouping.
      userId: this.authenticator.getNonNullableWorkspace().sId,
    });

    const startTime = Date.now();

    buffer.setInput({
      conversation,
      modelId: this.modelId,
      prompt,
      reasoningEffort: this.reasoningEffort,
      responseFormat: this.responseFormat,
      specifications,
      temperature: this.temperature,
    });

    // TODO(LLM-Router 13/11/2025): Temporary logs, TBRemoved
    let currentEvent: LLMEvent | null = null;
    try {
      for await (const event of this.internalStream({
        conversation,
        prompt,
        specifications,
      })) {
        currentEvent = event;
        buffer.addEvent(event);

        if (event.type === "interaction_id") {
          buffer.setModelInteractionId(event.content.modelInteractionId);
          generation.updateTrace({
            metadata: {
              modelInteractionId: event.content.modelInteractionId,
            },
          });
        }

        yield event;
      }

      if (currentEvent?.type !== "success" && currentEvent?.type !== "error") {
        currentEvent = new EventError(
          {
            type: "stream_error",
            message: `LLM did not complete successfully for ${this.metadata.clientId}/${this.metadata.modelId}.`,
            isRetryable: true,
            originalError: { lastEventType: currentEvent?.type },
          },
          this.metadata
        );
        buffer.addEvent(currentEvent);
        yield currentEvent;
      }
    } finally {
      if (currentEvent?.type === "error") {
        generation.updateTrace({
          tags: ["isError:true", `errorType:${currentEvent.content.type}`],
        });

        logger.error(
          {
            llmEventType: "error",
            errorContent: currentEvent.content,
            modelId: this.modelId,
            context: this.context,
            traceId: this.traceId,
          },
          "LLM Error"
        );
      } else if (currentEvent?.type === "success") {
        logger.info(
          {
            llmEventType: "success",
            modelId: this.modelId,
            context: this.context,
            traceId: this.traceId,
          },
          "LLM Success"
        );
      }

      const durationMs = Date.now() - startTime;
      buffer.writeToGCS({ durationMs, startTime }).catch(() => {});

      const { tokenUsage, ...rest } = buffer.currentOutput;

      generation.update({
        output: { ...rest },
      });

      if (tokenUsage) {
        generation.update({
          usageDetails: {
            input: tokenUsage.inputTokens,
            output: tokenUsage.outputTokens,
            total: tokenUsage.totalTokens,
            cache_read_input_tokens: tokenUsage.cachedTokens ?? 0,
            cache_creation_input_tokens: tokenUsage.cacheCreationTokens ?? 0,
            reasoning_tokens: tokenUsage.reasoningTokens ?? 0,
          },
        });
      }

      if (buffer.error) {
        generation.update({
          level: "ERROR",
          statusMessage: buffer.error.message,
          metadata: {
            errorType: buffer.error.type,
            errorMessage: buffer.error.message,
          },
        });
      }

      generation.end();

      const run = await RunResource.makeNew({
        appId: null,
        dustRunId: this.traceId,
        runType: "deploy",
        // Assumption made that this class exclusively uses Dust credentials.
        useWorkspaceCredentials: false,
        workspaceId: this.authenticator.getNonNullableWorkspace().id,
      });

      // Run usage is only populated if the run is successful.
      if (buffer.runTokenUsage) {
        await run.recordTokenUsage(buffer.runTokenUsage, this.modelId);
      }
    }
  }

  /**
   * Get the traceId for this LLM instance (includes llm_trace_ prefix)
   */
  getTraceId(): LLMTraceId {
    return this.traceId;
  }

  async *stream({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent> {
    yield* this.streamWithTracing({
      conversation,
      prompt,
      specifications,
      forceToolCall,
    });
  }

  protected abstract internalStream({
    conversation,
    prompt,
    specifications,
    forceToolCall,
  }: LLMStreamParameters): AsyncGenerator<LLMEvent>;
}
