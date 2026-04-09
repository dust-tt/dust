import type { AnthropicWhitelistedModelId } from "@app/lib/api/llm/clients/anthropic/types";
import type { FireworksWhitelistedModelId } from "@app/lib/api/llm/clients/fireworks/types";
import type { GoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import type { MistralWhitelistedModelId } from "@app/lib/api/llm/clients/mistral/types";
import type { OpenAIWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import {
  CLAUDE_3_5_HAIKU_20241022_MODEL_ID,
  CLAUDE_3_OPUS_2024029_MODEL_ID,
  CLAUDE_4_5_HAIKU_20251001_MODEL_ID,
  CLAUDE_4_5_OPUS_20251101_MODEL_ID,
  CLAUDE_4_5_SONNET_20250929_MODEL_ID,
  CLAUDE_4_OPUS_20250514_MODEL_ID,
  CLAUDE_4_SONNET_20250514_MODEL_ID,
  CLAUDE_OPUS_4_6_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import type { CUSTOM_MODEL_IDS } from "@app/types/assistant/models/custom_models.generated";
import {
  FIREWORKS_DEEPSEEK_V3P2_MODEL_ID,
  FIREWORKS_GLM_5_MODEL_ID,
  FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID,
  FIREWORKS_KIMI_K2P5_MODEL_ID,
  FIREWORKS_MINIMAX_M2P5_MODEL_ID,
} from "@app/types/assistant/models/fireworks";
import {
  GEMINI_2_5_FLASH_LITE_MODEL_ID,
  GEMINI_2_5_FLASH_MODEL_ID,
  GEMINI_2_5_PRO_MODEL_ID,
  GEMINI_3_1_FLASH_LITE_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
  GEMINI_3_FLASH_MODEL_ID,
  GEMINI_3_PRO_MODEL_ID,
} from "@app/types/assistant/models/google_ai_studio";
import {
  MISTRAL_CODESTRAL_MODEL_ID,
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_MEDIUM_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
} from "@app/types/assistant/models/mistral";
import {
  GPT_3_5_TURBO_MODEL_ID,
  GPT_4_1_MINI_MODEL_ID,
  GPT_4_1_MODEL_ID,
  GPT_4_TURBO_MODEL_ID,
  GPT_4O_20240806_MODEL_ID,
  GPT_4O_MINI_MODEL_ID,
  GPT_4O_MODEL_ID,
  GPT_5_1_MODEL_ID,
  GPT_5_2_MODEL_ID,
  GPT_5_4_MODEL_ID,
  GPT_5_MINI_MODEL_ID,
  GPT_5_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
  O1_MODEL_ID,
  O3_MINI_MODEL_ID,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
} from "@app/types/assistant/models/openai";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";

type CustomModelId = (typeof CUSTOM_MODEL_IDS)[number];

export const MODELS: Record<
  | OpenAIWhitelistedModelId
  | Exclude<AnthropicWhitelistedModelId, CustomModelId>
  | GoogleAIStudioWhitelistedModelId
  | MistralWhitelistedModelId
  | FireworksWhitelistedModelId,
  { runTest: boolean; providerId: ModelProviderIdType }
> = {
  // Anthropic models
  [CLAUDE_3_5_HAIKU_20241022_MODEL_ID]: {
    runTest: false,
    providerId: "anthropic",
  },
  [CLAUDE_3_OPUS_2024029_MODEL_ID]: { runTest: false, providerId: "anthropic" },
  [CLAUDE_4_5_HAIKU_20251001_MODEL_ID]: {
    runTest: false,
    providerId: "anthropic",
  },
  [CLAUDE_4_5_OPUS_20251101_MODEL_ID]: {
    runTest: false,
    providerId: "anthropic",
  },
  [CLAUDE_4_5_SONNET_20250929_MODEL_ID]: {
    runTest: false,
    providerId: "anthropic",
  },
  [CLAUDE_4_OPUS_20250514_MODEL_ID]: {
    runTest: false,
    providerId: "anthropic",
  },
  [CLAUDE_4_SONNET_20250514_MODEL_ID]: {
    runTest: false,
    providerId: "anthropic",
  },
  [CLAUDE_OPUS_4_6_MODEL_ID]: {
    runTest: false,
    providerId: "anthropic",
  },
  [CLAUDE_SONNET_4_6_MODEL_ID]: {
    runTest: false,
    providerId: "anthropic",
  },
  // Google models
  [GEMINI_2_5_FLASH_LITE_MODEL_ID]: {
    runTest: false,
    providerId: "google_ai_studio",
  },
  [GEMINI_3_1_FLASH_LITE_MODEL_ID]: {
    runTest: false,
    providerId: "google_ai_studio",
  },
  [GEMINI_2_5_FLASH_MODEL_ID]: {
    runTest: false,
    providerId: "google_ai_studio",
  },
  [GEMINI_2_5_PRO_MODEL_ID]: { runTest: false, providerId: "google_ai_studio" },
  [GEMINI_3_PRO_MODEL_ID]: { runTest: false, providerId: "google_ai_studio" },
  [GEMINI_3_1_PRO_MODEL_ID]: { runTest: false, providerId: "google_ai_studio" },
  [GEMINI_3_FLASH_MODEL_ID]: { runTest: false, providerId: "google_ai_studio" },
  // Mistral models
  [MISTRAL_CODESTRAL_MODEL_ID]: { runTest: false, providerId: "mistral" },
  [MISTRAL_LARGE_MODEL_ID]: { runTest: false, providerId: "mistral" },
  [MISTRAL_MEDIUM_MODEL_ID]: { runTest: false, providerId: "mistral" },
  [MISTRAL_SMALL_MODEL_ID]: { runTest: false, providerId: "mistral" },
  // OpenAI models
  [GPT_3_5_TURBO_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_4_1_MINI_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_4_1_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_4_TURBO_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_4O_20240806_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_4O_MINI_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_4O_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_5_1_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_5_2_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_5_4_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_5_MINI_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_5_MODEL_ID]: { runTest: false, providerId: "openai" },
  [GPT_5_NANO_MODEL_ID]: { runTest: false, providerId: "openai" },
  [O1_MODEL_ID]: { runTest: false, providerId: "openai" },
  [O3_MINI_MODEL_ID]: { runTest: false, providerId: "openai" },
  [O3_MODEL_ID]: { runTest: false, providerId: "openai" },
  [O4_MINI_MODEL_ID]: { runTest: false, providerId: "openai" },
  // Fireworks models
  [FIREWORKS_DEEPSEEK_V3P2_MODEL_ID]: {
    runTest: false,
    providerId: "fireworks",
  },
  [FIREWORKS_KIMI_K2_INSTRUCT_MODEL_ID]: {
    runTest: false,
    providerId: "fireworks",
  },
  [FIREWORKS_KIMI_K2P5_MODEL_ID]: {
    runTest: false,
    providerId: "fireworks",
  },
  [FIREWORKS_MINIMAX_M2P5_MODEL_ID]: {
    runTest: false,
    providerId: "fireworks",
  },
  [FIREWORKS_GLM_5_MODEL_ID]: {
    runTest: false,
    providerId: "fireworks",
  },
};
