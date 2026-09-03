import config from "@app/lib/api/config";
import {
  contributeFreeUsageCostForUser,
  isFreeUsageContext,
} from "@app/lib/api/llm/free_usage";
import { LLMRunLifecycle } from "@app/lib/api/llm/run_lifecycle";
import type {
  LLMAttemptOutcome,
  LLMAttemptOutcomeTelemetry,
} from "@app/lib/api/llm/telemetry";
import {
  emitLLMDurationMs,
  emitLLMTimeToFirstEventMs,
  emitLLMTimeToFirstTokenMs,
  llmAttemptLogFields,
  requestedReasoningEffortTag,
  serviceTierTags,
} from "@app/lib/api/llm/telemetry";
import type { LLMTraceId } from "@app/lib/api/llm/traces/buffer";
import {
  createLLMTraceId,
  LLMTraceBuffer,
} from "@app/lib/api/llm/traces/buffer";
import type {
  LLMTraceContext,
  LLMTraceCustomization,
} from "@app/lib/api/llm/traces/types";
import type {
  BatchDeletionOutcome,
  BatchResult,
  BatchResultWithRunIds,
  BatchStatus,
} from "@app/lib/api/llm/types/batch";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
  LLMStreamMetadata,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { emitTokenUsageMetrics } from "@app/lib/api/llm/usage_metrics";
import { isProgrammaticUsageFromContext } from "@app/lib/api/programmatic_usage/common";
import type { Authenticator } from "@app/lib/auth";
import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { USAGE_TYPE_FREE } from "@app/lib/metronome/constants";
import { getUsageType } from "@app/lib/metronome/events";
import type { UsageType } from "@app/lib/metronome/types";
import type { ServiceTier } from "@app/lib/model_constructors/types/input/configuration";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/types/assistant/creativity";

import type {
  ModelConfigurationType,
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LangfuseGeneration } from "@langfuse/tracing";
import { startObservation } from "@langfuse/tracing";
import { randomUUID } from "crypto";
import pickBy from "lodash/pickBy";
import startCase from "lodash/startCase";

export abstract class LLM<
  TEndpoint extends
    | DustStreamEndpointConstructor
    | DustBatchEndpointConstructor =
    | DustStreamEndpointConstructor
    | DustBatchEndpointConstructor,
  TPayload = unknown,
