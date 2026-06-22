import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleAiStudioGlobalGeminiThreeDotOneProBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_global_gemini_3_1_pro";

export class DustGoogleAiStudioGlobalGeminiThreeDotOneProBatch extends GoogleAiStudioGlobalGeminiThreeDotOneProBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustGoogleAiStudioGlobalGeminiThreeDotOneProBatch);
