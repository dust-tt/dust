import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_gemini_3_5_flash_global_google_ai_studio";
import { GEMINI_3_5_FLASH_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export class DustGoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch extends GoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch {
  static readonly endpointFilter = {};
  static readonly modelConfig = GEMINI_3_5_FLASH_MODEL_CONFIG;
}

defineDustBatchEndpoint(
  DustGoogleGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch
);
