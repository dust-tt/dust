import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
import { DustAnthropicUsClaudeSonnetFourDotSixBatch } from "@app/lib/llms/batch/endpoints/anthropic_us_claude_sonnet_four_dot_six";
import { DustGoogleAiStudioUsGeminiThreeDotOneFlashLiteBatch } from "@app/lib/llms/batch/endpoints/google_ai_studio_us_gemini_3_1_flash_lite";
import { DustGoogleAiStudioUsGeminiThreeDotOneProBatch } from "@app/lib/llms/batch/endpoints/google_ai_studio_us_gemini_3_1_pro";
import { DustGoogleAiStudioUsGeminiThreeDotFiveFlashBatch } from "@app/lib/llms/batch/endpoints/google_ai_studio_us_gemini_3_5_flash";
import { DustMistralEuropeMistralMedium35Batch } from "@app/lib/llms/batch/endpoints/mistral_eu_mistral_medium_3_5";
import { DustOpenAIResponsesGlobalGptFiveDotFiveBatch } from "@app/lib/llms/batch/endpoints/openai_responses_global_gpt_five_dot_five";
import { isEndpointAvailable } from "@app/lib/llms/batch/utils/is_endpoint_available";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import type { BatchEndpointId } from "@app/lib/model_constructors/batch";

export const DUST_BATCH_ENDPOINTS = {
  [DustAnthropicUsClaudeSonnetFourDotSixBatch.id]:
    DustAnthropicUsClaudeSonnetFourDotSixBatch,
  [DustGoogleAiStudioUsGeminiThreeDotOneProBatch.id]:
    DustGoogleAiStudioUsGeminiThreeDotOneProBatch,
  [DustGoogleAiStudioUsGeminiThreeDotFiveFlashBatch.id]:
    DustGoogleAiStudioUsGeminiThreeDotFiveFlashBatch,
  [DustGoogleAiStudioUsGeminiThreeDotOneFlashLiteBatch.id]:
    DustGoogleAiStudioUsGeminiThreeDotOneFlashLiteBatch,
  [DustOpenAIResponsesGlobalGptFiveDotFiveBatch.id]:
    DustOpenAIResponsesGlobalGptFiveDotFiveBatch,
  [DustMistralEuropeMistralMedium35Batch.id]:
    DustMistralEuropeMistralMedium35Batch,
} as const satisfies Record<BatchEndpointId, DustBatchEndpointConstructor>;

export function getBatchEndpoints(
  workspaceConfiguration: WorkspaceConfig,
  inputCondition: Where<EndpointConfig>
) {
  return Object.values(DUST_BATCH_ENDPOINTS).filter((constructor) =>
    isEndpointAvailable(constructor, workspaceConfiguration, inputCondition)
  );
}
