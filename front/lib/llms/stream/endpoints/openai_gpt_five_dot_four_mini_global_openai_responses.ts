import { WithDustGptFiveDotFourMiniConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four_mini";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_mini_global_openai_responses";

export class DustOpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream extends WithDustGptFiveDotFourMiniConfig(
  OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStream);
