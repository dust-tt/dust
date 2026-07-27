import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_gemini_3_5_flash_global_google_ai_studio";
import { GEMINI_3_5_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export class DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch extends GoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch {
  static readonly endpointFilter = {};
  static readonly modelConfig = GEMINI_3_5_FLASH_MODEL_CONFIG;
}

defineDustBatchEndpoint(
  DustGoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch
);
