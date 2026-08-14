import { WithDustThinkingMachinesInklingConfig } from "@app/lib/llms/providers/fireworks/models/inkling";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { ThinkingMachinesInklingGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/thinking_machines_inkling_global_fireworks";

export class DustThinkingMachinesInklingGlobalFireworksStream extends WithDustThinkingMachinesInklingConfig(
  ThinkingMachinesInklingGlobalFireworksStream
) {
  static readonly endpointFilter = {};
}

defineDustStreamEndpoint(DustThinkingMachinesInklingGlobalFireworksStream);
