import { WithDustGptFiveDotFourConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotFourGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_global_openai_responses";

export class DustOpenAIResponsesGlobalGptFiveDotFourStream extends WithDustGptFiveDotFourConfig(
  OpenAIGptFiveDotFourGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveDotFourStream);
