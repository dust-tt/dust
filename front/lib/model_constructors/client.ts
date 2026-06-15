import type { BaseModelConfiguration } from "@app/lib/model_constructors/configuration";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { ModelId } from "@app/lib/model_constructors/types/model_ids";
import type { ProviderApi } from "@app/lib/model_constructors/types/provider_apis";
import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";

export abstract class Client {
  // Re-type `this.constructor` (typed as `Function` by default) so the concrete
  // subclass's static config is visible at the type level.
  declare ["constructor"]: BaseModelConfiguration;

  metadata(): EndpointMetadata {
    return {
      providerId: this.constructor.providerId,
      api: this.constructor.api,
      region: this.constructor.region,
      modelId: this.constructor.modelId,
    };
  }

  // Generic `this` params P/A/R/M capture each concrete class's literal
  // identity fields, so the returned `id` is an exact literal (not the wide
  // union) and a registry keyed by it yields a precise `ModelId`.
  static buildId<
    P extends ProviderId,
    A extends ProviderApi,
    R extends Region,
    M extends ModelId,
  >(this: {
    providerId: P;
    api: A;
    region: R;
    modelId: M;
  }): `${P}/${A}/${R}/${M}` {
    return `${this.providerId}/${this.api}/${this.region}/${this.modelId}`;
  }
}
