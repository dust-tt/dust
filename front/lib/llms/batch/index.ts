import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
import { DustAnthropicClaudeSonnetFourDotSixGlobalAnthropicBatch } from "@app/lib/llms/batch/endpoints/anthropic_claude_sonnet_four_dot_six_global_anthropic";
import { DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch } from "@app/lib/llms/batch/endpoints/google_ai_studio_gemini_3_1_flash_lite_global_google_ai_studio";
import { DustGoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioBatch } from "@app/lib/llms/batch/endpoints/google_ai_studio_gemini_3_1_pro_global_google_ai_studio";
import { DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch } from "@app/lib/llms/batch/endpoints/google_ai_studio_gemini_3_5_flash_global_google_ai_studio";
import { DustMistralMistralMedium35EuropeMistralBatch } from "@app/lib/llms/batch/endpoints/mistral_mistral_medium_3_5_eu_mistral";
import { DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch } from "@app/lib/llms/batch/endpoints/openai_gpt_five_dot_five_global_openai_responses";
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
  [DustGoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioBatch.id]:
    DustGoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioBatch,
  [DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch.id]:
    DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch,
  [DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch.id]:
    DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch,
  [DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch.id]:
    DustOpenAIGptFiveDotFiveGlobalOpenAIResponsesBatch,
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
