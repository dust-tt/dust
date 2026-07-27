import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_gemini_3_5_flash_lite_global_google_ai_studio";
import { GEMINI_3_5_FLASH_LITE_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export class DustGoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch extends GoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch {
  static readonly endpointFilter = {};
  static readonly modelConfig = GEMINI_3_5_FLASH_LITE_MODEL_CONFIG;
}

defineDustBatchEndpoint(
  DustGoogleGeminiThreeDotFiveFlashLiteGlobalGoogleAiStudioBatch
);
