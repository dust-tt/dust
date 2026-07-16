import { WithDustGptFiveDotSixLunaConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_luna";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveDotSixLunaStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_six_luna";

export class DustOpenAIResponsesEuropeGptFiveDotSixLunaStream extends WithDustGptFiveDotSixLunaConfig(
  OpenAIResponsesEuropeGptFiveDotSixLunaStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveDotSixLunaStream);
