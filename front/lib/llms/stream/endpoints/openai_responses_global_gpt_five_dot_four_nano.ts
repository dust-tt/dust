import { WithDustGptFiveDotFourNanoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four_nano";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesGlobalGptFiveDotFourNanoStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_four_nano";

export class DustOpenAIResponsesGlobalGptFiveDotFourNanoStream extends WithDustGptFiveDotFourNanoConfig(
  OpenAIResponsesGlobalGptFiveDotFourNanoStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveDotFourNanoStream);
