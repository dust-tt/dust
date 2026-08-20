import { WithDustGptFiveDotSixTerraLongContextConfig } from "@app/lib/llms/providers/openai/models/gpt_five_dot_six_terra_long_context";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_long_context_global_openai_responses";

export class DustOpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream extends WithDustGptFiveDotSixTerraLongContextConfig(
  OpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream
) {
  static readonly endpointFilter = {
    featureFlags: { contains: "gpt_5_6_terra_long_context" as const },
  };
}

defineDustStreamEndpoint(
  DustOpenAIGptFiveDotSixTerraLongContextGlobalOpenAIResponsesStream
);
