import config from "@app/lib/api/config";
import type { LLMTraceId } from "@app/lib/api/llm/traces/buffer";
import {
  createLLMTraceId,
  LLMTraceBuffer,
} from "@app/lib/api/llm/traces/buffer";
import type {
  LLMTraceContext,
  LLMTraceCustomization,
} from "@app/lib/api/llm/traces/types";
import type { BatchResult, BatchStatus } from "@app/lib/api/llm/types/batch";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { RunResource } from "@app/lib/resources/run_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";

import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/types/assistant/creativity";
import type {
  ModelConfigurationType,
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { type LangfuseGeneration, startObservation } from "@langfuse/tracing";
import { randomUUID } from "crypto";
import pickBy from "lodash/pickBy";
import startCase from "lodash/startCase";

export abstract class LLM<TPayload = unknown> {
  protected modelId: ModelIdType;
  protected modelConfig: ModelConfigurationType;
  protected temperature: number | null;
  protected reasoningEffort: ReasoningEffort | null;
  protected responseFormat: string | null;
  protected bypassFeatureFlag: boolean;
  protected metadata: LLMClientMetadata;

  // Tracing fields.
  protected readonly authenticator: Authenticator;
  protected readonly context?: LLMTraceContext;
  protected readonly traceId: LLMTraceId;
  protected readonly getTraceOutput?: LLMTraceCustomization["getTraceOutput"];
  protected generation: LangfuseGeneration | null = null;

  protected constructor(
    auth: Authenticator,
    providerId: ModelProviderIdType,
    {
      bypassFeatureFlag = false,
      context,
      getTraceOutput,
      modelId,
      reasoningEffort = "none",
      responseFormat = null,
      temperature = AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced,
    }: LLMParameters
  ) {
    this.modelId = modelId;
    const modelConfig = getSupportedModelConfig({
      modelId: this.modelId,
      providerId,
    });
    if (!modelConfig) {
      throw new Error(`Model config not found for ${modelId}/${providerId}`);
    }
    this.modelConfig = modelConfig;
    this.temperature = temperature;
    this.reasoningEffort = reasoningEffort;
    this.responseFormat = responseFormat;
    this.bypassFeatureFlag = bypassFeatureFlag;
    this.metadata = {
      clientId: providerId,
      modelId: this.modelId,
    };

    // Initialize tracing.
    this.authenticator = auth;
    this.context = context;
    this.traceId = createLLMTraceId(randomUUID());
    this.getTraceOutput = getTraceOutput;
  }

  private async *completeStream(
    streamParameters: LLMStreamParameters
  ): AsyncGenerator<LLMEvent> {
    let currentEvent: LLMEvent | null = null;
    for await (const event of this.internalStream(streamParameters)) {
      currentEvent = event;
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
      yield currentEvent;
    }
  }

  /**
   * Private method that wraps the abstract internalStream() with tracing functionality
   */
  private async *streamWithTracing(
    streamParameters: LLMStreamParameters
  ): AsyncGenerator<LLMEvent> {
    if (!this.context) {
      yield* this.completeStream(streamParameters);
      return;
    }
    const { conversation, prompt, specifications } = streamParameters;

    const workspaceId = this.authenticator.getNonNullableWorkspace().sId;
    const buffer = new LLMTraceBuffer(
      this.traceId,
      workspaceId,
      this.context,
      this.modelId
    );

    this.generation = startObservation(
      "llm-completion",
      {
        input: undefined,
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

    this.generation.updateTrace({
      name: startCase(this.context.operationType),
      metadata: {
        dustTraceId: this.traceId,
        // All contextual data as key-value pairs for better filtering in Langfuse UI.
        ...(this.authenticator.user()?.sId && {
          actualUserId: this.authenticator.user()!.sId,
        }),
        ...(this.authenticator.key() && {
          apiKeyId: this.authenticator.key()!.id,
        }),
        authMethod: this.authenticator.authMethod() ?? "unknown",
        // Include all context fields (except userId and workspaceId).
        ...pickBy(
          this.context,
          (value, key) =>
            value !== undefined && !["userId", "workspaceId"].includes(key)
        ),
      },
      // In observability, userId maps to workspaceId for consistent grouping.
      userId: this.authenticator.getNonNullableWorkspace().sId,
    });

    const startTime = Date.now();

    // Only store the full input in the GCS trace buffer when Langfuse is not available.
    // When Langfuse is enabled, input is already captured via the generation span,
    // avoiding a redundant copy of the conversation in memory.
    if (!config.isLangfuseEnabled()) {
      buffer.setInput({
        conversation,
        modelId: this.modelId,
        prompt,
        reasoningEffort: this.reasoningEffort,
        responseFormat: this.responseFormat,
        specifications,
        temperature: this.temperature,
      });
    }

    // Track LLM interaction metric
    const metricTags = [
      `model_id:${this.modelId}`,
      `client_id:${this.metadata.clientId}`,
      `operation_type:${this.context.operationType}`,
    ];

    getStatsDClient().increment("llm_interaction.count", 1, metricTags);

    let currentEvent: LLMEvent | null = null;
    let timeToFirstEventMs: number | undefined = undefined;

    try {
      for await (const event of this.completeStream(streamParameters)) {
        if (currentEvent === null) {
          timeToFirstEventMs = Date.now() - startTime;
        }
        currentEvent = event;
        buffer.addEvent(currentEvent);

        if (currentEvent.type === "interaction_id") {
          buffer.setModelInteractionId(currentEvent.content.modelInteractionId);
          this.generation.updateTrace({
            metadata: {
              modelInteractionId: currentEvent.content.modelInteractionId,
            },
          });
        }

        if (currentEvent.type !== "success" && currentEvent.type !== "error") {
          yield currentEvent;
          continue;
        }

        // Logging before it gets stopped and retried downstream
        if (currentEvent.type === "error") {
          // Temporary: track LLM error metric
          getStatsDClient().increment("llm_error.count", 1, metricTags);
          this.generation.updateTrace({
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
        }

        if (currentEvent.type === "success") {
          // Temporary: track LLM success metric
          getStatsDClient().increment("llm_success.count", 1, metricTags);

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

        buffer
          .writeToGCS({ durationMs, startTime, timeToFirstEventMs })
          .catch(() => {});

        const { tokenUsage, ...rest } = buffer.currentOutput;

        this.generation.update({
          output: { ...rest },
        });

        // Use custom trace output transformer if provided, otherwise use the full output.
        if (this.getTraceOutput) {
          const traceOutput = this.getTraceOutput(rest);
          if (traceOutput) {
            this.generation.updateTrace({ output: traceOutput });
          }
        } else {
          this.generation.updateTrace({ output: { ...rest } });
        }

        if (tokenUsage) {
          this.generation.update({
            usageDetails: {
              // Report the uncached input tokens if provider supports it.
              input: tokenUsage.uncachedInputTokens ?? tokenUsage.inputTokens,
              output: tokenUsage.outputTokens,
              total: tokenUsage.totalTokens,
              cache_read_input_tokens: tokenUsage.cachedTokens ?? 0,
              cache_creation_input_tokens: tokenUsage.cacheCreationTokens ?? 0,
              reasoning_tokens: tokenUsage.reasoningTokens ?? 0,
            },
          });
        }

        if (buffer.error) {
          this.generation.update({
            level: "ERROR",
            statusMessage: buffer.error.message,
            metadata: {
              errorType: buffer.error.type,
              errorMessage: buffer.error.message,
            },
          });
        }

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
          await run.recordTokenUsage(
            this.authenticator,
            buffer.runTokenUsage,
            this.modelId
          );
        }

        yield currentEvent;

        break;
      }
    } finally {
      this.generation.end();
    }
  }

  /**
   * Get the traceId for this LLM instance (includes llm_trace_ prefix)
   */
  getTraceId(): LLMTraceId {
    return this.traceId;
  }

  getResponseFormat(): string | null {
    return this.responseFormat;
  }

  /**
   * Get the metadata for this LLM instance
   */
  getMetadata(): LLMClientMetadata {
    return this.metadata;
  }

  getModelConfig(): ModelConfigurationType {
    return this.modelConfig;
  }

  async *stream(
    streamParameters: LLMStreamParameters
  ): AsyncGenerator<LLMEvent> {
    yield* this.streamWithTracing(streamParameters);
  }

  /**
   * Submit a batch of conversations for asynchronous processing.
   * Returns a string that can be used to poll status and retrieve results.
   * Each entry in the map is keyed by a conversation identifier (custom_id).
   * Inputs are automatically traced when a tracing context is set.
   */
  async sendBatchProcessing(
    conversations: Map<string, LLMStreamParameters>
  ): Promise<string> {
    const batchId = await this.internalSendBatchProcessing(conversations);
    if (this.context) {
      this.traceBatchInputs(conversations);
    }
    return batchId;
  }

  /**
   * Override this method to implement provider-specific batch submission.
   */
  protected async internalSendBatchProcessing(
    _conversations: Map<string, LLMStreamParameters>
  ): Promise<string> {
    throw new Error(
      `Batch processing is not supported for ${this.metadata.clientId}/${this.metadata.modelId}`
    );
  }

  /**
   * Traces batch inputs by creating one Langfuse generation per conversation entry.
   */
  private traceBatchInputs(
    conversations: Map<string, LLMStreamParameters>
  ): void {
    const workspaceId = this.authenticator.getNonNullableWorkspace().sId;

    for (const [customId, params] of conversations) {
      const payload = this.buildStreamRequestPayload(params);

      const generation = startObservation(
        "llm-batch-input",
        {
          input: payload,
          model: this.modelId,
          modelParameters: {
            reasoningEffort: this.reasoningEffort ?? "",
            responseFormat: this.responseFormat ?? "",
            temperature: this.temperature ?? "",
          },
          metadata: {
            batchCustomId: customId,
          },
        },
        { asType: "generation" }
      );

      generation.updateTrace({
        metadata: {
          batchCustomId: customId,
          ...(this.authenticator.user()?.sId && {
            actualUserId: this.authenticator.user()!.sId,
          }),
          authMethod: this.authenticator.authMethod() ?? "unknown",
          ...pickBy(
            this.context!,
            (value, key) =>
              value !== undefined && !["userId", "workspaceId"].includes(key)
          ),
        },
        userId: workspaceId,
      });

      generation.end();
    }
  }

  /**
   * Poll the status of a previously submitted batch.
   */
  async getBatchStatus(_batchId: string): Promise<BatchStatus> {
    throw new Error(
      `Batch processing is not supported for ${this.metadata.clientId}/${this.metadata.modelId}`
    );
  }

  /**
   * Retrieve the results of a completed batch.
   * Only call this when getBatchStatus returns "ready".
   * Results are automatically traced when a tracing context is set.
   */
  async getBatchResult(batchId: string): Promise<BatchResult> {
    const results = await this.internalGetBatchResult(batchId);
    if (!this.context) {
      return results;
    }
    return this.traceBatchResults(results);
  }

  /**
   * Override this method to implement provider-specific batch result retrieval.
   */
  protected async internalGetBatchResult(
    _batchId: string
  ): Promise<BatchResult> {
    throw new Error(
      `Batch processing is not supported for ${this.metadata.clientId}/${this.metadata.modelId}`
    );
  }

  /**
   * Traces batch results by creating one Langfuse generation per batch entry.
   */
  private async traceBatchResults(results: BatchResult): Promise<BatchResult> {
    const workspaceId = this.authenticator.getNonNullableWorkspace().sId;

    for (const [customId, events] of results) {
      const traceId = createLLMTraceId(randomUUID());
      const buffer = new LLMTraceBuffer(traceId, workspaceId, this.context!);

      const generation = startObservation(
        "llm-batch-completion",
        {
          input: { batchCustomId: customId },
          model: this.modelId,
          modelParameters: {
            reasoningEffort: this.reasoningEffort ?? "",
            responseFormat: this.responseFormat ?? "",
            temperature: this.temperature ?? "",
          },
        },
        { asType: "generation" }
      );

      generation.updateTrace({
        metadata: {
          dustTraceId: traceId,
          batchCustomId: customId,
          ...(this.authenticator.user()?.sId && {
            actualUserId: this.authenticator.user()!.sId,
          }),
          ...(this.authenticator.key() && {
            apiKeyId: this.authenticator.key()!.id,
          }),
          authMethod: this.authenticator.authMethod() ?? "unknown",
          ...pickBy(
            this.context!,
            (value, key) =>
              value !== undefined && !["userId", "workspaceId"].includes(key)
          ),
        },
        userId: workspaceId,
      });

      const metricTags = [
        `model_id:${this.modelId}`,
        `client_id:${this.metadata.clientId}`,
        `operation_type:${this.context!.operationType}`,
      ];

      let hasError = false;
      for (const event of events) {
        buffer.addEvent(event);

        if (event.type === "error") {
          hasError = true;
          getStatsDClient().increment("llm_error.count", 1, metricTags);
          generation.updateTrace({
            tags: ["isError:true", `errorType:${event.content.type}`],
          });
        }
      }

      if (!hasError) {
        getStatsDClient().increment("llm_success.count", 1, metricTags);
      }
      getStatsDClient().increment("llm_interaction.count", 1, metricTags);

      const { tokenUsage, ...rest } = buffer.currentOutput;

      generation.update({ output: { ...rest } });

      if (this.getTraceOutput) {
        const traceOutput = this.getTraceOutput(rest);
        if (traceOutput) {
          generation.updateTrace({ output: traceOutput });
        }
      } else {
        generation.updateTrace({ output: { ...rest } });
      }

      if (tokenUsage) {
        generation.update({
          usageDetails: {
            input: tokenUsage.uncachedInputTokens ?? tokenUsage.inputTokens,
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
    }

    return results;
  }

  /**
   * Build the request payload that will be sent to the LLM provider.
   *
   * Contract: Implement this method to return the provider-specific request object.
   * The payload is automatically captured for tracing.
   */
  protected abstract buildStreamRequestPayload(
    streamParameters: LLMStreamParameters
  ): TPayload;

  /**
   * Send the request to the LLM provider and yield events.
   *
   * Contract: Implement this method as an async generator to handle
   * provider-specific API calls and response streaming.
   */
  protected abstract sendRequest(payload: TPayload): AsyncGenerator<LLMEvent>;

  /**
   * Orchestrates the request lifecycle: build -> capture for tracing -> send.
   */
  protected async *internalStream(
    streamParameters: LLMStreamParameters
  ): AsyncGenerator<LLMEvent> {
    const payload = this.buildStreamRequestPayload(streamParameters);

    // Update the generation span with the actual payload.
    this.generation?.update({ input: payload });

    yield* this.sendRequest(payload);
  }
}
