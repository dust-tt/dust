import { WithDustGptFiveDotFiveConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_five";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotFiveGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_five_global_openai_responses";

export class DustOpenAIResponsesGlobalGptFiveDotFiveStream extends WithDustGptFiveDotFiveConfig(
  OpenAIGptFiveDotFiveGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveDotFiveStream);
