import type {
  LLMTrace,
  LLMTraceContext,
  LLMTraceInput,
  LLMTraceOutput,
  ProcessedLLMEvents,
} from "@app/lib/api/llm/traces/types";
import type {
  LLMEvent,
  TokenUsage,
  ToolCall,
} from "@app/lib/api/llm/types/events";
import { getLLMTracesBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ReasoningEffort,
} from "@app/types";

/**
 * Buffer for LLM trace data with output size limits to prevent memory issues.
 *
 * This class tracks LLM inputs (unconstrained) and outputs (size-limited) for debugging.
 * Input data (conversation, prompt, specs) is always captured since it's controlled.
 * Output data (generated content, reasoning, tool calls) is limited to MAX_OUTPUT_SIZE to prevent
 * runaway generation from causing memory issues.
 *
 * When the output limit is reached, truncation occurs with a clear marker, and the
 * trace is still written to GCS with metadata indicating the truncation for DD monitoring.
 */
export class LLMTraceBuffer {
  private input: LLMTraceInput | null = null;
  private outputByteSize = 0;
  private truncated = false;
  private readonly MAX_OUTPUT_SIZE = 64 * 1024; // 64KB for output only.

  private content = "";
  private finishReason: LLMTraceOutput["finishReason"] = "unknown";
  private reasoning = "";
  private tokenUsage: TokenUsage | undefined;
  private toolCalls: ToolCall[] = [];

  constructor(
    private readonly runId: string,
    private readonly workspaceId: string,
    private readonly context: LLMTraceContext
  ) {}

  /**
   * Captures the full LLM input (unconstrained by size limits).
   */
  setInput({
    conversation,
    modelId,
    prompt,
    reasoningEffort,
    specifications,
    temperature,
  }: {
    conversation: ModelConversationTypeMultiActions;
    modelId: ModelIdType;
    prompt: string;
    reasoningEffort: ReasoningEffort;
    specifications: unknown[];
    temperature: number;
  }) {
    this.input = {
      conversation,
      modelId,
      prompt,
      reasoningEffort,
      specifications,
      temperature,
    };
  }

  /**
   * Adds an event by first estimating how much it would add to the total output size.
   * If it exceeds the MAX_OUTPUT_SIZE, we mark truncated and insert a truncation message.
   */
  addEvent(event: LLMEvent): boolean {
    if (this.truncated) {
      return false;
    }

    const estimatedDelta = this.estimateDelta(event);

    if (this.outputByteSize + estimatedDelta > this.MAX_OUTPUT_SIZE) {
      this.truncated = true;
      this.content += "\n\n[TRUNCATED: Output size limit reached]";
      this.outputByteSize = this.getApproximateSize();
      return false;
    }

    this.applyEvent(event);
    this.outputByteSize += estimatedDelta;
    return true;
  }

  /**
   * Applies changes to content/reasoning/toolCalls/finishReason.
   */
  private applyEvent(event: LLMEvent): void {
    switch (event.type) {
      case "text_delta":
        this.content += event.content.delta;
        break;

      case "reasoning_delta":
        this.reasoning += event.content.delta;
        break;

      case "text_generated":
        this.content = event.content.text;
        break;

      case "reasoning_generated":
        this.reasoning = event.content.text;
        break;

      case "tool_call":
        this.toolCalls.push({
          id: event.content.id,
          name: event.content.name,
          arguments: event.content.arguments,
        });
        break;

      case "token_usage":
        this.tokenUsage = event.content;
        break;

      // TODO(2025-10-31 DIRECT_LLM): Looks like success event is never sent.
      case "success":
        // TODO(2025-10-31 DIRECT_LLM): Store finishReason from event if available.
        break;

      case "error":
        // TODO(2025-10-31 DIRECT_LLM): Wire finishReason from LLM event if available.
        this.finishReason = "error";
        break;
    }
  }

  /**
   * Estimates how many bytes this event will add to our output fields.
   * For delta events, measures the new string. For replacement events, calculates oldSize → newSize.
   */
  private estimateDelta(event: LLMEvent): number {
    switch (event.type) {
      case "text_delta":
      case "reasoning_delta":
        return Buffer.byteLength(event.content.delta, "utf8");

      case "text_generated": {
        const oldSize = Buffer.byteLength(this.content, "utf8");
        const newSize = Buffer.byteLength(event.content.text, "utf8");
        return Math.max(0, newSize - oldSize);
      }

      case "reasoning_generated": {
        const oldSize = Buffer.byteLength(this.reasoning, "utf8");
        const newSize = Buffer.byteLength(event.content.text, "utf8");
        return Math.max(0, newSize - oldSize);
      }

      case "tool_call":
        return this.getByteSize(event.content);

      case "token_usage": {
        const oldUsageSize = this.tokenUsage
          ? this.getByteSize(this.tokenUsage)
          : 0;

        const newUsageSize = this.getByteSize(event.content);
        return Math.max(0, newUsageSize - oldUsageSize);
      }

      default:
        return 0;
    }
  }

