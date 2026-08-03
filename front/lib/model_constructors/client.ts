import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { Host } from "@app/lib/model_constructors/types/hosts";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Lab } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import type { Region } from "@app/lib/model_constructors/types/regions";

export abstract class Client<C extends InputConfig = InputConfig> {
  // Re-type `this.constructor` (typed as `Function` by default) so the concrete
  // subclass's static config is visible at the type level.
  declare ["constructor"]: BaseEndpointConfiguration<C>;

  metadata(): EndpointMetadata {
    return {
      lab: this.constructor.lab,
      host: this.constructor.host,
      region: this.constructor.region,
      model: this.constructor.model,
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
    lab: P;
    host: A;
    region: R;
    model: M;
  }): `${P}/${M}/${R}/${A}` {
    return `${this.lab}/${this.model}/${this.region}/${this.host}`;
  }
}
