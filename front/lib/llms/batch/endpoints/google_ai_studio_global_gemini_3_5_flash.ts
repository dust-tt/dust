import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_gemini_3_5_flash_global_google_ai_studio";

export class DustGoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch extends GoogleAiStudioGeminiThreeDotFiveFlashGlobalGoogleAiStudioBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustGoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch);
