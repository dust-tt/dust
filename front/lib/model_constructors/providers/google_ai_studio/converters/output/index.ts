import type { Client } from "@app/lib/model_constructors/client";
import {
  accumulatedReasoningToReasoningEvent,
  accumulatedTextToTextEvent,
  finishReasonToErrorEvent,
  functionCallToToolCallEvent,
  functionCallToToolCallStartedEvent,
  type OutputEventConverters,
  reasoningDeltaToReasoningDeltaEvent,
  responseIdToResponseIdEvent,
  streamErrorToErrorEvent,
  textDeltaToTextDeltaEvent,
  usageToTokenUsageEvent,
} from "@app/lib/model_constructors/providers/google_ai_studio/converters/output/utils";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

// Binds the Gemini leaf output converters onto a client as class fields (an
// endpoint can override a single leaf by re-declaring its field). The composite
// is per-surface, so each supplies its own `rawOutputToEvents`.
export function WithGoogleAiStudioOutputConverter<
  TBase extends AbstractConstructor<Client>,
>(Base: TBase) {
  abstract class WithGoogleAiStudioOutputConverter
    extends Base
    implements OutputEventConverters
  {
    responseIdToResponseIdEvent = responseIdToResponseIdEvent;
    textDeltaToTextDeltaEvent = textDeltaToTextDeltaEvent;
    reasoningDeltaToReasoningDeltaEvent = reasoningDeltaToReasoningDeltaEvent;
    accumulatedTextToTextEvent = accumulatedTextToTextEvent;
    accumulatedReasoningToReasoningEvent = accumulatedReasoningToReasoningEvent;
    functionCallToToolCallStartedEvent = functionCallToToolCallStartedEvent;
    functionCallToToolCallEvent = functionCallToToolCallEvent;
    usageToTokenUsageEvent = usageToTokenUsageEvent;
    finishReasonToErrorEvent = finishReasonToErrorEvent;
    streamErrorToErrorEvent = streamErrorToErrorEvent;
  }

  return WithGoogleAiStudioOutputConverter;
}
