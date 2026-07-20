import { WithDustGptFiveDotFourNanoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four_nano";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_nano_eu_openai_responses";

export class DustOpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream extends WithDustGptFiveDotFourNanoConfig(
  OpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustOpenAIGptFiveDotFourNanoEuropeOpenAIResponsesStream
);