  /**
   * Returns approximate JSON size for the entire output.
   */
  private getApproximateSize(): number {
    const output = {
      content: this.content,
      reasoning: this.reasoning,
      toolCalls: this.toolCalls,
      tokenUsage: this.tokenUsage,
    };

    return this.getByteSize(output);
  }

  /**
   * Creates the final trace JSON object.
   */
  toTraceJSON({
    durationMs,
    endTimestamp,
    error,
    startTimestamp,
  }: {
    durationMs: number;
    endTimestamp: string;
    error: Error | null;
    startTimestamp: string;
  }): LLMTrace {
    if (!this.input) {
      throw new Error("Input must be set before creating trace");
    }

    const trace: LLMTrace = {
      context: this.context,
      input: this.input,
      metadata: {
        durationMs,
        endTimestamp,
        modelId: this.input.modelId,
        startTimestamp,
      },
      runId: this.runId,
      workspaceId: this.workspaceId,
    };

    if (error) {
      trace.error = {
        message: error.message,
        partialCompletion:
          this.content.length > 0 ||
          this.reasoning.length > 0 ||
          this.toolCalls.length > 0,
        timestamp: endTimestamp,
      };
    } else {
      const processedEvents = this.getProcessedEvents();

      trace.output = {
        content: processedEvents.content,
        finishReason: processedEvents.finishReason,
        reasoning: processedEvents.reasoning || undefined,
        tokenUsage: processedEvents.tokenUsage,
        toolCalls:
          processedEvents.toolCalls.length > 0
            ? processedEvents.toolCalls
            : undefined,
      };
    }

    if (this.truncated) {
      trace.metadata.bufferTruncated = true;
      trace.metadata.capturedBytes = this.outputByteSize;
      trace.metadata.truncationReason = `Output size exceeded ${this.MAX_OUTPUT_SIZE / 1024}KB limit`;
    }

    return trace;
  }

  get filePath(): string {
    return `${this.workspaceId}/${this.runId}.json`;
  }

  isTruncated(): boolean {
    return this.truncated;
  }

  get outputSize(): number {
    return this.outputByteSize;
  }

  /**
   * Writes the final trace to GCS and log.
   * GCS write failures do not fail the main LLM operation.
   */
  async writeToGCS({
    startTime,
    durationMs,
    error,
  }: {
    startTime: number;
    durationMs: number;
    error: Error | null;
  }): Promise<void> {
    const startTimestamp = new Date(startTime).toISOString();
    const endTimestamp = new Date(startTime + durationMs).toISOString();

    try {
      const trace = this.toTraceJSON({
        durationMs,
        endTimestamp,
        error,
        startTimestamp,
      });
      const bucket = getLLMTracesBucket();

      await bucket.uploadRawContentToBucket({
        content: JSON.stringify(trace, null, 2),
        contentType: "application/json",
        filePath: this.filePath,
      });

      logger.info(
        {
          runId: this.runId,
          workspaceId: this.workspaceId,
          operationType: this.context.operationType,
          contextId: this.context.contextId,
          userId: this.context.userId,
          modelId: this.input?.modelId,
          gcsPath: this.filePath,
          durationMs,
          hasError: !!error,
          bufferTruncated: this.truncated,
          capturedBytes: this.outputByteSize,
          llmTrace: true,
        },
        "LLM trace written to GCS"
      );
    } catch (writeError) {
      logger.error(
        {
          outputSize: this.outputByteSize,
          bufferTruncated: this.truncated,
          error: writeError,
          runId: this.runId,
          workspaceId: this.workspaceId,
        },
        "Failed to write LLM trace to GCS"
      );
    }
  }

  /**
   * Returns the processed output fields.
   */
  getProcessedEvents(): ProcessedLLMEvents {
    return {
      content: this.content,
      reasoning: this.reasoning,
      toolCalls: this.toolCalls,
      tokenUsage: this.tokenUsage,
      finishReason: this.finishReason,
    };
  }

  /**
   * Helper to measure byte size of an object in UTF-8 JSON form.
   */
  private getByteSize(obj: unknown): number {
    try {
      return Buffer.byteLength(JSON.stringify(obj), "utf8");
    } catch (err) {
      return Buffer.byteLength(String(obj), "utf8");
    }
  }
}
