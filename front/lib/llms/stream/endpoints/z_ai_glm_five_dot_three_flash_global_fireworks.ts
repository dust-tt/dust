import { WithDustZAiGlm53FlashConfig } from "@app/lib/llms/providers/fireworks/models/glm_five_dot_three_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { ZAiGlmFiveDotThreeFlashGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_three_flash_global_fireworks";

export class DustZAiGlmFiveDotThreeFlashGlobalFireworksStream extends WithDustZAiGlm53FlashConfig(
  ZAiGlmFiveDotThreeFlashGlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustZAiGlmFiveDotThreeFlashGlobalFireworksStream);
