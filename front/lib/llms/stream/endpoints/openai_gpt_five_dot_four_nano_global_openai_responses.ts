import { WithDustGptFiveDotFourNanoConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_four_nano";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_four_nano_global_openai_responses";

export class DustOpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream extends WithDustGptFiveDotFourNanoConfig(
  OpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustOpenAIGptFiveDotFourNanoGlobalOpenAIResponsesStream
);
