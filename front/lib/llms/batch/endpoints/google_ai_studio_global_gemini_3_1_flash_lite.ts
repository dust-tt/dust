import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_global_gemini_3_1_flash_lite";

export class DustGoogleAiStudioGlobalGeminiThreeDotOneFlashLiteBatch extends GoogleAiStudioGlobalGeminiThreeDotOneFlashLiteBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(
  DustGoogleAiStudioGlobalGeminiThreeDotOneFlashLiteBatch
);
