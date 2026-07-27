import { defineDustBatchEndpoint } from "@app/lib/llms/batch/dust_batch_endpoint";
import { GoogleGeminiThreeDotOneProGlobalGoogleAiStudioBatch } from "@app/lib/model_constructors/batch/endpoints/google_gemini_3_1_pro_global_google_ai_studio";
import { GEMINI_3_1_PRO_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";

export class DustGoogleGeminiThreeDotOneProGlobalGoogleAiStudioBatch extends GoogleGeminiThreeDotOneProGlobalGoogleAiStudioBatch {
  static readonly endpointFilter = {};
  static readonly modelConfig = GEMINI_3_1_PRO_MODEL_CONFIG;
}

defineDustBatchEndpoint(
  DustGoogleGeminiThreeDotOneProGlobalGoogleAiStudioBatch
);
