import type { BaseModelConfiguration } from "@app/lib/model_constructors/configuration";
import type { Filter } from "@app/lib/model_constructors/types/filter";

// Whether a model's static configuration satisfies a `Filter`. Optional filter
// fields are skipped when `undefined`; `featureFlags` requires every flag the
// model declares to be enabled, and `apis` constrains the model's inference API.
export function matchFilter(
  model: BaseModelConfiguration,
  { providerIds, modelIds, regions, apis, byok, featureFlags }: Filter
): boolean {
  return (
    model.featureFlags.every((ff) => featureFlags.includes(ff)) &&
    (!byok || model.byok === true) &&
    (providerIds === undefined || providerIds.includes(model.providerId)) &&
    (modelIds === undefined || modelIds.includes(model.modelId)) &&
    (regions === undefined || regions.includes(model.region)) &&
    (apis === undefined || apis.includes(model.api))
  );
}
