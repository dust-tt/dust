import { randomUUID } from "crypto";

import { AGENT_CREATIVITY_LEVEL_TEMPERATURES } from "@app/components/agent_builder/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { LLMTraceBuffer } from "@app/lib/api/llm/traces/buffer";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ReasoningEffort,
} from "@app/types";
import { normalizeError } from "@app/types";

export interface LLMWithTracingParameters extends LLMParameters {
  context?: LLMTraceContext;
}

export abstract class LLM {
  protected modelId: ModelIdType;
  protected temperature: number;
  protected reasoningEffort: ReasoningEffort;
  protected bypassFeatureFlag: boolean;

  // Tracing fields.
  protected readonly authenticator: Authenticator;
  protected readonly context?: LLMTraceContext;
  protected readonly runId: string;

  constructor(
    auth: Authenticator,
    {
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag = false,
      context,
    }: LLMWithTracingParameters
  ) {
    this.modelId = modelId;
    this.temperature =
      temperature ?? AGENT_CREATIVITY_LEVEL_TEMPERATURES.balanced;
    this.reasoningEffort = reasoningEffort ?? "none";
    this.bypassFeatureFlag = bypassFeatureFlag;

    // Initialize tracing.
    this.authenticator = auth;
    this.context = context;
    this.runId = `llm_${randomUUID()}`;
  }

  protected abstract stream({
    conversation,
    prompt,
    specifications,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
    specifications: AgentActionSpecification[];
  }): AsyncGenerator<LLMEvent>;

  /**
   * Public method that wraps the abstract stream() with tracing functionality
   */
  async *streamWithTracing({
    conversation,
    prompt,
    specifications,
  }: {
    conversation: ModelConversationTypeMultiActions;
    prompt: string;
    specifications: AgentActionSpecification[];
  }): AsyncGenerator<LLMEvent> {
    if (!this.context) {
      yield* this.stream({ conversation, prompt, specifications });
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

    let error: Error | null = null;

    try {
      for await (const event of this.stream({
        conversation,
        prompt,
        specifications,
      })) {
        buffer.addEvent(event);
        yield event;
      }
    } catch (err) {
      error = normalizeError(err);
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;
      buffer
        .writeToGCS({
          durationMs,
          error,
          startTime,
        })
        .catch(() => {});
    }
  }

  /**
   * Get the runId for this LLM instance
   */
  getRunId(): string {
    return this.runId;
  }
}
