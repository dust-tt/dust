import type { Client } from "@app/lib/model_constructors/client";
import {
  accumulatedReasoningToReasoningEvent,
  accumulatedTextToTextEvent,
  accumulatedToolCallToToolCallEvent,
  inputJsonDeltaToToolCallDeltaEvent,
  invalidJsonToolCallToToolCallEvent,
  messageDeltaUsageToTokenUsageEvent,
  messageStartToResponseIdEvent,
  type OutputEventConverters,
  reasoningDeltaToReasoningDeltaEvent,
  stopReasonToErrorEvent,
  streamErrorToErrorEvent,
  textDeltaToTextDeltaEvent,
  toolUseBlockStartToToolCallStartedEvent,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

// Binds the Anthropic leaf output converters onto a client as class fields (an
// endpoint can override a single leaf by re-declaring its field). The composite
// is per-surface, so each supplies its own `rawOutputToEvents`.
export function WithAnthropicAIOutputConverter<
  TBase extends AbstractConstructor<Client>,
>(Base: TBase) {
  abstract class WithAnthropicAIOutputConverter
    extends Base
    implements OutputEventConverters
  {
    messageStartToResponseIdEvent = messageStartToResponseIdEvent;
    textDeltaToTextDeltaEvent = textDeltaToTextDeltaEvent;
    reasoningDeltaToReasoningDeltaEvent = reasoningDeltaToReasoningDeltaEvent;
    accumulatedTextToTextEvent = accumulatedTextToTextEvent;
    accumulatedReasoningToReasoningEvent = accumulatedReasoningToReasoningEvent;
    toolUseBlockStartToToolCallStartedEvent =
      toolUseBlockStartToToolCallStartedEvent;
    inputJsonDeltaToToolCallDeltaEvent = inputJsonDeltaToToolCallDeltaEvent;
    accumulatedToolCallToToolCallEvent = accumulatedToolCallToToolCallEvent;
    invalidJsonToolCallToToolCallEvent = invalidJsonToolCallToToolCallEvent;
    messageDeltaUsageToTokenUsageEvent = messageDeltaUsageToTokenUsageEvent;
    stopReasonToErrorEvent = stopReasonToErrorEvent;
    streamErrorToErrorEvent = streamErrorToErrorEvent;
  }

  return WithAnthropicAIOutputConverter;
}
