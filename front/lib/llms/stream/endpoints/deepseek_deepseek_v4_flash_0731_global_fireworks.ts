import { WithDustDeepSeekDeepSeekV4Flash0731Config } from "@app/lib/llms/providers/fireworks/models/deepseek_v4_flash_0731";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DeepSeekDeepSeekV4Flash0731GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/deepseek_deepseek_v4_flash_0731_global_fireworks";

export class DustDeepSeekDeepSeekV4Flash0731GlobalFireworksStream extends WithDustDeepSeekDeepSeekV4Flash0731Config(
  DeepSeekDeepSeekV4Flash0731GlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustDeepSeekDeepSeekV4Flash0731GlobalFireworksStream);
