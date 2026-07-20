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

    // Adjusts the config before it is validated by the endpoint's schema.
    // Omitted means identity; override per endpoint for provider quirks — e.g.
    // dropping a non-default temperature when reasoning is active, which some
    // schemas reject outright (Anthropic requires temperature=1 with thinking).
    parseConfig?: (config: InputConfig) => InputConfig;

    // Filter
    endpointFilter: Where<WorkspaceConfig>;
  };

// `parseConfig` helper: some providers reject any explicit temperature while
// reasoning is active, so drop it when reasoning is on. Providers that require a
// specific value (e.g. Anthropic's temperature=1) re-apply it via their schema
// default. Temperature is preserved when reasoning is off.
export function dropTemperatureWhenReasoning<C extends InputConfig>(
  config: C,
): C {
  const effort = config.reasoning?.effort;
  if (effort && effort !== "none") {
    return { ...config, temperature: undefined };
  }
  return config;
}

// `parseConfig` helper: some models reject an explicit temperature outright,
// regardless of reasoning effort (e.g. the OpenAI gpt-5 / gpt-5-mini / gpt-5-nano
// / gpt-5.1 Responses models). Always drop it.
export function dropTemperature<C extends InputConfig>(config: C): C {
  return { ...config, temperature: undefined };
}

// `parseConfig` helper: non-reasoning models reject `reasoning_effort`, so drop
// the reasoning field before validation (their schemas require it undefined).
export function dropReasoning<C extends InputConfig>(config: C): C {
  return { ...config, reasoning: undefined };
}
