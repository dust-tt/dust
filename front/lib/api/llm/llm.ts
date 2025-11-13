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
import logger from "@app/logger/logger";
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
        yield event;
      }
    } finally {
      if (currentEvent?.type === "error") {
        logger.error(
          {
            llmEventType: "error",
            message: currentEvent.content.message,
            modelId: this.modelId,
          },
          "LLM Error"
        );
      } else if (currentEvent?.type === "success") {
        logger.info(
          { llmEventType: "success", modelId: this.modelId },
          "LLM Success"
        );
      } else {
        logger.warn(
          {
            llmEventType: "uncategorized",
            lastEventType: currentEvent?.type,
            modelId: this.modelId,
          },
          "LLM uncategorized"
        );
      }

      const durationMs = Date.now() - startTime;
      buffer.writeToGCS({ durationMs, startTime }).catch(() => {});

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
