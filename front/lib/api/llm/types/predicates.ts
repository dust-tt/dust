import type {
  CompletionEvent,
  ContentChunk,
  DeltaMessage,
  ToolCall,
} from "@mistralai/mistralai/models/components";
import isNil from "lodash/isNil";

import logger from "@app/logger/logger";

export type ExpectedDeltaMessage =
  | {
      role?: string | null | undefined;
      content: string | Array<ContentChunk>;
      toolCalls: null | undefined;
    }
  | {
      role?: string | null | undefined;
      content: null | undefined;
      toolCalls: Array<ToolCall>;
    };

export function isCorrectDelta(
  delta: DeltaMessage
): delta is ExpectedDeltaMessage {
  const { content, toolCalls } = delta;
  if (toolCalls && !isNil(content)) {
    logger.error("Mistral completion event has both content and toolCalls");
    return false;
  }

  if (isNil(content) && !toolCalls) {
    logger.error(
      JSON.stringify(delta),
      "Mistral completion event has neither content nor toolCalls"
    );
    return false;
  }

  return true;
}

export function isCorrectCompletionEvent(completionEvent: CompletionEvent) {
  if (
    !completionEvent.data.choices ||
    completionEvent.data.choices.length === 0
  ) {
    logger.error("Mistral completion event has no choices");
    return false;
  }

  return true;
}

export function isCorrectToolCall(
  toolCall: ToolCall
): toolCall is ToolCall & { id: string } {
  if (!toolCall.id) {
    logger.error("Mistral tool call is missing id");
    return false;
  }

  return true;
}
