import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { AnthropicUsClaudeSonnetFourDotSixBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_us_claude_sonnet_four_dot_six";
import { GoogleAiStudioUsGeminiThreeDotOneFlashLiteBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_us_gemini_3_1_flash_lite";
import { GoogleAiStudioUsGeminiThreeDotOneProBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_us_gemini_3_1_pro";
import { GoogleAiStudioUsGeminiThreeDotFiveFlashBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_us_gemini_3_5_flash";
import { MistralEuropeMistralMedium35Batch } from "@app/lib/model_constructors/batch/endpoints/mistral_eu_mistral_medium_3_5";
import { OpenAIResponsesGlobalGptFiveDotFiveBatch } from "@app/lib/model_constructors/batch/endpoints/openai_responses_global_gpt_five_dot_five";

export const BATCH_ENDPOINTS = {
  [AnthropicUsClaudeSonnetFourDotSixBatch.id]:
    AnthropicUsClaudeSonnetFourDotSixBatch,
  [GoogleAiStudioUsGeminiThreeDotOneProBatch.id]:
    GoogleAiStudioUsGeminiThreeDotOneProBatch,
  [GoogleAiStudioUsGeminiThreeDotFiveFlashBatch.id]:
    GoogleAiStudioUsGeminiThreeDotFiveFlashBatch,
  [GoogleAiStudioUsGeminiThreeDotOneFlashLiteBatch.id]:
    GoogleAiStudioUsGeminiThreeDotOneFlashLiteBatch,
  [OpenAIResponsesGlobalGptFiveDotFiveBatch.id]:
    OpenAIResponsesGlobalGptFiveDotFiveBatch,
  [MistralEuropeMistralMedium35Batch.id]: MistralEuropeMistralMedium35Batch,
} as const satisfies Record<string, BatchEndpointConstructor>;

export type BatchEndpointId = keyof typeof BATCH_ENDPOINTS;
