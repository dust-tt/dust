import { WithDustNoopConfig } from "@app/lib/llms/providers/noop/models/noop";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import { NoopNoopGlobalNoopStream } from "@app/lib/model_constructors/stream/endpoints/noop_noop_global_noop";

export class DustNoopNoopGlobalNoopStream extends WithDustNoopConfig(
  NoopNoopGlobalNoopStream
) {
  static readonly endpointFilter = {
    featureFlags: { contains: "noop_model_feature" as const },
  };
}

defineDustStreamEndpoint(DustNoopNoopGlobalNoopStream);
