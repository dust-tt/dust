import { WithDustGptFiveDotFourMiniConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four_mini";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveDotFourMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_four_mini";

export class DustOpenAIResponsesEuropeGptFiveDotFourMiniStream extends WithDustGptFiveDotFourMiniConfig(
  OpenAIResponsesEuropeGptFiveDotFourMiniStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveDotFourMiniStream);
