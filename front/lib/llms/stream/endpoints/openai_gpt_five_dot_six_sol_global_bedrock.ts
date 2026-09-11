import { WithDustGptFiveDotSixSolConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_sol";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotSixSolGlobalBedrockStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_sol_global_bedrock";

export class DustOpenAIGptFiveDotSixSolGlobalBedrockStream extends WithDustGptFiveDotSixSolConfig(
  OpenAIGptFiveDotSixSolGlobalBedrockStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustOpenAIGptFiveDotSixSolGlobalBedrockStream);
