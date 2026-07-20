import { WithDustGptFiveDotSixTerraConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_terra";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_global_openai_responses";

export class DustOpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream extends WithDustGptFiveDotSixTerraConfig(
  OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream);
