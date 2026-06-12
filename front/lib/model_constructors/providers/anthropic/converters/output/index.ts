import type { Client } from "@app/lib/model_constructors/client";
import {
  accumulatedReasoningToReasoningEvent,
  accumulatedTextToTextEvent,
  messageStartToResponseIdEvent,
  type OutputEventConverters,
  reasoningDeltaToReasoningDeltaEvent,
  textDeltaToTextDeltaEvent,
} from "@app/lib/model_constructors/providers/anthropic/converters/output/utils";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

// Binds the Anthropic leaf output converters onto a client as class fields (an
// endpoint can override a single leaf by re-declaring its field). The composite
// is per-surface, so each supplies its own `rawOutputToEvents`.
export function WithAnthropicOutputConverter<
  TBase extends AbstractConstructor<Client>,
>(Base: TBase) {
  abstract class WithAnthropicOutputConverter
    extends Base
    implements OutputEventConverters
  {
    messageStartToResponseIdEvent = messageStartToResponseIdEvent;
    textDeltaToTextDeltaEvent = textDeltaToTextDeltaEvent;
    reasoningDeltaToReasoningDeltaEvent = reasoningDeltaToReasoningDeltaEvent;
    accumulatedTextToTextEvent = accumulatedTextToTextEvent;
    accumulatedReasoningToReasoningEvent = accumulatedReasoningToReasoningEvent;
  }

  return WithAnthropicOutputConverter;
}
