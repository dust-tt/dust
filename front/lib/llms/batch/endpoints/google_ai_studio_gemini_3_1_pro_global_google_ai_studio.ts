import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_ai_studio_gemini_3_1_pro_global_google_ai_studio";

export class DustGoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioBatch extends GoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioBatch {
  static readonly endpointFilter = {};
}

defineDustBatchEndpoint(DustGoogleAiStudioGeminiThreeDotOneProGlobalGoogleAiStudioBatch);
