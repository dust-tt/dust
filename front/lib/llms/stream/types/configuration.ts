import type { Where, WorkspaceConfig } from "@app/lib/llms/types/filter";
import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export type ReasoningEffortOf<C extends InputConfig> = NonNullable<
  C["reasoning"]
>["effort"];

// `ModelConfigurationType` is the legacy model config. Endpoints port it onto
// the new router by nesting the corresponding `*_DEFAULT_MODEL_CONFIG` under a
// single `modelConfig` static. This is a transitional step: over time we want
// each endpoint to declare its properties explicitly and drop the ones that are
// deprecated in the new router (e.g. `regionalAvailability`, `recommendedTopK`,
// ...) rather than carrying the whole legacy config forward.
export type DustStreamEndpointConfiguration<C extends InputConfig> = {
  modelConfig: ModelConfigurationType;
} & BaseEndpointConfiguration<C> & {
    // Description
    displayName: string;
    description: string;

    // Behavior
    // Commented out during transition
    // defaultReasoningEffort: ReasoningEffortOf<C>;

    // Parsers applied in order to the config before it is validated by the
    // endpoint's schema. Omitted means identity; override per endpoint for
    // provider quirks — e.g. dropping a non-default temperature when reasoning is
    // active, which some schemas reject outright (Anthropic requires
    // temperature=1 with thinking).
    configParsers?: Array<(config: InputConfig) => InputConfig>;

    // Filter
    endpointFilter: Where<WorkspaceConfig>;
  };

// `configParsers` helper: some providers reject any explicit temperature while
// reasoning is active, so drop it when reasoning is on. Providers that require a
// specific value (e.g. Anthropic's temperature=1) re-apply it via their schema
// default. Temperature is preserved when reasoning is off.
export function dropTemperatureWhenReasoning<C extends InputConfig>(
  config: C
): C {
  const effort = config.reasoning?.effort;
  if (effort && effort !== "none") {
    return { ...config, temperature: undefined };
  }
  return config;
}

// `configParsers` helper: some models reject an explicit temperature outright,
// regardless of reasoning effort (e.g. the OpenAI gpt-5 / gpt-5-mini / gpt-5-nano
// / gpt-5.1 Responses models). Always drop it.
export function dropTemperature<C extends InputConfig>(config: C): C {
  return { ...config, temperature: undefined };
}

// `configParsers` helper: non-reasoning models reject `reasoning_effort`, so drop
// the reasoning field before validation (their schemas require it undefined).
export function dropReasoning<C extends InputConfig>(config: C): C {
  return { ...config, reasoning: undefined };
}

// `configParsers` helper: some providers (Anthropic) reject a forced tool call
// while extended thinking is active, so disable reasoning when a tool is forced.
// Apply before `dropTemperatureWhenReasoning` so the now-disabled reasoning keeps
// any temperature the no-thinking branch allows.
export function disableReasoningWhenForcingTool<C extends InputConfig>(
  config: C
): C {
  if (config.forceTool !== undefined) {
    return { ...config, reasoning: { effort: "none" } };
  }
  return config;
}
