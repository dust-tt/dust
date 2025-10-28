import type { ModelConfigurationType } from "@app/types";

import {
  CLAUDE_2_1_MODEL_ID,
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_3_5_SONNET_20240620_MODEL_ID,
  CLAUDE_3_5_SONNET_20241022_MODEL_ID,
  CLAUDE_3_7_SONNET_20250219_MODEL_ID,
  CLAUDE_3_HAIKU_20240307_MODEL_ID,
  CLAUDE_3_OPUS_2024029_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_4_OPUS_20250514_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  CLAUDE_INSTANT_1_2_MODEL_ID,
} from "@app/types";

export const CLAUDE_4_THINKING_BUDGET_TOKENS = {
  none: 0,
  light: 0,
  medium: 1024,
  high: 4096,
};

export const ANTHROPIC_MODEL_IDS = [
  CLAUDE_2_1_MODEL_ID,
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_3_5_SONNET_20240620_MODEL_ID,
  CLAUDE_3_5_SONNET_20241022_MODEL_ID,
  CLAUDE_3_7_SONNET_20250219_MODEL_ID,
  CLAUDE_3_HAIKU_20240307_MODEL_ID,
  CLAUDE_3_OPUS_2024029_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_4_OPUS_20250514_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  CLAUDE_INSTANT_1_2_MODEL_ID,
];

export const ANTHROPIC_REASONING_MODEL_IDS = [
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_4_OPUS_20250514_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
];

export type AnthropicReasoningModelId =
  (typeof ANTHROPIC_REASONING_MODEL_IDS)[number];

export type AnthropicModelId = (typeof ANTHROPIC_MODEL_IDS)[number];

export type AnthropicPayload =
  | {
      model: ModelConfigurationType & { modelId: AnthropicReasoningModelId };
      options?: {
        reasoningEffort?: "medium" | "high";
        temperature?: 1 | undefined;
      };
    }
  | {
      model: ModelConfigurationType & { modelId: AnthropicModelId };
      options?: {
        temperature?: number;
        reasoningEffort?: undefined;
      };
    };
