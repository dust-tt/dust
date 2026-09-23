import { WithDustGptFiveDotSixSolConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_sol";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { PREMIUM_MODEL_ENDPOINT_FILTER } from "@app/lib/llms/utils/endpoint_filters";
import { OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_sol_eu_openai_responses";

export class DustOpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream extends WithDustGptFiveDotSixSolConfig(
  OpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = PREMIUM_MODEL_ENDPOINT_FILTER;
}

defineDustStreamEndpoint(DustOpenAIGptFiveDotSixSolEuropeOpenAIResponsesStream);
