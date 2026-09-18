import { WithDustSimulatedFailureModelConfig } from "@app/lib/llms/providers/openai/models/simulated_failure_model";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAISimulatedFailureModelGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_simulated_failure_model_global_openai_responses";
import { InternalServerError } from "openai";
import type {
  ResponseCreateParams,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

// An SDK error, not a bare `Error` carrying a `status`: only `instanceof
// APIError` reaches the HTTP-status classifier, and everything else lands in
// the catch-all as an `unknown_error` attributed to no one. The injected
// failure has to be attributed to the provider, or it never counts towards the
// breaker's error ratio and never reads as retryable.
function syntheticModelUnavailableError(): InternalServerError {
  return new InternalServerError(
    503,
    undefined,
    "Simulated failure model: upstream service unavailable (injected).",
    new Headers()
  );
}

/**
 * @cc [owner:frankaloia,label:error-handling;testing] synthetic-model-wrapper
 * This endpoint MUST throw a provider-classified, retryable 503 before yielding
 * any model output and MUST NOT mutate serving degradation state directly.
 */
export class DustOpenAISimulatedFailureModelGlobalOpenAIResponsesStream extends WithDustSimulatedFailureModelConfig(
  OpenAISimulatedFailureModelGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {
    featureFlags: { contains: "simulated_failure_model_feature" as const },
  };

  override async *streamRaw(
    _input: ResponseCreateParams
  ): AsyncGenerator<ResponseStreamEvent> {
    throw syntheticModelUnavailableError();
  }
}

defineDustStreamEndpoint(
  DustOpenAISimulatedFailureModelGlobalOpenAIResponsesStream
);
