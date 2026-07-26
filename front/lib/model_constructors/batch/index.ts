import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";
import { GoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_gemini_3_1_flash_lite_global_google_ai_studio";
import { GoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_gemini_3_1_pro_global_google_ai_studio";
import { GoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_gemini_3_5_flash_global_google_ai_studio";
import { GoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_gemini_3_5_flash_lite_global_google_ai_studio";
import { MistralMistralMedium35EuropeMistralBatch } from "@app/lib/model_constructors/batch/endpoints/mistral_mistral_medium_3_5_eu_mistral";
import { OpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_five_dot_five_global_openai_responses";

export const BATCH_ENDPOINTS = {
  [AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch.id]:
    AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch,
  [GoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioBatch.id]:
    GoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioBatch,
  [GoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch.id]:
    GoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch,
  [GoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch.id]:
    GoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch,
  [GoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch.id]:
    GoogleAiStudioGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch,
  [OpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch.id]:
    OpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch,
  [MistralMistralMedium35EuropeMistralBatch.id]:
    MistralMistralMedium35EuropeMistralBatch,
} as const satisfies Record<string, BatchEndpointConstructor>;

export type BatchEndpointId = keyof typeof BATCH_ENDPOINTS;
