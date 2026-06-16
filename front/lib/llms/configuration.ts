import type { BaseModelConfiguration } from "@app/lib/model_constructors/configuration";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

type ReasoningEffortOf<C extends InputConfig> = NonNullable<
  C["reasoning"]
>["effort"];

export type DustModelConfiguration<C extends InputConfig> =
  BaseModelConfiguration<C> & {
    // Description
    displayName: string;
    description: string;

    // Behavior
    defaultReasoningEffort: ReasoningEffortOf<C>;

    // Filters
    byok: boolean;
    featureFlags: WhitelistableFeature[];
  };
