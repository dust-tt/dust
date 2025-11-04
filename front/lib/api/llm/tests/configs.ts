import type { ConfigParams } from "@app/lib/api/llm/tests/types";

export const NO_REASONING_TEST_CONFIGS_PARAMS: ConfigParams[] = [
  {
    temperature: 0.5,
    reasoningEffort: undefined,
  },
  {
    temperature: 1,
    reasoningEffort: undefined,
  },
] as const;

export const PERMISSIVE_TEST_CONFIGS_PARAMS: ConfigParams[] = [
  {
    temperature: 0.5,
    reasoningEffort: "none",
  },
  {
    temperature: 1,
    reasoningEffort: "light",
  },
  {
    temperature: 0.5,
    reasoningEffort: "medium",
  },
  {
    temperature: 1,
    reasoningEffort: "high",
  },
] as const;
