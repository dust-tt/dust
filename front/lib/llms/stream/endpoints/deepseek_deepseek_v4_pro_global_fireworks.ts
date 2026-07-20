import { WithDustDeepSeekDeepSeekV4ProConfig } from "@app/lib/llms/providers/fireworks/models/deepseek_v4_pro";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DeepSeekDeepSeekV4ProGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/deepseek_deepseek_v4_pro_global_fireworks";

export class DustDeepSeekDeepSeekV4ProGlobalFireworksStream extends WithDustDeepSeekDeepSeekV4ProConfig(
  DeepSeekDeepSeekV4ProGlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustDeepSeekDeepSeekV4ProGlobalFireworksStream);
