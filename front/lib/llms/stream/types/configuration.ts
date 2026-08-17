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

// `configParsers` helper: Gemini accepts the full 0..2 temperature range, but
// Google strongly recommends `temperature: 1` for Gemini 3 and we follow that
// recommendation for every Gemini model. This is a Dust product choice, so it
// lives here rather than in the endpoint schema, which mirrors the API.
export function forceTemperatureToOne<C extends InputConfig>(config: C): C {
  return { ...config, temperature: 1 };
}

// `configParsers` helper: Fireworks accepts temperatures from 0 to 2. Kimi K3
// uses the lowest supported temperature as a Dust product choice, so keep that
// policy in the llms layer rather than narrowing the endpoint schema, which
// mirrors the provider API.
// Verified 2026-08-11: https://docs.fireworks.ai/api-reference/post-responses
export function forceTemperatureToZero<C extends InputConfig>(config: C): C {
  return { ...config, temperature: 0 };
}

// `configParsers` helper: some models cannot turn thinking off but do accept a
// minimum thinking level (Gemini 3.5 Flash-Lite and 3.6 Flash reject
// `thinkingBudget: 0` yet accept the `MINIMAL` thinking level). Their endpoint
// schemas therefore do not expose effort "none" — it is not a real API
// capability — but the product still offers it, so map it down to "minimal",
// which is what the legacy router effectively did.
export function mapReasoningNoneToMinimal<C extends InputConfig>(config: C): C {
  if (config.reasoning?.effort !== "none") {
    return config;
  }
  return { ...config, reasoning: { ...config.reasoning, effort: "minimal" } };
}

// `configParsers` helper: DeepSeek V4 Pro effectively always ran at `high` in
// the legacy router (its only configurable effort was `none`, which omitted
// `reasoning_effort` and let Fireworks fall back to its `high` default). The
// endpoint schema accepts every effort Fireworks accepts, so this parser keeps
// the product behavior until the router migrates the stored `none` values.
export function forceHighReasoningEffort<C extends InputConfig>(config: C): C {
  return { ...config, reasoning: { effort: "high" } };
}

// `configParsers` helper: some models only have on/off thinking, with no graded
// levels (Kimi K2.6). Their endpoint schema exposes `none` and `high` only, so
// fold every other requested effort onto `high` — the product still offers
// light/medium and they all just mean "thinking on" here.
export function mapNonNoneReasoningToHigh<C extends InputConfig>(config: C): C {
  const effort = config.reasoning?.effort;
  if (!effort || effort === "none" || effort === "high") {
    return config;
  }
  return { ...config, reasoning: { ...config.reasoning, effort: "high" } };
}

// `configParsers` helper: models whose documented efforts are low/high/max
// (Kimi K3) have no `medium` tier. Fold Dust's legacy ladder onto theirs —
// low stays low, medium becomes high, high becomes max — so the product keeps
// offering three levels that each map to a real model effort.
export function mapReasoningEffortToLowHighMax<C extends InputConfig>(
  config: C
): C {
  switch (config.reasoning?.effort) {
    case "medium":
      return { ...config, reasoning: { ...config.reasoning, effort: "high" } };
    case "high":
      return {
        ...config,
        reasoning: { ...config.reasoning, effort: "maximal" },
      };
    default:
      return config;
  }
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
