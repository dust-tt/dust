import flatMap from "lodash/flatMap";

import type { OpenAIModelFamily } from "@app/lib/api/llm/clients/openai/types";
import { OPENAI_MODEL_FAMILY_CONFIGS } from "@app/lib/api/llm/clients/openai/types";
import type { TestConfig } from "@app/scripts/llm_router/types";
import { PERMISSIVE_TEST_CONFIGS } from "@app/scripts/llm_router/types";
import type { ReasoningEffort } from "@app/types";

export const OPENAI_MODEL_FAMILY_TO_TEST_CONFIGS: Record<
  OpenAIModelFamily,
  {
    reasoningEffort?: ReasoningEffort;
    temperature?: number;
  }[]
> = {
  o3: [
    { reasoningEffort: "none" },
    { reasoningEffort: "light" },
    { reasoningEffort: "medium" },
    { reasoningEffort: "high" },
  ],
  reasoning: [
    { reasoningEffort: "none" },
    { reasoningEffort: "light", temperature: 0 },
    { reasoningEffort: "medium", temperature: 1 },
    { reasoningEffort: "high" },
  ],
  "non-reasoning": [{ temperature: 1 }, { temperature: 0 }],
  test: [...PERMISSIVE_TEST_CONFIGS],
} as const;

export const OPENAI_TEST_CONFIGS: TestConfig[] = flatMap(
  OPENAI_MODEL_FAMILY_CONFIGS["test"].modelIds.map((modelId) =>
    PERMISSIVE_TEST_CONFIGS.map((config) => ({
      ...config,
      modelId,
      provider: "openai" as const,
    }))
  )
);
