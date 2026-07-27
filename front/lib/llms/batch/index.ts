import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
import { DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch } from "@app/lib/llms/batch/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";
import { DustGoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch } from "@app/lib/llms/batch/endpoints/google_gemini_3_1_flash_lite_global_google_ai_studio";
import { DustGoogleGeminiThreeDotOneProGlobalGoogleAiStudioBatch } from "@app/lib/llms/batch/endpoints/google_gemini_3_1_pro_global_google_ai_studio";
import { DustGoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch } from "@app/lib/llms/batch/endpoints/google_gemini_3_5_flash_global_google_ai_studio";
import { DustGoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch } from "@app/lib/llms/batch/endpoints/google_gemini_3_5_flash_lite_global_google_ai_studio";
import { DustMistralMistralMedium35EuropeMistralBatch } from "@app/lib/llms/batch/endpoints/mistral_mistral_medium_3_5_eu_mistral";
import { DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch } from "@app/lib/llms/batch/endpoints/openai_gpt_five_dot_five_eu_openai_responses";
import { DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch } from "@app/lib/llms/batch/endpoints/openai_gpt_five_dot_five_global_openai_responses";
import { DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch } from "@app/lib/llms/batch/endpoints/openai_gpt_five_dot_six_luna_eu_openai_responses";
import { DustOpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch } from "@app/lib/llms/batch/endpoints/openai_gpt_five_dot_six_luna_global_openai_responses";
import { isEndpointAvailable } from "@app/lib/llms/batch/utils/is_endpoint_available";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import type { BatchEndpointId } from "@app/lib/model_constructors/batch";

export const DUST_BATCH_ENDPOINTS = {
  [DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch.id]:
    DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch,
  [DustGoogleGeminiThreeDotOneProGlobalGoogleAiStudioBatch.id]:
    DustGoogleGeminiThreeDotOneProGlobalGoogleAiStudioBatch,
  [DustGoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch.id]:
    DustGoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch,
  [DustGoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch.id]:
    DustGoogleGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch,
  [DustGoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch.id]:
    DustGoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch,
  [DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch.id]:
    DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch,
  [DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch.id]:
    DustOpenAIGptFiveDotFiveEuropeOpenAIResponsesBatch,
  [DustOpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch.id]:
    DustOpenAIGptFiveDotSixLunaGlobalOpenAIResponsesBatch,
  [DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch.id]:
    DustOpenAIGptFiveDotSixLunaEuropeOpenAIResponsesBatch,
  [DustMistralMistralMedium35EuropeMistralBatch.id]:
    DustMistralMistralMedium35EuropeMistralBatch,
} as const satisfies Record<BatchEndpointId, DustBatchEndpointConstructor>;

export function getBatchEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_BATCH_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
