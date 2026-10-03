import type { Client } from "@app/lib/model_constructors/client";
import type { OutputEventConverters } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import {
  accumulatedReasoningToReasoningEvent,
  accumulatedTextToTextEvent,
  accumulatedToolCallToToolCallEvent,
  streamErrorToErrorEvent as baseStreamErrorToErrorEvent,
  inputJsonDeltaToToolCallDeltaEvent,
  invalidJsonToolCallToToolCallEvent,
  messageDeltaUsageToTokenUsageEvent,
  messageStartToResponseIdEvent,
  reasoningDeltaToReasoningDeltaEvent,
  serverToolBlockToProviderPassthroughEvent,
  stopReasonToErrorEvent,
  textDeltaToTextDeltaEvent,
  toolUseBlockStartToToolCallStartedEvent,
} from "@app/lib/model_constructors/sdk/anthropic_ai/converters/output/utils";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";

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
    serverToolBlockToProviderPassthroughEvent =
      serverToolBlockToProviderPassthroughEvent;
    messageDeltaUsageToTokenUsageEvent = messageDeltaUsageToTokenUsageEvent;
    stopReasonToErrorEvent = stopReasonToErrorEvent;

    // Anthropic reports a rejected tool schema by index into the `tools` it was
    // sent, so the error converter needs the request's tool names. `streamRaw`
    // records them; they live for the duration of one request.
    private requestToolNames: string[] | undefined;

    protected recordRequestToolNames(
      tools: readonly { name: string }[] | undefined
    ): void {
      this.requestToolNames = tools?.map((tool) => tool.name);
    }

    streamErrorToErrorEvent = (metadata: EndpointMetadata, error: unknown) =>
      baseStreamErrorToErrorEvent(metadata, error, this.requestToolNames);
  }

  return WithAnthropicAIOutputConverter;
}
