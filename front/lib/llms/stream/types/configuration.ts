import type { Where, WorkspaceConfig } from "@app/lib/llms/types/filter";
import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";

type ReasoningEffortOf<C extends InputConfig> = NonNullable<
  C["reasoning"]
>["effort"];

export type DustStreamEndpointConfiguration<C extends InputConfig> =
  BaseEndpointConfiguration<C> & {
    // Description
    displayName: string;
    description: string;

    // Behavior
    defaultReasoningEffort: ReasoningEffortOf<C>;

    // Filter
    endpointFilter: Where<WorkspaceConfig>;
  };
