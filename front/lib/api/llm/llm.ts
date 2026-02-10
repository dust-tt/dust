import { startObservation } from "@langfuse/tracing";
import { randomUUID } from "crypto";
import pickBy from "lodash/pickBy";
import startCase from "lodash/startCase";

import type { LLMTraceId } from "@app/lib/api/llm/traces/buffer";
import {
  createLLMTraceId,
  LLMTraceBuffer,
} from "@app/lib/api/llm/traces/buffer";
import type {
  LLMTraceContext,
  LLMTraceCustomization,
} from "@app/lib/api/llm/traces/types";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
  LLMStreamParameters,
  SystemPromptInput,
} from "@app/lib/api/llm/types/options";
import { systemPromptToText } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type {
  ModelConfigurationType,
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types";
import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/types";
import type { Content } from "@app/types/assistant/generation";
import { isTextContent } from "@app/types/assistant/generation";

function contentToText(contents: Content[]): string {
  return contents
    .filter(isTextContent)
    .map((c) => c.text)
    .join("\n");
}

function buildDefaultTraceInput(
  prompt: SystemPromptInput,
  conversation: LLMStreamParameters["conversation"]
): unknown[] {
  return [
    { role: "system", content: systemPromptToText(prompt) },
    ...conversation.messages.map((message): unknown => {
      if (message.role !== "user") {
        return message;
      }

      return { ...message, content: contentToText(message.content) };
    }),
  ];
}

export abstract class LLM {
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
  protected readonly getTraceInput?: LLMTraceCustomization["getTraceInput"];
  protected readonly getTraceOutput?: LLMTraceCustomization["getTraceOutput"];

  protected constructor(
    auth: Authenticator,
    providerId: ModelProviderIdType,
    {
      bypassFeatureFlag = false,
      context,
      getTraceInput,
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
    this.getTraceInput = getTraceInput;
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
    const buffer = new LLMTraceBuffer(this.traceId, workspaceId, this.context);

    // Use custom trace input if provided, otherwise use the full conversation.
    // Full conversation with system prompt for observation (actual LLM call details).
    const observationInput = buildDefaultTraceInput(prompt, conversation);

    // Simplified input for trace if custom getter provided.
    const traceInput = this.getTraceInput?.(conversation) ?? observationInput;

    const generation = startObservation(
      "llm-completion",
      {
        input: observationInput,
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
      name: startCase(this.context.operationType),
      input: traceInput,
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

    buffer.setInput({
      conversation,
      modelId: this.modelId,
      prompt,
      reasoningEffort: this.reasoningEffort,
      responseFormat: this.responseFormat,
      specifications,
      temperature: this.temperature,
    });

    // Track LLM interaction metric
    const metricTags = [
      `model_id:${this.modelId}`,
      `client_id:${this.metadata.clientId}`,
      `operation_type:${this.context.operationType}`,
    ];
    statsDClient.increment("llm_interaction.count", 1, metricTags);

    let currentEvent: LLMEvent | null = null;
    let timeToFirstEventMs: number | undefined = undefined;

    for await (const event of this.completeStream(streamParameters)) {
      if (currentEvent === null) {
        timeToFirstEventMs = Date.now() - startTime;
      }
      currentEvent = event;
      buffer.addEvent(currentEvent);

      if (currentEvent.type === "interaction_id") {
        buffer.setModelInteractionId(currentEvent.content.modelInteractionId);
        generation.updateTrace({
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
        statsDClient.increment("llm_error.count", 1, metricTags);
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
      }

      if (currentEvent.type === "success") {
        // Temporary: track LLM success metric
        statsDClient.increment("llm_success.count", 1, metricTags);

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

      generation.update({
        output: { ...rest },
      });

      // Use custom trace output transformer if provided, otherwise use the full output.
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

      yield currentEvent;

      break;
    }
  }

  /**
   * Get the traceId for this LLM instance (includes llm_trace_ prefix)
   */
  getTraceId(): LLMTraceId {
    return this.traceId;
  }

  /**
   * Get the metadata for this LLM instance
   */
  getMetadata(): LLMClientMetadata {
    return this.metadata;
  }

  async *stream(
    streamParameters: LLMStreamParameters
  ): AsyncGenerator<LLMEvent> {
    yield* this.streamWithTracing(streamParameters);
  }

  protected abstract internalStream(
    streamParameters: LLMStreamParameters
  ): AsyncGenerator<LLMEvent>;
}
