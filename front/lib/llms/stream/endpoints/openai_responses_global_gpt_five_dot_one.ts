import { WithDustGptFiveDotOneConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_one";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIResponsesGlobalGptFiveDotOneStream } from "@app/lib/model_constructors/stream/endpoints/openai_responses_global_gpt_five_dot_one";

export class DustOpenAIResponsesGlobalGptFiveDotOneStream extends WithDustGptFiveDotOneConfig(
  OpenAIResponsesGlobalGptFiveDotOneStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIResponsesGlobalGptFiveDotOneStream);
