import { WithDustGptFiveDotFourMiniConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four_mini";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesGlobalGptFiveDotFourMiniStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_mini";

export class DustOpenAIResponsesGlobalGptFiveDotFourMiniStream extends WithDustGptFiveDotFourMiniConfig(
  OpenAIResponsesGlobalGptFiveDotFourMiniStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveDotFourMiniStream);
