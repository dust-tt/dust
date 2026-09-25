import { toRouterReasoningEffort } from "@app/lib/api/llm/transitionLLM";
import { DUST_STREAM_ENDPOINTS } from "@app/lib/llms/stream";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { ReasoningEffort as RouterReasoningEffort } from "@app/lib/model_constructors/types/reasoning_efforts";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

const REJECTED = "rejected";

type StoredEffort = "none" | "light" | "medium" | "high" | "unset";
type SentEffort = RouterReasoningEffort | typeof REJECTED;

// The effort each served model's provider receives today for each value an agent configuration can
// store; "unset" is a null `reasoningEffort`, which runs at the model's default effort. Rejected
// efforts fail the endpoint's schema, so those agents cannot run. On models without native light
// reasoning, "light" also adds the chain-of-thought meta prompt, which this table does not show.
const SENT_EFFORT_BY_MODEL: Record<string, Record<StoredEffort, SentEffort>> = {
  "claude-haiku-4-5-20251001": {
    none: "none",
    light: "none",
    medium: "medium",
    high: "high",
    unset: "none",
  },
  "claude-opus-5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-opus-5-5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-opus-4-8": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-opus-4-7": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-opus-4-6": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-sonnet-5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-sonnet-4-6": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gemini-3.5-flash": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "gemini-3.6-flash": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "gemini-3.7-flash": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "gemini-3.8-flash": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gemini-3.1-flash-lite": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "gemini-3.5-flash-lite": {
    none: "minimal",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "gemini-3.1-pro-preview": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "claude-fable-5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-fable-5-1": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "high",
  },
  "accounts/fireworks/models/deepseek-v4-pro": {
    none: "high",
    light: "high",
    medium: "high",
    high: "high",
    unset: "high",
  },
  "accounts/fireworks/models/deepseek-v4p1-flash": {
    none: "none",
    light: "low",
    medium: "high",
    high: "maximal",
    unset: "low",
  },
  "accounts/fireworks/models/glm-5p3": {
    none: "low",
    light: "low",
    medium: "high",
    high: "maximal",
    unset: "maximal",
  },
  "accounts/fireworks/models/glm-5p3-flash": {
    none: "low",
    light: "low",
    medium: "high",
    high: "maximal",
    unset: "low",
  },
  "accounts/fireworks/models/kimi-k3": {
    none: "low",
    light: "low",
    medium: "high",
    high: "maximal",
    unset: "low",
  },
  "accounts/fireworks/models/inkling": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "high",
  },
  "codestral-latest": {
    none: "none",
    light: "none",
    medium: "none",
    high: "none",
    unset: "none",
  },
  "mistral-large-latest": {
    none: "none",
    light: "none",
    medium: "none",
    high: "none",
    unset: "none",
  },
  "mistral-medium-3-5": {
    none: "none",
    light: "none",
    medium: "none",
    high: "high",
    unset: "none",
  },
  "mistral-small-latest": {
    none: "none",
    light: "none",
    medium: "none",
    high: "none",
    unset: "none",
  },
  noop: {
    none: "none",
    light: "none",
    medium: "none",
    high: "none",
    unset: "none",
  },
  "simulated-failure-model": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.5": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.4-mini": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.4-nano": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.4": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.1": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.6-luna": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-6-astra": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-6-luna": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-6-sol": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.6-sol": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.6-terra": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.6-terra-long-context": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.2": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5-mini": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5-nano": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "grok-4.5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "high",
  },
  "grok-4.6": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "high",
  },
  "grok-4.7": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "high",
  },
};

function effortSentToProvider(
  endpoint: DustStreamEndpointConstructor,
  storedEffort: ReasoningEffort
): SentEffort {
  const config: InputConfig = {
    reasoning: {
      effort: toRouterReasoningEffort(endpoint.modelConfig, storedEffort),
    },
  };
  const parsers = endpoint.configParsers ?? [];
  const result = endpoint.configSchema.safeParse(
    parsers.reduce((acc, parser) => parser(acc), config)
  );
  if (!result.success) {
    return REJECTED;
  }
  return result.data.reasoning?.effort ?? "none";
}

describe.each(Object.values(DUST_STREAM_ENDPOINTS))("$id", (endpoint) => {
  const { modelId, defaultReasoningEffort } = endpoint.modelConfig;

  it("sends the recorded effort for every stored effort", () => {
    expect({
      none: effortSentToProvider(endpoint, "none"),
      light: effortSentToProvider(endpoint, "light"),
      medium: effortSentToProvider(endpoint, "medium"),
      high: effortSentToProvider(endpoint, "high"),
      unset: effortSentToProvider(endpoint, defaultReasoningEffort),
    }).toEqual(SENT_EFFORT_BY_MODEL[modelId]);
  });
});
