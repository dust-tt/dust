import { startObservation } from "@langfuse/tracing";
import { randomUUID } from "crypto";

import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import type { LLMTraceId } from "@app/lib/api/llm/traces/buffer";
import {
  createLLMTraceId,
  LLMTraceBuffer,
} from "@app/lib/api/llm/traces/buffer";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMClientMetadata,
  LLMParameters,
  StreamParameters,
} from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { RunResource } from "@app/lib/resources/run_resource";
import type { ModelIdType, ReasoningEffort } from "@app/types";

export abstract class LLM {
  protected modelId: ModelIdType;
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
    }: LLMParameters & { clientId: string }
  ) {
    this.modelId = modelId;
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
  }: StreamParameters): AsyncGenerator<LLMEvent> {
    if (!this.context) {
      yield* this.internalStream({ conversation, prompt, specifications });
      return;
    }

    const workspaceId = this.authenticator.getNonNullableWorkspace().sId;
    const buffer = new LLMTraceBuffer(this.traceId, workspaceId, this.context);

    const generation = startObservation(
      "llm-completion",
      {
        input: conversation.messages,
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

    let streamedContent = "";
    let streamedReasoning = "";
    const streamedToolCalls = new Map<string, any>();

    try {
      for await (const event of this.internalStream({
        conversation,
        prompt,
        specifications,
      })) {
        buffer.addEvent(event);

        // Update Langfuse observation with each event
        switch (event.type) {
          case "text_delta":
            streamedContent += event.content.delta;
            generation.update({
              output: {
                content: streamedContent,
                toolCalls: Array.from(streamedToolCalls.values()),
                reasoning: streamedReasoning || undefined,
              },
            });
            break;

          case "reasoning_delta":
            streamedReasoning += event.content.delta;
            generation.update({
              output: {
                content: streamedContent,
                reasoning: streamedReasoning,
                toolCalls: Array.from(streamedToolCalls.values()),
              },
            });
            break;

          case "tool_call":
            streamedToolCalls.set(event.content.id, event.content);
            generation.update({
              output: {
                content: streamedContent,
                toolCalls: Array.from(streamedToolCalls.values()),
                reasoning: streamedReasoning || undefined,
              },
            });
            break;

          case "token_usage":
            generation.update({
              usageDetails: {
                input: event.content.inputTokens,
                output: event.content.outputTokens,
                total: event.content.totalTokens,
                cache_read_input_tokens: event.content.cachedTokens ?? 0,
                cache_creation_input_tokens:
                  event.content.cacheCreationTokens ?? 0,
                reasoning_tokens: event.content.reasoningTokens ?? 0,
              },
            });
            break;

          // case "success":
          //   generation.update({
          //     output: {
          //       // TODO: Refine based on final output structure.
          //       content: buffer.output
          //       // reasoning: event.r.content.text,
          //       // toolCalls: event.toolCalls?.map((tc) => tc.content),
          //     },
          //     level: "DEFAULT",
          //   });
          //   break;

          case "error":
            generation.update({
              level: "ERROR",
              statusMessage: event.content.message,
              metadata: {
                errorType: event.content.type,
                errorMessage: event.content.message,
              },
            });
            break;
        }

        yield event;
      }
    } finally {
      const durationMs = Date.now() - startTime;
      buffer.writeToGCS({ durationMs, startTime }).catch(() => {});

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
  }: StreamParameters): AsyncGenerator<LLMEvent> {
    yield* this.streamWithTracing({
      conversation,
      prompt,
      specifications,
    });
  }

  protected abstract internalStream({
    conversation,
    prompt,
    specifications,
  }: StreamParameters): AsyncGenerator<LLMEvent>;
}
