import { WithDustGptFiveDotOneConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_one";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotOneGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_one_global_openai_responses";

export class DustOpenAIGptFiveDotOneGlobalOpenAIResponsesStream extends WithDustGptFiveDotOneConfig(
  OpenAIGptFiveDotOneGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptFiveDotOneGlobalOpenAIResponsesStream);
