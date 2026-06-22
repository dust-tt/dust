import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { AnthropicGlobalClaudeSonnetFourDotSixBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_global_claude_sonnet_four_dot_six";
import { GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_global_gemini_3_1_flash_lite";
import { GoogleAiStudioGlobalGeminiThreeDotOneProBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_global_gemini_3_1_pro";
import { GoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_global_gemini_3_5_flash";
import { MistralEuropeMistralMedium35Batch } from "@app/lib/model_constructors/batch/endpoints/mistral_eu_mistral_medium_3_5";
import { OpenAIResponsesGlobalGptFiveDotFiveBatch } from "@app/lib/model_constructors/batch/endpoints/openai_responses_global_gpt_five_dot_five";

export const BATCH_ENDPOINTS = {
  [AnthropicGlobalClaudeSonnetFourDotSixBatch.id]:
    AnthropicGlobalClaudeSonnetFourDotSixBatch,
  [GoogleAiStudioGlobalGeminiThreeDotOneProBatch.id]:
    GoogleAiStudioGlobalGeminiThreeDotOneProBatch,
  [GoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch.id]:
    GoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch,
  [GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteBatch.id]:
    GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteBatch,
  [OpenAIResponsesGlobalGptFiveDotFiveBatch.id]:
    OpenAIResponsesGlobalGptFiveDotFiveBatch,
  [MistralEuropeMistralMedium35Batch.id]: MistralEuropeMistralMedium35Batch,
} as const satisfies Record<string, BatchEndpointConstructor>;

export type BatchEndpointId = keyof typeof BATCH_ENDPOINTS;
