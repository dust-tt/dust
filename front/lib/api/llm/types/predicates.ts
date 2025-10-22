import type {
  CompletionEvent,
  ContentChunk,
  DeltaMessage,
  ToolCall,
} from "@mistralai/mistralai/models/components";
import assert from "assert";
import isNil from "lodash/isNil";

import logger from "@app/logger/logger";
import { assertNever } from "@app/types";

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
    assertNever(delta as never);
  }

  assert(
    !(toolCalls && !isNil(content)),
    "Mistral completion event has both content and toolCalls"
  );

  // Using isNil because models can return empty strings
  assert(
    !(isNil(content) && !toolCalls),
    "Mistral completion event has neither content nor toolCalls"
  );

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

  assert(
    completionEvent.data.choices && completionEvent.data.choices.length > 0,
    "Mistral completion event has no choices"
  );

  return true;
}

export function isCorrectToolCall(
  toolCall: ToolCall
): toolCall is ToolCall & { id: string } {
  assert(toolCall.id, "Mistral tool call is missing id");

  return true;
}
