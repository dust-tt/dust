import { WithDustDeepSeekDeepSeekV41FlashConfig } from "@app/lib/llms/providers/fireworks/models/deepseek_v_four_dot_one_flash";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DeepSeekDeepSeekVFourDotOneFlashGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/deepseek_deepseek_v_four_dot_one_flash_global_fireworks";

export class DustDeepSeekDeepSeekVFourDotOneFlashGlobalFireworksStream extends WithDustDeepSeekDeepSeekV41FlashConfig(
  DeepSeekDeepSeekVFourDotOneFlashGlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(
  DustDeepSeekDeepSeekVFourDotOneFlashGlobalFireworksStream
);
