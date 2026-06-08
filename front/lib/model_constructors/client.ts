import type { BaseModelConfiguration } from "@app/lib/model_constructors/configuration";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { ModelId } from "@app/lib/model_constructors/types/model_ids";
import type { ProviderApi } from "@app/lib/model_constructors/types/provider_apis";
import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";

// Shared base for every way of talking to a model: it carries the identity
// (static config), the credentials, and the request-building contract, but says
// nothing about HOW the request is sent. The per-surface endpoints
// (`StreamEndpoint` / `BatchEndpoint` / …) extend it with their own inference
// method, while the provider converter mixins attach to it so both reuse the
// same payload/event conversion.
export abstract class Client {
  // Re-type `this.constructor` (typed as `Function` by default) so the concrete
  // subclass's static config is visible. At runtime `this.constructor` is the
  // actual subclass, so this resolves to the child's values. Typed as the
  // cross-surface-common `BaseModelConfiguration`; the surface-specific statics
  // (e.g. `configSchema`) are visible through the concrete subclass.
  declare ["constructor"]: BaseModelConfiguration;

  constructor(protected readonly credentials: Credentials) {}

  // Builds the model's `id` from its static identity fields, CAPTURING the
  // literal `providerId`/`api`/`region`/`modelId` of the concrete class via the
  // generic params P/A/R/M. Returning `${P}::${A}::${R}::${M}` (not the wide
  // `${ProviderId}::${ProviderApi}::...`) is what lets each concrete class's
  // `id` be its exact literal, so a registry keyed by it yields a precise
  // `ModelId` union. The explicit `this` typing (rather than reading the class)
  // is what makes the literals visible here; a plain method body could only ever
  // see the wide declared types.
  //
  // `id` itself can't be computed here on `Client` (the base has none of the
  // identity statics), so each concrete leaf assigns
  // `static readonly id = this.buildId()` once its `region` is pinned.
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
  }): `${P}::${A}::${R}::${M}` {
    return `${this.providerId}::${this.api}::${this.region}::${this.modelId}`;
  }

  static readonly featureFlags = ["use_new_llm_router"];
}
