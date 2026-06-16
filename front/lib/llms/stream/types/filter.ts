import type { ModelId } from "@app/lib/model_constructors/types/model_ids";
import type { ProviderApi } from "@app/lib/model_constructors/types/provider_apis";
import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export type EndpointFilter = {
  featureFlags: WhitelistableFeature[];
  enterprise: boolean;
};

export type WorkspaceFilter = {
  regions: Region[];
  providerIds: ProviderId[];
  modelIds: ModelId[];
  providerApis: ProviderApi[];
};

export type ArrayValueFilter<T> = {
  contains?: T;
  containsAny?: T[];
  containsAll?: T[];
  isEmpty?: boolean;
};

export type ScalarValueFilter<T> = {
  eq?: T;
  neq?: T;
  in?: T[];
};

export type ValueFilter<T> = T extends readonly (infer U)[]
  ? ArrayValueFilter<U>
  : ScalarValueFilter<T>;

// Combined set of operators supported for a single field. The runtime matcher branches on the
// shape of the value rather than the filter, so it needs a type accepted by both the array and
// scalar matchers. Since every operator is optional, every `ValueFilter<T>` is assignable to it.
export type AnyValueFilter = ArrayValueFilter<unknown> &
  ScalarValueFilter<unknown>;

export type LogicalFilters<T> = {
  and?: Where<T>[];
  or?: Where<T>[];
  not?: Where<T>;
};

export type FieldFilters<T> = {
  [K in Exclude<keyof T, "and" | "or" | "not">]?: ValueFilter<
    NonNullable<T[K]>
  >;
};

export type Where<T> = LogicalFilters<T> & FieldFilters<T>;
