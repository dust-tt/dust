import { WithDustZAiGlm53Config } from "@app/lib/llms/providers/fireworks/models/glm_five_dot_three";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { ZAiGlmFiveDotThreeEuropeMistralStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_three_eu_mistral";

export class DustZAiGlmFiveDotThreeEuropeMistralStream extends WithDustZAiGlm53Config(
  ZAiGlmFiveDotThreeEuropeMistralStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustZAiGlmFiveDotThreeEuropeMistralStream);
