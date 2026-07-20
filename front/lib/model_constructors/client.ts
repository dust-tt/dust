import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Model } from "@app/lib/model_constructors/types/model_ids";
import type { Host } from "@app/lib/model_constructors/types/provider_apis";
import type { Lab } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";

export abstract class Client<C extends InputConfig = InputConfig> {
  // Re-type `this.constructor` (typed as `Function` by default) so the concrete
  // subclass's static config is visible at the type level.
  declare ["constructor"]: BaseEndpointConfiguration<C>;

  metadata(): EndpointMetadata {
    return {
      lab: this.constructor.providerId,
      host: this.constructor.api,
      region: this.constructor.region,
      model: this.constructor.modelId,
    };
  }

  // Generic `this` params P/A/R/M capture each concrete class's literal
  // identity fields, so the returned `id` is an exact literal (not the wide
  // union) and a registry keyed by it yields a precise `ModelId`.
  static buildId<
    P extends Lab,
    A extends Host,
    R extends Region,
    M extends Model,
  >(this: {
    providerId: P;
    api: A;
    region: R;
    modelId: M;
  }): `${P}/${M}/${R}/${A}` {
    return `${this.providerId}/${this.modelId}/${this.region}/${this.api}`;
  }
}
