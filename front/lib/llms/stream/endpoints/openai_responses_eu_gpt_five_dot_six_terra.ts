import { WithDustGptFiveDotSixTerraConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_terra";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesEuropeGptFiveDotSixTerraStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_eu_gpt_five_dot_six_terra";

export class DustOpenAIResponsesEuropeGptFiveDotSixTerraStream extends WithDustGptFiveDotSixTerraConfig(
  OpenAIResponsesEuropeGptFiveDotSixTerraStream,
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesEuropeGptFiveDotSixTerraStream);
