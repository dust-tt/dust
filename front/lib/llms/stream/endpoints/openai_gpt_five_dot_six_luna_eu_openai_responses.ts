import { WithDustGptFiveDotSixLunaConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_luna";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_luna_eu_openai_responses";

export class DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream extends WithDustGptFiveDotSixLunaConfig(
  OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesStream
);
