import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import type {
  AssistantContentItemType,
  FunctionCallType,
  ModelId,
} from "@app/types";

interface ContentBoundaryEvent {
  type: "tokens" | "function_call" | "reasoning_item" | "stream_end";
  content?: string;
  functionCall?: FunctionCallType;
  reasoning?: {
    reasoning?: string;
    metadata: string;
  };
}

export class AgentStepContentAccumulator {
  private textBuffer: string = "";
  private currentIndex: number = 0;
  private stepContents: Array<{
    type: "text_content" | "reasoning" | "function_call";
    value: AssistantContentItemType["value"];
  }> = [];

  constructor(
    private agentMessageId: ModelId,
    private step: number,
    private workspaceId: ModelId
  ) {}

  /**
   * Handle incoming events and accumulate content appropriately
   */
  handleEvent(event: ContentBoundaryEvent): void {
    switch (event.type) {
      case "tokens":
        // Accumulate text tokens
        if (event.content) {
          this.textBuffer += event.content;
        }
        break;

      case "function_call":
        // Save accumulated text if any
        if (this.textBuffer.length > 0) {
          this.saveTextContent();
        }
        // Save function call
        if (event.functionCall) {
          this.saveFunctionCall(event.functionCall);
        }
        break;

      case "reasoning_item":
        // Save accumulated text if any
        if (this.textBuffer.length > 0) {
          this.saveTextContent();
        }
        // Save reasoning content
        if (event.reasoning) {
          this.saveReasoning(event.reasoning);
        }
        break;

      case "stream_end":
        // Save any remaining text
        if (this.textBuffer.length > 0) {
          this.saveTextContent();
        }
        break;
    }
  }

  /**
   * Save accumulated text as a text_content entry
   */
  private saveTextContent(): void {
    this.stepContents.push({
      type: "text_content",
      value: this.textBuffer,
    });
    this.textBuffer = ""; // Reset buffer
  }

  /**
   * Save a function call entry
   */
  private saveFunctionCall(functionCall: FunctionCallType): void {
    this.stepContents.push({
      type: "function_call",
      value: functionCall,
    });
  }

  /**
   * Save a reasoning entry
   */
  private saveReasoning(reasoning: { reasoning?: string; metadata: string }): void {
    this.stepContents.push({
      type: "reasoning",
      value: reasoning,
    });
  }

  /**
   * Get the accumulated step contents for inspection
   */
  getStepContents(): typeof this.stepContents {
    return this.stepContents;
  }

  /**
   * Persist all accumulated content to the database
   */
  async persistToDatabase(): Promise<void> {
    if (this.stepContents.length === 0) {
      return;
    }

    const records = this.stepContents.map((content, index) => ({
      agentMessageId: this.agentMessageId,
      step: this.step,
      index: this.currentIndex + index,
      type: content.type,
      value: {
        type: content.type,
        value: content.value,
      },
      workspaceId: this.workspaceId,
    }));

    await AgentStepContentModel.bulkCreate(records);
    
    // Update the current index for future entries
    this.currentIndex += this.stepContents.length;
    // Clear the accumulated contents
    this.stepContents = [];
  }

  /**
   * Check if there's any buffered text that hasn't been saved
   */
  hasBufferedText(): boolean {
    return this.textBuffer.length > 0;
  }

  /**
   * Get the current buffer size (for debugging/monitoring)
   */
  getBufferSize(): number {
    return this.textBuffer.length;
  }
}