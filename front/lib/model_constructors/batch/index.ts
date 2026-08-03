import type { BatchEndpointConstructor } from "@app/lib/model_constructors/batch/configuration";
import { AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch } from "@app/lib/model_constructors/batch/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";
import { GoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_gemini_3_1_flash_lite_global_google_ai_studio";
import { GoogleGeminiThreeDotOneProGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_gemini_3_1_pro_global_google_ai_studio";
import { GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_gemini_3_5_flash_global_google_ai_studio";
import { GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_gemini_3_5_flash_lite_global_google_ai_studio";
import { MistralMistralMedium35EuropeMistralBatch } from "@app/lib/model_constructors/batch/endpoints/mistral_mistral_medium_3_5_eu_mistral";
import { OpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_five_dot_five_eu_openai_responses";
import { OpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_five_dot_five_global_openai_responses";
import { OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_five_dot_six_luna_eu_openai_responses";
import { OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch } from "@app/lib/model_constructors/batch/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";

export const BATCH_ENDPOINTS = {
  [AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch.id]:
    AnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch,
  [GoogleGeminiThreeDotOneProGlobalGoogleAiStudioBatch.id]:
    GoogleGeminiThreeDotOneProGlobalGoogleAiStudioBatch,
  [GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch.id]:
    GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch,
  [GoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch.id]:
    GoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch,
  [GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch.id]:
    GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch,
  [OpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch.id]:
    OpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch,
  [OpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch.id]:
    OpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch,
  [OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch.id]:
    OpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch,
  [OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch.id]:
    OpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch,
  [MistralMistralMedium35EuropeMistralBatch.id]:
    MistralMistralMedium35EuropeMistralBatch,
} as const satisfies Record<string, BatchEndpointConstructor>;

export type BatchEndpointId = keyof typeof BATCH_ENDPOINTS;
