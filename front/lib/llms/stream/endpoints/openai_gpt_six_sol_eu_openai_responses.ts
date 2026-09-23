import { WithDustGptSixSolConfig } from "@app/lib/llms/providers/openai/models/gpt_six_sol";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { PREMIUM_MODEL_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { OpenAIGptSixSolEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_six_sol_eu_openai_responses";

export class DustOpenAIGptSixSolEuropeOpenAIResponsesStream extends WithDustGptSixSolConfig(
  OpenAIGptSixSolEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = PREMIUM_MODEL_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(DustOpenAIGptSixSolEuropeOpenAIResponsesStream);
