import type { Client } from "@app/lib/model_constructors/client";
import {
  accumulatedReasoningToReasoningEvent,
  accumulatedTextToTextEvent,
  argumentsDeltaToToolCallDeltaEvent,
  functionCallToToolCallEvent,
  functionCallToToolCallStartedEvent,
  type OutputEventConverters,
  reasoningSummaryDeltaToReasoningDeltaEvent,
  responseCreatedToResponseIdEvent,
  streamErrorToErrorEvent,
  textDeltaToTextDeltaEvent,
  usageToTokenUsageEvent,
} from "@app/lib/model_constructors/sdk/openai_responses/converters/output/utils";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

// Binds the OpenAI leaf output converters onto a client as class fields (an
// endpoint can override a single leaf by re-declaring its field). The composite
// is per-surface, so each supplies its own `rawOutputToEvents`.
export function WithOpenAIResponsesOutputConverter<
  TBase extends AbstractConstructor<Client>,
>(Base: TBase) {
  abstract class WithOpenAIResponsesOutputConverter
    extends Base
    implements OutputEventConverters
  {
    responseCreatedToResponseIdEvent = responseCreatedToResponseIdEvent;
    textDeltaToTextDeltaEvent = textDeltaToTextDeltaEvent;
    reasoningSummaryDeltaToReasoningDeltaEvent =
      reasoningSummaryDeltaToReasoningDeltaEvent;
    functionCallToToolCallStartedEvent = functionCallToToolCallStartedEvent;
    argumentsDeltaToToolCallDeltaEvent = argumentsDeltaToToolCallDeltaEvent;
    accumulatedTextToTextEvent = accumulatedTextToTextEvent;
    accumulatedReasoningToReasoningEvent = accumulatedReasoningToReasoningEvent;
    functionCallToToolCallEvent = functionCallToToolCallEvent;
    usageToTokenUsageEvent = usageToTokenUsageEvent;
    streamErrorToErrorEvent = streamErrorToErrorEvent;
  }

  return WithOpenAIResponsesOutputConverter;
}
