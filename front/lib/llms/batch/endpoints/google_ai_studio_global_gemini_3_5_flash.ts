import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_global_gemini_3_5_flash";

export class DustGoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch extends GoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustGoogleAiStudioGlobalGeminiThreeDotFiveFlashBatch);
