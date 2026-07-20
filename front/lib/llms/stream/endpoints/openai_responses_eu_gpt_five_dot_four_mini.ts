import { WithDustGptFiveDotFourMiniConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four_mini";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_mini_eu_openai_responses";

export class DustOpenAIResponsesEuropeGptFiveDotFourMiniStream extends WithDustGptFiveDotFourMiniConfig(
  OpenAIGptFiveDotFourMiniEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveDotFourMiniStream);