> {
  protected modelId: ModelIdType;
  protected modelConfig: ModelConfigurationType;
  protected temperature: number | null;
  protected reasoningEffort: ReasoningEffort | null;
  protected responseFormat: string | null;
  protected bypassFeatureFlag: boolean;
  protected metadata: LLMClientMetadata;
  // Temporary during the router migration; "new" is set by BaseTransition.
  protected readonly router: "legacy" | "new" = "legacy";

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
      modelInfo,
    }: LLMParameters<TEndpoint>
  ) {
    const modelConfig = modelInfo.endpoint.modelConfig;
    this.modelId = modelConfig.modelId;
    this.modelConfig = modelConfig;
    this.temperature =
      modelInfo.temperature ?? AGENT_CREATIVITY_LEVEL_TEMPERATURES["balanced"];
    // TODO(new-llm-router): We should not set reasoning effort to none
    // Not in scope of the current refactor
    this.reasoningEffort = modelInfo.reasoningEffort ?? "none";
    this.responseFormat = modelInfo.responseFormat ?? null;
    this.bypassFeatureFlag = bypassFeatureFlag;
    this.metadata = {
      clientId: providerId,
      inferenceProvider: providerId,
      inferenceRegion: "global",
      modelId: this.modelId,
    };

    // Initialize tracing.
    this.authenticator = auth;
    this.context = context;
    this.traceId = createLLMTraceId(randomUUID());
    this.getTraceOutput = getTraceOutput;
  }

  private async *completeStream(
    streamParameters: LLMStreamParameters,
    metadata?: LLMStreamMetadata
  ): AsyncGenerator<LLMEvent> {
    let currentEvent: LLMEvent | null = null;
    for await (const event of this.internalStream(streamParameters, metadata)) {
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
          // Closing without a terminal event does not prove the provider caused
          // the gap. Keep this unknown so the outage fallback cannot relabel it.
          errorSource: "unknown",
        },
        this.metadata
      );
      yield currentEvent;
    }
  }

  // Identity tags for attempt counters. Adding a tag here splits existing
  // Datadog series for llm_interaction.count, llm_success.count, and
  // llm_error.count.
  private getTelemetryTags({
    surface,
  }: {
    surface: "stream" | "batch";
  }): string[] {
    return [
      `model_id:${this.modelId}`,
      `provider_id:${this.modelConfig.providerId}`,
      `client_id:${this.metadata.clientId}`,
      `inference_provider:${this.metadata.inferenceProvider}`,
      ...(this.metadata.region ? [`region:${this.metadata.region}`] : []),
      `operation_type:${this.context?.operationType ?? "unknown"}`,
      `surface:${surface}`,
    ];
  }

  // Latency tags additionally carry the requested reasoning effort and the
  // processing tier the provider billed, so llm_duration_ms,
  // llm_time_to_first_event_ms and llm_time_to_first_token_ms can be compared
  // across service tiers (for example flex versus default) on the same model.
  private getLatencyTelemetryTags({
    serviceTier,
    surface,
  }: {
    serviceTier: ServiceTier | undefined;
    surface: "stream" | "batch";
  }): string[] {
    return [
      ...this.getTelemetryTags({ surface }),
      requestedReasoningEffortTag(this.reasoningEffort),
      ...serviceTierTags(serviceTier),
    ];
  }

  private emitStreamAttemptTelemetry({
    durationMs,
    serviceTier,
    timeToFirstEventMs,
    timeToFirstTokenMs,
    ...outcomeTelemetry
  }: {
    durationMs: number;
    serviceTier: ServiceTier | undefined;
    timeToFirstEventMs: number | undefined;
    timeToFirstTokenMs: number | undefined;
  } & LLMAttemptOutcomeTelemetry): void {
    const baseTags = this.getTelemetryTags({ surface: "stream" });
    const latencyTags = this.getLatencyTelemetryTags({
      serviceTier,
      surface: "stream",
    });

    switch (outcomeTelemetry.outcome) {
      case "error":
        statsDMetrics.increment("llm_error.count", 1, [
          ...baseTags,
          `error_type:${outcomeTelemetry.errorType}`,
          `error_source:${outcomeTelemetry.errorSource}`,
        ]);
        break;
      case "success":
        statsDMetrics.increment("llm_success.count", 1, baseTags);
        break;
      case "success_without_usage":
        statsDMetrics.increment("llm_success.count", 1, baseTags);
        statsDMetrics.increment("llm_success_without_usage.count", 1, baseTags);
        break;
      default:
        assertNever(outcomeTelemetry);
    }

    emitLLMDurationMs({
      durationMs,
      tags: latencyTags,
      ...outcomeTelemetry,
    });
    emitLLMTimeToFirstEventMs(timeToFirstEventMs, latencyTags);
    emitLLMTimeToFirstTokenMs(timeToFirstTokenMs, latencyTags);
  }

  /**
   * Private method that wraps the abstract internalStream() with tracing functionality
   */
  private async *streamWithTracing(
    streamParameters: LLMStreamParameters,
    metadata?: LLMStreamMetadata
  ): AsyncGenerator<LLMEvent> {
    if (!this.context) {
      yield* this.completeStream(streamParameters, metadata);
      return;
    }

    const { conversation, prompt, specifications, previousMessageId } =
      streamParameters;

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
        // Prompt-cache diagnostics: the previous response id we threaded into this
        // request (the current one is added below from the `interaction_id` event).
        ...(previousMessageId && { previousMessageId }),
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

    const metricTags = this.getTelemetryTags({ surface: "stream" });

    statsDMetrics.increment("llm_interaction.count", 1, metricTags);

    let currentEvent: LLMEvent | null = null;
    let timeToFirstEventMs: number | undefined;
    let timeToFirstTokenMs: number | undefined;

    try {
      for await (const event of this.completeStream(
        streamParameters,
        metadata
      )) {
        const elapsedMs = Date.now() - startTime;

        if (timeToFirstEventMs === undefined) {
          timeToFirstEventMs = elapsedMs;
        }

        if (
          timeToFirstTokenMs === undefined &&
          (event.type === "text_delta" || event.type === "reasoning_delta")
        ) {
          timeToFirstTokenMs = elapsedMs;
        }

        currentEvent = event;
        buffer.addEvent(currentEvent);

        // Providers report usage exactly once per response, at end of stream. Emitting here in
        // the base class covers both the new router and the legacy clients.
        if (currentEvent.type === "token_usage") {
          emitTokenUsageMetrics(currentEvent.content, [
            ...metricTags,
            ...serviceTierTags(currentEvent.content.serviceTier),
          ]);
        }

        if (currentEvent.type === "interaction_id") {
          const { modelInteractionId, cacheMissReason } = currentEvent.content;
          buffer.setModelInteractionId(modelInteractionId);
          this.generation.updateTrace({
            metadata: {
              modelInteractionId,
              ...(cacheMissReason && {
                cacheMissReasonType: cacheMissReason.type,
                cacheMissedInputTokens: cacheMissReason.cacheMissedInputTokens,
              }),
            },
          });
        }

        if (currentEvent.type !== "success" && currentEvent.type !== "error") {
          yield currentEvent;
          continue;
        }

        const durationMs = Date.now() - startTime;
        const { tokenUsage, ...rest } = buffer.currentOutput;
        const timingLogFields = llmAttemptLogFields({
          durationMs,
          timeToFirstEventMs,
          timeToFirstTokenMs,
          requestedReasoningEffort: this.reasoningEffort,
          serviceTier: tokenUsage?.serviceTier,
          surface: "stream",
        });

        if (currentEvent.type === "error") {
          const errorType = currentEvent.content.type;
          const errorSource = currentEvent.content.errorSource;

          this.emitStreamAttemptTelemetry({
            outcome: "error",
            durationMs,
            serviceTier: tokenUsage?.serviceTier,
            timeToFirstEventMs,
            timeToFirstTokenMs,
            errorType,
            errorSource,
          });
          this.generation.updateTrace({
            tags: [
              "isError:true",
              `errorType:${errorType}`,
              `errorSource:${errorSource}`,
            ],
          });

          logger.error(
            {
              llmEventType: "error",
              router: this.router,
              errorContent: currentEvent.content,
              modelId: this.modelId,
              inferenceProvider: this.metadata.inferenceProvider,
              region: this.metadata.region,
              context: this.context,
              traceId: this.traceId,
              errorType,
              errorSource,
              ...timingLogFields,
            },
            "LLM Error"
          );
        }

        if (currentEvent.type === "success") {
          const outcome: LLMAttemptOutcome = tokenUsage
            ? "success"
            : "success_without_usage";

          this.emitStreamAttemptTelemetry({
            outcome,
            durationMs,
            serviceTier: tokenUsage?.serviceTier,
            timeToFirstEventMs,
            timeToFirstTokenMs,
          });

          const logContext = {
            router: this.router,
            modelId: this.modelId,
            inferenceProvider: this.metadata.inferenceProvider,
            region: this.metadata.region,
            context: this.context,
            traceId: this.traceId,
            ...timingLogFields,
          };

          if (tokenUsage) {
            logger.info(
              { llmEventType: "success", ...logContext },
              "LLM Success"
            );
          } else {
            this.generation.updateTrace({
              tags: ["success_without_usage:true"],
            });
            this.generation.update({
              level: "WARNING",
              statusMessage:
                "LLM completed successfully without reporting token usage.",
            });
            logger.warn(
              {
                llmEventType: "success_without_usage",
                ...logContext,
                outputContentLength: rest.content?.length ?? 0,
                reasoningLength: rest.reasoning?.length ?? 0,
                toolCallCount: rest.toolCalls?.length ?? 0,
              },
              "LLM Success without usage"
            );
          }
        }

        buffer
          .writeToGCS({
            durationMs,
            startTime,
            timeToFirstEventMs,
            timeToFirstTokenMs,
          })
          .catch(() => {});

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
              output: tokenUsage.totalOutputTokens,
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
              errorType: buffer.error.content.type,
              errorMessage: buffer.error.message,
              errorSource: buffer.error.content.errorSource,
            },
          });
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
    streamParameters: LLMStreamParameters,
    metadata?: LLMStreamMetadata
  ): AsyncGenerator<LLMEvent> {
    yield* this.streamWithTracing(streamParameters, metadata);
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
      await this.traceBatchInputs(conversations);
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
  private async traceBatchInputs(
    conversations: Map<string, LLMStreamParameters>
  ): Promise<void> {
    const workspaceId = this.authenticator.getNonNullableWorkspace().sId;

    for (const [customId, params] of conversations) {
      const payload = await this.buildStreamRequestPayload(params);

      const generation = startObservation(
        `llm-batch-input-${customId}`,
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
   * Delete a batch's data on the provider.
   * By default the provider does not support deletion.
   */
  async deleteBatch(
    _batchId: string
  ): Promise<Result<BatchDeletionOutcome, Error>> {
    return new Ok("unsupported");
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
  async getBatchResult(batchId: string): Promise<BatchResultWithRunIds> {
    const results = await this.internalGetBatchResult(batchId);
    if (this.context) {
      await this.traceBatchResults(results);
    }
    return this.createRunsForBatchResults(results);
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
   * Creates RunResource entries and records token usage for each batch entry.
   * This enables cost tracking by linking batch results to run_usages.
   */
  private async createRunsForBatchResults(
    results: BatchResult
  ): Promise<BatchResultWithRunIds> {
    const enrichedResults: BatchResultWithRunIds = new Map();
    const usageType = this.getUsageType();

    for (const [customId, events] of results) {
      const traceId = createLLMTraceId(randomUUID());

      const run = await RunResource.makeNew({
        appId: null,
        dustRunId: traceId,
        runType: "deploy",
        useWorkspaceCredentials: false,
        workspaceId: this.authenticator.getNonNullableWorkspace().id,
      });

      // Record token usage from events.
      for (const event of events) {
        if (event.type === "token_usage") {
          await run.recordTokenUsage(
            this.authenticator,
            event.content,
            this.modelId,
            {
              isBatch: true,
              inferenceRegion: this.metadata.inferenceRegion,
              usageType,
            }
          );
        }
      }

      enrichedResults.set(customId, { events, dustRunId: traceId });
    }

    return enrichedResults;
  }

  /**
   * Traces batch results by creating one Langfuse generation per batch entry.
   */
  private async traceBatchResults(results: BatchResult): Promise<void> {
    const workspaceId = this.authenticator.getNonNullableWorkspace().sId;

    for (const [customId, events] of results) {
      const traceId = createLLMTraceId(randomUUID());
      const buffer = new LLMTraceBuffer(traceId, workspaceId, this.context!);

      const generation = startObservation(
        `llm-batch-completion-${customId}`,
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

      const metricTags = this.getTelemetryTags({ surface: "batch" });

      let hasError = false;
      for (const event of events) {
        buffer.addEvent(event);

        if (event.type === "token_usage") {
          emitTokenUsageMetrics(event.content, [
            ...metricTags,
            ...serviceTierTags(event.content.serviceTier),
          ]);
        }

        if (event.type === "error") {
          hasError = true;
          const errorType = event.content.type;
          const errorSource = event.content.errorSource;
          statsDMetrics.increment("llm_error.count", 1, [
            ...metricTags,
            `error_type:${errorType}`,
            `error_source:${errorSource}`,
          ]);
          generation.updateTrace({
            tags: [
              "isError:true",
              `errorType:${errorType}`,
              `errorSource:${errorSource}`,
            ],
          });
          logger.error(
            {
              llmEventType: "error",
              router: this.router,
              errorContent: event.content,
              modelId: this.modelId,
              inferenceProvider: this.metadata.inferenceProvider,
              region: this.metadata.region,
              context: this.context,
              traceId,
              errorType,
              errorSource,
              ...llmAttemptLogFields({
                requestedReasoningEffort: this.reasoningEffort,
                surface: "batch",
              }),
            },
            "LLM Error"
          );
        }
      }

      if (!hasError) {
        statsDMetrics.increment("llm_success.count", 1, metricTags);
      }
      statsDMetrics.increment("llm_interaction.count", 1, metricTags);

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
            output: tokenUsage.totalOutputTokens,
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
            errorType: buffer.error.content.type,
            errorMessage: buffer.error.message,
            errorSource: buffer.error.content.errorSource,
          },
        });
      }

      generation.end();
    }
  }

  /**
   * Build the request payload that will be sent to the LLM provider.
   *
   * Contract: Implement this method to return the provider-specific request object.
   * The payload is automatically captured for tracing.
   */
  protected abstract buildStreamRequestPayload(
    streamParameters: LLMStreamParameters,
    metadata?: LLMStreamMetadata
  ): TPayload | Promise<TPayload>;

  /**
   * Send the request to the LLM provider and yield events.
   *
   * Contract: Implement this method as an async generator to handle
   * provider-specific API calls and response streaming.
   */
  protected abstract sendRequest(payload: TPayload): AsyncGenerator<LLMEvent>;

  /**
   * Override to inject run usages that bypass token-based pricing (e.g. noop simulation).
   * Called after the stream completes; returned entries are recorded via recordRunUsage.
   */
  protected getSimulatedRunUsages(): RunUsageType[] | null {
    return null;
  }

  /**
   * Orchestrates the request lifecycle: build -> capture for tracing -> send.
   */
  protected async *internalStream(
    streamParameters: LLMStreamParameters,
    metadata?: LLMStreamMetadata
  ): AsyncGenerator<LLMEvent> {
    // Persist first: if this fails, no provider request is made. Every provider
    // attempt therefore starts with a durable run and pending usage row.
    const usageType = this.getUsageType();
    const lifecycle = await LLMRunLifecycle.start(this.authenticator, {
      dustRunId: this.traceId,
      inferenceProvider: this.metadata.inferenceProvider,
      inferenceRegion: this.metadata.inferenceRegion,
      modelId: this.modelId,
      providerId: this.modelConfig.providerId,
      region: this.metadata.region ?? null,
      usageType,
    });

    try {
      const payload = await this.buildStreamRequestPayload(
        streamParameters,
        metadata
      );

      // Update the generation span with the actual payload.
      this.generation?.update({ input: payload });

      const simulatedRunUsages = this.getSimulatedRunUsages();
      if (simulatedRunUsages) {
        await lifecycle.recordRunUsages(simulatedRunUsages);
      }

      for await (const event of this.sendRequest(payload)) {
        if (event.type === "token_usage") {
          const costMicroUsd = await lifecycle.recordTokenUsage(event.content);
          const user = this.authenticator.user();
          if (usageType === USAGE_TYPE_FREE && user && costMicroUsd) {
            await contributeFreeUsageCostForUser(
              this.authenticator.getNonNullableWorkspace(),
              user.id,
              costMicroUsd
            );
          }
        }
        yield event;
      }
    } finally {
      await lifecycle.close();
    }
  }

  private getUsageType(): UsageType {
    // Calls without tracing context and non-agent utility calls are free.
    if (!this.context || isFreeUsageContext(this.context)) {
      return USAGE_TYPE_FREE;
    }

    const userMessageOrigin = this.context.userMessageOrigin;
    if (!userMessageOrigin) {
      throw new Error(
        "Agent conversation LLM context is missing userMessageOrigin"
      );
    }

    return getUsageType(
      isProgrammaticUsageFromContext({
        authMethod: this.authenticator.authMethod(),
        userMessageOrigin,
      }),
      userMessageOrigin
    );
  }
}
