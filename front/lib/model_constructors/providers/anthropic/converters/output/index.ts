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
} from "@app/lib/model_constructors/providers/anthropic/converters/output/utils";

type AbstractConstructor<T> = abstract new (...args: any[]) => T;

/**
 * Mixin that binds the Anthropic leaf output converters (one unified event per
 * Anthropic signal) onto a model client as class fields, so an endpoint can
 * override a single leaf — say `stopReasonToErrorEvent` — by re-declaring its
 * own field, without touching the rest. Event identity
 * (`providerId`/`api`/`region`/`modelId`) is read from the endpoint's static
 * fields via `this.metadata()`.
 *
 * The composite that drives these leaves differs per inference method — a
 * streaming generator (`ModelEndpoint`) vs. a one-shot array (`BatchEndpoint`) —
 * so each api class supplies its own `rawOutputToEvents`; this mixin only
 * provides the shared leaves both build on.
 */
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
    toolUseBlockStartToToolCallStartedEvent =
      toolUseBlockStartToToolCallStartedEvent;
    inputJsonDeltaToToolCallDeltaEvent = inputJsonDeltaToToolCallDeltaEvent;
    accumulatedToolCallToToolCallEvent = accumulatedToolCallToToolCallEvent;
    invalidJsonToolCallToToolCallEvent = invalidJsonToolCallToToolCallEvent;
    messageDeltaUsageToTokenUsageEvent = messageDeltaUsageToTokenUsageEvent;
    stopReasonToErrorEvent = stopReasonToErrorEvent;
    streamErrorToErrorEvent = streamErrorToErrorEvent;
  }

  return WithAnthropicOutputConverter;
}
