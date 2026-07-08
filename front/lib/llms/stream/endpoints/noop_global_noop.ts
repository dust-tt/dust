import { WithDustNoopConfig } from "@app/lib/llms/providers/noop/models/noop";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { NoopGlobalNoopStream } from "@app/lib/model_constructors/stream/endpoints/noop_global_noop";

export class DustNoopGlobalNoopStream extends WithDustNoopConfig(
  NoopGlobalNoopStream
) {
  static readonly endpointFilter = {
    featureFlags: { contains: "noop_model_feature" as const },
  };
}

defineDustStreamEndpoint(DustNoopGlobalNoopStream);
