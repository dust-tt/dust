import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_gemini_3_1_flash_lite_global_google_ai_studio";

export class DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch extends GoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(
  DustGoogleAiStudioGeminiThreeDotOneFlashLiteGlobalGoogleAiStudioBatch
);
