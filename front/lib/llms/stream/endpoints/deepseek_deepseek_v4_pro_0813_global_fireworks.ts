import { WithDustDeepSeekDeepSeekV4Pro0813Config } from "@app/lib/llms/providers/fireworks/models/deepseek_v4_pro_0813";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { DeepSeekDeepSeekV4Pro0813GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/deepseek_deepseek_v4_pro_0813_global_fireworks";

export class DustDeepSeekDeepSeekV4Pro0813GlobalFireworksStream extends WithDustDeepSeekDeepSeekV4Pro0813Config(
  DeepSeekDeepSeekV4Pro0813GlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustDeepSeekDeepSeekV4Pro0813GlobalFireworksStream);
