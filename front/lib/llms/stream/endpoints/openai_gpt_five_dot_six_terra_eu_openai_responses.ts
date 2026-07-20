import { WithDustGptFiveDotSixTerraConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_terra";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_eu_openai_responses";

export class DustOpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream extends WithDustGptFiveDotSixTerraConfig(
  OpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptFiveDotSixTerraEuropeOpenAIResponsesStream);
