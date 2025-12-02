import type {
  LLMEvent,
  LLMOutputItem,
  ReasoningGeneratedEvent,
  TextGeneratedEvent,
  ToolCallEvent,
} from "@app/lib/api/llm/types/events";

export class SuccessAggregate {
  get aggregated(): LLMOutputItem[] {
    return this._aggregated;
  }
  get textGenerated(): TextGeneratedEvent | undefined {
    return this._textGenerated;
  }
  get reasoningGenerated(): ReasoningGeneratedEvent | undefined {
    return this._reasoningGenerated;
  }
  get toolCalls(): ToolCallEvent[] | undefined {
    return this._toolCalls;
  }

  private readonly _aggregated: LLMOutputItem[];
  private _textGenerated?: TextGeneratedEvent;
  private _reasoningGenerated?: ReasoningGeneratedEvent;
  private _toolCalls?: ToolCallEvent[];

  constructor() {
    this._aggregated = [];
    console.log("hello");
  }

  public add(event: LLMEvent): void {
    if (
      event.type === "text_generated" ||
      event.type === "reasoning_generated" ||
      event.type === "tool_call"
    ) {
      this._aggregated.push(event);

      switch (event.type) {
        case "text_generated":
          this._textGenerated = event;
          break;
        case "reasoning_generated":
          this._reasoningGenerated = event;
          break;
        case "tool_call":
          this._toolCalls = this._toolCalls ?? [];
          this._toolCalls.push(event);
          break;
      }
    }
  }
}
